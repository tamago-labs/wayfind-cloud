// 11 - grounded search: recent-events question should trigger the hosted
// Meta web_search tool and come back with a Sources block from url_citations.
// Run: npx tsx scripts/computer/11-grounding.ts (server must be running)
import { assert, runToDone } from './config.js';

async function main(): Promise<void> {
  const { runId, output } = await runToDone(
    'Who won the most recent Formula 1 Grand Prix? Keep it to two sentences.',
  );
  console.log(`--- run ${runId} output ---\n${output}\n--- end ---`);
  assert(/sources:/i.test(output), 'grounded answer includes a Sources block');
  assert(/https?:\/\//.test(output), 'Sources block contains at least one URL');
  console.log('11-grounding: PASS');
}

main().catch((err) => {
  console.error('11-grounding: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
