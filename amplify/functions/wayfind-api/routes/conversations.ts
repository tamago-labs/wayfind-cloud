import { RunMicrovmCommand } from "@aws-sdk/client-lambda-microvms";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";
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
  unwrapConversationKey,
  wrapConversationKey,
} from "../lib/escrow.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// ---- ONE conversations (hybrid-C): session metadata + checkpoint pointers.
// No history content in DynamoDB — transcript in the VM, sealed blobs in S3.
const CURATED_MODELS: Record<string, { provider: string }> = {
  "Qwen/Qwen3.8-27B": { provider: "near-ai" },
  "Muse Spark": { provider: "meta-test" },
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
    checkpointManifest?: Array<string | null> | null;
  };
}

// POST /conversations — open a conversation: mint key, boot a disposable
// VM, record the session row. Bot bundle + workspace push land with the
// image task-runner (step 4); the VM boots ready for them.
// Body: { botId?, botBundleHash?, workspaceHash?, model?, securityLevel?,
//         idleTtlSeconds? }. Returns metadata only (no bearer, no key —
// the relay resolves server-side; history key via GET /:id/key).
export async function handleConversationsCreate(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
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
  let idleTtl = 1800;
  if (typeof body.idleTtlSeconds === "number" && Number.isFinite(body.idleTtlSeconds)) {
    idleTtl = Math.min(28_800, Math.max(300, Math.floor(body.idleTtlSeconds)));
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
        botId: typeof body.botId === "string" ? body.botId : undefined,
        botBundleHash: typeof body.botBundleHash === "string" ? body.botBundleHash : undefined,
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
  const items = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    conversationId: r.id,
    botId: r.botId ?? null,
    model: r.model,
    provider: r.provider,
    securityLevel: r.securityLevel,
    status: r.status,
    checkpointManifest: r.checkpointManifest ?? [],
    receipt: r.receipt ?? null,
    provisionedAt: r.createdAt ?? null,
    lastUsedAt: r.updatedAt ?? null, // Amplify-managed; bumps on every row touch
    terminatedAt: r.terminatedAt ?? null,
  }));
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

// POST /conversations/:id/terminate — close now. Best-effort verified kill
// (already-gone counts as gone), row marked closed + terminatedAt.
// Receipt binding lands in step 7; the row stays for history/audit.
export async function handleConversationTerminate(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId } = ctx;
  const cid = method === "POST" ? convIdFor(path, "terminate") : null;
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row) return json(404, { error: "conversation not found" });
  if (row.status !== "live") return json(200, { ok: true, alreadyClosed: true });
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
  try {
    await dataClient.models.Conversation.update({
      id: cid,
      status: "closed",
      terminatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json(500, { error: `VM ${verified ? "terminated" : "kill unverified"} but row update failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  return json(200, { ok: true, verified });
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

// GET /conversations/:id/key — release the escrowed conversation key to
// the owner over TLS (client-side history decrypt). Works live or
// closed; the master key never leaves the server.
export async function handleConversationKey(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId } = ctx;
  const cid = method === "GET" ? convIdFor(path, "key") : null;
  if (!cid) return null;
  const row = await getOwnedConversation(ownerId, cid);
  if (!row || !row.encryptedKey) return json(404, { error: "conversation not found" });
  let key: Buffer;
  try {
    key = unwrapConversationKey(row.encryptedKey);
  } catch {
    return json(500, { error: "key unwrap failed" });
  }
  return json(200, { key: key.toString("base64") });
}
