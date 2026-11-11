import { dataClient } from "../lib/clients.js";
import { json } from "../lib/respond.js";
import { receiptPublicKey } from "../lib/receipts.js";

// GET /verify-key — public receipt-signing key (Ed25519 SPKI PEM + kid).
// No auth: verifiers need it before they have any credential. Fails closed
// (503) when the signing key isn't configured — receipts are unsigned then.
export async function handleVerifyKey(ctx: Ctx): Promise<RouteResult> {
  const { method, path } = ctx;
  if (!path.endsWith("/verify-key") || method !== "GET") return null;
  try {
    return json(200, receiptPublicKey());
  } catch {
    return json(503, { error: "receipt signing not configured" });
  }
}import {
  CLI_LOGIN_URL,
  CLI_TOKEN_TTL_MS,
  DEVICE_CODE_TTL_MS,
  deviceExpired,
  deviceRateOk,
  ensureProfile,
  findDeviceCode,
  newCliToken,
  newUserCode,
  sha256hex,
} from "../lib/auth.js";
import { stampOwner } from "../lib/owner.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /auth/device — mint a device-flow code (public; the CLI calls this
// before it has any credential). Body: { deviceName? }.
// Returns { code, url, expiresIn }. Rate-limited per source IP.
export async function handleAuthDevice(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/auth/device") || method !== "POST") return null;
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
export async function handleAuthDevicePoll(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/auth/device/poll") || method !== "POST") return null;
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

// POST /auth/device/approve — browser approval for a CLI device code.
// Cognito sessions ONLY: a CLI token must never mint further credentials.
// Body: { code, action: "approve"|"deny" }. Approve mints a CliToken for
// the verified caller (same user — userId comes from the Cognito JWT).
export async function handleAuthDeviceApprove(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId, claims } = ctx;
  if (!path.endsWith("/auth/device/approve") || method !== "POST") return null;
  if (claims?.cliTokenId) return json(403, { error: "device approval requires a browser (Cognito) session" });
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
  const profile = await ensureProfile(claims!);
  // Empty-string profile emails (created before email capture) must not
  // shadow a real Cognito claim — use ||, not ??, throughout.
  const email =
    (typeof claims!.email === "string" && claims!.email) || profile.email || undefined;
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
  return json(200, { ok: true, status: "approved", email: profile.email ?? claims!.email ?? null });
}

// GET /auth/me — who is this bearer? Works for Cognito and CLI tokens.
// The CLI uses this as its session check (login guard).
export async function handleAuthMe(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId, claims } = ctx;
  if (!path.endsWith("/auth/me") || method !== "GET") return null;
  let email: string | null = typeof claims!.email === "string" ? claims!.email : null;
  if (!email && claims!.cliTokenId) {
    try {
      const fetched = await dataClient.models.CliToken.get({ id: claims!.cliTokenId });
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
  return json(200, { userId: ownerId, email, via: claims!.cliTokenId ? "cli" : "cognito" });
}

// POST /auth/revoke — revoke CLI tokens. A CLI bearer revokes itself;
// a Cognito session may revoke one ({ cliTokenId }) or all ({ all: true }).
export async function handleAuthRevoke(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId, claims } = ctx;
  if (!path.endsWith("/auth/revoke") || method !== "POST") return null;
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
  if (claims!.cliTokenId) {
    const ok = await revoke(claims!.cliTokenId);
    return json(200, { ok, revoked: ok ? [claims!.cliTokenId] : [] });
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
