// Runtime config. Env wins; the VM keystore ($WORKSPACE_DIR/.wayfind/keys.json)
// is the P1 home for PROVIDER_API_KEY (pushed via the privileged channel,
// never via chat).
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env' });

export const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? './workspace';

function keystore(): Record<string, string> {
  const p = join(WORKSPACE_DIR, '.wayfind', 'keys.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

const keys = keystore();

export const PROVIDER_BASE_URL = process.env.PROVIDER_BASE_URL ?? 'https://openrouter.ai/api/v1';
export const PROVIDER_MODEL = process.env.PROVIDER_MODEL ?? 'xingchen-agi/xing4.0-29b-a4b:free';
export const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY ?? keys.PROVIDER_API_KEY ?? '';

export const PORT = Number(process.env.PORT ?? 8080);

export function requireApiKey(): string {
  if (!PROVIDER_API_KEY) {
    console.error('Missing PROVIDER_API_KEY — set it in .env or the workspace keystore.');
    process.exit(1);
  }
  return PROVIDER_API_KEY;
}
