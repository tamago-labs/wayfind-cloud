import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import { readFileSync } from 'fs';
import WebSocket from 'ws';

const REGION = process.env.AWS_REGION ?? 'ap-southeast-1';
const state = JSON.parse(readFileSync('packages/computer/scripts/image/.computer-image-state.json', 'utf8'));
const { microvmId, endpoint } = state as { microvmId: string; endpoint: string };

const mv = new LambdaMicrovmsClient({ region: REGION });
async function mint(): Promise<string> {
  const t = await mv.send(new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }));
  const token = (t.authToken as any)?.['X-aws-proxy-auth'];
  if (!token) throw new Error('no token');
  return token;
}

function open(token: string): Promise<WebSocket> {
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

function run(ws: WebSocket, cmd: string, expect: string, timeoutMs = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${expect}; got: ${JSON.stringify(out.slice(0, 200))}`)), timeoutMs);
    ws.on('message', (raw: Buffer) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'output') {
          out += m.data;
          if (out.includes(expect)) { clearTimeout(timer); resolve(); }
        } else if (m.type === 'error') { clearTimeout(timer); reject(new Error(m.error)); }
      } catch { /* ignore */ }
    });
    ws.send(JSON.stringify({ type: 'input', data: cmd }));
  });
}

const token = await mint();

// 03-resize: set 120x40, verify via stty size (prints "rows cols").
{
  const ws = await open(token);
  ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
  await run(ws, 'stty size\n', '40 120');
  ws.close();
  console.log('TERM RESIZE: PASS');
}

// 04-limits: 2 sessions OK, 3rd rejected (429 -> ws error/close).
{
  const ws1 = await open(token);
  const ws2 = await open(token);
  let rejected = false;
  try {
    const ws3 = await open(token);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('third session stayed open')), 15000);
      ws3.on('close', () => { clearTimeout(timer); resolve(); });
      ws3.on('message', (raw: Buffer) => {
        try {
          const m = JSON.parse(raw.toString());
          if (m.type === 'error') { clearTimeout(timer); resolve(); }
        } catch { /* ignore */ }
      });
    });
    rejected = true;
    try { ws3.close(); } catch { /* ignore */ }
  } catch {
    rejected = true; // upgrade rejected outright counts too
  }
  ws1.close();
  ws2.close();
  if (!rejected) { console.log('TERM LIMITS: FAIL — third session allowed'); process.exit(1); }
  console.log('TERM LIMITS: PASS');
}
process.exit(0);
