// 02 - text task: minimal model round-trip, no tools expected.
// Run: npx tsx scripts/computer/02-task-text.ts
import { assert, runToDone } from './config.js';

async function main(): Promise<void> {
  const { runId, events, output } = await runToDone('Reply with exactly: ok');
  assert(output.trim() === 'ok', `run ${runId} output is exactly "ok" (got ${JSON.stringify(output.trim())})`);
  assert(events.some((e) => e.type === 'chunk'), 'stream emitted chunk events');
  const manual = events.filter((e) => e.type === 'approval' && !e.auto);
  assert(manual.length === 0, 'every approval (if any) is auto:true in permissive mode');
  console.log('02-task-text: PASS');
}

main().catch((err) => {
  console.error('02-task-text: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
