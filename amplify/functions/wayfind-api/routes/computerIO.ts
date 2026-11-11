import { CreateMicrovmAuthTokenCommand } from "@aws-sdk/client-lambda-microvms";
import { CORS, json } from "../lib/respond.js";
import { dataClient, microvms } from "../lib/clients.js";
import {
  mintVmToken,
  pickComputer,
  resetStaleRow,
  vmAlive,
} from "../lib/microvm.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /computer/token - mint a short-lived, port-scoped auth token for
// the caller's own MicroVM (browser-to-VM direct SSE). Body: { microvmId?,
// expirationInMinutes? (default 30, max 60), port? (default 8080) }.
// microvmId must match the caller's Computer row - never another account.
export async function handleComputerToken(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.endsWith("/computer/token") || method !== "POST") return null;
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
export async function handleComputerProxy(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.includes("/computer/proxy/")) return null;
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
