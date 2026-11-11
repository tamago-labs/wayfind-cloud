import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { dataClient, s3sync, syncBucket } from "../lib/clients.js";
import { json } from "../lib/respond.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// VM file sync via presigned S3 URLs (server-to-server). The VM holds no
// AWS credentials, so all bytes move over HTTPS with short-lived signed
// URLs instead. Auth: per-computer usage token (X-computer-usage-token)
// matched against the row for the claimed computerId. Paths are
// constrained to that computer's workspace prefix; .wayfind/ (keystore)
// never syncs.
async function vmSyncAuth(
  headers: Record<string, string | undefined>,
  body: { computerId?: string },
): Promise<{ computer: { id: string } } | { error: string; status: number }> {
  const usageToken =
    headers["x-computer-usage-token"] ??
    headers["X-computer-usage-token"] ??
    headers["X-Computer-Usage-Token"];
  const computerId = typeof body.computerId === "string" ? body.computerId : "";
  if (!usageToken || !computerId) return { error: "unauthorized: no usage token or computerId", status: 401 };
  const { data: computer } = await dataClient.models.Computer.get({ id: computerId });
  if (!computer || !computer.usageToken || computer.usageToken !== usageToken) {
    return { error: "unauthorized: bad usage token", status: 401 };
  }
  return { computer: { id: computer.id } };
}

function cleanSyncPath(p: unknown): string | null {
  if (typeof p !== "string" || !p || p.length > 512) return null;
  const parts = p.split("/").filter((s) => s !== "" && s !== ".");
  if (parts.length === 0 || parts.some((s) => s === "..")) return null;
  if (parts[0] === ".wayfind") return null;
  return parts.join("/");
}

// POST /computer/sync/upload-urls — { computerId, files: [{ path, size }] }
// → { urls: { path: presignedPutUrl } }. Per-file 25MB cap, 2000 files max.
export async function handleSyncUploadUrls(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/computer/sync/upload-urls") || method !== "POST") return null;
  let body: { computerId?: string; files?: Array<{ path?: string; size?: number }> } = {};
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const auth = await vmSyncAuth(event.headers ?? {}, body);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
  const files = Array.isArray(body.files) ? body.files.slice(0, 2000) : [];
  const urls: Record<string, string> = {};
  for (const f of files) {
    const clean = cleanSyncPath(f?.path);
    if (!clean || typeof f?.size !== "number" || f.size <= 0 || f.size > 25 * 1024 * 1024) continue;
    urls[clean] = await getSignedUrl(
      s3sync,
      new PutObjectCommand({ Bucket: syncBucket, Key: `computers/${auth.computer.id}/workspace/${clean}` }),
      { expiresIn: 900 },
    );
  }
  return json(200, { urls });
}

// POST /computer/sync/download-urls — { computerId } → { files: [{ path,
// size, url }] } (presigned GETs, 15min). Skips .wayfind/ and folder markers.
export async function handleSyncDownloadUrls(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/computer/sync/download-urls") || method !== "POST") return null;
  let body: { computerId?: string } = {};
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const auth = await vmSyncAuth(event.headers ?? {}, body);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  if (!syncBucket) return json(500, { error: "workspace bucket not configured" });
  const prefix = `computers/${auth.computer.id}/workspace/`;
  const files: Array<{ path: string; size: number; url: string }> = [];
  let token: string | undefined;
  for (;;) {
    const res = await s3sync.send(
      new ListObjectsV2Command({ Bucket: syncBucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith("/")) continue;
      const rel = obj.Key.slice(prefix.length);
      if (!cleanSyncPath(rel)) continue;
      if (files.length >= 2000) break;
      files.push({
        path: rel,
        size: obj.Size ?? 0,
        url: await getSignedUrl(s3sync, new GetObjectCommand({ Bucket: syncBucket, Key: obj.Key }), {
          expiresIn: 900,
        }),
      });
    }
    if (!res.IsTruncated || files.length >= 2000) break;
    token = res.NextContinuationToken;
  }
  return json(200, { files });
}
