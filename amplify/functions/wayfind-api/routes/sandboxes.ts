import { RunMicrovmCommand } from "@aws-sdk/client-lambda-microvms";
import { randomBytes } from "crypto";
import { json } from "../lib/respond.js";
import { dataClient, env, microvms } from "../lib/clients.js";
import { stampOwner } from "../lib/owner.js";
import { verifyToken } from "../lib/auth.js";
import {
  mintVmToken,
  terminateAndVerify,
  touchSession,
  vmFetch,
  waitForRunning,
} from "../lib/microvm.js";
import { emitAudit } from "../lib/audit.js";
import { signReceiptBody } from "../lib/receipts.js";
import { loadPolicy } from "../lib/policy.js";
import {
  deriveWorkspaceKey,
  sealWorkspaceFile,
} from "../lib/escrow.js";
import { CURATED_MODELS } from "./conversations.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// ---- Inner sandboxes (PLAN-P2 Phase 2): disposable per-task MicroVMs
// spawned by an outer computer (or directly by the owner). The inner run
// is near-ai-only, verified_inference-only, killed after each task.
//
// Auth is dual (usage.ts pattern): a user bearer (Cognito/CLI) attributes
// to the verified caller; otherwise the outer computer's usage token
// (X-computer-usage-token + body.computerId) attributes to that computer's
// owner. The inner session bearer is minted here and NEVER leaves the
// control plane — the outer relays via /sandboxes/:id/message, so it only
// ever holds its own usageToken.

interface SandboxAuth {
  ownerId: string;
  actor: string;
  computerId: string | null;
}

async function sandboxAuth(ctx: Ctx, body: { computerId?: unknown }): Promise<SandboxAuth | { error: string; status: number }> {
  const authHeader = ctx.event.headers?.authorization ?? ctx.event.headers?.Authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const claims = await verifyToken(authHeader);
      const actor = (claims as { cliTokenId?: string }).cliTokenId
        ? `cli:${(claims as { cliTokenId?: string }).cliTokenId}`
        : `user:${claims.sub}`;
      return { ownerId: claims.sub, actor, computerId: null };
    } catch {
      // Fall through to usage-token auth.
    }
  }
  const usageToken =
    ctx.event.headers?.["x-computer-usage-token"] ??
    ctx.event.headers?.["X-computer-usage-token"] ??
    ctx.event.headers?.["X-Computer-Usage-Token"];
  const computerId = typeof body.computerId === "string" ? body.computerId : "";
  if (!usageToken || !computerId) {
    return { error: "unauthorized: no bearer or usage token", status: 401 };
  }
  const { data: computer } = await dataClient.models.Computer.get({ id: computerId });
  const c = computer as unknown as { id: string; ownerId?: string; usageToken?: string | null } | null;
  if (!c || !c.usageToken || c.usageToken !== usageToken) {
    return { error: "unauthorized: bad usage token", status: 401 };
  }
  return { ownerId: c.ownerId ?? "", actor: `computer:${computerId}`, computerId };
}

interface SandboxRow {
  id: string;
  ownerId?: string | null;
  sandboxId?: string | null;
  sessionToken?: string | null;
  endpoint?: string | null;
  status?: string | null;
  provisionedAt?: string | null;
  parentComputerId?: string | null;
  policy?: string | null;
  profile?: string | null;
}

async function getOwnedSandbox(owner: string, sandboxId: string): Promise<SandboxRow | null> {
  const { data } = await dataClient.models.SandboxSession.sandboxSessionsByOwnerId({ ownerId: owner });
  const row = ((data ?? []) as unknown as SandboxRow[]).find((r) => r.sandboxId === sandboxId);
  return row ?? null;
}

function cleanSandboxPath(p: unknown): string | null {
  if (typeof p !== "string" || !p || p.length > 256) return null;
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.length === 0 || parts.some((s) => s === ".." || s === ".wayfind")) return null;
  return parts.join("/");
}

interface SealedFile {
  path: string;
  sha256: string;
  nonce: string;
  data: string;
}

