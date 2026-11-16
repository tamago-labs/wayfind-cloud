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

const ws = new WebSocket(`wss://${endpoint}/term`, [
  'lambda-microvms',
  `lambda-microvms.authentication.${token}`,
  'lambda-microvms.port.8080',
]);

let out = '';
const done = new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout waiting for echo')), 60000);
  ws.on('open', () => {
    console.log('ws open — sending echo');
    ws.send(JSON.stringify({ type: 'input', data: 'echo hello-term\n' }));
  });
  ws.on('message', (raw: Buffer) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'output') {
        out += m.data;
        process.stdout.write(m.data);
        if (out.includes('hello-term')) {
          clearTimeout(timer);
          resolve(out);
        }
      } else if (m.type === 'error') {
        clearTimeout(timer);
        reject(new Error(`server error: ${m.error}`));
      } else if (m.type === 'exit') {
        clearTimeout(timer);
        reject(new Error(`pty exited early: ${m.code}`));
      }
    } catch { /* keepalive */ }
  });
  ws.on('error', (e) => { clearTimeout(timer); reject(e); });
});

try {
  await done;
  console.log('\nTERM ECHO: PASS');
} catch (e) {
  console.log(`\nTERM ECHO: FAIL — ${e instanceof Error ? e.message : e}`);
  process.exit(1);
} finally {
  ws.close();
}
process.exit(0);
