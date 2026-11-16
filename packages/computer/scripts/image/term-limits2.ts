import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import { readFileSync } from 'fs';
import WebSocket from 'ws';

const REGION = process.env.AWS_REGION ?? 'ap-southeast-1';
const state = JSON.parse(readFileSync('packages/computer/scripts/image/.computer-image-state.json', 'utf8'));
const { microvmId, endpoint } = state as { microvmId: string; endpoint: string };

const mv = new LambdaMicrovmsClient({ region: REGION });
const t = await mv.send(new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }));
const token = (t.authToken as any)?.['X-aws-proxy-auth'];
if (!token) throw new Error('no token');

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${endpoint}/term`, [
      'lambda-microvms',
      `lambda-microvms.authentication.${token}`,
      'lambda-microvms.port.8080',
    ]);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function closeAll(list: WebSocket[]): Promise<void> {
  return new Promise((resolve) => {
    let n = list.length;
    if (n === 0) return resolve();
    for (const ws of list) {
      ws.on('close', () => { if (--n === 0) resolve(); });
      ws.close();
    }
    setTimeout(resolve, 10000);
  });
}

// Open 2 (cap), close both, open 2 more — proves killSession cleanup runs
// (the same path that writes the audit lines).
for (let round = 1; round <= 2; round++) {
  const a = await open();
  const b = await open();
  await closeAll([a, b]);
  await new Promise((r) => setTimeout(r, 3000));
  console.log(`round ${round}: opened + closed 2 sessions`);
}
const c = await open();
const d = await open();
await closeAll([c, d]);
console.log('TERM REOPEN: PASS — no session leak across rounds');
process.exit(0);
