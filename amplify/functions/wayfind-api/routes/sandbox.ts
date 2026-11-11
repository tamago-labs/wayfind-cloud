import { RunMicrovmCommand } from "@aws-sdk/client-lambda-microvms";
import { randomBytes } from "crypto";
import { CORS, json } from "../lib/respond.js";
import { dataClient, env, microvms } from "../lib/clients.js";
import { stampOwner } from "../lib/owner.js";
import {
  findActiveSession,
  mintVmToken,
  terminateAndVerify,
  touchSession,
  vmFetch,
  waitForRunning,
} from "../lib/microvm.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /sandbox/provision — boot a disposable exec sandbox (P1).
// Body: { idleTtlSeconds? (300..28800, default 1800), reuse?: boolean }.
// reuse:true returns the caller's live session instead of booting when one
// exists (warm path for `run`). Always records a SandboxSession row.
// Returns { sandboxId, endpoint, sessionToken, provisionedAt, reused }.
export async function handleSandboxProvision(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.endsWith("/sandbox/provision") || method !== "POST") return null;
  const imageArn = env.EXEC_IMAGE_ARN;
  if (!imageArn) return json(500, { error: "EXEC_IMAGE_ARN is not configured" });
  let idleTtl = 1800;
  let reuse = false;
  try {
    const parsed = JSON.parse(event.body ?? "{}") as { idleTtlSeconds?: unknown; reuse?: unknown };
    if (typeof parsed.idleTtlSeconds === "number" && Number.isFinite(parsed.idleTtlSeconds)) {
      idleTtl = Math.min(28_800, Math.max(300, Math.floor(parsed.idleTtlSeconds)));
    }
    if (parsed.reuse === true) reuse = true;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  // Warm path: an existing live session wins over a fresh boot.
  if (reuse) {
    const live = await findActiveSession(ownerId);
    if (live?.sandboxId) {
      void touchSession(live.id);
      return json(200, {
        sandboxId: live.sandboxId,
        endpoint: live.endpoint,
        sessionToken: live.sessionToken,
        provisionedAt: live.provisionedAt,
        reused: true,
      });
    }
  }
  const region = env.COMPUTER_REGION ?? "ap-southeast-1";
  let bootedMicrovmId: string | undefined;
  try {
    const run = await microvms.send(
      new RunMicrovmCommand({
        imageIdentifier: imageArn,
        runHookPayload: JSON.stringify({ provisionedFor: ownerId, purpose: "wayfind-exec" }),
        ingressNetworkConnectors: [
          `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:ALL_INGRESS`,
        ],
        egressNetworkConnectors: [
          // NOTE: full egress until P1 workstream 3 lands the allowlist.
          `arn:aws:lambda:${region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`,
        ],
        // Disposable: no auto-resume, short idle TTL, hard 8h cap.
        // suspendedDurationSeconds is type-required but inert here:
        // suspend/resume hooks are DISABLED on the exec image, so an
        // idle VM never comes back — it ages out and terminates.
        idlePolicy: { autoResumeEnabled: false, maxIdleDurationSeconds: idleTtl, suspendedDurationSeconds: 3600 },
        maximumDurationInSeconds: 28_800,
      }),
    );
    if (!run.microvmId) throw new Error("run-microvm returned no microvmId");
    bootedMicrovmId = run.microvmId;
    const endpoint = await waitForRunning(run.microvmId);
    const token = await mintVmToken(run.microvmId);
    // Session bearer: the exec agent gates everything on this.
    // Unguessable; recorded on the owner's SandboxSession row (same
    // secrecy as Computer.usageToken) so the relay can resolve it.
    const sessionToken = randomBytes(32).toString("base64url");
    const hookRes = await vmFetch(endpoint, token, "/hooks/run", { sessionToken });
    if (!hookRes.ok) throw new Error(`/hooks/run → ${hookRes.status}: ${(await hookRes.text()).slice(0, 200)}`);
    // Smoke: the agent answers an exec with the fresh session bearer.
    const smokeRes = await vmFetch(endpoint, token, "/exec", { cmd: "true" }, sessionToken);
    if (!smokeRes.ok) throw new Error(`/exec smoke → ${smokeRes.status}`);
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
      });
      if (errors || !row) throw new Error(JSON.stringify(errors));
      await stampOwner("SandboxSession", (row as unknown as { id: string }).id, ownerId);
    } catch (rowErr) {
      console.error(`[wayfind-api] session row write failed (session still usable):`, rowErr);
    }
    return json(200, {
      sandboxId: run.microvmId,
      endpoint,
      sessionToken,
      provisionedAt,
      reused: false,
    });
  } catch (err) {
    if (bootedMicrovmId) {
      const gone = await terminateAndVerify(bootedMicrovmId);
      if (gone) {
        console.log(`[wayfind-api] terminated ${bootedMicrovmId} after failed sandbox provision`);
      }
    }
    return json(502, { error: `sandbox provision failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}

// GET /sandbox/session — the caller's live session, if any.
// Powers `run` warm reuse and `status` without the caller holding ids.
// The session bearer is NOT returned here (relay resolves it server-side).
export async function handleSandboxSession(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId } = ctx;
  if (!path.endsWith("/sandbox/session") || method !== "GET") return null;
  const live = await findActiveSession(ownerId);
  if (!live?.sandboxId) return json(200, { session: null });
  return json(200, {
    session: {
      sandboxId: live.sandboxId,
      endpoint: live.endpoint,
      provisionedAt: live.provisionedAt,
      lastUsedAt: live.lastUsedAt,
    },
  });
}

// POST /sandbox/terminate { sandboxId? } — end a session now.
// sandboxId optional: without it, terminates the caller's live session.
// Ownership = the caller's own SandboxSession row, plus the agent
// re-verifies the stored bearer (proof-of-holdership, not guessing).
export async function handleSandboxTerminate(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.endsWith("/sandbox/terminate") || method !== "POST") return null;
  let sandboxId = "";
  let sessionToken = "";
  try {
    const parsed = JSON.parse(event.body ?? "{}") as { sandboxId?: unknown; sessionToken?: unknown };
    if (typeof parsed.sandboxId === "string") sandboxId = parsed.sandboxId;
    if (typeof parsed.sessionToken === "string") sessionToken = parsed.sessionToken;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  // No ids given → terminate the caller's live session (row-resolved).
  if (!sandboxId) {
    const live = await findActiveSession(ownerId);
    if (!live?.sandboxId) return json(200, { ok: true, alreadyGone: true });
    sandboxId = live.sandboxId;
    sessionToken = typeof live.sessionToken === "string" ? live.sessionToken : "";
  }
  if (!sandboxId || !sessionToken) return json(400, { error: "sandboxId and sessionToken are required" });
  // Capability check: prove the caller holds this session's bearer by
  // running a no-op through the agent with it. Wrong token → 401/503
  // from the agent → 403 here. MicroVM ids are unguessable, but this
  // makes termination proof-of-holdership, not proof-of-guessing.
  try {
    const endpoint = await waitForRunning(sandboxId, 30_000);
    const token = await mintVmToken(sandboxId);
    const probe = await fetch(`https://${endpoint}/exec`, {
      method: "POST",
      headers: {
        "X-aws-proxy-auth": token,
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cmd: "true" }),
    });
    if (probe.status === 401 || probe.status === 503) {
      return json(403, { error: "bad session token for this sandbox" });
    }
    if (!probe.ok) throw new Error(`probe → ${probe.status}`);
  } catch {
    return json(404, { error: "sandbox not found or unreachable" });
  }
  const gone = await terminateAndVerify(sandboxId);
  if (!gone) return json(502, { error: "terminate unverified — check console, VM may still bill" });
  try {
    const { data: rows } = await dataClient.models.SandboxSession.sandboxSessionsByOwnerId({ ownerId });
    for (const r of (rows ?? []) as unknown as Array<{ id: string; sandboxId?: string | null }>) {
      if (r.sandboxId === sandboxId) {
        await dataClient.models.SandboxSession.update({ id: r.id, status: "terminated" });
      }
    }
  } catch { /* best-effort row cleanup */ }
  return json(200, { ok: true });
}