// Seal caller-supplied plaintext inputs + pre-sealed envelopes into the
// inner-VM /sync/in shape. Plaintext lives only in this Lambda's memory.
function sealSandboxFiles(
  wsKey: Buffer,
  fileInputs: unknown,
  fileEnvelopes: unknown,
): SealedFile[] {
  const sealed: SealedFile[] = [];
  const inputs = Array.isArray(fileInputs) ? fileInputs : [];
  if (inputs.length > 20) throw new Error("fileInputs: max 20 files");
  for (const f of inputs as Array<{ path?: unknown; contentBase64?: unknown }>) {
    const rel = cleanSandboxPath(f?.path);
    if (!rel) throw new Error("fileInputs: bad path (jailed, no .wayfind)");
    if (typeof f?.contentBase64 !== "string") throw new Error("fileInputs: contentBase64 required");
    const bytes = Buffer.from(f.contentBase64, "base64");
    if (bytes.length > 10 * 1024 * 1024) throw new Error(`fileInputs: ${rel} exceeds 10MB`);
    const s = sealWorkspaceFile(wsKey, rel, bytes);
    sealed.push({ path: rel, ...s });
  }
  const preSealed = Array.isArray(fileEnvelopes) ? fileEnvelopes : [];
  for (const e of preSealed as Array<{ path?: unknown; sha256?: string; nonce?: string; data?: string }>) {
    const rel = cleanSandboxPath(e?.path);
    if (!rel || typeof e?.sha256 !== "string" || typeof e?.nonce !== "string" || typeof e?.data !== "string") {
      throw new Error("fileEnvelopes: each needs { path, sha256, nonce, data }");
    }
    sealed.push({ path: rel, sha256: e.sha256, nonce: e.nonce, data: e.data });
  }
  return sealed;
}

async function pushSealedFiles(
  endpoint: string,
  token: string,
  sessionToken: string,
  sealed: SealedFile[],
): Promise<void> {
  if (sealed.length === 0) return;
  const push = await vmFetch(endpoint, token, "/sync/in", { files: sealed }, sessionToken);
  if (!push.ok) throw new Error(`/sync/in → ${push.status}: ${(await push.text()).slice(0, 200)}`);
}

function sandboxIdFor(path: string, suffix: string): string | null {
  const m = path.match(new RegExp(`/sandboxes/([^/]+)/${suffix}$`));
  return m ? m[1] : null;
}

// GET /sandboxes[?computerId=] — live inner sandboxes for the composer
// picker and the Sandboxes panel. User bearer → own active rows; usage
// token (+computerId) → that computer's active runs. Metadata only —
// no bearer, no endpoint, no session token ever leaves the control plane.
export async function handleSandboxesList(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/sandboxes") || method !== "GET" || path.includes("/sandboxes/")) return null;
  const qs = new URLSearchParams(event.rawQueryString ?? "");
  const qComputer = qs.get("computerId") ?? undefined;
  const auth = await sandboxAuth(ctx, qComputer ? { computerId: qComputer } : {});
  if ("error" in auth) return json(auth.status, { error: auth.error });
  if (!auth.ownerId) return json(401, { error: "unauthorized: no owner" });
  const { data } = await dataClient.models.SandboxSession.sandboxSessionsByOwnerId({ ownerId: auth.ownerId });
  const items = ((data ?? []) as unknown as SandboxRow[])
    .filter((r) => r.status === "active")
    .filter((r) => !auth.computerId || r.parentComputerId === auth.computerId)
    .map((r) => ({
      sandboxId: r.sandboxId,
      profile: r.profile ?? "analysis",
      policy: r.policy ?? "verified_inference",
      parentComputerId: r.parentComputerId ?? null,
      provisionedAt: r.provisionedAt ?? null,
      lastUsedAt: (r as { lastUsedAt?: string | null }).lastUsedAt ?? null,
    }));
  return json(200, { sandboxes: items });
}

