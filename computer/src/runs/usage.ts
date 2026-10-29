// Usage metering: every completed run emits a usage event (logged + kept on
// the run). If WAYFIND_API_URL is set, it is also POSTed to
// POST /runs/:id/usage (run id = backend run id passed via TASK_RUN_ID).
// Token-level cost accounting lands in P2.
export interface TokenCounts {
  input: number;
  output: number;
}

export interface UsageEvent {
  runId: string;
  model: string;
  provider?: string;
  durationMs: number;
  outputChars: number;
  toolCalls: number;
  tokens?: TokenCounts;
  /** $/1M tokens from providers.json. */
  costPer1M?: { input: number; output: number };
  /** Computed only when both tokens and rates are present. */
  spendUsd?: number;
  at: string;
}

export async function reportUsage(usage: UsageEvent): Promise<UsageEvent> {
  if (usage.tokens && usage.costPer1M) {
    usage.spendUsd =
      (usage.tokens.input * usage.costPer1M.input + usage.tokens.output * usage.costPer1M.output) / 1_000_000;
  }
  console.log(`[usage] ${JSON.stringify(usage)}`);
  const base = process.env.WAYFIND_API_URL;
  const backendRunId = process.env.TASK_RUN_ID;
  if (!base || !backendRunId) return usage;
  try {
    await fetch(`${base}/runs/${backendRunId}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...usage, backendRunId }),
    });
  } catch (err) {
    console.error('[usage] post failed:', err instanceof Error ? err.message : err);
  }
  return usage;
}
