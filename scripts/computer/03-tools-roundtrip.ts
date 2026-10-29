// 03 - tools round-trip: write → read back → shell list. Uses allow-listed
// paths so no approval interrupts the flow. Verifies files on disk after.
// Run: npx tsx scripts/computer/03-tools-roundtrip.ts
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assert, runToDone } from './config.js';

const FILE = `ping-${Date.now()}.txt`;
const WORKSPACE = 'computer/workspace';

async function main(): Promise<void> {
  try {
    const { runId, output } = await runToDone(
      `Write the file ${FILE} containing exactly the word pong (no extra whitespace), ` +
        `then read it back and reply with READBACK:<content>. Do not run anything else.`,
    );
    assert(/READBACK:\s*pong/.test(output), `run ${runId} read back "pong"`);
    const disk = join(WORKSPACE, FILE);
    assert(existsSync(disk), `file exists on disk: ${disk}`);
    assert(readFileSync(disk, 'utf8').trim() === 'pong', 'disk content is exactly "pong"');
    console.log('03-tools-roundtrip: PASS');
  } finally {
    rmSync(join(WORKSPACE, FILE), { force: true });
  }
}

main().catch((err) => {
  console.error('03-tools-roundtrip: FAIL', err instanceof Error ? err.message : err);
  try {
    rmSync(join(WORKSPACE, FILE), { force: true });
  } catch {
    // ignore
  }
  process.exit(1);
});
