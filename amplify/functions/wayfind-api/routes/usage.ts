import { dataClient } from "../lib/clients.js";
import { json } from "../lib/respond.js";
import { verifyToken } from "../lib/auth.js";
import { stampOwner } from "../lib/owner.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

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
export async function handleUsage(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!/\/runs\/[^/]+\/usage$/.test(path) || method !== "POST") return null;
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
