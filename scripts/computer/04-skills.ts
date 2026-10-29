// 04 - skills: the agent must load the example skill by name and use it.
// Run: npx tsx scripts/computer/04-skills.ts
import { assert, runToDone } from './config.js';

async function main(): Promise<void> {
  const { runId, output } = await runToDone(
    'Use the example-skill skill and then reply with SKILLNAME:<the skill name you loaded>.',
  );
  assert(/SKILLNAME:\s*example-skill/i.test(output), `run ${runId} loaded example-skill`);
  console.log('04-skills: PASS');
}

main().catch((err) => {
  console.error('04-skills: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