// ANY /sandbox/proxy/* — relay CLI traffic to a disposable sandbox.
// Auth: the caller's user identity (gate). Session resolution: explicit
// X-Sandbox-Id / X-Sandbox-Token headers win; otherwise the caller's
// live SandboxSession row is used (so the CLI needs no stored ids).
// VM token minted server-side per call.
export async function handleSandboxProxy(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.includes("/sandbox/proxy/")) return null;
  const headers = event.headers ?? {};
  let sandboxId: string =
    headers["x-sandbox-id"] ?? headers["X-Sandbox-Id"] ?? headers["X-sandbox-id"] ?? "";
  let sessionToken: string =
    headers["x-sandbox-token"] ?? headers["X-Sandbox-Token"] ?? headers["X-sandbox-token"] ?? "";
  let rowId: string | null = null;
  if (!sandboxId || !sessionToken) {
    const live = await findActiveSession(ownerId);
    if (!live?.sandboxId || typeof live.sessionToken !== "string" || !live.sessionToken) {
      return json(404, { error: "no active sandbox — provision one first" });
    }
    sandboxId = live.sandboxId;
    sessionToken = live.sessionToken;
    rowId = live.id;
  }
  let endpoint: string;
  try {
    endpoint = await waitForRunning(sandboxId, 30_000);
  } catch {
    if (rowId) {
      try {
        await dataClient.models.SandboxSession.update({ id: rowId, status: "terminated" });
      } catch { /* best-effort heal */ }
    }
    return json(410, { error: "that sandbox no longer exists — provision a fresh one" });
  }
  if (rowId) void touchSession(rowId);
  let token: string;
  try {
    token = await mintVmToken(sandboxId, 30);
  } catch {
    return json(502, { error: "microvm token mint failed" });
  }
  const sub = path.slice(path.indexOf("/sandbox/proxy/") + "/sandbox/proxy/".length);
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const ctype = headers["content-type"] ?? headers["Content-Type"];
  const accept = headers["accept"] ?? headers["Accept"];
  let upstream: Response;
  try {
    upstream = await fetch(`https://${endpoint}/${sub}${qs}`, {
      method,
      headers: {
        "X-aws-proxy-auth": token,
        Authorization: `Bearer ${sessionToken}`,
        ...(ctype ? { "Content-Type": ctype } : {}),
        ...(accept ? { Accept: accept } : {}),
      },
      body:
        method === "GET" || method === "HEAD"
          ? undefined
          : event.isBase64Encoded
            ? Buffer.from(event.body ?? "", "base64")
            : (event.body ?? undefined),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(502, { error: `sandbox unreachable: ${msg.slice(0, 200)}` });
  }
  const upType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await upstream.arrayBuffer());
  const textish = /^(text\/|application\/json|application\/.*\+json)/.test(upType);
  return {
    statusCode: upstream.status,
    headers: { ...CORS, "Content-Type": upType },
    body: textish ? buf.toString("utf8") : buf.toString("base64"),
    ...(textish ? {} : { isBase64Encoded: true }),
  };
}
