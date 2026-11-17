// /preview route verification: seed a tiny site, exercise all branches.
import { LambdaMicrovmsClient, CreateMicrovmAuthTokenCommand } from '@aws-sdk/client-lambda-microvms';
import { readFileSync } from 'node:fs';

const state = JSON.parse(readFileSync('packages/computer/scripts/image/.computer-image-state.json', 'utf8'));
const { microvmId, endpoint } = state as { microvmId: string; endpoint: string };

const mv = new LambdaMicrovmsClient({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
const t = await mv.send(
  new CreateMicrovmAuthTokenCommand({ microvmIdentifier: microvmId, expirationInMinutes: 60, allowedPorts: [{ allPorts: {} }] }),
);
const token = (t.authToken as Record<string, string>)?.['X-aws-proxy-auth'];
if (!token) throw new Error('no token');

const H = { 'Content-Type': 'application/json', 'X-aws-proxy-auth': token };

async function upload(path: string, text: string): Promise<unknown> {
  const res = await fetch(`https://${endpoint}/files/upload`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ path, contentBase64: Buffer.from(text).toString('base64') }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function get(path: string): Promise<{ status: number; ct: string | null; body: string }> {
  const res = await fetch(`https://${endpoint}${path}`, { headers: { 'X-aws-proxy-auth': token } });
  return { status: res.status, ct: res.headers.get('content-type'), body: (await res.text()).slice(0, 100) };
}

console.log('seed:', await upload('hello/index.html', '<!doctype html><html><body><h1>Hi</h1><script src="./app.js"></script></body></html>'));
console.log('seed:', await upload('hello/app.js', 'console.log("hi")'));

const cases: Array<[string, number, string | null]> = [
  ['/preview/hello/', 200, 'text/html'],
  ['/preview/hello/app.js', 200, 'text/javascript'],
  ['/preview/hello/missing/route', 200, 'text/html'], // SPA fallback
  ['/preview/../secret', 404, null], // URL normalization strips .. before it arrives
  ['/preview/%2e%2e%2fsecret', 400, null], // encoded traversal reaches us → blocked
  ['/preview/hello/.hidden', 400, null],
  ['/preview/nope/', 404, null],
];
let ok = true;
for (const [p, wantStatus, wantCt] of cases) {
  const r = await get(p);
  const pass = r.status === wantStatus && (wantCt === null || r.ct?.startsWith(wantCt) === true);
  if (!pass) ok = false;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${p} → ${r.status} ${r.ct} ${JSON.stringify(r.body.slice(0, 60))}`);
}
if (!ok) process.exit(1);
console.log('PREVIEW VERIFY: PASS — dir, asset, SPA fallback, traversal, dotfile, 404');
process.exit(0);
