// Workspace sync for cloud suspend/resume/terminate hooks.
//
// The VM holds no AWS credentials, so all bytes move over HTTPS with
// short-lived presigned URLs minted by the backend (server-to-server auth
// via the per-computer usage token). Push uploads new/changed files on
// suspend/terminate; pull restores missing files on run/resume. Secrets
// NEVER sync: .wayfind/ (keystore) stays on the VM — identity is
// re-injected at every /run. Per-file cap 25MB (buffered PUTs).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { WORKSPACE_DIR } from '../core/config.js';

const ROOT = resolve(WORKSPACE_DIR);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 2000;

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

function relOf(full: string): string {
  return relative(ROOT, full).split(sep).join('/');
}

export interface SyncCtx {
  apiBase: string;
  token: string;
  computerId: string;
}

async function syncFetch(ctx: SyncCtx, route: string, body: unknown): Promise<Response> {
  const res = await fetch(`${ctx.apiBase}/computer/sync/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-computer-usage-token': ctx.token },
    body: JSON.stringify({ computerId: ctx.computerId, ...(body as Record<string, unknown>) }),
  });
  if (!res.ok) {
    throw new Error(`sync/${route} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res;
}

export async function pushWorkspace(ctx: SyncCtx): Promise<{ pushed: number; bytes: number; skippedLarge: number }> {
  const files = existsSync(ROOT) ? walk(ROOT) : [];
  const entries: Array<{ path: string; size: number; full: string }> = [];
  let skippedLarge = 0;
  for (const full of files.slice(0, MAX_FILES)) {
    const st = statSync(full);
    if (st.size > MAX_FILE_BYTES) {
      skippedLarge += 1;
      continue;
    }
    entries.push({ path: relOf(full), size: st.size, full });
  }
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const urlRes = await syncFetch(ctx, 'upload-urls', {
    files: entries.map(({ path, size }) => ({ path, size })),
  });
  const { urls } = (await urlRes.json()) as { urls?: Record<string, string> };
  let pushed = 0;
  let bytes = 0;
  for (const [path, url] of Object.entries(urls ?? {})) {
    const entry = byPath.get(path);
    if (!entry) continue;
    // Re-check size at upload time (file may have changed since listing).
    if (statSync(entry.full).size > MAX_FILE_BYTES) {
      skippedLarge += 1;
      continue;
    }
    const put = await fetch(url, { method: 'PUT', body: readFileSync(entry.full) });
    if (!put.ok) throw new Error(`PUT ${path} → ${put.status}: ${(await put.text()).slice(0, 120)}`);
    pushed += 1;
    bytes += entry.size;
  }
  return { pushed, bytes, skippedLarge };
}

export async function pullWorkspace(ctx: SyncCtx): Promise<{ pulled: number; skipped: number }> {
  const listRes = await syncFetch(ctx, 'download-urls', {});
  const { files } = (await listRes.json()) as { files?: Array<{ path: string; size: number; url: string }> };
  let pulled = 0;
  let skipped = 0;
  for (const f of (files ?? []).slice(0, MAX_FILES)) {
    const parts = f.path.split('/').filter((s) => s !== '' && s !== '.');
    if (parts.length === 0 || parts.some((s) => s === '..') || parts[0] === '.wayfind') continue;
    const full = resolve(ROOT, ...parts);
    if (full !== ROOT && !full.startsWith(ROOT + sep)) continue;
    if (existsSync(full)) {
      skipped += 1; // never overwrite running state
      continue;
    }
    if (typeof f.size === 'number' && f.size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const got = await fetch(f.url);
    if (!got.ok) throw new Error(`GET ${f.path} → ${got.status}`);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(await got.arrayBuffer()));
    pulled += 1;
  }
  return { pulled, skipped };
}
