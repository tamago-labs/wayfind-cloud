import { createHmac, timingSafeEqual } from "crypto";
import { CreateMicrovmAuthTokenCommand } from "@aws-sdk/client-lambda-microvms";
import { CORS, json } from "../lib/respond.js";
import { dataClient, env, microvms } from "../lib/clients.js";
import {
  mintVmToken,
  pickComputer,
  resetStaleRow,
  vmAlive,
} from "../lib/microvm.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /computer/token - mint a short-lived, port-scoped auth token for
// the caller's own MicroVM (browser-to-VM direct SSE). Body: { microvmId?,
// expirationInMinutes? (default 30, max 60), port? (default 8080),
// kind? (default classic) }.
// microvmId must match the caller's Computer row - never another account.
export async function handleComputerToken(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.endsWith("/computer/token") || method !== "POST") return null;
  let body: { microvmId?: string; expirationInMinutes?: number; port?: number; kind?: string } = {};
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const kind = body.kind === "one_outer" ? "one_outer" : "classic";
  const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
  const computer = pickComputer(computers, kind);
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

// ---- Signed preview URLs (new-tab/iframe access without a bearer) ----
// Navigations can't attach the Cognito bearer, so preview/dev links carry
// a short-lived stateless HMAC token instead:
//   …/computer/proxy/preview/<folder>/?preview=<exp>.<ownerB64>.<hex>
//   …/computer/proxy/dev/?port=5173&preview=<exp>.<ownerB64>.<hex>
// Payload: `${ownerId}.${scope}.${target}.${exp}`. Scope binding: preview
// tokens only proxy preview/<target>/…, dev tokens only proxy /dev/ with
// ?port=<target>.
const PREVIEW_TTL_MS = 15 * 60 * 1000;

// Preview HMAC root, derived from TICK_SECRET with a fixed domain string
// so signatures never cross contexts (ticker vs preview). No extra secret.
let previewKey: Buffer | null = null;
function previewSecret(): string {
  if (previewKey) return previewKey.toString("hex");
  const tick = env.TICK_SECRET ?? "";
  if (!tick) return "";
  previewKey = createHmac("sha256", tick).update("wayfind-preview-v1").digest();
  return previewKey.toString("hex");
}

function safeFolder(target: unknown): string | null {
  if (typeof target !== "string" || !target) return null;
  const t = target.replace(/^\/+|\/+$/g, "");
  if (!t || t.split("/").some((s) => s === ".." || s.startsWith("."))) return null;
  return t;
}

// POST /computer/proxy/preview-token (Cognito) → { sig, exp, scope, target }.
export async function handlePreviewToken(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.endsWith("/computer/proxy/preview-token") || method !== "POST") return null;
  const secret = previewSecret();
  if (!secret) return json(500, { error: "preview not configured (TICK_SECRET)" });
  let body: { scope?: string; target?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (body.scope !== "preview" && body.scope !== "dev") {
    return json(400, { error: "scope must be preview|dev" });
  }
  let target: string;
  if (body.scope === "preview") {
    const f = safeFolder(body.target);
    if (!f) return json(400, { error: "target must be a workspace folder" });
    target = f;
  } else {
    const port = typeof body.target === "string" ? Number(body.target) : body.target;
    if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
      return json(400, { error: "target must be a port 1-65535" });
    }
    target = String(port);
  }
  const exp = Date.now() + PREVIEW_TTL_MS;
  const payload = `${ownerId}.${body.scope}.${target}.${exp}`;
  const hex = createHmac("sha256", secret).update(payload).digest("hex");
  const ownerB64 = Buffer.from(ownerId, "utf8").toString("base64url");
  return json(200, { sig: `${exp}.${ownerB64}.${hex}`, exp, scope: body.scope, target });
}

