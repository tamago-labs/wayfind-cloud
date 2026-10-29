// Step 1: zip hello-app/ and upload to S3.
// Run: npx tsx scripts/microvm/01-package-upload.ts
import { ZipArchive } from 'archiver';
import { createWriteStream, readFileSync } from 'fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, DIR, ZIP_KEY, s3 } from './config';

async function main(): Promise<void> {
  const zipPath = `${DIR}/hello-app.zip`;
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    out.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(out);
    archive.file(`${DIR}/hello-app/app.js`, { name: 'app.js' });
    archive.file(`${DIR}/hello-app/Dockerfile`, { name: 'Dockerfile' });
    void archive.finalize();
  });

  const body = readFileSync(zipPath);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: ZIP_KEY, Body: body }));
  console.log(`Uploaded s3://${BUCKET}/${ZIP_KEY} (${body.length} bytes)`);
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
