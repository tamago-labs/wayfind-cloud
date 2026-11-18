// Run one shell command on the manual VM via /term PTY and print output.
// Usage: npx tsx packages/computer/scripts/image/term-run.ts "<command>" [timeoutSec]
// Secrets are never printed: the caller must avoid echoing secret values.
import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import { loadState, mv } from './config';
import WebSocket from 'ws';

import { readFileSync } from 'node:fs';

let cmd = process.argv[2];
if (!cmd) throw new Error('usage: term-run.ts "<command>"|@<file> [timeoutSec]');
if (cmd.startsWith('@')) cmd = readFileSync(cmd.slice(1), 'utf8').trim();
const timeoutSec = Number(process.argv[3] ?? process.env.TERM_TIMEOUT ?? 120);

const { microvmId, endpoint } = loadState();
if (!microvmId || !endpoint) throw new Error('No microvm in state — run 03 first.');

const t = await mv.send(
  new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }),
);
const token = (t.authToken as Record<string, string>)?.['X-aws-proxy-auth'];
if (!token) throw new Error('no token');

// Sentinel only matches executed output: the input echo carries the literal
// `$?`/`%s`, while the real line has digits (@@EXIT@@=0=@@).
const MARK = `@@EXIT@@`;
const ws = new WebSocket(`wss://${endpoint}/term`, [
  'lambda-microvms',
  `lambda-microvms.authentication.${token}`,
  'lambda-microvms.port.8080',
]);

let out = '';
const done = new Promise<number>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout after ${timeoutSec}s waiting for marker`)), timeoutSec * 1000);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'input', data: `${cmd}\nprintf '\\n${MARK}=%s=${MARK}\\n' "$?"\n` }));
  });
  ws.on('message', (raw: Buffer) => {
    try {
      const m = JSON.parse(raw.toString()) as { type?: string; data?: string; error?: string; code?: number };
      if (m.type === 'output' && typeof m.data === 'string') {
        out += m.data;
        const mm = out.match(/@@EXIT@@=(\d+)=@@EXIT@@/);
        if (mm) {
          clearTimeout(timer);
          resolve(Number(mm[1]));
        }
      } else if (m.type === 'error') {
        clearTimeout(timer);
        reject(new Error(`server error: ${m.error}`));
      }
    } catch { /* keepalive */ }
  });
  ws.on('error', (e) => { clearTimeout(timer); reject(e); });
});

// REDACT=NAME1,NAME2 replaces those local env values with *** in output.
function redact(s: string): string {
  const names = (process.env.REDACT ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  let r = s;
  for (const n of names) {
    const v = process.env[n];
    if (v) r = r.split(v).join('***');
  }
  return r;
}

try {
  const code = await done;
  const clean = redact(out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, ''));
  console.log(clean);
  console.log(`\nTERM RUN exit=${code}`);
  process.exit(0);
} catch (e) {
  console.log(out);
  console.log(`\nTERM RUN FAIL — ${e instanceof Error ? e.message : e}`);
  process.exit(1);
} finally {
  ws.close();
}
