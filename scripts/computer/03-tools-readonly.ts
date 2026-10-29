// 03 - read-only tools: read + list + allow-listed shell (ls/cat).
// Write/approve paths are covered by 05-approval-flow.
// Run: npx tsx scripts/computer/03-tools-readonly.ts
import { assert, runToDone } from './config.js';

async function main(): Promise<void> {
  const { runId, output } = await runToDone(
    'Read skills/example/SKILL.md, list the skills directory, and reply with ' +
      'FIRSTLINE:<the first markdown heading you saw>. Do not write anything.',
  );
  assert(/FIRSTLINE:/.test(output), `run ${runId} reported a heading`);
  assert(!/needs approval|Denied|denied/.test(output), 'no permission blocks on the allow-listed path');
  console.log('03-tools-readonly: PASS');
}

main().catch((err) => {
  console.error('03-tools-readonly: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
