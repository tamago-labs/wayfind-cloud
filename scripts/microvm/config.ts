// Shared config for scripts/microvm/*.ts — run from the repo root, e.g.
//   npx tsx scripts/microvm/01-package-upload.ts
// This mirrors what the future `computer-manager` Lambda will do with the
// same SDK clients, so working calls here transfer directly to backend code.
import { config } from 'dotenv';
// Root .env.local first (already holds AWS_REGION + MICROVM_BUCKET),
// then scripts/microvm/.env as an optional override for test-specific vars.
config({ path: '.env.local' });
config({ path: 'scripts/microvm/.env', override: true });

import { LambdaMicrovmsClient } from '@aws-sdk/client-lambda-microvms';
import { S3Client } from '@aws-sdk/client-s3';
import { existsSync, readFileSync, writeFileSync } from 'fs';

export const DIR = 'scripts/microvm';
const STATE_PATH = `${DIR}/.microvm-state.json`;

export function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} — copy ${DIR}/.env.example to ${DIR}/.env and fill it in (see ${DIR}/README.md).`);
    process.exit(1);
  }
  return v;
}

export const REGION = process.env.AWS_REGION ?? 'ap-southeast-1';
export const BUCKET = need('MICROVM_BUCKET');
export const IMAGE_NAME = process.env.MICROVM_IMAGE_NAME ?? 'wayfind-hello';
export const ZIP_KEY = process.env.MICROVM_ZIP_KEY ?? `microvm-artifacts/${IMAGE_NAME}.zip`;

// Lambda-managed connectors (per-region). If run-microvm rejects these with
// ValidationException, the region's connector ARNs differ — check the console
// or `aws lambda-microvms` CLI reference for that region.
export const INGRESS_ALL = `arn:aws:lambda:${REGION}:aws:network-connector:aws-network-connector:ALL_INGRESS`;
export const EGRESS_INTERNET = `arn:aws:lambda:${REGION}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`;

export const mv = new LambdaMicrovmsClient({ region: REGION });
export const s3 = new S3Client({ region: REGION });

export interface MicrovmState {
  imageArn?: string;
  microvmId?: string;
  endpoint?: string;
}

export function loadState(): MicrovmState {
  if (!existsSync(STATE_PATH)) return {};
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as MicrovmState;
}

export function saveState(patch: Partial<MicrovmState>): MicrovmState {
  const next = { ...loadState(), ...patch };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

export async function waitFor<T>(
  label: string,
  poll: () => Promise<T | null>,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const intervalMs = opts.intervalMs ?? 15_000;
  const timeoutMs = opts.timeoutMs ?? 20 * 60_000;
  const start = Date.now();
  for (;;) {
    const done = await poll();
    if (done !== null) return done;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${label}: timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
