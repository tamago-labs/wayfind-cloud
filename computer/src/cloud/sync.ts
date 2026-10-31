// Workspace S3 sync for cloud suspend/resume/terminate hooks.
// Pushes workspace files to computers/<computerId>/workspace/ on suspend,
// pulls missing files back on run/resume. Secrets NEVER sync: .wayfind/
// (keystore) stays on the VM — identity is re-injected at every /run.
import { ListObjectsV2Command, PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { WORKSPACE_DIR } from '../core/config.js';

const ROOT = resolve(WORKSPACE_DIR);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    // Secrets + state that must never leave the VM.
    if (rel === '.wayfind' || rel.startsWith(`.wayfind${sep}`)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) out.push(full);
  }
  return out;
}

function keyFor(prefix: string, full: string): string {
  return `${prefix.replace(/\/+$/, '')}/${relative(ROOT, full).split(sep).join('/')}`;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

export async function pushWorkspace(bucket: string, prefix: string): Promise<{ pushed: number; bytes: number }> {
  const s3 = new S3Client({});
  const files = existsSync(ROOT) ? walk(ROOT) : [];
  let pushed = 0;
  let bytes = 0;
  for (const full of files) {
    const st = statSync(full);
    if (st.size > 100 * 1024 * 1024) continue; // sanity cap per file
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: keyFor(prefix, full), Body: createReadStream(full) }),
    );
    pushed += 1;
    bytes += st.size;
  }
  return { pushed, bytes };
}

export async function pullWorkspace(bucket: string, prefix: string): Promise<{ pulled: number; skipped: number }> {
  const s3 = new S3Client({});
  const clean = prefix.replace(/\/+$/, '');
  let pulled = 0;
  let skipped = 0;
  let token: string | undefined;
  for (;;) {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${clean}/`, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue;
      const rel = obj.Key.slice(clean.length + 1);
      if (!rel || rel === '.wayfind' || rel.startsWith('.wayfind/')) continue;
      const full = resolve(ROOT, rel);
      if (full !== ROOT && !full.startsWith(ROOT + sep)) continue;
      if (existsSync(full)) {
        skipped += 1; // never overwrite running state
        continue;
      }
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, await bodyToBuffer(got.Body));
      pulled += 1;
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  return { pulled, skipped };
}
