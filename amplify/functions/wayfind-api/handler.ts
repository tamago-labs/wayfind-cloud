import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/wayfind-api";
import type { Schema } from "../../data/resource";
import {
  LambdaMicrovmsClient,
  CreateMicrovmAuthTokenCommand,
  RunMicrovmCommand,
  SuspendMicrovmCommand,
  ResumeMicrovmCommand,
  TerminateMicrovmCommand,
  GetMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";
import { createVerify, createPublicKey, randomUUID } from "crypto";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();
const microvms = new LambdaMicrovmsClient({ region: env.AWS_REGION ?? process.env.AWS_REGION });

/* ---------------- Cognito JWT verification (no external deps) ---------------- */

interface Claims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  token_use?: string;
  aud?: string;
  exp: number;
  iss: string;
  [k: string]: unknown;
}

let jwksCache: { fetchedAt: number; keys: Map<string, ReturnType<typeof createPublicKey>> } | null = null;

async function getPublicKey(kid: string, iss: string) {
  const now = Date.now();
  if (!jwksCache || now - jwksCache.fetchedAt > 60 * 60 * 1000) {
    const res = await fetch(`${iss}/.well-known/jwks.json`);
    if (!res.ok) throw new Error("jwks fetch failed");
    const jwks = (await res.json()) as { keys: Array<{ kid: string }> };
    const keys = new Map<string, ReturnType<typeof createPublicKey>>();
    for (const jwk of jwks.keys) {
      keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: "jwk" }));
    }
    jwksCache = { fetchedAt: now, keys };
  }
  const key = jwksCache.keys.get(kid);
  if (!key) throw new Error("unknown kid");
  return key;
}

async function verifyToken(authHeader: string | undefined): Promise<Claims> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("missing bearer token");
  const token = authHeader.slice(7);
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed token");

  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as Claims;

  // All env is resource-declared (functions/wayfind-api/resource.ts) — the
  // console shows exactly what the deploy captured.
  const poolId = env.USER_POOL_ID;
  const region = env.AWS_REGION ?? process.env.AWS_REGION;
  if (!poolId || !region) throw new Error("auth not configured");
  const expectedIss = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
  if (claims.iss !== expectedIss) throw new Error("bad issuer");
  if (claims.exp * 1000 < Date.now()) throw new Error("token expired");
  if (claims.token_use !== "id" && claims.token_use !== "access") throw new Error("bad token use");
  const clientId = env.USER_POOL_CLIENT_ID;
  if (claims.token_use === "id" && clientId && claims.aud !== clientId) throw new Error("bad audience");

  const key = await getPublicKey(header.kid, expectedIss);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  const ok = verifier.verify(key, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("bad signature");
  return claims;
}

/* ---------------- helpers ---------------- */

const CORS = {
  // No Access-Control-Allow-Origin here: the Function URL layer sets it
  // (allowedOrigins in backend.ts). Sending it twice breaks browsers.
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});


async function ensureProfile(claims: Claims) {
  const { data: existing } = await dataClient.models.UserProfile.profileByOwnerId({
    ownerId: claims.sub,
  });
  if (existing && existing.length > 0) return existing[0];
  const { data: created, errors } = await dataClient.models.UserProfile.create({
    ownerId: claims.sub,
    email: claims.email ?? "",
    plan: "free",
  });
  if (errors || !created) throw new Error(`profile create failed: ${JSON.stringify(errors)}`);
  return created;
}

/* ---------------- handler ---------------- */

