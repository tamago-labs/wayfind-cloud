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
import { createVerify, createPublicKey, createHash, randomBytes, randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient, ListTablesCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { CronExpressionParser } from "cron-parser";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();
const microvms = new LambdaMicrovmsClient({ region: env.AWS_REGION ?? process.env.AWS_REGION });
const s3sync = new S3Client({ region: env.AWS_REGION ?? process.env.AWS_REGION });
const dynamo = new DynamoDBClient({ region: env.AWS_REGION ?? process.env.AWS_REGION });

/**
 * Owner backfill for Lambda-created rows: AppSync auto-fills `owner` only
 * for userPool calls, and the generated create inputs reject an explicit
 * `owner` — so without this, owner-scoped reads (Schedules tab, ledger
 * history) silently return []. Table names are discovered at runtime
 * (ListTables, cached): referencing data-stack tables from backend.ts would
 * create a CloudFormation circular dependency (data→function via
 * allow.resource, function→data via the table refs).
 * On failure the caller should delete the orphan row and 500.
 */
const ownerStampTables = new Map<string, string>();
async function stampOwner(modelPrefix: string, id: string, owner: string): Promise<void> {
  let table = ownerStampTables.get(modelPrefix);
  if (!table) {
    let token: string | undefined;
    const found: string[] = [];
    do {
      const out = await dynamo.send(new ListTablesCommand({ ExclusiveStartTableName: token, Limit: 100 }));
      for (const name of out.TableNames ?? []) {
        if (name.startsWith(`${modelPrefix}-`) && name.endsWith("-NONE")) found.push(name);
      }
      token = out.LastEvaluatedTableName;
    } while (token);
    if (found.length === 0) throw new Error(`no ${modelPrefix} table found`);
    // One backend normally owns exactly one; prefer the most recently
    // created on the off chance several sandboxes share the account.
    table = found.sort().reverse()[0];
    if (found.length > 1) {
      console.warn(`[owner-stamp] ambiguous ${modelPrefix} tables, using ${table}`);
    }
    ownerStampTables.set(modelPrefix, table);
  }
  await dynamo.send(
    new UpdateItemCommand({
      TableName: table,
      Key: { id: { S: id } },
      UpdateExpression: "SET #o = :o",
      ExpressionAttributeNames: { "#o": "owner" },
      ExpressionAttributeValues: { ":o": { S: owner } },
    }),
  );
}

/* ---------------- Cognito JWT verification (no external deps) ---------------- */

interface Claims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  token_use?: string;
  aud?: string;
  exp: number;
  iss: string;
  // Present when the bearer is an opaque CLI token (P0 login) rather than
  // a Cognito JWT. Such callers are authenticated but must never mint
  // further credentials (device approval requires a Cognito session).
  cliTokenId?: string;
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
  // Opaque CLI tokens (P0 login) carry no dots — Cognito JWTs always have
  // exactly three segments. Route before any JWT parsing.
  if (token.split(".").length !== 3) return verifyCliToken(token);
  const [h, p, s] = token.split(".");

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

/* ---------------- CLI token verification (P0 login) ---------------- */

const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");

// Opaque CLI tokens minted by the device flow. Stored hashed; looked up by
// tokenHash GSI. Identity is the cloud user (userId = Cognito sub).
async function verifyCliToken(token: string): Promise<Claims> {
  if (!token || token.length < 32) throw new Error("malformed token");
  const { data } = await dataClient.models.CliToken.cliTokenByTokenHash({
    tokenHash: sha256hex(token),
  });
  const row = (data ?? [])[0] as unknown as {
    id: string;
    userId?: string | null;
    expiresAt?: string | null;
    revokedAt?: string | null;
  } | undefined;
  if (!row || !row.userId) throw new Error("unknown CLI token");
  if (row.revokedAt) throw new Error("CLI token revoked");
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    throw new Error("CLI token expired");
  }
  return {
    sub: row.userId,
    exp: Math.floor(new Date(row.expiresAt ?? Date.now() + 86_400_000).getTime() / 1000),
    iss: "wayfind-cli",
    cliTokenId: row.id,
  };
}

/* ---------------- CLI device flow (P0 login) ---------------- */

const CLI_LOGIN_URL = "https://wayfind.click/cli-login";
const DEVICE_CODE_TTL_MS = 10 * 60_000;
const CLI_TOKEN_TTL_MS = 90 * 24 * 3_600_000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous: no 0/O, 1/I

function newUserCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function newCliToken(): string {
  return randomBytes(32).toString("base64url");
}

// Best-effort per-instance rate limit on code minting (Lambda instances are
// ephemeral; this blunts casual abuse, not a distributed attack).
const deviceCodeRate = new Map<string, { count: number; windowStart: number }>();
function deviceRateOk(ip: string): boolean {
  const now = Date.now();
  const cur = deviceCodeRate.get(ip);
  if (!cur || now - cur.windowStart > 3_600_000) {
    deviceCodeRate.set(ip, { count: 1, windowStart: now });
    return true;
  }
  cur.count += 1;
  return cur.count <= 10;
}

async function findDeviceCode(code: string) {
  const { data } = await dataClient.models.DeviceCode.deviceCodeByCodeHash({
    codeHash: sha256hex(code.trim().toUpperCase()),
  });
  return ((data ?? [])[0] ?? null) as unknown as {
    id: string;
    status?: string | null;
    userId?: string | null;
    cliTokenId?: string | null;
    deviceName?: string | null;
    tokenOnce?: string | null;
    expiresAt?: string | null;
  } | null;
}

