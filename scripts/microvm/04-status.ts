// Status check for the test MicroVM.
// Run: npx tsx scripts/microvm/04-status.ts
import { GetMicrovmCommand } from '@aws-sdk/client-lambda-microvms';
import { loadState, mv } from './config';

async function main(): Promise<void> {
  const { microvmId } = loadState();
  if (!microvmId) {
    console.error('No microvmId in state — run 03-run.ts first.');
    process.exit(1);
  }
  const res = await mv.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
  console.log(
    JSON.stringify(
      {
        microvmId: res.microvmId,
        state: res.state,
        stateReason: res.stateReason ?? null,
        endpoint: res.endpoint ?? null,
        imageArn: res.imageArn ?? null,
        imageVersion: res.imageVersion ?? null,
        idlePolicy: res.idlePolicy ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('Status failed:', err);
  process.exit(1);
});


// PS C:\projects\wayfind-cloud> npx tsx scripts/microvm/04-status.ts
// ◇ injected env (19) from .env.local // tip: ⌘ custom filepath { path: '/custom/path/.env' }
// ◇ injected env (0) from scripts\microvm\.env // tip: ⌘ enable debugging { debug: true }
// {
//   "microvmId": "microvm-43ae7eb8-0053-3da7-92cc-872fa43a198d",
//   "state": "RUNNING",
//   "stateReason": null,
//   "endpoint": "8ed0c306-ed48-e63e-d89f-6047b5167234.lambda-microvm.ap-southeast-1.on.aws",
//   "imageArn": "arn:aws:lambda:ap-southeast-1:057386374967:microvm-image:wayfind-hello",
//   "imageVersion": "1.0",
//   "idlePolicy": {
//     "maxIdleDurationSeconds": 900,
//     "suspendedDurationSeconds": 300,
//     "autoResumeEnabled": true
//   }
// }