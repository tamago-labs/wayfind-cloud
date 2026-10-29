// 06 - CLI backup: `backup now` writes a tarball, `backup list` shows it.
// Cleans up after itself. Runs the CLI in computer/ (no server needed).
// Run: npx tsx scripts/computer/06-cli-backup.ts
import { exec } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './config.js';

const COMPUTER_DIR = 'computer';
const BACKUP_DIR = join(COMPUTER_DIR, 'workspace', '.wayfind', 'backups');

function cli(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`npx tsx src/cli.ts ${args.join(' ')}`, { cwd: COMPUTER_DIR, timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`wayfind ${args.join(' ')} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

async function main(): Promise<void> {
  const before = new Set(existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR) : []);
  await cli('backup', 'now');
  const after = existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR) : [];
  const created = after.filter((f) => !before.has(f));
  assert(created.length === 1 && created[0].endsWith('.tgz'), `backup now wrote one tarball (${created.join(',')})`);

  const list = await cli('backup', 'list');
  assert(list.includes(created[0]), 'backup list shows the new tarball');

  for (const f of created) rmSync(join(BACKUP_DIR, f), { force: true });
  console.log('06-cli-backup: PASS');
}

main().catch((err) => {
  console.error('06-cli-backup: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
