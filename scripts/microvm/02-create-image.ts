// Step 2: create the MicroVM image from the uploaded zip, poll to CREATED.
// Run: npx tsx scripts/microvm/02-create-image.ts
import { CreateMicrovmImageCommand, GetMicrovmImageCommand } from '@aws-sdk/client-lambda-microvms';
import { BUCKET, IMAGE_NAME, REGION, ZIP_KEY, mv, need, saveState, waitFor } from './config';

async function main(): Promise<void> {
  const buildRoleArn = need('MICROVM_BUILD_ROLE_ARN');
  const baseImageArn = need('MICROVM_BASE_IMAGE_ARN');

  let imageArn: string | undefined;
  try {
    const created = await mv.send(
      new CreateMicrovmImageCommand({
        name: IMAGE_NAME,
        codeArtifact: { uri: `s3://${BUCKET}/${ZIP_KEY}` },
        baseImageArn,
        buildRoleArn,
        description: 'Wayfind hello-world MicroVM test image',
        tags: { Project: 'wayfind-cloud', Purpose: 'microvm-spike' },
      }),
    );
    console.log(`Build started: ${created.imageArn} (state ${created.state})`);
    imageArn = created.imageArn;
  } catch (err) {
    // Image name already exists (e.g. a previous attempt is still building)
    // — fall through to polling the existing build.
    if (err instanceof Error && err.name === 'ConflictException') {
      const accountId = buildRoleArn.split(':')[4];
      imageArn = `arn:aws:lambda:${REGION}:${accountId}:microvm-image:${IMAGE_NAME}`;
      console.log(`Image ${IMAGE_NAME} already exists — polling existing build ${imageArn}`);
    } else {
      throw err;
    }
  }
  if (!imageArn) throw new Error('create-microvm-image returned no imageArn');

  await waitFor(
    'image build',
    async () => {
      // NOTE: GetMicrovmImage requires the full ARN, not the bare name.
      const res = await mv.send(new GetMicrovmImageCommand({ imageIdentifier: imageArn }));
      console.log(`  ... state=${res.state} version=${res.latestActiveImageVersion ?? '-'}`);
      if (res.state === 'CREATED') return res;
      if (res.state === 'CREATE_FAILED') {
        throw new Error(
          `Build FAILED — check CloudWatch log group /aws/lambda-microvms/${IMAGE_NAME} for the Dockerfile output.`,
        );
      }
      return null;
    },
    { intervalMs: 15_000, timeoutMs: 30 * 60_000 },
  );

  saveState({ imageArn });
  console.log(`Image ready: ${imageArn}`);
}

main().catch((err) => {
  console.error('Create-image failed:', err);
  process.exit(1);
});
