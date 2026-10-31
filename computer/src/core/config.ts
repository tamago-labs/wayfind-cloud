// Runtime config. Two keys, strictly separated:
// - PROVIDER_API_KEY (Meta): grounded search + voice transcription via api.meta.ai.
// - MODAL_API_KEY: the main chat model endpoint (open-weights server).
// Locally both come from .env; on the MicroVM both are embedded privately.
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

export const PROVIDER_BASE_URL = process.env.PROVIDER_BASE_URL ?? 'https://api.meta.ai/v1';
export const PROVIDER_MODEL = process.env.PROVIDER_MODEL ?? 'meta-models/Muse-Spark-Open-816B-A42B';
export const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY ?? keys.PROVIDER_API_KEY ?? '';
export const MODAL_API_KEY = process.env.MODAL_API_KEY ?? keys.MODAL_API_KEY ?? '';

export const PORT = Number(process.env.PORT ?? 8080);

export function requireApiKey(): string {  if (!PROVIDER_API_KEY) {
    console.error('Missing PROVIDER_API_KEY (Meta) — set it in .env or the workspace keystore.');
    process.exit(1);
  }
  if (!MODAL_API_KEY) {
    console.error('Missing MODAL_API_KEY (chat model) — set it in .env or the workspace keystore.');
    process.exit(1);
  }
  return PROVIDER_API_KEY;
}
