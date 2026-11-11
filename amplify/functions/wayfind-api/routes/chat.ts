import { json } from "../lib/respond.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /chat/message — Phase 4 (chat + model runtime). Honest stub.
export async function handleChatMessage(ctx: Ctx): Promise<RouteResult> {
  const { method, path } = ctx;
  if (!path.endsWith("/chat/message")) return null;
  void method;
  return json(501, {
    error: "chat runtime arrives in Phase 4 (chat + model). Your Bots, account and Computer request are real; no work was run.",
    phase: 4,
  });
}
