// Step 3: run a MicroVM, wait for RUNNING, mint an auth token, curl it.
// Run: npx tsx scripts/microvm/03-run.ts
import {
  CreateMicrovmAuthTokenCommand,
  GetMicrovmCommand,
  RunMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import { EGRESS_INTERNET, INGRESS_ALL, loadState, mv, saveState, waitFor } from './config';

async function main(): Promise<void> {
  const { imageArn } = loadState();
  if (!imageArn) {
    console.error('No imageArn in state — run 02-create-image.ts first.');
    process.exit(1);
  }

  const startedAt = Date.now();
  const run = await mv.send(
    new RunMicrovmCommand({
      imageIdentifier: imageArn,
      ingressNetworkConnectors: [INGRESS_ALL],
      egressNetworkConnectors: [EGRESS_INTERNET],
      idlePolicy: { autoResumeEnabled: true, maxIdleDurationSeconds: 900, suspendedDurationSeconds: 300 },
      maximumDurationInSeconds: 14_400, // 4h cap for the test VM
    }),
  );
  const microvmId = run.microvmId;
  if (!microvmId) throw new Error('run-microvm returned no microvmId');
  console.log(`MicroVM ${microvmId} starting...`);

  const info = await waitFor(
    'run to RUNNING',
    async () => {
      const res = await mv.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
      console.log(`  ... state=${res.state}`);
      return res.state === 'RUNNING' ? res : null;
    },
    { intervalMs: 10_000, timeoutMs: 10 * 60_000 },
  );
  console.log(`RUNNING after ${((Date.now() - startedAt) / 1000).toFixed(1)}s — endpoint ${info.endpoint}`);
  saveState({ microvmId, endpoint: info.endpoint });

  const tokenRes = await mv.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: microvmId,
      expirationInMinutes: 30,
      allowedPorts: [{ allPorts: {} }],
    }),
  );
  const token = tokenRes.authToken?.['X-aws-proxy-auth'];
  if (!token) throw new Error('No X-aws-proxy-auth in auth token response');

  const resp = await fetch(`https://${info.endpoint}/`, {
    headers: { 'X-aws-proxy-auth': token },
  });
  console.log(`GET / → ${resp.status} ${await resp.text()}`);
}

main().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});


// PS C:\projects\wayfind-cloud> npx tsx scripts/microvm/03-run.ts
// ◇ injected env (19) from .env.local // tip: ◈ encrypted .env [www.dotenvx.com]
// ◇ injected env (0) from scripts\microvm\.env // tip: ◈ encrypted .env [www.dotenvx.com]
// MicroVM microvm-43ae7eb8-0053-3da7-92cc-872fa43a198d starting...
//   ... state=PENDING
//   ... state=RUNNING
// RUNNING after 10.6s — endpoint 8ed0c306-ed48-e63e-d89f-6047b5167234.lambda-microvm.ap-southeast-1.on.aws
// GET / → 200 {"status":"ok","path":"/"}