function deviceExpired(row: { expiresAt?: string | null }): boolean {
  return !!row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
}

/* ---------------- helpers ---------------- */

const CORS = {
  // No Access-Control-Allow-Origin here: the Function URL layer sets it
  // (allowedOrigins in backend.ts). Sending it twice breaks browsers.
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
  // API responses must never be cached: a cached 410 for a proxy GET kept a
  // dead VM "dead" in the browser long after recovery (same URL re-fires).
  "Cache-Control": "no-store",
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
const BACKEND_REV = "1.1.0+relay+guarded-dedupe+usage-token+presigned-sync+no-store+cli-auth+sandbox";

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
    try {
      await stampOwner("CreditLedger", entry.id, usageOwner);
    } catch {
      // Ledger is observe-only: a missing owner stamp only hides this row
      // from history reads, so don't fail the usage call over it.
    }
    return json(200, { ok: true, ledgerId: entry.id, delta, balanceAfter });
  }

  // Offset of `timezone` at a UTC instant, in ms (wall − UTC). Used to
  // interpret offset-less datetimes as wall time in that zone.
  const tzOffsetMs = (timezone: string, utcMs: number): number => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return asUTC - utcMs;
  };

  // Naive "YYYY-MM-DDTHH:mm[:ss]" (no offset/Z) → UTC instant, reading the
  // wall clock in `timezone`. Models often emit the local wall time without
  // an offset; parsing it as UTC would shift the fire by the zone offset.
  // Throws on bad input — callers turn it into a 400 the model can act on.
  const zonedWallToUtc = (naive: string, timezone: string): Date => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive.trim());
    if (!m) throw new Error(`runAt "${naive}" needs a full date-time with an explicit offset, e.g. 2026-11-02T15:28:00+07:00`);
    try {
      // Throws on unknown IANA zones.
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error(`unknown timezone "${timezone}" — use IANA, e.g. Asia/Bangkok`);
    }
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
    if (Number.isNaN(guess)) throw new Error(`runAt "${naive}" is not a valid date-time`);
    // Two passes so a DST fold between guess and target still converges.
    const instant = guess - tzOffsetMs(timezone, guess);
    return new Date(guess - tzOffsetMs(timezone, instant));
  };

  // Next cron fire strictly after `from`, in `timezone`. Throws on bad
  // cron/timezone — callers turn it into a 400 the model can act on.
  const nextCronRun = (cron: string, timezone: string, from: Date = new Date()): string => {
    try {
      // Throws on unknown IANA zones.
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error(`unknown timezone "${timezone}" — use IANA, e.g. Asia/Bangkok`);
    }
    try {
      return CronExpressionParser.parse(cron, { tz: timezone, currentDate: from }).next().toDate().toISOString();
    } catch {
      throw new Error(`invalid cron "${cron}" — use 5-field minute precision, e.g. "0 9 * * 1"`);
    }
  };

  // POST /routines — create a scheduled routine (chat-created via the
  // schedule_task agent tool). Dual auth like /runs/:id/usage: a user bearer
  // attributes to the verified caller; otherwise the per-computer usage
  // token + claimed ownerId attributes to that computer's owner. The bot is
  // ownership-checked. Body: { ownerId?, botId, name?, prompt,
  // kind: 'once'|'cron', runAt?, cron?, timezone? }.
  if (/\/routines$/.test(path) && method === "POST") {
    let schedOwner: string | null = null;
    const schedAuth = event.headers.authorization ?? event.headers.Authorization;
    if (schedAuth?.startsWith("Bearer ")) {
      try {
        schedOwner = (await verifyToken(schedAuth)).sub;
      } catch {
        // Fall through to usage-token auth.
      }
    }
    let schedBody: {
      ownerId?: string;
      botId?: string;
      name?: string;
      prompt?: string;
      kind?: string;
      runAt?: string;
      cron?: string;
      timezone?: string;
    } = {};
    try {
      schedBody = JSON.parse(event.body ?? "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (!schedOwner) {
      const usageToken =
        event.headers["x-computer-usage-token"] ??
        event.headers["X-computer-usage-token"] ??
        event.headers["X-Computer-Usage-Token"];
      const claimedOwner = typeof schedBody.ownerId === "string" ? schedBody.ownerId : "";
      if (!usageToken || !claimedOwner) {
        return json(401, { error: "unauthorized: no bearer or usage token" });
      }
      const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId: claimedOwner });
      const match = (computers ?? []).find((c) => c.usageToken && c.usageToken === usageToken);
      if (!match) return json(401, { error: "unauthorized: bad usage token" });
      schedOwner = claimedOwner;
    }
    const botId = typeof schedBody.botId === "string" ? schedBody.botId : "";
    const prompt = typeof schedBody.prompt === "string" ? schedBody.prompt.slice(0, 2000).trim() : "";
    const kind = schedBody.kind;
    const timezone = typeof schedBody.timezone === "string" && schedBody.timezone ? schedBody.timezone : "UTC";
    try {
      // Throws on unknown IANA zones — validate up front so kind=once rows
      // can't store a timezone the ticker/display can't use.
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return json(400, { error: `unknown timezone "${timezone}" — use IANA, e.g. Asia/Bangkok` });
    }
    if (!botId) return json(400, { error: "botId is required" });
    if (!prompt) return json(400, { error: "prompt is required" });
    if (kind !== "once" && kind !== "cron") return json(400, { error: "kind must be 'once' or 'cron'" });
    const { data: bot } = await dataClient.models.Bot.get({ id: botId });
    if (!bot) return json(404, { error: "unknown bot" });
    if (bot.ownerId !== schedOwner) return json(403, { error: "bot belongs to a different owner" });
    let nextRunAt: string;
    let runAt: string | undefined;
    let cron: string | undefined;
    if (kind === "once") {
      if (typeof schedBody.runAt !== "string" || !schedBody.runAt) {
        return json(400, { error: "runAt ISO time is required for kind=once" });
      }
      // Offset-less datetimes are wall time in the routine's timezone
      // (models often emit the local clock without an offset); only explicit
      // offsets/Z are read as absolute instants.
      let at: Date;
      if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(schedBody.runAt.trim())) {
        at = new Date(schedBody.runAt);
        if (Number.isNaN(at.getTime())) return json(400, { error: "runAt is not a valid date" });
      } else {
        try {
          at = zonedWallToUtc(schedBody.runAt, timezone);
        } catch (err) {
          return json(400, { error: err instanceof Error ? err.message : "bad runAt/timezone" });
        }
      }
      if (at.getTime() < Date.now() + 60_000) {
        return json(400, { error: "runAt must be at least a minute in the future" });
      }
      runAt = at.toISOString();
      nextRunAt = runAt;
    } else {
      if (typeof schedBody.cron !== "string" || !schedBody.cron.trim()) {
        return json(400, { error: "cron is required for kind=cron" });
      }
      cron = schedBody.cron.trim();
      try {
        nextRunAt = nextCronRun(cron, timezone);
      } catch (err) {
        return json(400, { error: err instanceof Error ? err.message : "bad cron/timezone" });
      }
    }
    const { data: routine, errors } = await dataClient.models.Routine.create({
      ownerId: schedOwner,
      botId,
      ...(typeof schedBody.name === "string" && schedBody.name.trim()
        ? { name: schedBody.name.trim().slice(0, 80) }
        : {}),
      prompt,
      kind,
      ...(cron ? { cron } : {}),
      ...(runAt ? { runAt } : {}),
      timezone,
      status: "active",
      nextRunAt,
      runCount: 0,
    });
    if (errors || !routine) {
      return json(500, { error: `routine create failed: ${JSON.stringify(errors)}` });
    }
    try {
      await stampOwner("Routine", routine.id, schedOwner);
    } catch (err) {
      // No invisible orphans: roll the row back when the owner stamp fails.
      try {
        await dataClient.models.Routine.delete({ id: routine.id });
      } catch {
        // Best-effort rollback.
      }
      return json(500, { error: `routine owner stamp failed: ${err instanceof Error ? err.message : err}` });
    }
    return json(200, {
      ok: true,
      routine: { id: routine.id, kind, nextRunAt, timezone, status: "active" },
    });
  }

  /** Shared fire implementation behind /routines/fire (30-minute ticker).
   * Advances nextRunAt
   * FIRST (no double-fire), resumes a suspended computer (never provisions —
   * a dead VM marks the run skipped-no-computer), then POSTs the stored
   * prompt to the VM as the bot. Output lands in the bot's thread
   * (conversationId = botId). Returns the HTTP status + body the route
   * should reply with. */
  const fireRoutine = async (routineId: string): Promise<{ status: number; body: Record<string, unknown> }> => {
    const record = async (id: string, status: string, runCount?: number) => {
      try {
        const cur = await dataClient.models.Routine.get({ id });
        await dataClient.models.Routine.update({
          id,
          lastRunAt: new Date().toISOString(),
          lastStatus: status,
          runCount: (runCount ?? cur.data?.runCount ?? 0) + 1,
        });
      } catch {
        // Best-effort bookkeeping — the fire result is already decided.
      }
    };
    const { data: routine } = await dataClient.models.Routine.get({ id: routineId });
    if (!routine) return { status: 404, body: { error: "unknown routine" } };
    if (routine.status !== "active") return { status: 200, body: { ok: true, skipped: `status=${routine.status}` } };
    // Advance before firing so a crash/retry never double-runs.
    if (routine.kind === "once") {
      await dataClient.models.Routine.update({ id: routine.id, status: "done" });
    } else {
      if (!routine.cron) {
        await record(routine.id, "bad-cron: missing expression", routine.runCount ?? 0);
        return { status: 200, body: { ok: true, skipped: "bad-cron" } };
      }
      try {
        const next = nextCronRun(routine.cron, routine.timezone ?? "UTC");
        await dataClient.models.Routine.update({ id: routine.id, nextRunAt: next });
      } catch (err) {
        await record(routine.id, `bad-cron: ${err instanceof Error ? err.message : err}`, routine.runCount ?? 0);
        return { status: 200, body: { ok: true, skipped: "bad-cron" } };
      }
    }
    const { data: bot } = routine.botId
      ? await dataClient.models.Bot.get({ id: routine.botId })
      : { data: null };
    if (routine.botId && !bot) {
      await record(routine.id, "skipped-unknown-bot", routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: "unknown-bot" } };
    }
    if (bot && bot.ownerId !== routine.ownerId) {
      await record(routine.id, "skipped-wrong-owner", routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: "wrong-owner" } };
    }
    const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId: routine.ownerId });
    const computer = pickComputer(computers);
    if (!computer?.microvmId) {
      await record(routine.id, "skipped-no-computer", routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: "no-computer" } };
    }
    const microvmId = computer.microvmId;
    if (!(await vmAlive(microvmId))) {
      await resetStaleRow(computer.id, microvmId);
      await record(routine.id, "skipped-no-vm", routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: "no-vm" } };
    }
    let endpoint = computer.endpoint ?? "";
    if (computer.provisionStatus === "suspended") {
      try {
        endpoint = await resumeComputer(computer.id, microvmId);
      } catch (err) {
          await record(routine.id, `resume-failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`, routine.runCount ?? 0);
          return { status: 502, body: { error: "resume failed" } };
      }
    } else if (computer.provisionStatus !== "running") {
      await record(routine.id, `skipped-${computer.provisionStatus}`, routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: computer.provisionStatus ?? "not-ready" } };
    }
    // Clock line first: the model is otherwise time-blind.
    const tz = routine.timezone ?? "UTC";
    let clockLine: string;
    try {
      const local = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
      }).format(new Date());
      clockLine = `Current time: ${local} (${tz}).`;
    } catch {
      clockLine = `Current time: ${new Date().toISOString()} (UTC).`;
    }
    const botName = bot?.name ?? "Assistant";
    const system = bot
      ? bot.role
        ? `You are "${botName}". Role: ${bot.role}.`
        : `You are "${botName}". Your role is not defined yet.`
      : `You are "${botName}".`;
    let token: string;
    try {
      token = await mintVmToken(microvmId, 30);
    } catch {
      await record(routine.id, "token-mint-failed", routine.runCount ?? 0);
      return { status: 502, body: { error: "microvm token mint failed" } };
    }
    let upstream: Response;
    try {
      upstream = await vmFetch(endpoint, token, "/task", {
        text: routine.prompt,
        conversationId: routine.botId ?? `routine-${routine.id}`,
        system: `${system}\n${clockLine}`,
        allowedSkills: bot?.skillsEnabled ?? undefined,
        allowedMcp: bot?.mcpEnabled ?? undefined,
        ownerId: routine.ownerId,
        ...(env.COMPUTER_API_URL ? { apiUrl: env.COMPUTER_API_URL } : {}),
      });
    } catch (err) {
      await record(routine.id, `task-post-failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`, routine.runCount ?? 0);
      return { status: 502, body: { error: "computer unreachable" } };
    }
    if (!upstream.ok) {
      await record(routine.id, `task-rejected: ${upstream.status}`, routine.runCount ?? 0);
      return { status: 502, body: { error: `computer rejected task: ${upstream.status}` } };
    }
    let runId: string | undefined;
    try {
      runId = ((await upstream.json()) as { runId?: string }).runId;
    } catch {
      runId = undefined;
    }
    await record(routine.id, "ok", routine.runCount ?? 0);
    return { status: 200, body: { ok: true, runId } };
  };

  // POST /routines/fire {routineId} — ticker-only entry (X-Tick-Secret must
  // match the shared TICK_SECRET).
  if (/\/routines\/fire$/.test(path) && method === "POST") {
    const tickSecret =
      event.headers["x-tick-secret"] ??
      event.headers["x-tick-secret"] ??
      event.headers["X-Tick-Secret"];
    if (!env.TICK_SECRET) {
      // Server misconfig — the ticker can never succeed until the secret is
      // set (sandbox secret / branch env). Log loud, fail closed.
      console.error("[routines/fire] TICK_SECRET is not configured");
      return json(401, { error: "unauthorized: bad tick secret" });
    }
    if (tickSecret !== env.TICK_SECRET) {
      return json(401, { error: "unauthorized: bad tick secret" });
    }
    let fireBody: { routineId?: string } = {};
    try {
      fireBody = JSON.parse(event.body ?? "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (typeof fireBody.routineId !== "string" || !fireBody.routineId) {
      return json(400, { error: "routineId is required" });
    }
    const out = await fireRoutine(fireBody.routineId);
    return json(out.status, out.body);
  }

  // VM file sync via presigned S3 URLs (server-to-server). The VM holds no
  // AWS credentials, so all bytes move over HTTPS with short-lived signed
  // URLs instead. Auth: per-computer usage token (X-computer-usage-token)
  // matched against the row for the claimed computerId. Paths are
  // constrained to that computer's workspace prefix; .wayfind/ (keystore)
  // never syncs.
  const vmSyncAuth = async (
    body: { computerId?: string },
  ): Promise<{ computer: { id: string } } | { error: string; status: number }> => {
    const usageToken =
      event.headers["x-computer-usage-token"] ??
      event.headers["X-computer-usage-token"] ??
      event.headers["X-Computer-Usage-Token"];
    const computerId = typeof body.computerId === "string" ? body.computerId : "";
    if (!usageToken || !computerId) return { error: "unauthorized: no usage token or computerId", status: 401 };
    const { data: computer } = await dataClient.models.Computer.get({ id: computerId });
    if (!computer || !computer.usageToken || computer.usageToken !== usageToken) {
      return { error: "unauthorized: bad usage token", status: 401 };
    }
    return { computer: { id: computer.id } };
  };
  const cleanSyncPath = (p: unknown): string | null => {
    if (typeof p !== "string" || !p || p.length > 512) return null;
    const parts = p.split("/").filter((s) => s !== "" && s !== ".");
    if (parts.length === 0 || parts.some((s) => s === "..")) return null;
    if (parts[0] === ".wayfind") return null;
    return parts.join("/");
  };
  const syncBucket = env.COMPUTER_WORKSPACE_BUCKET ?? "";

  // POST /computer/sync/upload-urls — { computerId, files: [{ path, size }] }
  // → { urls: { path: presignedPutUrl } }. Per-file 25MB cap, 2000 files max.
  if (path.endsWith("/computer/sync/upload-urls") && method === "POST") {
    let body: { computerId?: string; files?: Array<{ path?: string; size?: number }> } = {};
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const auth = await vmSyncAuth(body);
    if ("error" in auth) return json(auth.status, { error: auth.error });
    if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
    const files = Array.isArray(body.files) ? body.files.slice(0, 2000) : [];
    const urls: Record<string, string> = {};
    for (const f of files) {
      const clean = cleanSyncPath(f?.path);
      if (!clean || typeof f?.size !== "number" || f.size <= 0 || f.size > 25 * 1024 * 1024) continue;
      urls[clean] = await getSignedUrl(
        s3sync,
        new PutObjectCommand({ Bucket: syncBucket, Key: `computers/${auth.computer.id}/workspace/${clean}` }),
        { expiresIn: 900 },
      );
    }
    return json(200, { urls });
  }

  // POST /computer/sync/download-urls — { computerId } → { files: [{ path,
  // size, url }] } (presigned GETs, 15min). Skips .wayfind/ and folder markers.
  if (path.endsWith("/computer/sync/download-urls") && method === "POST") {
    let body: { computerId?: string } = {};
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const auth = await vmSyncAuth(body);
    if ("error" in auth) return json(auth.status, { error: auth.error });
    if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
    const prefix = `computers/${auth.computer.id}/workspace/`;
    const files: Array<{ path: string; size: number; url: string }> = [];
    let token: string | undefined;
    for (;;) {
      const res = await s3sync.send(
        new ListObjectsV2Command({ Bucket: syncBucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key || obj.Key.endsWith("/")) continue;
        const rel = obj.Key.slice(prefix.length);
        if (!cleanSyncPath(rel)) continue;
        if (files.length >= 2000) break;
        files.push({
          path: rel,
          size: obj.Size ?? 0,
          url: await getSignedUrl(s3sync, new GetObjectCommand({ Bucket: syncBucket, Key: obj.Key }), {
            expiresIn: 900,
          }),
        });
      }
      if (!res.IsTruncated || files.length >= 2000) break;
      token = res.NextContinuationToken;
    }
    return json(200, { files });
  }

  // POST /auth/device — mint a device-flow code (public; the CLI calls this
  // before it has any credential). Body: { deviceName? }.
  // Returns { code, url, expiresIn }. Rate-limited per source IP.
  if (path.endsWith("/auth/device") && method === "POST") {
    const ip = event.requestContext.http.sourceIp ?? "unknown";
    if (!deviceRateOk(ip)) return json(429, { error: "too many code requests, try again later" });
    let deviceName = "";
    try {
      const parsed = JSON.parse(event.body ?? "{}") as { deviceName?: unknown };
      if (typeof parsed.deviceName === "string") deviceName = parsed.deviceName.slice(0, 80);
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const code = newUserCode();
    const { data: row, errors } = await dataClient.models.DeviceCode.create({
      codeHash: sha256hex(code),
      status: "pending",
      deviceName: deviceName || undefined,
      expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS).toISOString(),
    });
    if (errors || !row) return json(500, { error: `device code create failed: ${JSON.stringify(errors)}` });
    return json(200, { code, url: CLI_LOGIN_URL, expiresIn: DEVICE_CODE_TTL_MS / 1000 });
  }

  // POST /auth/device/poll — CLI polls with { code }. Public.
  // → { status: pending, expiresIn } | { status: approved, token, expiresAt }
  //   | { status: denied|expired }. The token is revealed exactly once.
  if (path.endsWith("/auth/device/poll") && method === "POST") {
    let code = "";
    try {
      const parsed = JSON.parse(event.body ?? "{}") as { code?: unknown };
      if (typeof parsed.code === "string") code = parsed.code;
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (!code) return json(400, { error: "code is required" });
    const row = await findDeviceCode(code);
    if (!row) return json(404, { error: "unknown or expired code" });
    if (deviceExpired(row) || row.status === "expired") {
      if (row.status !== "expired") {
        try {
          await dataClient.models.DeviceCode.update({ id: row.id, status: "expired" });
        } catch { /* best-effort */ }
      }
      return json(200, { status: "expired" });
    }
    if (row.status === "denied") return json(200, { status: "denied" });
    if (row.status === "approved") {
      if (!row.tokenOnce) return json(200, { status: "approved", token: null });
      const token = row.tokenOnce;
      try {
        await dataClient.models.DeviceCode.update({ id: row.id, tokenOnce: null });
      } catch { /* best-effort: the token was already minted, still return it */ }
      // Look up the CliToken row for expiry info (non-fatal if missing).
      let expiresAt: string | null = null;
      try {
        const fetched = await dataClient.models.CliToken.get({ id: row.cliTokenId ?? "" });
        expiresAt = (fetched.data as unknown as { expiresAt?: string } | null)?.expiresAt ?? null;
      } catch { /* ignore */ }
      return json(200, { status: "approved", token, expiresAt });
    }
    const expiresIn = row.expiresAt
      ? Math.max(0, Math.round((new Date(row.expiresAt).getTime() - Date.now()) / 1000))
      : DEVICE_CODE_TTL_MS / 1000;
    return json(200, { status: "pending", expiresIn });
  }

  // Everything below requires a verified identity: Cognito JWT or CLI token.
  let claims: Claims;
  try {
    claims = await verifyToken(event.headers.authorization ?? event.headers.Authorization);
  } catch (err) {
    return json(401, { error: `unauthorized: ${(err as Error).message}` });
  }
  const ownerId = claims.sub;

  try {
    // POST /auth/device/approve — browser approval for a CLI device code.
    // Cognito sessions ONLY: a CLI token must never mint further credentials.
    // Body: { code, action: "approve"|"deny" }. Approve mints a CliToken for
    // the verified caller (same user — userId comes from the Cognito JWT).
    if (path.endsWith("/auth/device/approve") && method === "POST") {
      if (claims.cliTokenId) return json(403, { error: "device approval requires a browser (Cognito) session" });
      let code = "";
      let action = "approve";
      try {
        const parsed = JSON.parse(event.body ?? "{}") as { code?: unknown; action?: unknown };
        if (typeof parsed.code === "string") code = parsed.code;
        if (parsed.action === "deny") action = "deny";
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }
      if (!code) return json(400, { error: "code is required" });
      const row = await findDeviceCode(code);
      if (!row) return json(404, { error: "unknown or expired code" });
      if (deviceExpired(row) || row.status !== "pending") {
        return json(410, { error: `code is ${deviceExpired(row) ? "expired" : row.status}` });
      }
      if (action === "deny") {
        await dataClient.models.DeviceCode.update({ id: row.id, status: "denied" });
        return json(200, { ok: true, status: "denied" });
      }
      const profile = await ensureProfile(claims);
      // Empty-string profile emails (created before email capture) must not
      // shadow a real Cognito claim — use ||, not ??, throughout.
      const email =
        (typeof claims.email === "string" && claims.email) || profile.email || undefined;
      if (email && !profile.email) {
        try {
          await dataClient.models.UserProfile.update({ id: profile.id, email });
        } catch { /* best-effort backfill */ }
      }
      const token = newCliToken();
      const { data: cliToken, errors } = await dataClient.models.CliToken.create({
        tokenHash: sha256hex(token),
        userId: ownerId,
        email,
        deviceName: row.deviceName ?? undefined,
        expiresAt: new Date(Date.now() + CLI_TOKEN_TTL_MS).toISOString(),
      });
      if (errors || !cliToken) {
        return json(500, { error: `CLI token create failed: ${JSON.stringify(errors)}` });
      }
      await stampOwner("CliToken", (cliToken as unknown as { id: string }).id, ownerId);
      await dataClient.models.DeviceCode.update({
        id: row.id,
        status: "approved",
        userId: ownerId,
        cliTokenId: (cliToken as unknown as { id: string }).id,
        tokenOnce: token,
      });
      try {
        await stampOwner("DeviceCode", row.id, ownerId);
      } catch { /* best-effort: approval already recorded */ }
      return json(200, { ok: true, status: "approved", email: profile.email ?? claims.email ?? null });
    }

    // GET /auth/me — who is this bearer? Works for Cognito and CLI tokens.
    // The CLI uses this as its session check (login guard).
    if (path.endsWith("/auth/me") && method === "GET") {
      let email: string | null = typeof claims.email === "string" ? claims.email : null;
      if (!email && claims.cliTokenId) {
        try {
          const fetched = await dataClient.models.CliToken.get({ id: claims.cliTokenId });
          const rowEmail = (fetched.data as unknown as { email?: string | null } | null)?.email;
          if (typeof rowEmail === "string" && rowEmail) email = rowEmail;
        } catch { /* best-effort */ }
      }
      if (!email) {
        try {
          const { data: profiles } = await dataClient.models.UserProfile.profileByOwnerId({ ownerId });
          email = (profiles ?? [])[0]?.email ?? null;
        } catch { /* best-effort */ }
      }
      return json(200, { userId: ownerId, email, via: claims.cliTokenId ? "cli" : "cognito" });
    }

    // POST /auth/revoke — revoke CLI tokens. A CLI bearer revokes itself;
    // a Cognito session may revoke one ({ cliTokenId }) or all ({ all: true }).
    if (path.endsWith("/auth/revoke") && method === "POST") {
      let cliTokenId = "";
      let all = false;
      try {
        const parsed = JSON.parse(event.body ?? "{}") as { cliTokenId?: unknown; all?: unknown };
        if (typeof parsed.cliTokenId === "string") cliTokenId = parsed.cliTokenId;
        if (parsed.all === true) all = true;
      } catch {
        return json(400, { error: "Invalid JSON body" });
      }
      const revoke = async (id: string): Promise<boolean> => {
        type TokenRow = { userId?: string | null; revokedAt?: string | null } | null;
        let row: TokenRow = null;
        try {
          const fetched = await dataClient.models.CliToken.get({ id });
          row = fetched.data as unknown as TokenRow;
        } catch {
          return false;
        }
        if (!row || row.userId !== ownerId || row.revokedAt) return false;
        await dataClient.models.CliToken.update({ id, revokedAt: new Date().toISOString() });
        return true;
      };
      if (claims.cliTokenId) {
        const ok = await revoke(claims.cliTokenId);
        return json(200, { ok, revoked: ok ? [claims.cliTokenId] : [] });
      }
      if (all) {
        const { data: rows } = await dataClient.models.CliToken.cliTokensByUserId({ userId: ownerId });
        const revoked: string[] = [];
        for (const r of rows ?? []) {
          const id = (r as unknown as { id: string }).id;
          if (await revoke(id)) revoked.push(id);
        }
        return json(200, { ok: true, revoked });
      }
      if (!cliTokenId) return json(400, { error: "cliTokenId or all:true is required" });
      const ok = await revoke(cliTokenId);
      if (!ok) return json(404, { error: "token not found" });
      return json(200, { ok: true, revoked: [cliTokenId] });
    }

    // POST /sandbox/provision — boot a disposable exec sandbox (P1).
    // Body: { idleTtlSeconds? } (300..28800, default 1800). Returns
    // { sandboxId, endpoint, sessionToken, provisionedAt }. The CLI holds
    // the sessionToken in memory and presents it per relay call — no DB
    // row, no resume, no suspend. Auth here is bearer-capability:
    // knowledge of the unguessable sessionToken + an authenticated caller.
    // P1-hardening adds SandboxSession rows (owner check) + metering from
    // GetMicrovm startedAt/terminatedAt at terminate time.
    if (path.endsWith("/sandbox/provision") && method === "POST") {
      const imageArn = env.EXEC_IMAGE_ARN;
      if (!imageArn) return json(500, { error: "EXEC_IMAGE_ARN is not configured" });
      let idleTtl = 1800;
      try {
        const parsed = JSON.parse(event.body ?? "{}") as { idleTtlSeconds?: unknown };
        if (typeof parsed.idleTtlSeconds === "number" && Number.isFinite(parsed.idleTtlSeconds)) {
          idleTtl = Math.min(28_800, Math.max(300, Math.floor(parsed.idleTtlSeconds)));
        }
      } catch {
        return json(400, { error: "Invalid JSON body" });
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
        // Session bearer: the exec agent gates everything on this. Unguessable,
        // held in CLI memory, never stored server-side (disposable model).
        const sessionToken = randomBytes(32).toString("base64url");
        const hookRes = await vmFetch(endpoint, token, "/hooks/run", { sessionToken });
        if (!hookRes.ok) throw new Error(`/hooks/run → ${hookRes.status}: ${(await hookRes.text()).slice(0, 200)}`);
        // Smoke: the agent answers an exec with the fresh session bearer.
        const smokeRes = await vmFetch(endpoint, token, "/exec", { cmd: "true" }, sessionToken);
        if (!smokeRes.ok) throw new Error(`/exec smoke → ${smokeRes.status}`);
        return json(200, {
          sandboxId: run.microvmId,
          endpoint,
          sessionToken,
          provisionedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (bootedMicrovmId) {
          try {
            await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: bootedMicrovmId }));
            console.log(`[wayfind-api] terminated ${bootedMicrovmId} after failed sandbox provision`);
          } catch (termErr) {
            console.error(
              `[wayfind-api] LEAKED microvm ${bootedMicrovmId} (sandbox provision failed, terminate failed):`,
              termErr instanceof Error ? termErr.message : String(termErr),
            );
          }
        }
        return json(502, { error: `sandbox provision failed: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // POST /sandbox/terminate { sandboxId } — end a session now. Best-effort
    // ownership: the caller must present the session bearer (capability).
    if (path.endsWith("/sandbox/terminate") && method === "POST") {
      let sandboxId = "";
      let sessionToken = "";
      try {
        const parsed = JSON.parse(event.body ?? "{}") as { sandboxId?: unknown; sessionToken?: unknown };
        if (typeof parsed.sandboxId === "string") sandboxId = parsed.sandboxId;
        if (typeof parsed.sessionToken === "string") sessionToken = parsed.sessionToken;
      } catch {
        return json(400, { error: "Invalid JSON body" });
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
      try {
        await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: sandboxId }));
      } catch (err) {
        if (err instanceof Error && /not found/i.test(`${err.name} ${err.message}`)) {
          return json(200, { ok: true, alreadyGone: true });
        }
        return json(502, { error: "terminate failed" });
      }
      return json(200, { ok: true });
    }

    // ANY /sandbox/proxy/* — relay CLI traffic to a disposable sandbox.
    // Auth: the caller's user identity (gate) + per-call session capability
    // via X-Sandbox-Id / X-Sandbox-Token headers (Authorization stays the
    // user's Cognito/CliToken bearer). VM token minted server-side per call.
    if (path.includes("/sandbox/proxy/")) {
      const headers = event.headers ?? {};
      const sandboxId =
        headers["x-sandbox-id"] ?? headers["X-Sandbox-Id"] ?? headers["X-sandbox-id"] ?? "";
      const sessionToken =
        headers["x-sandbox-token"] ?? headers["X-Sandbox-Token"] ?? headers["X-sandbox-token"] ?? "";
      if (!sandboxId || !sessionToken) {
        return json(400, { error: "X-Sandbox-Id and X-Sandbox-Token headers are required" });
      }
      let endpoint: string;
      try {
        endpoint = await waitForRunning(sandboxId, 30_000);
      } catch {
        return json(410, { error: "that sandbox no longer exists — provision a fresh one" });
      }
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
      // Self-heal any row holding a MicroVM, whatever its status label says
      // (a stale label must never route a live VM to a fresh provision):
      // gone VM → clear and fall through to boot; live VM with a stale
      // label (e.g. poisoned "terminated") → relabel suspended so the
      // resume path owns it.
      if (computer.microvmId) {
        try {
          if (!(await vmAlive(computer.microvmId))) {
            await resetStaleRow(computer.id, computer.microvmId);
            computer = { ...computer, provisionStatus: "not_provisioned", microvmId: "" };
          } else if (
            computer.provisionStatus !== "running" &&
            computer.provisionStatus !== "suspended" &&
            computer.provisionStatus !== "provisioning"
          ) {
            await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "suspended" });
            computer = { ...computer, provisionStatus: "suspended" };
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
              await resetStaleRow(r.id, r.microvmId);
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
        await resetStaleRow(computer.id, microvmId);
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
          const endpoint = await resumeComputer(computer.id, microvmId);
          const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
          return json(200, { data: updated ?? { ...computer, provisionStatus: "running", endpoint } });
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
        if (computer) await resetStaleRow(computer.id, microvmId);
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
        await resetStaleRow(computer.id, computer.microvmId);
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
      // Reconcile-on-traffic: the VM answers only when awake, and our VMs
      // run with autoResumeEnabled — so a served relay response proves a
      // "suspended" row has woken up. Heal the status without an extra
      // GetMicrovm call; fire-and-forget so the relay never blocks on it.
      if (computer.provisionStatus !== "running") {
        void dataClient.models.Computer.update({ id: computer.id, provisionStatus: "running" }).catch(() => {});
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

/** Clear a row whose VM is gone so the next Start provisions fresh. Logs the
 * observed VM state first: GetMicrovm keeps terminated VMs queryable with
 * stateReason/startedAt/terminatedAt — the only record of why a VM died
 * young (lifetime cap, reclaim, crash). Check CloudWatch for this line. */
async function resetStaleRow(computerId: string, microvmId?: string | null): Promise<void> {
  if (microvmId) {
    try {
      const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
      const started = res.startedAt?.getTime();
      const ended = res.terminatedAt?.getTime() ?? Date.now();
      const lifetimeMin = started ? Math.round((ended - started) / 60_000) : -1;
      console.log(
        `[wayfind-api] resetStaleRow ${computerId} vm=${microvmId} state=${res.state as string} reason=${res.stateReason ?? "—"} lifetimeMin=${lifetimeMin}`,
      );
    } catch (err) {
      console.log(
        `[wayfind-api] resetStaleRow ${computerId} vm=${microvmId} getFailed=${err instanceof Error ? err.name : String(err)}`,
      );
    }
  }
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

async function vmFetch(
  endpoint: string,
  token: string,
  path: string,
  body?: unknown,
  sessionToken?: string,
): Promise<Response> {
  return fetch(`https://${endpoint}${path}`, {
    method: "POST",
    headers: {
      "X-aws-proxy-auth": token,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      "Content-Type": "application/json",
    },
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

/** Resume path shared by POST /computer/action and /routines/fire:
 * ResumeMicrovm + wait + heal the row. Returns the live endpoint. */
async function resumeComputer(computerId: string, microvmId: string): Promise<string> {
  await microvms.send(new ResumeMicrovmCommand({ microvmIdentifier: microvmId }));
  const endpoint = await waitForRunning(microvmId);
  await dataClient.models.Computer.update({ id: computerId, provisionStatus: "running", endpoint });
  return endpoint;
}

/** Full provision chain (boot + identity + smoke test). Throws on any step. */
export async function provisionComputer(computerId: string, ownerId: string): Promise<void> {
  const imageArn = env.COMPUTER_IMAGE_ARN;
  if (!imageArn) throw new Error("COMPUTER_IMAGE_ARN is not configured");
  const bucket = env.COMPUTER_WORKSPACE_BUCKET ?? "";
  const prefix = `computers/${computerId}/workspace/`;

  await dataClient.models.Computer.update({ id: computerId, provisionStatus: "provisioning" });
  // RunMicrovm may succeed before a later step (hooks, smoke test) fails —
  // track it so the catch block can terminate the orphan instead of leaking
  // an alive, billing, untracked VM.
  let bootedMicrovmId: string | undefined;
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
    bootedMicrovmId = run.microvmId;
    const endpoint = await waitForRunning(run.microvmId);
    const token = await mintVmToken(run.microvmId);

    // Identity + secrets (Amplify secrets, never stored in the DB).
    // Plus the per-computer usage token: minted here, stored on the row,
    // injected into the VM — the VM reports metered calls with it since it
    // holds no Cognito identity of its own. apiUrl lets the VM reach this
    // API (usage + presigned sync) without the backend knowing its own URL.
    const modalKey = env.MODAL_API_KEY;
    const metaKey = env.PROVIDER_API_KEY;
    if (!modalKey || !metaKey) throw new Error("provider API keys are not configured (Amplify secrets)");
    const usageToken = randomUUID();
    await dataClient.models.Computer.update({ id: computerId, usageToken });
    const computerApi = (env.COMPUTER_API_URL ?? "").replace(/\/+$/, "");
    const runRes = await vmFetch(endpoint, token, "/hooks/run", {
      ownerId,
      computerId,
      secrets: { MODAL_API_KEY: modalKey, PROVIDER_API_KEY: metaKey },
      usageToken,
      ...(computerApi ? { apiUrl: computerApi } : {}),
      ...(bucket ? { workspace: { bucket, prefix } } : {}),
    });
    if (!runRes.ok) throw new Error(`/hooks/run → ${runRes.status}: ${(await runRes.text()).slice(0, 200)}`);

    // Smoke test: one chat turn through the new VM.
    const taskRes = await vmFetch(endpoint, token, "/task", {
      text: "Reply with exactly: cloud-ok",
      ownerId,
      ...(computerApi ? { apiUrl: computerApi } : {}),
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
    // Never poison the row: a mid-provision failure means "try again", not
    // "dead". Marking "terminated" used to skip the vmAlive self-heal on the
    // next boot and orphan the VM that just started (alive, billing, but
    // untracked since microvmId is only stored on success).
    if (bootedMicrovmId) {
      try {
        await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: bootedMicrovmId }));
        console.log(`[wayfind-api] terminated ${bootedMicrovmId} after failed provision of ${computerId}`);
      } catch (termErr) {
        console.error(
          `[wayfind-api] LEAKED microvm ${bootedMicrovmId} (provision of ${computerId} failed, terminate failed):`,
          termErr instanceof Error ? termErr.message : String(termErr),
        );
      }
    }
    await dataClient.models.Computer.update({
      id: computerId,
      provisionStatus: "not_provisioned",
    });
    throw err;
  }
}