// Bump on every backend behavior change so we can verify what's deployed
// (download the function bundle or hit /health — Amplify keeps stale code
// live when a build fails, and nothing else surfaces that).
const BACKEND_REV = "2026-11-01-relay+guarded-dedupe+stale-heal";

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath || event.requestContext.http.path;

  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  // Public health check
  if (path.endsWith("/health")) {
    return json(200, { ok: true, service: "wayfind-api", phase: 3, rev: BACKEND_REV });
  }

  // POST /runs/:id/usage — agent usage events go to CreditLedger rows (M2).
  // Above the Cognito gate: the VM reporter holds no user JWT. Dual auth —
  // a user bearer attributes to the verified caller; otherwise the
  // per-computer usage token (X-computer-usage-token, minted at provision,
  // injected via /hooks/run) attributes to that computer's owner.
  // Body: { model?, provider?, durationMs?, outputChars?, toolCalls?,
  //         kind?, unit?, quantity?, tokens?: { input, output },
  //         costPer1M?: { input, output }, costUsd?, userId? }.
  // Observe-only: metering never blocks. Delta is negative spend when a
  // price is known, else a 0-delta audit row carrying quantities in reason.
  if (/\/runs\/[^/]+\/usage$/.test(path) && method === "POST") {
    let usageOwner: string | null = null;
    const authHeader = event.headers.authorization ?? event.headers.Authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        usageOwner = (await verifyToken(authHeader)).sub;
      } catch {
        // Fall through to usage-token auth.
      }
    }
    let body: {
      model?: string;
      provider?: string;
      durationMs?: number;
      outputChars?: number;
      toolCalls?: number;
      kind?: string;
      unit?: string;
      quantity?: number;
      tokens?: { input?: number; output?: number };
      costPer1M?: { input?: number; output?: number };
      costUsd?: number;
      spendUsd?: number;
      userId?: string;
    } = {};
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (!usageOwner) {
      const usageToken =
        event.headers["x-computer-usage-token"] ??
        event.headers["X-computer-usage-token"] ??
        event.headers["X-Computer-Usage-Token"];
      const claimedOwner = typeof body.userId === "string" ? body.userId : "";
      if (!usageToken || !claimedOwner) {
        return json(401, { error: "unauthorized: no bearer or usage token" });
      }
      const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId: claimedOwner });
      const match = (computers ?? []).find((c) => c.usageToken && c.usageToken === usageToken);
      if (!match) return json(401, { error: "unauthorized: bad usage token" });
      usageOwner = claimedOwner;
    }
    const runId = path.split("/").slice(-2, -1)[0];
    let delta = 0;
    const { tokens, costPer1M } = body;
    // costUsd (explicit caller claim) or spendUsd (VM-computed) — the VM
    // reporter sends spendUsd; accept both so priced calls meter.
    const claimed = typeof body.costUsd === "number" ? body.costUsd : body.spendUsd;
    if (typeof claimed === "number") {
      delta = -Math.abs(claimed);
    } else if (
      typeof tokens?.input === "number" &&
      typeof tokens?.output === "number" &&
      typeof costPer1M?.input === "number" &&
      typeof costPer1M?.output === "number"
    ) {
      delta = -((tokens.input * costPer1M.input + tokens.output * costPer1M.output) / 1_000_000);
    }
    const qty =
      typeof body.quantity === "number" ? ` ${body.quantity}${body.unit ? ` ${body.unit}` : ""}` : "";
    const reason =
      `model usage run=${runId} provider=${body.provider ?? "?"} model=${body.model ?? "?"} ` +
      `kind=${body.kind ?? "chat"}${qty} ` +
      `tokens=${tokens ? `${tokens.input ?? 0}in/${tokens.output ?? 0}out` : "unknown"} ` +
      `tools=${body.toolCalls ?? 0} durationMs=${body.durationMs ?? 0}`;
    // Running balance = sum of all prior deltas + this one. Cheap enough
    // at current volumes; revisit with a stored balance + pagination later.
    let balanceAfter: number | null = null;
    try {
      const { data: rows } = await dataClient.models.CreditLedger.ledgerByOwnerId({ ownerId: usageOwner });
      const prior = (rows ?? []).reduce((sum, r) => sum + (r.delta ?? 0), 0);
      balanceAfter = Math.round((prior + delta) * 1_000_000) / 1_000_000;
    } catch {
      balanceAfter = null;
    }
    const { data: entry, errors } = await dataClient.models.CreditLedger.create({
      ownerId: usageOwner,
      delta,
      reason,
      balanceAfter,
      runId,
    });
    if (errors || !entry) {
      return json(500, { error: `ledger write failed: ${JSON.stringify(errors)}` });
    }
    return json(200, { ok: true, ledgerId: entry.id, delta, balanceAfter });
  }

  // Everything below requires a verified Cognito token
  let claims: Claims;
  try {
    claims = await verifyToken(event.headers.authorization ?? event.headers.Authorization);
  } catch (err) {
    return json(401, { error: `unauthorized: ${(err as Error).message}` });
  }
  const ownerId = claims.sub;

  try {
    // POST /computer/request - get-or-create the caller's Computer row.
    // No approval gate: any signed-in user may provision (gatekeeper removed).
    if (path.endsWith("/computer/request") && method === "POST") {
      const profile = await ensureProfile(claims);
      const { data: existing } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
      let computer = pickComputer(existing);
      if (!computer) {
        const { data: created, errors } = await dataClient.models.Computer.create({
          ownerId,
          userProfileId: profile.id,
          provisionStatus: "not_provisioned",
          region: "ap-southeast-1",
          requestedAt: new Date().toISOString(),
        });
        if (errors || !created) {
          return json(500, { error: `computer create failed: ${JSON.stringify(errors)}` });
        }
        computer = created;
      }
      if (computer) void dedupeComputers(ownerId, computer.id);
      return json(200, { data: computer });
    }

    // POST /chat/message â€” Phase 4 (chat + model runtime). Honest stub.
    // POST /computer/provision - boot the caller's VM (idempotent).
    // Returns the Computer row immediately; the footer polls provisionStatus.
    // Awaited inline (boot ~11s + hooks + smoke < 60s, fits the 300s budget).
    if (path.endsWith("/computer/provision") && method === "POST") {
      const profile = await ensureProfile(claims);
      let computer = await findOrCreateComputer(ownerId, profile.id);
      // Self-heal rows whose VM is gone (terminated out-of-band or by the
      // suspend-window expiry): fall through to a fresh provision.
      if (computer.microvmId && (computer.provisionStatus === "running" || computer.provisionStatus === "suspended")) {
        try {
          if (!(await vmAlive(computer.microvmId))) {
            await resetStaleRow(computer.id);
            computer = { ...computer, provisionStatus: "not_provisioned", microvmId: "" };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return json(502, { error: `computer state check failed: ${msg.slice(0, 200)}` });
        }
      }
      if (computer.provisionStatus === "running") return json(200, { data: computer });
      if (computer.provisionStatus === "provisioning") return json(202, { data: computer });
      if (computer.provisionStatus === "suspended") {
        return json(409, { error: "computer is suspended - use POST /computer/action {resume}", data: computer });
      }
      // Converge leftover duplicate rows: dead VMs get cleared (later
      // dedupe removes the husk); live ones are left alone, never deleted.
      try {
        const { data: all } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
        for (const r of all ?? []) {
          if (r.id === computer.id || !r.microvmId) continue;
          try {
            if (!(await vmAlive(r.microvmId))) {
              await resetStaleRow(r.id);
              console.log(`[wayfind-api] cleared stale computer row ${r.id}`);
            }
          } catch {
            // Per-row check failed - leave it for the next call.
          }
        }
      } catch {
        // Listing failed - provision the picked row anyway.
      }
      try {
        await provisionComputer(computer.id, ownerId);
        const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
        return json(200, { data: updated ?? computer });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[wayfind-api] provision failed:", msg);
        return json(502, { error: `provision failed: ${msg.slice(0, 300)}` });
      }
    }

    // POST /computer/action {suspend|resume|terminate} - caller's own VM only.
    if (path.endsWith("/computer/action") && method === "POST") {
      let body: { action?: string } = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }
      const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
      const computer = pickComputer(computers);
      if (computer && computers && computers.length > 1) void dedupeComputers(ownerId, computer.id);
      if (!computer?.microvmId) return json(404, { error: "no provisioned MicroVM for this account" });
      const microvmId = computer.microvmId;
      // The VM may be gone (suspend-window expiry, out-of-band delete) while
      // the row still claims it. Terminate heals silently; resume/suspend say so.
      if (!(await vmAlive(microvmId))) {
        await resetStaleRow(computer.id);
        if (body.action === "terminate") {
          const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
          return json(200, { data: updated });
        }
        return json(410, { error: "that MicroVM no longer exists - press Start computer for a fresh one" });
      }
      try {
        if (body.action === "suspend") {
          // Best-effort workspace flush before suspend.
          try {
            const token = await mintVmToken(microvmId, 5);
            await vmFetch(computer.endpoint ?? "", token, "/hooks/suspend", {});
          } catch {
            // VM may already be unreachable - suspend anyway.
          }
          await microvms.send(new SuspendMicrovmCommand({ microvmIdentifier: microvmId }));
          const { data: updated } = await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "suspended" });
          return json(200, { data: updated });
        }
        if (body.action === "resume") {
          await microvms.send(new ResumeMicrovmCommand({ microvmIdentifier: microvmId }));
          const endpoint = await waitForRunning(microvmId);
          const { data: updated } = await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "running", endpoint });
          return json(200, { data: updated });
        }
        if (body.action === "terminate") {
          try {
            const token = await mintVmToken(microvmId, 5);
            await vmFetch(computer.endpoint ?? "", token, "/hooks/terminate", {});
          } catch {
            // VM may already be gone - terminate anyway.
          }
          await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }));
          const { data: updated } = await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "terminated", microvmId: "" });
          return json(200, { data: updated });
        }
        return json(400, { error: "action must be suspend, resume, or terminate" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[wayfind-api] computer action failed:", msg);
        return json(502, { error: `action failed: ${msg.slice(0, 300)}` });
      }
    }

    // POST /computer/token - mint a short-lived, port-scoped auth token for
    // the caller's own MicroVM (browser-to-VM direct SSE). Body: { microvmId?,
    // expirationInMinutes? (default 30, max 60), port? (default 8080) }.
    // microvmId must match the caller's Computer row - never another account.
    if (path.endsWith("/computer/token") && method === "POST") {
      let body: { microvmId?: string; expirationInMinutes?: number; port?: number } = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }
      const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
      const computer = pickComputer(computers);
      const microvmId = body.microvmId ?? computer?.microvmId;
      if (!microvmId) {
        return json(404, { error: "no provisioned MicroVM for this account" });
      }
      if (microvmId && !(await vmAlive(microvmId))) {
        if (computer) await resetStaleRow(computer.id);
        return json(410, { error: "that MicroVM no longer exists - press Start computer for a fresh one" });
      }
      if (computer?.microvmId && microvmId !== computer.microvmId) {
        return json(403, { error: "microvmId does not belong to this account" });
      }
      const expirationInMinutes = Math.min(Math.max(body.expirationInMinutes ?? 30, 1), 60);
      const port = body.port ?? 8080;
      try {
        const out = await microvms.send(
          new CreateMicrovmAuthTokenCommand({
            microvmIdentifier: microvmId,
            expirationInMinutes,
            allowedPorts: [{ port }],
          }),
        );
        const token = (out.authToken as Record<string, string> | undefined)?.["X-aws-proxy-auth"];
        if (!token) return json(500, { error: "token mint returned no auth token" });
        return json(200, { microvmId, authToken: token, expirationInMinutes });
      } catch (err) {
        console.error("[wayfind-api] token mint failed:", err);
        return json(502, { error: "microvm token mint failed" });
      }
    }

    // ANY /computer/proxy/* - relay browser traffic to the caller's MicroVM.
    // Browsers cannot reach the VM endpoint directly: the token proxy
    // rejects unauthenticated preflights (browsers never attach the token
    // to OPTIONS) and honors no query-token, so all cloud chat/files/stream
    // go through here. Cognito at this layer, short-lived VM token minted
    // server-side per call. Upstream status passes through untouched.
    // Limits: SSE is buffered (no response streaming through this wrapper,
    // so cloud chat renders whole), ~6MB Lambda response cap on downloads.
    if (path.includes("/computer/proxy/")) {
      const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
      const computer = pickComputer(computers);
      if (!computer?.microvmId || !computer.endpoint) {
        return json(404, { error: "no provisioned MicroVM for this account" });
      }
      if (!(await vmAlive(computer.microvmId))) {
        await resetStaleRow(computer.id);
        return json(410, { error: "that MicroVM no longer exists - press Start computer for a fresh one" });
      }
      let token: string;
      try {
        token = await mintVmToken(computer.microvmId, 30);
      } catch {
        return json(502, { error: "microvm token mint failed" });
      }
      const sub = path.slice(path.indexOf("/computer/proxy/") + "/computer/proxy/".length);
      const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
      const headers = event.headers ?? {};
      const ctype = headers["content-type"] ?? headers["Content-Type"];
      const accept = headers["accept"] ?? headers["Accept"];
      let upstream: Response;
      try {
        upstream = await fetch(`https://${computer.endpoint}/${sub}${qs}`, {
          method,
          headers: {
            "X-aws-proxy-auth": token,
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
        return json(502, { error: `computer unreachable: ${msg.slice(0, 200)}` });
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

    if (path.endsWith("/chat/message")) {
      return json(501, {
        error: "chat runtime arrives in Phase 4 (chat + model). Your Bots, account and Computer request are real; no work was run.",
        phase: 4,
      });
    }

    return json(404, { error: "not found" });
  } catch (err) {
    console.error("[wayfind-api] error:", err);
    return json(500, { error: "internal error" });
  }
};

/* ---------------- computer lifecycle (provision/action) ---------------- */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type ComputerRow = {
  id: string;
  provisionStatus?: string | null;
  microvmId?: string | null;
  updatedAt?: string | null;
};

/** Deterministic pick among an owner's Computer rows. The GSI has no sort
 * key, so [0] is undefined order — and a create race can leave duplicates.
 * Prefer the row holding a MicroVM, newest first. */
function pickComputer<T extends ComputerRow>(rows: T[] | null | undefined): T | undefined {
  if (!rows || rows.length === 0) return undefined;
  const active = rows.filter((r) => r.microvmId);
  const pool = active.length > 0 ? active : [...rows];
  return [...pool].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
}

/** Best-effort duplicate removal after a pick. Deletion is guarded three
 * ways so concurrent invocations converge instead of annihilating:
 * - abort unless the kept row is visible in the fresh list (a keep chosen
 *   from a stale list must never delete what it cannot see),
 * - abort on fewer than 2 rows,
 * - never delete a row holding a microvmId (would orphan a possibly-live,
 *   still-billing VM — those converge via resetStaleRow instead). */
async function dedupeComputers(ownerId: string, keepId: string): Promise<void> {
  try {
    const { data: rows } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
    const pool = rows ?? [];
    if (pool.length < 2) return;
    if (!pool.some((r) => r.id === keepId)) return;
    for (const r of pool) {
      if (r.id !== keepId && !r.microvmId) {
        try {
          await dataClient.models.Computer.delete({ id: r.id });
          console.log(`[wayfind-api] deduped empty computer row ${r.id}, kept ${keepId}`);
        } catch {
          // Another invocation won the race - the pick stays valid.
        }
      }
    }
  } catch {
    // Listing failed - proceed with the picked row.
  }
}

/** True when the MicroVM still exists and is resumable/running. */
async function vmAlive(microvmId: string): Promise<boolean> {
  try {
    const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
    // Cast: the service returns TERMINATED/FAILED at runtime, but the SDK's
    // state union lags behind and a direct literal compare fails tsc.
    const state = res.state as string | undefined;
    return state !== "TERMINATED" && state !== "FAILED";
  } catch (err) {
    if (err instanceof Error && err.name.includes("NotFound")) return false;
    throw err;
  }
}

/** Clear a row whose VM is gone so the next Start provisions fresh. */
async function resetStaleRow(computerId: string): Promise<void> {
  await dataClient.models.Computer.update({
    id: computerId,
    provisionStatus: "not_provisioned",
    microvmId: "",
    endpoint: "",
  });
}

async function findOrCreateComputer(ownerId: string, profileId: string) {
  const { data: existing } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
  const picked = pickComputer(existing);
  if (picked) {
    if (existing && existing.length > 1) void dedupeComputers(ownerId, picked.id);
    return picked;
  }
  const { data: created, errors } = await dataClient.models.Computer.create({
    ownerId,
    userProfileId: profileId,
    provisionStatus: "not_provisioned",
    region: env.COMPUTER_REGION ?? "ap-southeast-1",
    requestedAt: new Date().toISOString(),
  });
  if (errors || !created) throw new Error(`computer create failed: ${JSON.stringify(errors)}`);
  return created;
}

async function waitForRunning(microvmId: string, timeoutMs = 5 * 60_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
    if (res.state === "RUNNING") {
      if (!res.endpoint) throw new Error("VM RUNNING but no endpoint");
      return res.endpoint;
    }
    if (res.state === "TERMINATED") throw new Error("VM terminated while starting");
    if (Date.now() - start > timeoutMs) throw new Error(`VM did not reach RUNNING in ${timeoutMs / 1000}s`);
    await sleep(10_000);
  }
}

async function vmFetch(endpoint: string, token: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`https://${endpoint}${path}`, {
    method: "POST",
    headers: { "X-aws-proxy-auth": token, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function mintVmToken(microvmId: string, expirationInMinutes = 30): Promise<string> {
  const out = await microvms.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: microvmId,
      expirationInMinutes,
      allowedPorts: [{ port: 8080 }],
    }),
  );
  const token = (out.authToken as Record<string, string> | undefined)?.["X-aws-proxy-auth"];
  if (!token) throw new Error("token mint returned no auth token");
  return token;
}

/** Full provision chain (boot + identity + smoke test). Throws on any step. */
export async function provisionComputer(computerId: string, ownerId: string): Promise<void> {
  const imageArn = env.COMPUTER_IMAGE_ARN;
  if (!imageArn) throw new Error("COMPUTER_IMAGE_ARN is not configured");
  const bucket = env.COMPUTER_WORKSPACE_BUCKET ?? "";
  const prefix = `computers/${computerId}/workspace/`;

  await dataClient.models.Computer.update({ id: computerId, provisionStatus: "provisioning" });
  try {
    const run = await microvms.send(
      new RunMicrovmCommand({
        imageIdentifier: imageArn,
        runHookPayload: JSON.stringify({ ownerId, computerId }),
        ingressNetworkConnectors: [
          `arn:aws:lambda:${env.COMPUTER_REGION ?? "ap-southeast-1"}:aws:network-connector:aws-network-connector:ALL_INGRESS`,
        ],
        egressNetworkConnectors: [
          `arn:aws:lambda:${env.COMPUTER_REGION ?? "ap-southeast-1"}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`,
        ],
        // Generous lifetimes for a dev computer: suspend after 15m idle, but
        // a suspended VM survives 7d (observed: the old 300s value had the
        // service terminate VMs ~5m after suspend). Absolute cap is 8h
        // (service max for maximumDurationInSeconds) - the workspace restores
        // from S3 on the next provision, so expiry is friction, not loss.
        idlePolicy: { autoResumeEnabled: true, maxIdleDurationSeconds: 900, suspendedDurationSeconds: 604_800 },
        maximumDurationInSeconds: 28_800,
      }),
    );
    if (!run.microvmId) throw new Error("run-microvm returned no microvmId");
    const endpoint = await waitForRunning(run.microvmId);
    const token = await mintVmToken(run.microvmId);

    // Identity + secrets (Amplify secrets, never stored in the DB).
    // Plus the per-computer usage token: minted here, stored on the row,
    // injected into the VM — the VM reports metered calls with it since it
    // holds no Cognito identity of its own.
    const modalKey = env.MODAL_API_KEY;
    const metaKey = env.PROVIDER_API_KEY;
    if (!modalKey || !metaKey) throw new Error("provider API keys are not configured (Amplify secrets)");
    const usageToken = randomUUID();
    await dataClient.models.Computer.update({ id: computerId, usageToken });
    const runRes = await vmFetch(endpoint, token, "/hooks/run", {
      ownerId,
      computerId,
      secrets: { MODAL_API_KEY: modalKey, PROVIDER_API_KEY: metaKey },
      usageToken,
      ...(bucket ? { workspace: { bucket, prefix } } : {}),
    });
    if (!runRes.ok) throw new Error(`/hooks/run → ${runRes.status}: ${(await runRes.text()).slice(0, 200)}`);

    // Smoke test: one chat turn through the new VM.
    const taskRes = await vmFetch(endpoint, token, "/task", {
      text: "Reply with exactly: cloud-ok",
      ownerId,
    });
    if (!taskRes.ok) throw new Error(`/task smoke → ${taskRes.status}`);
    const { runId } = (await taskRes.json()) as { runId?: string };
    if (!runId) throw new Error("smoke task returned no runId");
    const stream = await fetch(`https://${endpoint}/stream/${runId}`, {
      headers: { "X-aws-proxy-auth": token, Accept: "text/event-stream" },
    });
    const sse = await stream.text();
    if (!sse.includes("cloud-ok")) throw new Error("smoke chat did not return cloud-ok");

    await dataClient.models.Computer.update({
      id: computerId,
      provisionStatus: "running",
      microvmId: run.microvmId,
      endpoint,
      imageVersion: "1.0",
      decidedAt: new Date().toISOString(),
    });
  } catch (err) {
    await dataClient.models.Computer.update({
      id: computerId,
      provisionStatus: "terminated",
    });
    throw err;
  }
}
