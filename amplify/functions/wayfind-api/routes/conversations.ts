import { RunMicrovmCommand } from "@aws-sdk/client-lambda-microvms";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomBytes } from "crypto";
import { json } from "../lib/respond.js";
import { dataClient, env, microvms, s3sync, syncBucket } from "../lib/clients.js";
import { stampOwner } from "../lib/owner.js";
import {
  mintVmToken,
  terminateAndVerify,
  vmFetch,
  waitForRunning,
} from "../lib/microvm.js";
import {
  deriveConversationKey,
  deriveWorkspaceKey,
  sealWorkspaceFile,
  sha256HexBytes,
  unwrapConversationKey,
  wrapConversationKey,
} from "../lib/escrow.js";
import { loadPolicy, policyAllows } from "../lib/policy.js";
import { emitAudit } from "../lib/audit.js";
import { receiptPublicKey, signReceiptBody } from "../lib/receipts.js";
import { toVerificationReports } from "../lib/reports.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// ---- ONE conversations (hybrid-C): session metadata + checkpoint pointers.
// No history content in DynamoDB — transcript in the VM, sealed blobs in S3.
export const CURATED_MODELS: Record<string, { provider: string }> = {
  "Qwen/Qwen3.8-27B": { provider: "near-ai" },
};

function convIdFor(path: string, suffix: string): string | null {
  const m = path.match(new RegExp(`/conversations/([^/]+)/${suffix}$`));
  return m ? m[1] : null;
}

async function getOwnedConversation(owner: string, id: string) {
  const { data } = await dataClient.models.Conversation.get({ id });
  if (!data || (data as unknown as { ownerId?: string }).ownerId !== owner) return null;
  return data as unknown as {
    id: string; status?: string | null; sandboxId?: string | null;
    sessionToken?: string | null; encryptedKey?: string | null;
    checkpointManifest?: Array<string | null> | null; receipt?: unknown;
    botId?: string | null; botBundleHash?: string | null;
    workspaceHash?: string | null; model?: string | null;
    provider?: string | null; securityLevel?: string | null;
    createdAt?: string | null; terminatedAt?: string | null;
  };
}

