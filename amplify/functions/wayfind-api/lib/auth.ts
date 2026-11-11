import { createVerify, createPublicKey, createHash, randomBytes } from "crypto";
import { dataClient, env } from "./clients.js";

/* ---------------- Cognito JWT verification (no external deps) ---------------- */

export interface Claims {
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

export async function verifyToken(authHeader: string | undefined): Promise<Claims> {
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

export const sha256hex = (s: string): string => createHash("sha256").update(s).digest("hex");

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

export const CLI_LOGIN_URL = "https://wayfind.click/cli-login";
export const DEVICE_CODE_TTL_MS = 10 * 60_000;
export const CLI_TOKEN_TTL_MS = 90 * 24 * 3_600_000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous: no 0/O, 1/I

export function newUserCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function newCliToken(): string {
  return randomBytes(32).toString("base64url");
}

// Best-effort per-instance rate limit on code minting (Lambda instances are
// ephemeral; this blunts casual abuse, not a distributed attack).
const deviceCodeRate = new Map<string, { count: number; windowStart: number }>();

export function deviceRateOk(ip: string): boolean {
  const now = Date.now();
  const cur = deviceCodeRate.get(ip);
  if (!cur || now - cur.windowStart > 3_600_000) {
    deviceCodeRate.set(ip, { count: 1, windowStart: now });
    return true;
  }
  cur.count += 1;
  return cur.count <= 10;
}

export async function findDeviceCode(code: string) {
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

export function deviceExpired(row: { expiresAt?: string | null }): boolean {
  return !!row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
}

export async function ensureProfile(claims: Claims) {
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
