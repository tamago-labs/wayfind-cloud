// Bun toolchain smoke test on the fresh image: versions (should be
// approval-free probes), then init + add + run, approving shell cards as
// they come to count first-touch friction.
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

const J = (path: string, init?: RequestInit): Promise<unknown> =>
  fetch(`https://${endpoint}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), 'X-aws-proxy-auth': token, 'Content-Type': 'application/json' },
  }).then((r) => r.json());

const RUN = process.argv[2];
if (!RUN) {
  const task = (await J('/task', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: 'bun-smoke',
      model: 'zai-org/GLM-5.3-Flash',
      text: 'Prove the bun toolchain works: report bun --version and bunx --version. Then in workspace folder scratch-bun/ run bun init -y, bun add zod, write index.ts that validates an object with zod and prints the result, and run it with bun. Report versions plus the program output.',
    }),
  })) as { runId?: string };
  console.log(`run started: ${task.runId}`);
  console.log('rerun: npx tsx packages/computer/scripts/image/bun-verify.ts <runId>');
  process.exit(0);
}

let approvals = 0;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const ev = (await J(`/runs/${RUN}/events?cursor=0`)) as {
    events?: Array<{ type?: string; approvalId?: string }>;
    done?: boolean;
    output?: string;
  };
  const es = ev.events ?? [];
  const pending = es.filter((e) => e.type === 'approval');
  for (const a of pending) {
    if (!a.approvalId) continue;
    approvals++;
    await J(`/approvals/${a.approvalId}`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    console.log(`approved #${approvals}: ${a.approvalId}`);
  }
  if (ev.done) {
    const chunks = es.filter((e) => e.type === 'chunk').map((e) => (e as { chunk?: string }).chunk ?? '').join('');
    console.log(`DONE — approval cards this run: ${approvals}`);
    console.log('=== output tail ===');
    console.log((ev.output ?? chunks).slice(-2500));
    process.exit(0);
  }
}
console.error('BUN VERIFY: FAIL — timed out');
process.exit(1);
