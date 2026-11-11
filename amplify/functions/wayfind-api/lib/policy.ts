import { dataClient } from "./clients.js";
import { stampOwner } from "./owner.js";

export const LEVEL_RANK: Record<string, number> = { none: 0, standard: 1, verified_inference: 2 };

export interface EffectivePolicy {
  mandatoryLevel: "none" | "standard" | "verified_inference";
  allowedModels: string[]; // empty = curated list only
  maxIdleTtlSeconds: number;
}

const DEFAULTS: EffectivePolicy = { mandatoryLevel: "none", allowedModels: [], maxIdleTtlSeconds: 28_800 };

export async function loadPolicy(ownerId: string): Promise<EffectivePolicy> {
  const { data } = await dataClient.models.Policy.policiesByOwner({ ownerId });
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).filter((r) => r.mandatoryLevel);
  if (rows.length === 0) return { ...DEFAULTS };
  rows.sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  const r = rows[0];
  const level = typeof r.mandatoryLevel === "string" && r.mandatoryLevel in LEVEL_RANK ? r.mandatoryLevel : "none";
  return {
    mandatoryLevel: level as EffectivePolicy["mandatoryLevel"],
    allowedModels: Array.isArray(r.allowedModels) ? (r.allowedModels as string[]).filter((m) => typeof m === "string") : [],
    maxIdleTtlSeconds: typeof r.maxIdleTtlSeconds === "number" && r.maxIdleTtlSeconds > 0 ? Math.floor(r.maxIdleTtlSeconds) : DEFAULTS.maxIdleTtlSeconds,
  };
}

/** Fail-closed gate for conversation creation. */
export function policyAllows(
  policy: EffectivePolicy,
  req: { model: string; curatedModels: string[]; securityLevel: string },
): { ok: true } | { ok: false; error: string } {
  const allowed = policy.allowedModels.length > 0 ? policy.allowedModels : req.curatedModels;
  if (!allowed.includes(req.model)) {
    return { ok: false, error: `model not permitted by policy (allowed: ${allowed.join(", ") || "none"})` };
  }
  const need = LEVEL_RANK[policy.mandatoryLevel] ?? 0;
  const got = LEVEL_RANK[req.securityLevel] ?? -1;
  if (got < need) {
    return { ok: false, error: `policy requires security level ${policy.mandatoryLevel} or stronger` };
  }
  return { ok: true };
}

export async function savePolicy(
  ownerId: string,
  input: { mandatoryLevel?: string; allowedModels?: string[]; maxIdleTtlSeconds?: number },
): Promise<void> {
  if (input.mandatoryLevel !== undefined && !(input.mandatoryLevel in LEVEL_RANK)) {
    throw new Error("mandatoryLevel must be none | standard | verified_inference");
  }
  if (input.allowedModels !== undefined) {
    if (!Array.isArray(input.allowedModels) || input.allowedModels.some((m) => typeof m !== "string")) {
      throw new Error("allowedModels must be a string array");
    }
  }
  if (input.maxIdleTtlSeconds !== undefined && (!Number.isInteger(input.maxIdleTtlSeconds) || input.maxIdleTtlSeconds < 300)) {
    throw new Error("maxIdleTtlSeconds must be an integer >= 300");
  }
  const { data } = await dataClient.models.Policy.policiesByOwner({ ownerId });
  const rows = ((data ?? []) as unknown as Array<{ id: string; updatedAt?: string | null; createdAt?: string | null }>);
  const patch: Record<string, unknown> = {};
  if (input.mandatoryLevel !== undefined) patch.mandatoryLevel = input.mandatoryLevel;
  if (input.allowedModels !== undefined) patch.allowedModels = input.allowedModels;
  if (input.maxIdleTtlSeconds !== undefined) patch.maxIdleTtlSeconds = Math.floor(input.maxIdleTtlSeconds);
  if (rows.length === 0) {
    const { data: created, errors } = await dataClient.models.Policy.create({
      ownerId,
      mandatoryLevel: (patch.mandatoryLevel as "none" | "standard" | "verified_inference" | undefined) ?? "none",
      ...(patch.allowedModels !== undefined ? { allowedModels: patch.allowedModels as string[] } : {}),
      ...(patch.maxIdleTtlSeconds !== undefined ? { maxIdleTtlSeconds: patch.maxIdleTtlSeconds as number } : {}),
    });
    if (errors || !created) throw new Error(JSON.stringify(errors));
    await stampOwner("Policy", (created as unknown as { id: string }).id, ownerId);
    return;
  }
  rows.sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  const { errors } = await dataClient.models.Policy.update({ id: rows[0].id, ...patch });
  if (errors) throw new Error(JSON.stringify(errors));
}