// POST /sandboxes — spawn an inner sandbox.
// Body: { computerId?, goal?, goalHash?, fileInputs?, fileEnvelopes?,
//         model?, idleTtlSeconds? }.
// fileInputs = [{ path, contentBase64 }] plaintext from the outer computer
// (it legitimately holds these bytes): sealed HERE with the inner
// session-derived workspace key before pushing, so the inner VM receives
// sealed envelopes and nothing sensitive is persisted in the clear.
// fileEnvelopes = pre-sealed [{path,sha256,nonce,data}] (for callers that
// can seal). Path jail + 10MB/file + 20 files max, fail closed.
// Policy is pinned by construction: curated near-ai model only,
// verified_inference only — no securityLevel param exists to weaken.
// Returns { sandboxId, model, provider, provisionedAt } — no endpoint,
// no bearer: relay via /sandboxes/:id/message.
export async function handleSandboxesSpawn(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/sandboxes") || method !== "POST" || path.includes("/sandboxes/")) return null;
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const auth = await sandboxAuth(ctx, body);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  if (!auth.ownerId) return json(401, { error: "unauthorized: no owner" });
  const { ownerId, actor, computerId } = auth;

  const model = typeof body.model === "string" && body.model ? body.model : "Qwen/Qwen3.8-27B";
  const curated = CURATED_MODELS[model];
  if (!curated) {
    return json(400, { error: `model not curated: ${model} (inner sandboxes run near-ai only)` });
  }
  if (curated.provider !== "near-ai") {
    return json(501, { error: `provider not wired for inner sandboxes: ${curated.provider}` });
  }
  const goalHash =
    typeof body.goalHash === "string" && body.goalHash ? body.goalHash : undefined;
  // Policy is enforced INSIDE the sandbox (see packages/sandbox): the run
  // policy rides in /hooks/run and the image refuses to violate it —
  // no attestation, no run; model outside the allowlist, no inference.
  // Spawn stays dumb on purpose: a creation-time gate here would be
  // bypassable by anyone who can call RunMicrovm; in-image enforcement
  // is not. The owner's allowed-models list is passed down (not gated
  // on) so the image enforces the owner's own rule.
  const ownerPolicy = await loadPolicy(ownerId);
  const runPolicy = {
    securityLevel: "verified_inference",
    allowedModels: ownerPolicy.allowedModels.length > 0 ? ownerPolicy.allowedModels : [model],
  };
  // Sandbox profile: review (read-only tools, cheapest) or analysis (+exec).
  // Same image today; the image gates tool registration on the boot profile.
  const profile = typeof body.profile === "string" && body.profile ? body.profile : "analysis";
  if (profile !== "review" && profile !== "analysis") {
    return json(400, { error: "profile must be review | analysis" });
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
        runHookPayload: JSON.stringify({ provisionedFor: ownerId, purpose: "wayfind-sandbox-inner" }),
        ingressNetworkConnectors: [
          `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`,
        ],
        egressNetworkConnectors: [
          // NOTE: full egress until the NEAR-only allowlist lands (inner
          // agent-loop work, PLAN-P2 Phase 2). Policy pin verified_inference
          // is enforced at the inference layer regardless.
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
    const nearKey = env.NEARAI_CLOUD_API_KEY ?? "";
    if (!nearKey) throw new Error("NEARAI_CLOUD_API_KEY is not configured (Amplify secret)");
    const hookRes = await vmFetch(endpoint, token, "/hooks/run", {
      sessionToken,
      aiCredentials: { provider: "near-ai", key: nearKey, model },
      policy: runPolicy,
      profile,
    });
    if (!hookRes.ok) throw new Error(`/hooks/run → ${hookRes.status}: ${(await hookRes.text()).slice(0, 200)}`);
    // Smoke: prove the fresh session bearer works. Review profile disables
    // exec by design, so smoke it with a read-path call instead.
    const smokeRes =
      profile === 'review'
        ? await vmFetch(endpoint, token, '/glob', { pattern: '*' }, sessionToken)
        : await vmFetch(endpoint, token, '/exec', { cmd: 'true' }, sessionToken);
    if (!smokeRes.ok) throw new Error(`/exec smoke → ${smokeRes.status}`);
    // Sealed file intake (see sealSandboxFiles): the inner VM receives
    // sealed envelopes via /sync/in; the outer never handles anything
    // it can't already read.
    const sealed = sealSandboxFiles(deriveWorkspaceKey(sessionToken), body.fileInputs, body.fileEnvelopes);
    await pushSealedFiles(endpoint, token, sessionToken, sealed);
    const provisionedAt = new Date().toISOString();
    try {
      const { data: row, errors } = await dataClient.models.SandboxSession.create({
        ownerId,
        sandboxId: run.microvmId,
        sessionToken,
        endpoint,
        status: "active",
        provisionedAt,
        lastUsedAt: provisionedAt,
        parentComputerId: computerId ?? undefined,
        policy: "verified_inference",
        profile,
      });
      if (errors || !row) throw new Error(JSON.stringify(errors));
      await stampOwner("SandboxSession", (row as unknown as { id: string }).id, ownerId);
    } catch (rowErr) {
      // Fail closed: without the row there is no nesting link or audit.
      throw new Error(`sandbox row write failed: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`);
    }
    void emitAudit(ownerId, actor, "sandbox.spawned", run.microvmId, {
      parentComputerId: computerId ?? null,
      goalHash: goalHash ?? null,
      model,
      provider: curated.provider,
      files: sealed.length,
      runPolicy,
      profile,
    });
    return json(200, {
      sandboxId: run.microvmId,
      model,
      provider: curated.provider,
      securityLevel: "verified_inference",
      policy: runPolicy,
      profile,
      provisionedAt,
    });
  } catch (err) {
    if (bootedMicrovmId) {
      const gone = await terminateAndVerify(bootedMicrovmId);
      if (gone) {
        console.log(`[wayfind-api] terminated ${bootedMicrovmId} after failed inner sandbox spawn`);
      }
    }
    return json(502, { error: `inner sandbox spawn failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}

// POST /sandboxes/:id/message — relay a call to the live inner VM.
// Body: { sub? (default "exec"), body?, fileInputs? }. fileInputs are
// sealed with the inner session key and pushed via /sync/in before the
// relay — mid-run uploads to a live sandbox. A computer caller may only
// reach sandboxes it spawned (parentComputerId binding); a user bearer
// may reach any own row.
export async function handleSandboxesMessage(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  const sid = method === "POST" ? sandboxIdFor(path, "message") : null;
  if (!sid) return null;
  let body: { computerId?: unknown; sub?: unknown; body?: unknown; fileInputs?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { computerId?: unknown; sub?: unknown; body?: unknown; fileInputs?: unknown };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const auth = await sandboxAuth(ctx, body);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  const row = await getOwnedSandbox(auth.ownerId, sid);
  if (!row || row.status !== "active" || !row.sessionToken) {
    return json(410, { error: "sandbox is not live" });
  }
  if (auth.computerId && row.parentComputerId !== auth.computerId) {
    return json(403, { error: "this computer did not spawn that sandbox" });
  }
  if (body.fileInputs !== undefined) {
    try {
      const sealed = sealSandboxFiles(deriveWorkspaceKey(row.sessionToken), body.fileInputs, undefined);
      const endpoint = await waitForRunning(sid, 30_000);
      const token = await mintVmToken(sid, 30);
      await pushSealedFiles(endpoint, token, row.sessionToken, sealed);
    } catch (err) {
      return json(400, { error: `file intake failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) });
    }
  }
  const sub = typeof body.sub === "string" && body.sub ? body.sub.replace(/^\/+/, "") : "exec";
  if (!/^[A-Za-z0-9/_-]+$/.test(sub)) return json(400, { error: "bad relay sub-path" });
  void touchSession(row.id);
  try {
    const data = await relayToSandbox(sid, row.sessionToken, sub, body.body);
    return json(200, { result: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const m = msg.match(/^(\d+):\s*(.*)$/);
    const status = m ? Number(m[1]) : 502;
    if (status === 410) {
      try {
        await dataClient.models.SandboxSession.update({ id: row.id, status: "terminated" });
      } catch { /* best-effort heal */ }
      return json(410, { error: "that sandbox no longer exists" });
    }
    if (status === 502 && /microvm token mint|agent unreachable|non-JSON/.test(msg)) {
      return json(502, { error: (m?.[2] ?? msg).slice(0, 300) });
    }
    return json(status >= 400 && status < 600 ? status : 502, { error: (m?.[2] ?? msg).slice(0, 300) });
  }
}

// Shared relay: POST a sub-call to the live inner VM. Returns the parsed
// upstream body or throws with a status-coded message.
async function relayToSandbox(
  sid: string,
  sessionToken: string,
  sub: string,
  body: unknown,
): Promise<unknown> {
  let endpoint: string;
  try {
    endpoint = await waitForRunning(sid, 30_000);
  } catch {
    throw new Error("410: that sandbox no longer exists");
  }
  let token: string;
  try {
    token = await mintVmToken(sid, 30);
  } catch {
    throw new Error("502: microvm token mint failed");
  }
  let upstream: Response;
  try {
    upstream = await fetch(`https://${endpoint}/${sub}`, {
      method: "POST",
      headers: {
        "X-aws-proxy-auth": token,
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify((body as Record<string, unknown> | undefined) ?? {}),
    });
  } catch (err) {
    throw new Error(`502: agent unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("502: agent returned non-JSON");
  }
  if (!upstream.ok) {
    throw new Error(`${upstream.status}: ${(data as { error?: string } | null)?.error ?? `agent → ${upstream.status}`}`);
  }
  return data;
}

// Shared closeout: final sealed snapshot + evidence pull, verified kill,
// row marked terminated, signed receipt. Used by terminate and run.
async function closeSandbox(
  ownerId: string,
  actor: string,
  row: SandboxRow,
  sid: string,
  goalHash: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let finalEvidence: unknown = null;
  let finalSnapshot: { recorded: boolean; seq?: number; sha256?: string; error?: string } = { recorded: false };
  if (row.sessionToken) {
    try {
      const endpoint = await waitForRunning(sid, 30_000);
      const token = await mintVmToken(sid, 30);
      const authz = { "X-aws-proxy-auth": token, Authorization: `Bearer ${row.sessionToken}` };
      const snap = await fetch(`https://${endpoint}/checkpoint`, { method: "POST", headers: authz });
      if (snap.ok) {
        const env = (await snap.json()) as { seq?: unknown; sha256?: string; nonce?: string; data?: string };
        if (typeof env.sha256 === "string" && typeof env.nonce === "string" && typeof env.data === "string") {
          finalSnapshot = { recorded: true, sha256: env.sha256.toLowerCase() };
          finalEvidence = { checkpoint: env };
        } else {
          finalSnapshot = { recorded: false, error: "agent returned a malformed envelope" };
        }
      }
      try {
        const ev = await fetch(`https://${endpoint}/bot/evidence`, { method: "POST", headers: authz });
        if (ev.ok) {
          const botEv = await ev.json();
          finalEvidence = { ...(finalEvidence as Record<string, unknown> | null ?? {}), botEvidence: botEv };
        }
      } catch {
        // Older images lack /bot/evidence — inference evidence stays null.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[wayfind-api] final snapshot skipped for inner sandbox ${sid}: ${msg}`);
      if (!finalSnapshot.recorded && !finalSnapshot.error) {
        finalSnapshot = { recorded: false, error: msg.slice(0, 200) };
      }
    }
  } else {
    finalSnapshot = { recorded: false, error: "no live session on record" };
  }
  let verified = false;
  try {
    verified = await terminateAndVerify(sid);
  } catch {
    verified = false;
  }
  const terminatedAt = new Date().toISOString();
  const receipt: Record<string, unknown> = {
    version: "wayfind-receipt/v0",
    class: "signed",
    kind: "inner-sandbox",
    sandboxId: sid,
    parentComputerId: row.parentComputerId ?? null,
    goalHash: goalHash,
    model: "Qwen/Qwen3.8-27B",
    provider: "near-ai",
    securityLevel: "verified_inference",
    policy: row.policy ?? "verified_inference",
    provisionedAt: row.provisionedAt ?? null,
    terminatedAt,
    cleanup: { vmTerminated: verified },
    finalSnapshot,
    inference: finalEvidence,
  };
  try {
    receipt.signature = signReceiptBody(receipt);
  } catch (err) {
    delete receipt.signature;
    receipt.class = "observed";
    console.log(`[wayfind-api] receipt left unsigned for inner sandbox ${sid}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const { data: updated, errors: updateErrors } = await dataClient.models.SandboxSession.update({
      id: row.id,
      status: "terminated",
    });
    if (updateErrors || !updated) {
      throw new Error(`row update rejected: ${JSON.stringify(updateErrors)}`);
    }
  } catch (err) {
    return { status: 500, body: { error: `VM ${verified ? "terminated" : "kill unverified"} but row update failed: ${err instanceof Error ? err.message : String(err)}`, receipt } };
  }
  void emitAudit(ownerId, actor, "sandbox.terminated", sid, { verified, receiptClass: receipt.class });
  return { status: 200, body: { ok: true, verified, receipt, result: null, evidence: finalEvidence } };
}

// POST /sandboxes/:id/terminate — close now (see closeSandbox).
// Body: { computerId?, goalHash? }.
export async function handleSandboxesTerminate(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  const sid = method === "POST" ? sandboxIdFor(path, "terminate") : null;
  if (!sid) return null;
  let body: { computerId?: unknown; goalHash?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { computerId?: unknown; goalHash?: unknown };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const auth = await sandboxAuth(ctx, body);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  const { ownerId, actor } = auth;
  const row = await getOwnedSandbox(ownerId, sid);
  if (!row) return json(404, { error: "sandbox not found" });
  if (row.status !== "active") return json(200, { ok: true, alreadyClosed: true });
  if (auth.computerId && row.parentComputerId !== auth.computerId) {
    return json(403, { error: "this computer did not spawn that sandbox" });
  }
  const out = await closeSandbox(ownerId, actor, row, sid, typeof body.goalHash === "string" ? body.goalHash : null);
  return json(out.status, out.body);
}

// POST /sandboxes/:id/run — one-shot direct run for the composer sandbox
// bar: bot_init → bot/message → closeout, all server-side in one call.
// Body: { computerId?, goal, goalHash? }. The sandbox must already be
// spawned (files ride the spawn call). Returns { result, evidence,
// receipt, verified } — no polling, no frontend state machine.
export async function handleSandboxesRun(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  const sid = method === "POST" ? sandboxIdFor(path, "run") : null;
  if (!sid) return null;
  let body: { computerId?: unknown; goal?: unknown; goalHash?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { computerId?: unknown; goal?: unknown; goalHash?: unknown };
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (typeof body.goal !== "string" || !body.goal.trim()) {
    return json(400, { error: "goal is required" });
  }
  const auth = await sandboxAuth(ctx, body);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  const { ownerId, actor } = auth;
  const row = await getOwnedSandbox(ownerId, sid);
  if (!row || row.status !== "active" || !row.sessionToken) {
    return json(410, { error: "sandbox is not live" });
  }
  if (auth.computerId && row.parentComputerId !== auth.computerId) {
    return json(403, { error: "this computer did not spawn that sandbox" });
  }
  const goalHash = typeof body.goalHash === "string" ? body.goalHash : null;
  const fail = async (why: string): Promise<RouteResult> => {
    const out = await closeSandbox(ownerId, actor, row, sid, goalHash);
    return json(502, { error: why, ...(out.body as Record<string, unknown>) });
  };
  try {
    const init = (await relayToSandbox(sid, row.sessionToken, "bot/init", {
      system: `Direct sandbox run. Goal sha256: ${goalHash ?? "n/a"}.`,
      model: "Qwen/Qwen3.8-27B",
    })) as { ok?: boolean; error?: string };
    if (!init || init.ok !== true) {
      return fail(`init failed: ${(init as { error?: string })?.error ?? "no ok from agent"}`);
    }
  } catch (err) {
    return fail(`init failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  let result: unknown;
  try {
    const msg = (await relayToSandbox(sid, row.sessionToken, "bot/message", { content: body.goal })) as {
      error?: string;
    };
    if (!msg || typeof msg !== "object") return fail("run returned no result");
    result = msg;
  } catch (err) {
    return fail(`run failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const out = await closeSandbox(ownerId, actor, row, sid, goalHash);
  if (out.status !== 200) return json(out.status, { ...out.body, result });
  return json(200, { ...(out.body as Record<string, unknown>), result });
}
