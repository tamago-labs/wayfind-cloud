// 05 - approval flow (SDK-native interrupt/resume): force `ask`s (write is
// ask-by-default), then APPROVE every ask on the first run (must complete and
// write the file) and REJECT the first ask on the second run (file must NOT
// be written). Only runs against an enforcing server; SKIPs on permissive.
// Boot one with: PERMISSION_MODE=enforcing npx tsx src/server.ts  (from computer/)
// Run: npx tsx scripts/computer/05-approval-flow.ts
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_URL, assert, collectStream, postTask, type SseEvent } from './config.js';

const WORKSPACE = 'computer/workspace';

async function pendingFor(runId: string): Promise<Array<{ id: string }>> {
  const list = (await (await fetch(`${AGENT_URL}/approvals`)).json()) as {
    approvals: Array<{ id: string; runId: string }>;
  };
  return list.approvals.filter((a) => a.runId === runId);
}

async function decide(approvalId: string, decision: 'approve' | 'reject'): Promise<void> {
  const res = await fetch(`${AGENT_URL}/approvals/${approvalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  assert(res.ok, `POST /approvals/${approvalId} ${decision} → 200`);
}

/** Approve every ask that appears for the run until it finishes. */
async function approveAll(runId: string, events: Promise<SseEvent[]>): Promise<SseEvent[]> {
  const seen = new Set<string>();
  for (;;) {
    const done = events.then((evts) => evts.some((e) => e.type === 'done' || e.type === 'error'));
    if (await Promise.race([done, new Promise((r) => setTimeout(() => r(false), 2000))])) break;
    for (const a of await pendingFor(runId)) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        await decide(a.id, 'approve');
      }
    }
  }
  return events;
}

async function main(): Promise<void> {
  const status = (await (await fetch(`${AGENT_URL}/status`)).json()) as { permissionMode?: string };
  if (status.permissionMode !== 'enforcing') {
    console.log('05-approval-flow: SKIP (server is permissive; boot with PERMISSION_MODE=enforcing to exercise interrupt/resume)');
    return;
  }
  const stamp = Date.now();

  // approve path — every ask approved, run must complete and write the file
  {
    const file = `approve-${stamp}.txt`;
    const runId = await postTask(`Write the file ${file} containing exactly APPROVED. Reply DONE when finished.`);
    const promise = collectStream(runId, 600_000);
    const events = await approveAll(runId, promise);
    assert(events.some((e) => e.type === 'approval'), 'approve path parked at least once');
    assert(events.some((e) => e.type === 'approval-resolved'), 'approve path emitted approval-resolved');
    assert(events.some((e) => e.type === 'done'), 'approve path run completed');
    const done = events.find((e) => e.type === 'done');
    assert(/DONE/.test(String(done?.output ?? '')), 'approve path output says DONE');
    assert(existsSync(join(WORKSPACE, file)), 'approve path file was written after approval');
    rmSync(join(WORKSPACE, file), { force: true });
  }

  // reject path — first ask rejected, file must NOT be written
  {
    const file = `reject-${stamp}.txt`;
    const runId = await postTask(`Write the file ${file} containing exactly REJECTED. Reply DONE when finished.`);
    const promise = collectStream(runId, 600_000);
    const deadline = Date.now() + 240_000;
    let rejected = false;
    while (Date.now() < deadline) {
      const [a] = await pendingFor(runId);
      if (a) {
        await decide(a.id, 'reject');
        rejected = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    assert(rejected, 'reject path produced an approval to reject');
    const events = await promise;
    assert(events.some((e) => e.type === 'done' || e.type === 'error'), 'reject path run terminated');
    assert(!existsSync(join(WORKSPACE, file)), 'reject path file was NOT written');
    rmSync(join(WORKSPACE, file), { force: true });
  }

  console.log('05-approval-flow: PASS');
}

main().catch((err) => {
  console.error('05-approval-flow: FAIL', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
