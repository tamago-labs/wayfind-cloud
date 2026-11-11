import { json } from "../lib/respond.js";
import { dataClient } from "../lib/clients.js";
import { loadPolicy, savePolicy } from "../lib/policy.js";
import { emitAudit } from "../lib/audit.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// GET /policy — the caller's effective execution policy (defaults when unset).
export async function handlePolicyGet(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId } = ctx;
  if (method !== "GET" || !path.endsWith("/policy")) return null;
  return json(200, { policy: await loadPolicy(ownerId) });
}

// PUT /policy — set the caller's execution policy. Body may carry any of:
// { mandatoryLevel: none|standard|verified_inference, allowedModels: [...],
//   maxIdleTtlSeconds }. Audited.
export async function handlePolicyPut(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId, claims } = ctx;
  if (method !== "PUT" || !path.endsWith("/policy")) return null;
  let body: { mandatoryLevel?: unknown; allowedModels?: unknown; maxIdleTtlSeconds?: unknown } = {};
  try {
    body = JSON.parse(event.body ?? "{}") as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  try {
    await savePolicy(ownerId, {
      ...(typeof body.mandatoryLevel === "string" ? { mandatoryLevel: body.mandatoryLevel } : {}),
      ...(body.allowedModels !== undefined ? { allowedModels: body.allowedModels as string[] } : {}),
      ...(typeof body.maxIdleTtlSeconds === "number" ? { maxIdleTtlSeconds: body.maxIdleTtlSeconds } : {}),
    });
  } catch (err) {
    return json(400, { error: err instanceof Error ? err.message : String(err) });
  }
  const actor = claims?.cliTokenId ? `cli:${claims.cliTokenId}` : `user:${ownerId}`;
  void emitAudit(ownerId, actor, "policy.updated", undefined, { keys: Object.keys(body) });
  return json(200, { ok: true, policy: await loadPolicy(ownerId) });
}

// GET /audit[?conversationId=][?limit=] — the caller's audit trail, newest
// first. Bounded (default 50, max 200).
export async function handleAuditList(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (method !== "GET" || !path.endsWith("/audit")) return null;
  const params = event.queryStringParameters ?? {};
  const wantConv = typeof params.conversationId === "string" && params.conversationId ? params.conversationId : null;
  const limit = Math.min(200, Math.max(1, Number(params.limit ?? 50) || 50));
  const { data } = await dataClient.models.AuditEvent.auditByOwner({ ownerId });
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((r) => !wantConv || r.conversationId === wantConv)
    .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")))
    .slice(0, limit)
    .map((r) => ({
      at: r.at ?? null,
      actor: r.actor ?? null,
      action: r.action ?? null,
      conversationId: r.conversationId ?? null,
      detail: (() => {
        try {
          return r.detail ? JSON.parse(r.detail as string) : null;
        } catch {
          return r.detail ?? null;
        }
      })(),
    }));
  return json(200, { events: rows });
}
