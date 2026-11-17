// One-off: list all microvms in the region.
import { LambdaMicrovmsClient, ListMicrovmsCommand } from '@aws-sdk/client-lambda-microvms';
import { REGION, mv } from './config';

async function main(): Promise<void> {
  const r = await mv.send(new ListMicrovmsCommand({}));
  const items = (r as unknown as { items?: Array<Record<string, unknown>> }).items ?? [];
  console.log(`region=${REGION} count=${items.length}`);
  for (const m of items) {
    console.log(`- ${m.microvmId} state=${m.state} image=${String(m.imageArn).split('/').pop()}`);
  }
}

main().catch((err) => {
  console.error('list failed:', err);
  process.exit(1);
});