// POST /conversations — open a conversation: mint key, boot a disposable
// VM, record the session row. Bot bundle + workspace push land with the
// image task-runner (step 4); the VM boots ready for them.
// Body: { botId?, botBundleHash?, workspaceHash?, model?, securityLevel?,
//         idleTtlSeconds? }. Returns metadata only (no bearer, no key —
// the relay resolves server-side; history key via GET /:id/key).
export async function handleConversationsCreate(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId, claims } = ctx;
  if (!path.endsWith("/conversations") || method !== "POST" || path.includes("/conversations/")) return null;
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const model = typeof body.model === "string" && body.model ? body.model : "Qwen/Qwen3.8-27B";
  const curated = CURATED_MODELS[model];
  if (!curated) {
    return json(400, { error: `model not curated: ${model} (each model must pass scripts/near-ai-tests 00-07)` });
  }
  const securityLevel = typeof body.securityLevel === "string" ? body.securityLevel : "standard";
  if (securityLevel === "strict-confidential") {
    return json(400, { error: "strict-confidential requires the Phase 3 Nitro backend — fails closed" });
  }
  if (securityLevel !== "standard" && securityLevel !== "verified_inference") {
    return json(400, { error: "securityLevel must be standard | verified_inference" });
  }
  // Per-owner policy gate (Phase 2): fail closed on weaker levels,
  // disallowed models, and clamp idle TTL to the cap.
  const policy = await loadPolicy(ownerId);
  const gate = policyAllows(policy, { model, curatedModels: Object.keys(CURATED_MODELS), securityLevel });
  if (!gate.ok) return json(403, { error: gate.error });
  let idleTtl = 1800;
  if (typeof body.idleTtlSeconds === "number" && Number.isFinite(body.idleTtlSeconds)) {
    idleTtl = Math.min(28_800, Math.max(300, Math.floor(body.idleTtlSeconds)));
  }
  idleTtl = Math.min(idleTtl, policy.maxIdleTtlSeconds);
  // Bot bundle pinning: the bundle is the Bot row's canonical definition.
  // Owner-checked; hash recorded so later runs can prove what was deployed.
  let botBundleHash: string | undefined;
  const botId = typeof body.botId === "string" && body.botId ? body.botId : undefined;
  if (botId) {
    const { data: bot } = await dataClient.models.Bot.get({ id: botId });
    const b = bot as unknown as {
      ownerId?: string; name?: string | null; role?: string | null;
      description?: string | null; skillsEnabled?: string[] | null; mcpEnabled?: string[] | null;
    } | null;
    if (!b) return json(404, { error: "unknown bot" });
    if (b.ownerId !== ownerId) return json(403, { error: "bot belongs to a different owner" });
    botBundleHash = createHash("sha256")
      .update(
        JSON.stringify({
          name: b.name ?? null,
          role: b.role ?? null,
          description: b.description ?? null,
          skillsEnabled: b.skillsEnabled ?? null,
          mcpEnabled: b.mcpEnabled ?? null,
        }),
      )
      .digest("hex");
  }
  const imageArn = env.EXEC_IMAGE_ARN;
  if (!imageArn) return json(500, { error: "EXEC_IMAGE_ARN is not configured" });
  const region = env.COMPUTER_REGION ?? "ap-southeast-1";
    let bootedMicrovmId: string | undefined;
  try {
    const run = await microvms.send(
      new RunMicrovmCommand({
        imageIdentifier: imageArn,
        runHookPayload: JSON.stringify({ provisionedFor: ownerId, purpose: "wayfind-conversation" }),
        ingressNetworkConnectors: [
          `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`,
        ],
        egressNetworkConnectors: [
          // NOTE: full egress until the allowlist lands; verified_inference
          // conversations are still gated at the inference-policy layer.
          `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`,
        ],
        idlePolicy: { autoResumeEnabled: false, maxIdleDurationSeconds: idleTtl, suspendedDurationSeconds: 3600 },
        maximumDurationInSeconds: 28_800,
      }),
    );
    if (!run.microvmId) throw new Error("run-microvm returned no microvmId");
    bootedMicrovmId = run.microvmId;
    const endpoint = await waitForRunning(run.microvmId);
    const token = await mintVmToken(run.microvmId);
    const sessionToken = randomBytes(32).toString("base64url");
    // In-VM inference credential (memory-only, dies with the VM). near-ai
    // key comes from the Wayfind-held secret; meta-test has no in-VM path
    // yet (/ai fails closed 501 for it). Missing secret → provision fails
    // closed below ONLY for near-ai conversations, never silently keyless.
    let aiCredentials: { provider: string; key: string; model: string } | undefined;
    if (curated.provider === "near-ai") {
      const nearKey = env.NEARAI_CLOUD_API_KEY ?? "";
      if (!nearKey) throw new Error("NEARAI_CLOUD_API_KEY is not configured (Amplify secret)");
      aiCredentials = { provider: "near-ai", key: nearKey, model };
    }
    const hookRes = await vmFetch(endpoint, token, "/hooks/run", {
      sessionToken,
      ...(aiCredentials ? { aiCredentials } : {}),
    });
    if (!hookRes.ok) throw new Error(`/hooks/run → ${hookRes.status}: ${(await hookRes.text()).slice(0, 200)}`);
    const smokeRes = await vmFetch(endpoint, token, "/exec", { cmd: "true" }, sessionToken);
    if (!smokeRes.ok) throw new Error(`/exec smoke → ${smokeRes.status}`);
    // Conversation key: derived from the bearer (dies with the session),
    // escrowed wrapped for history rendering after the VM is gone.
    let encryptedKey: string;
    try {
      encryptedKey = wrapConversationKey(deriveConversationKey(sessionToken));
    } catch (keyErr) {
      throw new Error(`conversation key escrow failed: ${keyErr instanceof Error ? keyErr.message : String(keyErr)}`);
    }
    let conversationId = "";
    let conversationCreatedAt = new Date().toISOString();
    try {
      const { data: row, errors } = await dataClient.models.Conversation.create({
        ownerId,
        botId,
        botBundleHash,
        workspaceHash: typeof body.workspaceHash === "string" ? body.workspaceHash : undefined,
        model,
        provider: curated.provider,
        securityLevel: securityLevel as "standard" | "verified_inference",
        status: "live",
        sandboxId: run.microvmId,
        endpoint,
        sessionToken,
        encryptedKey,
        checkpointManifest: [],
      });
      if (errors || !row) throw new Error(JSON.stringify(errors));
      conversationId = (row as unknown as { id: string }).id;
          conversationCreatedAt =
            (row as unknown as { createdAt?: string }).createdAt ?? conversationCreatedAt;
          await stampOwner("Conversation", conversationId, ownerId);
          void emitAudit(ownerId, claims?.cliTokenId ? `cli:${claims.cliTokenId}` : `user:${ownerId}`, "conversation.created", conversationId, { model, provider: curated.provider, securityLevel });
    } catch (rowErr) {
      // Fail closed: without the row there is no history, quota, or audit.
      throw new Error(`conversation row write failed: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
    }
    return json(200, {
      conversationId,
      sandboxId: run.microvmId,
      model,
      provider: curated.provider,
      securityLevel,
      provisionedAt: conversationCreatedAt,
    });
  } catch (err) {
    if (bootedMicrovmId) {
      const gone = await terminateAndVerify(bootedMicrovmId);
      if (gone) {
        console.log(`[wayfind-api] terminated ${bootedMicrovmId} after failed conversation provision`);
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("CONVERSATION_MASTER_KEY") ? 500 : 502;
    return json(status, { error: `conversation provision failed: ${msg}` });
  }
}

// GET /conversations — the caller's conversations, metadata only
// (no bearer, no endpoint, no escrowed key — those resolve server-side
// or via the dedicated key route).
export async function handleConversationsList(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId } = ctx;
  if (!path.endsWith("/conversations") || method !== "GET") return null;
  const { data } = await dataClient.models.Conversation.conversationsByOwnerId({ ownerId });
  const items = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    // AWSJSON comes back as a string — parse for API consumers (CLI verify,
    // website panel). Fall back to raw on any shape surprise.
    let receiptOut: unknown = null;
    if (typeof r.receipt === "string") {
      try {
        receiptOut = JSON.parse(r.receipt);
      } catch {
        receiptOut = r.receipt;
      }
    } else if (r.receipt != null) {
      receiptOut = r.receipt;
    }
    return {
      conversationId: r.id,
      botId: r.botId ?? null,
      model: r.model,
      provider: r.provider,
      securityLevel: r.securityLevel,
      status: r.status,
      checkpointManifest: r.checkpointManifest ?? [],
      receipt: receiptOut,
      provisionedAt: r.createdAt ?? null,
      lastUsedAt: r.updatedAt ?? null, // Amplify-managed; bumps on every row touch
      terminatedAt: r.terminatedAt ?? null,
    };
  });
  return json(200, { conversations: items });
}

// POST /conversations/:id/message — relay a call to the live VM's agent.
// Body: { sub? (default "exec"), body? }. Generic relay (like
// /sandbox/proxy but conversation-scoped); the bot runner (step 4)
// just uses sub "bot/message". Touches nothing on the row — metering
// is createdAt→terminatedAt, VM idle TTL is enforced VM-side.
export async function handleConversationMessage(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  const cid = method === "POST" ? convIdFor(path, "message") : null;
  if (!cid) return null;
  let body: { sub?: unknown; body?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { sub?: unknown; body?: unknown };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const row = await getOwnedConversation(ownerId, cid);
  if (!row || row.status !== "live" || !row.sandboxId || !row.sessionToken) {
    return json(410, { error: "conversation is not live" });
  }
  const sub = typeof body.sub === "string" && body.sub ? body.sub.replace(/^\/+/, "") : "exec";
  if (!/^[A-Za-z0-9/_-]+$/.test(sub)) return json(400, { error: "bad relay sub-path" });
  let endpoint: string;
  try {
    endpoint = await waitForRunning(row.sandboxId, 30_000);
  } catch {
    return json(410, { error: "that sandbox no longer exists" });
  }
  let token: string;
  try {
    token = await mintVmToken(row.sandboxId, 30);
  } catch {
    return json(502, { error: "microvm token mint failed" });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`https://${endpoint}/${sub}`, {
      method: "POST",
      headers: {
        "X-aws-proxy-auth": token,
        Authorization: `Bearer ${row.sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify((body.body as Record<string, unknown> | undefined) ?? {}),
    });
  } catch (err) {
    return json(502, { error: `agent unreachable: ${err instanceof Error ? err.message : String(err)}` });
  }
  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return json(502, { error: "agent returned non-JSON" });
  }
  if (!upstream.ok) return json(upstream.status, { error: (data as { error?: string } | null)?.error ?? `agent → ${upstream.status}` });
  return json(200, { result: data });
}

// POST /conversations/:id/terminate — close now. First takes a final
// sealed snapshot (best-effort: a dead VM simply has nothing new to save),
// then verified kill, row marked closed + terminatedAt + receipt v0.
// Receipt binding of inference evidence lands in step 7; the row stays
// for history/audit.
export async function handleConversationTerminate(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId, claims } = ctx;
  const cid = method === "POST" ? convIdFor(path, "terminate") : null;
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row) return json(404, { error: "conversation not found" });
  if (row.status !== "live") return json(200, { ok: true, alreadyClosed: true });
  // Final snapshot + evidence pull: sealed transcript envelope stored as
  // the next manifest entry, plus the agent's attestation evidence for the
  // receipt. Best-effort — an unreachable VM means the last recorded state
  // is final. Older images lack /bot/evidence (inference stays null).
  // The outcome is reported (never silent): receipt.finalSnapshot tells
  // the client whether history exists and why not.
  let finalEvidence: unknown = null;
  let finalSnapshot: { recorded: boolean; seq?: number; error?: string } = { recorded: false };
  if (row.sandboxId && row.sessionToken) {
    try {
      const endpoint = await waitForRunning(row.sandboxId, 30_000);
      const token = await mintVmToken(row.sandboxId, 30);
      const authz = { "X-aws-proxy-auth": token, Authorization: `Bearer ${row.sessionToken}` };
      const snap = await fetch(`https://${endpoint}/checkpoint`, { method: "POST", headers: authz });
      if (snap.ok) {
        const env = (await snap.json()) as { seq?: unknown; sha256?: string; nonce?: string; data?: string };
        const manifest = (row.checkpointManifest ?? []).filter((e): e is string => typeof e === "string");
        const seq = manifest.length;
        if (typeof env.sha256 === "string" && typeof env.nonce === "string" && typeof env.data === "string") {
          if (!syncBucket) throw new Error("workspace bucket not configured");
          const blobKey = `checkpoints/${ownerId}/${cid}/${seq}.bin`;
          await s3sync.send(
            new PutObjectCommand({
              Bucket: syncBucket,
              Key: blobKey,
              Body: JSON.stringify(env),
              ContentType: "application/json",
            }),
          );
          const { data: cp, errors } = await dataClient.models.Checkpoint.create({
            ownerId,
            conversationId: cid,
            seq,
            sha256: env.sha256.toLowerCase(),
            blobKey,
          });
          if (errors || !cp) throw new Error(JSON.stringify(errors));
          await stampOwner("Checkpoint", (cp as unknown as { id: string }).id, ownerId);
          manifest.push(`${seq}:${env.sha256.toLowerCase()}`);
          row.checkpointManifest = manifest;
          finalSnapshot = { recorded: true, seq };
        } else {
          finalSnapshot = { recorded: false, error: "agent returned a malformed envelope" };
        }
      }
      try {
        const ev = await fetch(`https://${endpoint}/bot/evidence`, { method: "POST", headers: authz });
        if (ev.ok) finalEvidence = await ev.json();
      } catch {
        // Older images lack /bot/evidence — inference evidence stays null.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[wayfind-api] final snapshot skipped for ${cid}: ${msg}`);
      if (!finalSnapshot.recorded && !finalSnapshot.error) {
        finalSnapshot = { recorded: false, error: msg.slice(0, 200) };
      }
    }
  } else {
    finalSnapshot = { recorded: false, error: "no live sandbox on record" };
  }
  let verified = false;
  if (row.sandboxId) {
    try {
      verified = await terminateAndVerify(row.sandboxId);
    } catch {
      verified = false;
    }
  } else {
    verified = true;
  }
  // Receipt v0: binds what this backend saw — session metadata, checkpoint
  // manifest, inference evidence, metering, cleanup outcome. Signed when
  // the signing key is configured (class "signed"); otherwise "observed".
  const manifest = (row.checkpointManifest ?? []).filter((e): e is string => typeof e === "string");
  const terminatedAt = new Date().toISOString();
  const receipt: Record<string, unknown> = {
    version: "wayfind-receipt/v0",
    class: "observed",
    conversationId: cid,
    botId: row.botId ?? null,
    botBundleHash: row.botBundleHash ?? null,
    workspaceHash: row.workspaceHash ?? null,
    model: row.model ?? null,
    provider: row.provider ?? null,
    securityLevel: row.securityLevel ?? null,
    checkpointManifest: manifest,
    provisionedAt: row.createdAt ?? null,
    terminatedAt,
    cleanup: { vmTerminated: verified },
    finalSnapshot,
    inference: finalEvidence,
  };
  // Class flips BEFORE signing: the signature must cover the exact bytes
  // verifiers will check (signing the "observed" shape then relabeling
  // produces signatures that can never verify).
  receipt.class = "signed";
  try {
    receipt.signature = signReceiptBody(receipt);
  } catch (err) {
    delete receipt.signature;
    receipt.class = "observed";
    console.log(`[wayfind-api] receipt left unsigned for ${cid}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    // NOTE: AppSync returns row errors in `errors`, NOT as throws — an
    // unchecked update can report 200 while persisting nothing.
    // a.json() (AWSJSON) takes a JSON *string* as the mutation variable —
    // passing the object rejects with "Variable 'receipt' has an invalid value".
    const { data: updated, errors: updateErrors } = await dataClient.models.Conversation.update({
      id: cid,
      status: "closed",
      terminatedAt,
      checkpointManifest: manifest,
      receipt: JSON.stringify(receipt),
    });
    if (updateErrors || !updated) {
      throw new Error(`row update rejected: ${JSON.stringify(updateErrors)}`);
    }
  } catch (err) {
    return json(500, { error: `VM ${verified ? "terminated" : "kill unverified"} but row update failed: ${err instanceof Error ? err.message : String(err)}`, receipt });
  }
  void emitAudit(ownerId, claims?.cliTokenId ? `cli:${claims.cliTokenId}` : `user:${ownerId}`, "conversation.terminated", cid, { verified, receiptClass: (receipt as Record<string, unknown>).class });
  return json(200, { ok: true, verified, receipt });
}

// POST /conversations/:id/checkpoint-upload — { seq } → presigned PUT for
// the sealed checkpoint blob (15min, bytes never touch the API).
export async function handleCheckpointUpload(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  const cid = method === "POST" ? convIdFor(path, "checkpoint-upload") : null;
  if (!cid) return null;
  let body: { seq?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { seq?: unknown };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const row = await getOwnedConversation(ownerId, cid);
  if (!row || row.status !== "live") return json(410, { error: "conversation is not live" });
  if (typeof body.seq !== "number" || !Number.isInteger(body.seq) || body.seq < 0) {
    return json(400, { error: "seq must be a non-negative integer" });
  }
  if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
  const blobKey = `checkpoints/${ownerId}/${cid}/${body.seq}.bin`;
  const url = await getSignedUrl(
    s3sync,
    new PutObjectCommand({ Bucket: syncBucket, Key: blobKey }),
    { expiresIn: 900 },
  );
  return json(200, { blobKey, url });
}

// POST /conversations/:id/checkpoints — record a checkpoint manifest entry
// after the sealed blob upload. Append-only: seq must equal the current
// manifest length, or the chain is broken (409, fail closed).
export async function handleCheckpointRecord(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  const cid = method === "POST" ? convIdFor(path, "checkpoints") : null;
  if (!cid) return null;
  let body: { seq?: unknown; sha256?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { seq?: unknown; sha256?: unknown };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const row = await getOwnedConversation(ownerId, cid);
  if (!row || row.status !== "live") return json(410, { error: "conversation is not live" });
  if (typeof body.seq !== "number" || !Number.isInteger(body.seq) || body.seq < 0) {
    return json(400, { error: "seq must be a non-negative integer" });
  }
  if (typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(body.sha256)) {
    return json(400, { error: "sha256 must be a 64-hex digest" });
  }
  const manifest = (row.checkpointManifest ?? []).filter((e): e is string => typeof e === "string");
  if (body.seq !== manifest.length) {
    return json(409, { error: `seq ${body.seq} breaks the chain (manifest holds ${manifest.length})` });
  }
  const entry = `${body.seq}:${body.sha256.toLowerCase()}`;
  try {
    const { data: cp, errors } = await dataClient.models.Checkpoint.create({
      ownerId,
      conversationId: cid,
      seq: body.seq,
      sha256: body.sha256.toLowerCase(),
      blobKey: `checkpoints/${ownerId}/${cid}/${body.seq}.bin`,
    });
    if (errors || !cp) throw new Error(JSON.stringify(errors));
    await stampOwner("Checkpoint", (cp as unknown as { id: string }).id, ownerId);
    await dataClient.models.Conversation.update({ id: cid, checkpointManifest: [...manifest, entry] });
  } catch (err) {
    return json(500, { error: `checkpoint record failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  return json(200, { ok: true, seq: body.seq, entry });
}

// GET /conversations/:id/checkpoint-url?seq=N — presigned GET for a sealed
// checkpoint blob (15min). Works live or closed: history rendering needs
// it after the VM is gone. The caller decrypts client-side with the
// workspace key from GET /:id/key.
export async function handleCheckpointUrl(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (method !== "GET" || !path.includes("/checkpoint-url")) return null;
  const cid = convIdFor(path, "checkpoint-url");
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row) return json(404, { error: "conversation not found" });
  // Manifest source: the row field, falling back to the receipt copy.
  // (Rows closed before the manifest-persist fix carry the manifest in
  // the receipt only — history must still render for them.)
  let manifest = (row.checkpointManifest ?? []).filter((e): e is string => typeof e === "string");
  if (manifest.length === 0) {
    try {
      const receiptRaw = (row as unknown as { receipt?: unknown }).receipt;
      const receipt = typeof receiptRaw === "string" ? JSON.parse(receiptRaw) : receiptRaw;
      const rm = (receipt as { checkpointManifest?: unknown } | null)?.checkpointManifest;
      if (Array.isArray(rm)) manifest = rm.filter((e): e is string => typeof e === "string");
    } catch {
      // Fall through to the 404 below.
    }
  }
  const seqRaw = event.queryStringParameters?.seq ?? new URL(event.rawPath, "http://x").searchParams.get("seq");
  const seq = Number(seqRaw);
  if (!Number.isInteger(seq) || seq < 0 || seq >= manifest.length) {
    return json(404, { error: `no checkpoint seq ${String(seqRaw)} (manifest holds ${manifest.length})` });
  }
  if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
  const blobKey = `checkpoints/${ownerId}/${cid}/${seq}.bin`;
  const url = await getSignedUrl(s3sync, new GetObjectCommand({ Bucket: syncBucket, Key: blobKey }), { expiresIn: 900 });
  const wantSha = manifest[seq].split(":")[1] ?? null;
  return json(200, { blobKey, url, sha256: wantSha });
}

// GET /conversations/:id/checkpoint-blob?seq=N — same sealed blob as
// checkpoint-url, but relayed through the API as JSON instead of a
// presigned S3 URL. Browsers block cross-origin S3 GETs without bucket
// CORS; this route has none of that problem (owner-authenticated, small
// transcripts only — blobs over 5MB are rejected here, use the URL).
export async function handleCheckpointBlob(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (method !== "GET" || !path.includes("/checkpoint-blob")) return null;
  const cid = convIdFor(path, "checkpoint-blob");
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row) return json(404, { error: "conversation not found" });
  let manifest = (row.checkpointManifest ?? []).filter((e): e is string => typeof e === "string");
  if (manifest.length === 0) {
    try {
      const receiptRaw = (row as unknown as { receipt?: unknown }).receipt;
      const receipt = typeof receiptRaw === "string" ? JSON.parse(receiptRaw) : receiptRaw;
      const rm = (receipt as { checkpointManifest?: unknown } | null)?.checkpointManifest;
      if (Array.isArray(rm)) manifest = rm.filter((e): e is string => typeof e === "string");
    } catch {
      // Fall through to the 404 below.
    }
  }
  const seqRaw = event.queryStringParameters?.seq ?? new URL(event.rawPath, "http://x").searchParams.get("seq");
  const seq = Number(seqRaw);
  if (!Number.isInteger(seq) || seq < 0 || seq >= manifest.length) {
    return json(404, { error: `no checkpoint seq ${String(seqRaw)} (manifest holds ${manifest.length})` });
  }
  if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
  const blobKey = `checkpoints/${ownerId}/${cid}/${seq}.bin`;
  let text: string;
  try {
    const obj = await s3sync.send(new GetObjectCommand({ Bucket: syncBucket, Key: blobKey }));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) throw new Error("empty blob");
    if (bytes.length > 5 * 1024 * 1024) {
      return json(413, { error: "blob too large for relay — use checkpoint-url" });
    }
    text = Buffer.from(bytes).toString("utf8");
  } catch (err) {
    return json(502, { error: `blob read failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  let env: unknown;
  try {
    env = JSON.parse(text);
  } catch {
    return json(502, { error: "blob is not a sealed envelope" });
  }
  return json(200, { blobKey, sha256: manifest[seq].split(":")[1] ?? null, envelope: env });
}

// GET /conversations/:id/verification-reports[?chatId=] — evidence as
// NEAR Verification Center reports (iframe widget format). Live rows pull
// fresh /bot/evidence from the VM; closed rows use the receipt copy.
// One response report per array (widget rule): latest valid by default.
export async function handleVerificationReports(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (method !== "GET" || !path.includes("/verification-reports")) return null;
  const cid = convIdFor(path, "verification-reports");
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row) return json(404, { error: "conversation not found" });
  let evidence: {
    preflight?: unknown;
    messages?: unknown;
  } | null = null;
  if (row.status === "live" && row.sandboxId && row.sessionToken) {
    try {
      const endpoint = await waitForRunning(row.sandboxId, 30_000);
      const token = await mintVmToken(row.sandboxId, 30);
      const ev = await fetch(`https://${endpoint}/bot/evidence`, {
        method: "POST",
        headers: { "X-aws-proxy-auth": token, Authorization: `Bearer ${row.sessionToken}` },
      });
      if (ev.ok) evidence = (await ev.json()) as typeof evidence;
    } catch {
      // Fall through to receipt copy / unverifiable below.
    }
  }
  if (!evidence) {
    try {
      const receiptRaw = (row as unknown as { receipt?: unknown }).receipt;
      const receipt = typeof receiptRaw === "string" ? JSON.parse(receiptRaw) : receiptRaw;
      evidence = ((receipt as { inference?: unknown } | null)?.inference ?? null) as typeof evidence;
    } catch {
      evidence = null;
    }
  }
  const model = (row as unknown as { model?: string }).model ?? "unknown";
  const chatId = event.queryStringParameters?.chatId ?? undefined;
  const reports = toVerificationReports(model, evidence as never, chatId);
  return json(200, { reports });
}

