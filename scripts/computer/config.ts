// Shared helpers for scripts/computer/*.ts — black-box tests against the
// agent server. Assumes the server is already running with a real key:
//   cd computer && npx tsx src/server.ts
// Run from the repo root: npx tsx scripts/computer/01-health.ts
export const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:8080';

export interface SseEvent {
  type: string;
  [k: string]: unknown;
}

export function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
}

export async function postTask(text: string): Promise<string> {
  const body: Record<string, string> = { text };
  // Override the model for test runs without touching the repo default,
  // e.g. TEST_MODEL=recursive/flint-v1.0:free when the default is exhausted.
  if (process.env.TEST_PROVIDER) body.provider = process.env.TEST_PROVIDER;
  if (process.env.TEST_MODEL) body.model = process.env.TEST_MODEL;
  const res = await fetch(`${AGENT_URL}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /task → ${res.status}: ${await res.text()}`);
  const { runId } = (await res.json()) as { runId: string };
  return runId;
}

/** Collect SSE events until done/error or timeout. Returns all events. */
export async function collectStream(runId: string, timeoutMs = 600_000): Promise<SseEvent[]> {
  const res = await fetch(`${AGENT_URL}/stream/${runId}`, { headers: { Accept: 'text/event-stream' } });
  if (!res.ok || !res.body) throw new Error(`GET /stream → ${res.status}`);
  const events: SseEvent[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`stream ${runId} timed out after ${timeoutMs}ms`);
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        const m = line.match(/^data: (.*)$/);
        if (m) {
          try {
            events.push(JSON.parse(m[1]) as SseEvent);
          } catch {
            // ignore malformed lines
          }
        }
      }
    }
    if (events.some((e) => e.type === 'done' || e.type === 'error')) break;
  }
  await reader.cancel().catch(() => {});
  return events;
}

/** Run a task to completion; throws on error event, returns done output.
 * Retries the whole task on provider 429s (free-tier rate limits). */
export async function runToDone(
  text: string,
  timeoutMs = 600_000,
  retries = 3,
): Promise<{ runId: string; events: SseEvent[]; output: string }> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const runId = await postTask(text);
    const events = await collectStream(runId, timeoutMs);
    const err = events.find((e) => e.type === 'error');
    if (!err) {
      const done = events.find((e) => e.type === 'done');
      return { runId, events, output: (done?.output as string) ?? '' };
    }
    lastErr = new Error(`run ${runId} errored: ${err.error}`);
    if (/429/.test(String(err.error ?? '')) && attempt <= retries) {
      console.log(`  429 rate-limited (attempt ${attempt}/${retries + 1}) — waiting 60s…`);
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}
