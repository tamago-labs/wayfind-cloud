// 01 - health: server routes that need no model call.
// Run: npx tsx scripts/computer/01-health.ts
import { AGENT_URL, assert } from './config.js';

async function main(): Promise<void> {
  const ready = await fetch(`${AGENT_URL}/ready`);
  assert(ready.ok, 'GET /ready → 200');

  const status = (await (await fetch(`${AGENT_URL}/status`)).json()) as {
    ok: boolean;
    provider: { baseURL: string; model: string };
  };
  assert(status.ok === true, 'GET /status → ok');
  console.log(`  provider: ${status.provider.baseURL} :: ${status.provider.model}`);

  const skills = (await (await fetch(`${AGENT_URL}/skills`)).json()) as {
    skills: Array<{ name: string }>;
  };
  assert(skills.skills.some((s) => s.name === 'example-skill'), 'GET /skills lists example-skill');

  const approvals = (await (await fetch(`${AGENT_URL}/approvals`)).json()) as { approvals: unknown[] };
  assert(Array.isArray(approvals.approvals), 'GET /approvals returns a list');

  const bad = await fetch(`${AGENT_URL}/approvals/does-not-exist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert(bad.status === 404, 'POST /approvals/unknown → 404');

  console.log('01-health: PASS');
}

main().catch((err) => {
  console.error('01-health: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
