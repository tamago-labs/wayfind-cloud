// VM keystore: model keys live here, never in chat/transcripts.
// File is chmod 0600. Writes come from `wayfind keys set` (owner on the
// machine) or POST /keys (privileged backend channel only — P2 adds auth).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WORKSPACE_DIR } from './config.js';

export const KEYSTORE_PATH = join(WORKSPACE_DIR, '.wayfind', 'keys.json');

export function readKeys(): Record<string, string> {
  if (!existsSync(KEYSTORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(KEYSTORE_PATH, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function writeKey(name: string, value: string): void {
  mkdirSync(dirname(KEYSTORE_PATH), { recursive: true });
  const keys = { ...readKeys(), [name]: value };
  writeFileSync(KEYSTORE_PATH, JSON.stringify(keys, null, 2));
  chmodSync(KEYSTORE_PATH, 0o600);
}

export function maskedKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(readKeys())) {
    out[k] = v.length <= 8 ? '****' : `${v.slice(0, 4)}…${v.slice(-4)}`;
  }
  return out;
}
