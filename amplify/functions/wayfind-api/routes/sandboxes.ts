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
}

async function getOwnedSandbox(owner: string, sandboxId: string): Promise<SandboxRow | null> {
  const { data } = await dataClient.models.SandboxSession.sandboxSessionsByOwnerId({ ownerId: owner });
  const row = ((data ?? []) as unknown as SandboxRow[]).find((r) => r.sandboxId === sandboxId);
  return row ?? null;
}

function sandboxIdFor(path: string, suffix: string): string | null {
  const m = path.match(new RegExp(`/sandboxes/([^/]+)/${suffix}$`));
  return m ? m[1] : null;
}

// POST /sandboxes — spawn an inner sandbox.
// Body: { computerId?, goal?, goalHash?, fileEnvelopes?, model?,
//         idleTtlSeconds? }. fileEnvelopes = sealed [{path,sha256,nonce,
// data}] pushed direct-to-inner (bytes never transit the outer).
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
    });
    if (!hookRes.ok) throw new Error(`/hooks/run → ${hookRes.status}: ${(await hookRes.text()).slice(0, 200)}`);
    const smokeRes = await vmFetch(endpoint, token, "/exec", { cmd: "true" }, sessionToken);
    if (!smokeRes.ok) throw new Error(`/exec smoke → ${smokeRes.status}`);
    // Sealed file intake: envelopes move control-plane → inner directly.
    // The outer never decrypts; the relay never sees plaintext.
    const envelopes = Array.isArray(body.fileEnvelopes) ? body.fileEnvelopes : [];
    if (envelopes.length > 0) {
      const push = await vmFetch(endpoint, token, "/sync/in", { files: envelopes }, sessionToken);
      if (!push.ok) throw new Error(`/sync/in → ${push.status}: ${(await push.text()).slice(0, 200)}`);
    }
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
      files: envelopes.length,
    });
    return json(200, {
      sandboxId: run.microvmId,
      model,
      provider: curated.provider,
      securityLevel: "verified_inference",
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
// Body: { sub? (default "exec"), body? }. A computer caller may only reach
// sandboxes it spawned (parentComputerId binding); a user bearer may reach
// any own row.
export async function handleSandboxesMessage(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  const sid = method === "POST" ? sandboxIdFor(path, "message") : null;
  if (!sid) return null;
  let body: { computerId?: unknown; sub?: unknown; body?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as { computerId?: unknown; sub?: unknown; body?: unknown };
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
  const sub = typeof body.sub === "string" && body.sub ? body.sub.replace(/^\/+/, "") : "exec";
  if (!/^[A-Za-z0-9/_-]+$/.test(sub)) return json(400, { error: "bad relay sub-path" });
  let endpoint: string;
  try {
    endpoint = await waitForRunning(sid, 30_000);
  } catch {
    return json(410, { error: "that sandbox no longer exists" });
  }
  let token: string;
  try {
    token = await mintVmToken(sid, 30);
  } catch {
    return json(502, { error: "microvm token mint failed" });
  }
  void touchSession(row.id);
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

// POST /sandboxes/:id/terminate — close now. Final sealed snapshot +
// evidence pull first (returned inline so the outer stores the evidence),
// then verified kill, row marked terminated, signed receipt v0.
// The receipt binds { parentComputerId, sandboxId, goalHash } — nesting
// proof. Body: { computerId?, goalHash? } (goalHash echoes the spawn
// binding into the receipt; spawn-time audit carries it regardless).
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
    goalHash: typeof body.goalHash === "string" ? body.goalHash : null,
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
    return json(500, { error: `VM ${verified ? "terminated" : "kill unverified"} but row update failed: ${err instanceof Error ? err.message : String(err)}`, receipt });
  }
  void emitAudit(ownerId, actor, "sandbox.terminated", sid, { verified, receiptClass: receipt.class });
  return json(200, { ok: true, verified, receipt, result: null, evidence: finalEvidence });
}