// POST /conversations/:id/workspace — browser/CLI uploads workspace files.
// Body: { files: [{ path, contentBase64 }] }. The backend seals each file
// server-side (it holds the bearer-derived workspace key) and relays the
// envelopes via sync/in; the VM decrypts in memory. Relay sees metadata +
// ciphertext only. Updates row.workspaceHash to the manifest digest.
export async function handleWorkspacePush(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  const cid = method === "POST" ? convIdFor(path, "workspace") : null;
  if (!cid) return null;
  let body: { files?: Array<{ path?: unknown; contentBase64?: unknown }> } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const row = await getOwnedConversation(ownerId, cid);
  if (!row || row.status !== "live" || !row.sandboxId || !row.sessionToken) {
    return json(410, { error: "conversation is not live" });
  }
  const files = Array.isArray(body.files) ? body.files.slice(0, 200) : [];
  if (files.length === 0) return json(400, { error: "files[] is required (max 200)" });
  const key = deriveWorkspaceKey(row.sessionToken);
  const sealed: Array<{ path: string; sha256: string; nonce: string; data: string }> = [];
  let totalBytes = 0;
  for (const f of files) {
    if (typeof f?.path !== "string" || typeof f?.contentBase64 !== "string") {
      return json(400, { error: "each file needs path + contentBase64" });
    }
    if (f.path.includes("..") || f.path.startsWith("/") || f.path.length > 512) {
      return json(400, { error: `bad path: ${f.path.slice(0, 80)}` });
    }
    let plaintext: Buffer;
    try {
      plaintext = Buffer.from(f.contentBase64, "base64");
    } catch {
      return json(400, { error: `bad base64: ${f.path}` });
    }
    if (plaintext.length > 5 * 1024 * 1024) return json(413, { error: `file too large: ${f.path}` });
    totalBytes += plaintext.length;
    if (totalBytes > 50 * 1024 * 1024) return json(413, { error: "workspace push exceeds 50MB" });
    const env = sealWorkspaceFile(key, f.path, plaintext);
    sealed.push({ path: f.path, sha256: env.sha256, nonce: env.nonce, data: env.data });
  }
  let endpoint: string;
  try {
    endpoint = await waitForRunning(row.sandboxId, 30_000);
  } catch {
    return json(410, { error: "that sandbox no longer exists" });
  }
  let token: string;
  try {
    token = await mintVmToken(row.sandboxId, 30);
  } catch {
    return json(502, { error: "microvm token mint failed" });
  }
  // Relay in the same batches the CLI uses.
  for (let i = 0; i < sealed.length; i += 50) {
    const res = await vmFetch(endpoint, token, "/sync/in", { files: sealed.slice(i, i + 50) }, row.sessionToken);
    if (!res.ok) return json(502, { error: `sync/in → ${res.status}: ${(await res.text()).slice(0, 200)}` });
  }
  const manifestDigest = createHash("sha256")
    .update(sealed.map((f) => `${f.path}:${f.sha256}`).sort().join("\n"))
    .digest("hex");
  try {
    const { errors } = await dataClient.models.Conversation.update({ id: cid, workspaceHash: manifestDigest });
    if (errors) throw new Error(JSON.stringify(errors));
  } catch (err) {
    return json(500, { error: `workspace pushed but hash stamp failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  return json(200, { ok: true, pushed: sealed.length, workspaceHash: manifestDigest });
}

// GET /conversations/:id/key — release the escrowed conversation key to
// the owner over TLS (client-side history decrypt). Also derives the
// workspace key from the session bearer so the website/CLI can open sealed
// checkpoint blobs and pull files. Works live or closed; the master key
// never leaves the server.
export async function handleConversationKey(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId } = ctx;
  const cid = method === "GET" ? convIdFor(path, "key") : null;
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row || !row.encryptedKey || !row.sessionToken) return json(404, { error: "conversation not found" });
  let key: Buffer;
  try {
    key = unwrapConversationKey(row.encryptedKey);
  } catch {
    return json(500, { error: "key unwrap failed" });
  }
  return json(200, {
    key: key.toString("base64"),
    workspaceKey: deriveWorkspaceKey(row.sessionToken).toString("base64"),
  });
}
