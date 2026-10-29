// Usage metering: every completed run emits a usage event (logged + kept on
// the run). If WAYFIND_API_URL is set, it is also POSTed to
// POST /runs/:id/usage (run id = backend run id passed via TASK_RUN_ID).
// Token-level cost accounting lands in P2.
export interface UsageEvent {
  runId: string;
  model: string;
  durationMs: number;
  outputChars: number;
  toolCalls: number;
  at: string;
}

export async function reportUsage(usage: UsageEvent): Promise<void> {
  console.log(`[usage] ${JSON.stringify(usage)}`);
  const base = process.env.WAYFIND_API_URL;
  const backendRunId = process.env.TASK_RUN_ID;
  if (!base || !backendRunId) return;
  try {
    await fetch(`${base}/runs/${backendRunId}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usage),
    });
  } catch (err) {
    console.error('[usage] post failed:', err instanceof Error ? err.message : err);
  }
}
