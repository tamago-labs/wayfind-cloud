// Step 4: explicit suspend → resume, timing each leg, then prove the app
// still answers (M1 latency data for docs/DEV-HANDOFF.md §8).
// Run: npx tsx scripts/microvm/05-suspend-resume.ts
import {
  CreateMicrovmAuthTokenCommand,
  GetMicrovmCommand,
  ResumeMicrovmCommand,
  SuspendMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import { loadState, mv, secs, waitFor } from './config';

async function curl(endpoint: string): Promise<void> {
  const { microvmId } = loadState();
  const tokenRes = await mv.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: microvmId,
      expirationInMinutes: 30,
      allowedPorts: [{ allPorts: {} }],
    }),
  );
  const token = tokenRes.authToken?.['X-aws-proxy-auth'];
  if (!token) throw new Error('No X-aws-proxy-auth in auth token response');
  const resp = await fetch(`https://${endpoint}/`, {
    headers: { 'X-aws-proxy-auth': token },
  });
  console.log(`GET / → ${resp.status} ${await resp.text()}`);
}

async function main(): Promise<void> {
  const { microvmId, endpoint } = loadState();
  if (!microvmId || !endpoint) {
    console.error('No microvmId/endpoint in state — run 03-run.ts first.');
    process.exit(1);
  }

  let t = Date.now();
  await mv.send(new SuspendMicrovmCommand({ microvmIdentifier: microvmId }));
  await waitFor(
    'suspend to SUSPENDED',
    async () => {
      const res = await mv.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
      return res.state === 'SUSPENDED' ? res : null;
    },
    { intervalMs: 10_000, timeoutMs: 10 * 60_000 },
  );
  console.log(`SUSPENDED in ${secs(Date.now() - t)}`);

  t = Date.now();
  await mv.send(new ResumeMicrovmCommand({ microvmIdentifier: microvmId }));
  await waitFor(
    'resume to RUNNING',
    async () => {
      const res = await mv.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
      return res.state === 'RUNNING' ? res : null;
    },
    { intervalMs: 10_000, timeoutMs: 10 * 60_000 },
  );
  console.log(`RUNNING again in ${secs(Date.now() - t)}`);

  await curl(endpoint);
}

main().catch((err) => {
  console.error('Suspend/resume failed:', err);
  process.exit(1);
});


// PS C:\projects\wayfind-cloud> npx tsx scripts/microvm/05-suspend-resume.ts
// ◇ injected env (19) from .env.local // tip: ◈ secrets for agents [www.dotenvx.com]
// ◇ injected env (0) from scripts\microvm\.env // tip: ◈ encrypted .env [www.dotenvx.com]
// SUSPENDED in 10.5s
// RUNNING again in 10.2s
// GET / → 200 {"status":"ok","path":"/"}
// PS C:\projects\wayfind-cloud>