// One-off: does the proxy allow WS to a non-8080 port?
import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import WebSocket from 'ws';
import { loadState, mv } from './config';

const PORT = Number(process.argv[2] ?? 5180);

async function main(): Promise<void> {
  const { microvmId, endpoint } = loadState();
  if (!microvmId || !endpoint) throw new Error('no VM in state');
  const t = await mv.send(
    new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ port: PORT }] }),
  );
  const token = (t.authToken as Record<string, string>)?.['X-aws-proxy-auth'];
  if (!token) throw new Error('no token');
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`wss://${endpoint}/`, [
      'lambda-microvms',
      `lambda-microvms.authentication.${token}`,
      `lambda-microvms.port.${PORT}`,
    ]);
    ws.on('open', () => {
      console.log(`WS OPEN on ${PORT}`);
      ws.close();
      resolve();
    });
    ws.on('error', (e: Error) => {
      console.log(`WS error on ${PORT}:`, e.message);
      resolve();
    });
    ws.on('unexpected-response', (_req: unknown, res: { statusCode?: number }) => {
      console.log(`WS http status on ${PORT}:`, res.statusCode);
      resolve();
    });
    setTimeout(() => resolve(), 15000);
  });
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
