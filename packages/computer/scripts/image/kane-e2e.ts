// E2E probe: ask the VM agent a question, auto-approve parked approvals, print output.
// Usage: npx tsx packages/computer/scripts/image/kane-e2e.ts "<question>"
import { loadState } from './config';
import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';

const question = process.argv[2] ?? 'Reply with exactly: probe-ok';
const { microvmId, endpoint } = loadState();
if (!microvmId || !endpoint) throw new Error('No microvm in state — run 03 first.');
const mv = new LambdaMicrovmsClient({ region: 'ap-southeast-1' });
const t = await mv.send(new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }));
const token = (t.authToken as Record<string, string>)['X-aws-proxy-auth'];

const res = await fetch(`https://${endpoint}/task`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-aws-proxy-auth': token },
  body: JSON.stringify({ text: question, ownerId: 'manual-boot' }),
});
const { runId } = (await res.json()) as { runId: string };
console.log('runId=', runId);

const approved = new Set<string>();
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const ev = await fetch(`https://${endpoint}/runs/${runId}/events?cursor=0`, { headers: { 'X-aws-proxy-auth': token } });
  const page = (await ev.json()) as { events: Array<{ type: string; approvalId?: string; permission?: string; output?: string }>; done: boolean };
  for (const e of page.events) {
    if (e.type === 'approval' && e.approvalId && !approved.has(e.approvalId)) {
      approved.add(e.approvalId);
      console.log(`approving ${e.approvalId} (${e.permission})`);
      await fetch(`https://${endpoint}/approvals/${e.approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-aws-proxy-auth': token },
        body: JSON.stringify({ decision: 'approve' }),
      });
    }
  }
  const done = page.events.find((e) => e.type === 'done');
  if (done || page.done) { console.log('OUTPUT:', (done?.output ?? '').slice(0, 2000)); break; }
  if (i === 79) console.log('TIMEOUT — last events:', JSON.stringify(page.events.slice(-3)).slice(0, 2000));
}
