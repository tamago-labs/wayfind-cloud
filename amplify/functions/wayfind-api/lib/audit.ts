import { dataClient } from "./clients.js";
import { stampOwner } from "./owner.js";

/** Append-only audit trail. Fire-and-forget from routes: audit must never
 * fail a user-facing call, so callers catch and log. Details carry ids,
 * hashes, and levels — never secrets, keys, or content. */
export async function emitAudit(
  ownerId: string,
  actor: string,
  action: "conversation.created" | "conversation.terminated" | "policy.updated" | "evidence.exported" | "image.published",
  conversationId?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  let detailStr: string | undefined;
  if (detail !== undefined) {
    try {
      detailStr = JSON.stringify(detail).slice(0, 2000);
    } catch {
      detailStr = "{}";
    }
  }
  try {
    const { data, errors } = await dataClient.models.AuditEvent.create({
      ownerId,
      at: new Date().toISOString(),
      actor: actor.slice(0, 120),
      action,
      ...(conversationId ? { conversationId } : {}),
      ...(detailStr !== undefined ? { detail: detailStr } : {}),
    });
    if (errors || !data) throw new Error(JSON.stringify(errors));
    await stampOwner("AuditEvent", (data as unknown as { id: string }).id, ownerId);
  } catch (err) {
    console.log(`[audit] emit failed (${action}): ${err instanceof Error ? err.message : String(err)}`);
  }
}
