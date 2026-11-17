// /dev reverse-proxy verification: agent serves a folder on :5180,
// then we fetch it through /dev/?port=5180 from outside.
import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import { readFileSync } from 'node:fs';

const state = JSON.parse(readFileSync('packages/computer/scripts/image/.computer-image-state.json', 'utf8'));
const { microvmId, endpoint } = state as { microvmId: string; endpoint: string };

const mv = new LambdaMicrovmsClient({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
const t = await mv.send(
  new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }),
);
const token = (t.authToken as Record<string, string>)?.['X-aws-proxy-auth'];
if (!token) throw new Error('no token');

const H = { 'Content-Type': 'application/json', 'X-aws-proxy-auth': token };
const J = (path: string, init?: RequestInit): Promise<unknown> =>
  fetch(`https://${endpoint}${path}`, { ...init, headers: { ...(init?.headers ?? {}), ...H } }).then((r) =>
    r.json().catch(() => ({})),
  );

const code = [
  'const u = new URL(req.url);',
  'const p = u.pathname === "/" ? "/index.html" : u.pathname;',
  'const f = Bun.file("live" + p);',
  'const ok = await f.exists();',
  'return new Response(ok ? f : "missing", { status: ok ? 200 : 404,',
  '  headers: { "Content-Type": p.endsWith(".html") ? "text/html" : "text/plain" } });',
].join('\n');

let runId = process.argv[2];
if (!runId) {
  const task = (await J('/task', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: 'dev-live',
      model: 'zai-org/GLM-5.3-Flash',
      text: 'In workspace folder live/ create index.html with a big LIVE heading and a paragraph. Then serve it with: nohup bun -e \'Bun.serve({ port: 5180, fetch: async (req) => { ' + code.replace(/\n/g, ' ') + ' } })\' > live.log 2>&1 & — then confirm HTTP 200 on http://localhost:5180/ with fetch or wget and report.',
    }),
  })) as { runId?: string };
  if (!task.runId) throw new Error(`task rejected: ${JSON.stringify(task)}`);
  runId = task.runId;
  console.log(`run started: ${runId}`);
  console.log(`rerun: npx tsx packages/computer/scripts/image/dev-verify.ts ${runId}`);
}

for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const ev = (await J(`/runs/${runId}/events?cursor=0`)) as {
    events?: Array<{ type?: string; approvalId?: string; permission?: string; target?: string }>;
    done?: boolean;
    output?: string;
  };
  const es = ev.events ?? [];
  for (const a of es.filter((e) => e.type === 'approval' && e.approvalId)) {
    await J(`/approvals/${a.approvalId}`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    console.log(`approved: ${(a.permission ?? '')} ${(a.target ?? '').slice(0, 60)}`);
  }
  if (ev.done) {
    console.log('run done. output tail:');
    console.log((ev.output ?? '').slice(-1200));
    break;
  }
}

// Now through the /dev proxy from outside.
const res = await fetch(`https://${endpoint}/dev/?port=5180`, { headers: { 'X-aws-proxy-auth': token } });
const body = await res.text();
console.log(`GET /dev/?port=5180 → ${res.status} ${res.headers.get('content-type')}`);
console.log(body.slice(0, 200));
if (res.status === 200 && body.includes('LIVE')) {
  console.log('DEV VERIFY: PASS — live server reachable through /dev proxy');
  process.exit(0);
}
console.error('DEV VERIFY: FAIL');
process.exit(1);
