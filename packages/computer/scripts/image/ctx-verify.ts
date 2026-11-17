// Context endpoint verification: GET (empty + after task), POST compact
// (small-context no-op path), DELETE (reset), GET (empty again).
import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import { readFileSync } from 'node:fs';

const REGION = process.env.AWS_REGION ?? 'ap-southeast-1';
const state = JSON.parse(readFileSync('packages/computer/scripts/image/.computer-image-state.json', 'utf8'));
const { microvmId, endpoint } = state as { microvmId: string; endpoint: string };

const mv = new LambdaMicrovmsClient({ region: REGION });
const t = await mv.send(
  new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }),
);
const token = (t.authToken as Record<string, string>)?.['X-aws-proxy-auth'];
if (!token) throw new Error('no token');

async function vmFetch(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://${endpoint}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), 'X-aws-proxy-auth': token, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const cid = `ctx-verify-${Date.now()}`;

// 0. Catalog default is GLM (no model anywhere → GLM + 1050000 limit).
{
  const dd = await vmFetch(`/context/ctx-verify-default`);
  console.log('GET default:', JSON.stringify(dd.body));
  const def = dd.body as { model?: string; limit?: number };
  if (dd.status !== 200 || def.model !== 'zai-org/GLM-5.3-Flash') fail(`default model ${def.model}`);
  if (def.limit !== 1050000) fail(`default limit ${def.limit}`);
}
  console.error(`CTX VERIFY: FAIL — ${msg}`);
  process.exit(1);
};

// 1. Empty conversation reads (near-)zero.
let r = await vmFetch(`/context/${cid}`);
console.log('GET empty:', JSON.stringify(r.body));
const empty = r.body as { tokens?: number; items?: number };
if (r.status !== 200 || !(empty.tokens <= 1) || empty.items !== 0) fail('empty GET');

// 2. Run a task on this conversation with an explicit model (selection tracking).
const task = await vmFetch('/task', {
  method: 'POST',
  body: JSON.stringify({
    text: 'Reply with exactly the word OK and nothing else.',
    conversationId: cid,
    model: 'meta-models/Muse-Spark-Open-816B-A42B',
  }),
});
if (task.status !== 202) fail(`task → ${task.status}`);
const runId = (task.body as { runId?: string }).runId;
if (!runId) fail('no runId');
for (let i = 0; i < 120; i++) {
  await new Promise((r2) => setTimeout(r2, 2000));
  const ev = await vmFetch(`/runs/${runId}/events?cursor=999999`);
  const b = ev.body as { done?: boolean };
  if (b.done) break;
}

// 3. Context now nonzero, limit from the catalog, model echoed back.
r = await vmFetch(`/context/${cid}`);
console.log('GET after task:', JSON.stringify(r.body));
const after = r.body as { tokens?: number; limit?: number; model?: string; pct?: number };
if (r.status !== 200 || !(after.tokens > 0)) fail('tokens not accumulated');
if (after.limit !== 1000000) fail(`limit ${after.limit}`);
if (after.model !== 'meta-models/Muse-Spark-Open-816B-A42B') fail(`model ${after.model}`);

// 4. Compact on a small context is a clean no-op (routing + selection work).
r = await vmFetch(`/context/${cid}`, { method: 'POST' });
console.log('POST compact:', JSON.stringify(r.body));
if (r.status !== 200 || (r.body as { compacted?: boolean }).compacted !== false) fail('compact no-op');

// 5. DELETE resets; GET reads zero again.
r = await vmFetch(`/context/${cid}`, { method: 'DELETE' });
console.log('DELETE:', JSON.stringify(r.body));
if (r.status !== 200 || (r.body as { cleared?: boolean }).cleared !== true) fail('delete');
r = await vmFetch(`/context/${cid}`);
const cleared = r.body as { tokens?: number; items?: number };
if (r.status !== 200 || !(cleared.tokens <= 1) || cleared.items !== 0) fail('not empty after delete');

console.log('CTX VERIFY: PASS — stats accumulate, model tracked, compact routes, reset works');
process.exit(0);