// Pre-gate: GET|HEAD /computer/proxy/{preview,dev}/… with ?preview=<sig>
// or the wf_preview cookie (set on the first signed response — absolute
// asset paths like /@vite/client drop the query string).
// Validates the HMAC, then relays as that owner (no Cognito needed).
export async function handlePreviewRelay(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (method !== "GET" && method !== "HEAD") return null;
  const m = path.match(/\/computer\/proxy\/(preview|dev)\//);
  if (!m) return null;
  const params = new URLSearchParams(event.rawQueryString ?? "");
  const fromQuery = params.get("preview");
  const sig = fromQuery ?? previewToken(event);
  if (!sig) return null; // not a signed request — fall through to the Cognito gate
  const secret = previewSecret();
  if (!secret) return json(500, { error: "preview not configured (TICK_SECRET)" });
  const parts = sig.split(".");
  if (parts.length !== 3) return json(403, { error: "bad preview signature" });
  const [expStr, ownerB64, hex] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return json(403, { error: "preview link expired" });
  let ownerId = "";
  try {
    ownerId = Buffer.from(ownerB64, "base64url").toString("utf8");
  } catch {
    return json(403, { error: "bad preview signature" });
  }
  if (!ownerId) return json(403, { error: "bad preview signature" });
  const scope = m[1];
  // Re-derive the bound target from the live request and compare.
  let target: string | null = null;
  if (scope === "preview") {
    const rest = path.slice(path.indexOf("/computer/proxy/preview/") + "/computer/proxy/preview/".length);
    const folder = rest.split("/")[0] ?? "";
    let decoded = "";
    try {
      decoded = decodeURIComponent(folder);
    } catch {
      return json(403, { error: "bad preview signature" });
    }
    target = safeFolder(decoded);
    if (!target) return json(403, { error: "bad preview signature" });
  } else {
    target = params.get("port") ?? "5173";
    if (!/^\d+$/.test(target) || Number(target) < 1 || Number(target) > 65535) {
      return json(403, { error: "bad preview signature" });
    }
  }
  const payload = `${ownerId}.${scope}.${target}.${exp}`;
  const want = createHmac("sha256", secret).update(payload).digest();
  let got: Buffer;
  try {
    got = Buffer.from(hex, "hex");
    if (got.length !== want.length) return json(403, { error: "bad preview signature" });
  } catch {
    return json(403, { error: "bad preview signature" });
  }
  if (!timingSafeEqual(got, want)) return json(403, { error: "bad preview signature" });
  // First contact carries ?preview= — plant the cookie so absolute-path
  // subresources (no query string) authenticate on follow-up requests.
  return handleComputerProxy({ event, method, path, ownerId, claims: null }, fromQuery ? sig : undefined);
}

// Short-lived bearer for preview subresources (absolute asset paths like
// /@vite/client drop the ?preview= query). Set on the first signed
// response; the browser resends it on every same-host subrequest.
// HttpOnly + Secure + scoped path — valid only for preview/dev paths.
function previewCookie(sig: string): string {
  return `wf_preview=${sig}; Path=/computer/proxy/; Max-Age=900; HttpOnly; Secure; SameSite=None`;
}

/** Read the preview token from ?preview= or the wf_preview cookie. */
function previewToken(event: { rawQueryString?: string; headers?: Record<string, string | undefined> }): string | null {
  const params = new URLSearchParams(event.rawQueryString ?? "");
  const q = params.get("preview");
  if (q) return q;
  const cookieHeader = event.headers?.cookie ?? event.headers?.Cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === "wf_preview") {
      const val = v.join("=");
      if (val) return val;
    }
  }
  return null;
}

// ANY /computer/proxy/* - relay browser traffic to the caller's MicroVM.
// Browsers cannot reach the VM endpoint directly: the token proxy
// rejects unauthenticated preflights (browsers never attach the token
// to OPTIONS) and honors no query-token, so all cloud chat/files/stream
// go through here. Cognito at this layer, short-lived VM token minted
// server-side per call. Upstream status passes through untouched.
// Limits: SSE is buffered (no response streaming through this wrapper,
// so cloud chat renders whole), ~6MB Lambda response cap on downloads.
export async function handleComputerProxy(ctx: Ctx, previewSig?: string): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.includes("/computer/proxy/")) return null;
  const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
  // kind rides the query string (?kind=one_outer) so GET relays stay
  // bodiless; absent means classic (all existing cloud callers).
  const params = new URLSearchParams(event.rawQueryString ?? "");
  const kind = params.get("kind") === "one_outer" ? "one_outer" : "classic";
  const computer = pickComputer(computers, kind);
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
    headers: {
      ...CORS,
      "Content-Type": upType,
      // Plant the preview bearer for absolute-path subresources (see
      // handlePreviewRelay). Only on explicitly signed responses.
      ...(previewSig ? { "Set-Cookie": previewCookie(previewSig) } : {}),
    },
    body: textish ? buf.toString("utf8") : buf.toString("base64"),
    ...(textish ? {} : { isBase64Encoded: true }),
  };
}
