// E2E UI simulation: "help create a to-do list with react", explicit GLM
// (image predates the GLM default), then inspect what landed on disk.
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

const cid = `todo-ui-${Date.now()}`;
const task = await vmFetch('/task', {
  method: 'POST',
  body: JSON.stringify({
    conversationId: cid,
    model: 'zai-org/GLM-5.3-Flash',
    text: 'Help create a to-do list with React. Scaffold it under workspace folder todo-app (Vite + React), implement add/toggle/delete with localStorage persistence, then verify it actually builds: report node -v and npm -v, run npm install and npm run build, and tell me the final file tree plus whether the build succeeded.',
  }),
});
if (task.status !== 202) {
  console.error('task rejected:', JSON.stringify(task.body));
  process.exit(1);
}
const runId = (task.body as { runId?: string }).runId;
console.log(`run ${runId} started — polling (up to ~28 min for npm install + build)…`);

let done = false;
let last = '';
for (let i = 0; i < 840; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const ev = await vmFetch(`/runs/${runId}/events?cursor=999999`);
  const b = ev.body as { done?: boolean; output?: string };
  if (i % 30 === 0) {
    const h = await vmFetch(`/runs/history/${runId}`).catch(() => null);
    void h;
    console.log(`  …${Math.round(((i + 1) * 2) / 60)}m elapsed`);
  }
  if (b.done) {
    done = true;
    last = b.output ?? '';
    break;
  }
}
if (!done) {
  console.error('TODO VERIFY: FAIL — run did not finish in time');
  process.exit(1);
}
console.log('=== final output (tail) ===');
console.log(last.slice(-3000));

const files = await vmFetch(`/files?path=${encodeURIComponent('todo-app')}`);
console.log('=== todo-app listing ===');
console.log(JSON.stringify(files.body, null, 1).slice(0, 4000));
console.log('TODO VERIFY: run completed — review output + listing above');
process.exit(0);
