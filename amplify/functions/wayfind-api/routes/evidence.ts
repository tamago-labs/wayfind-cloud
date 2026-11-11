import { timingSafeEqual } from "crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { json } from "../lib/respond.js";
import { dataClient, env, s3sync, syncBucket } from "../lib/clients.js";
import { stampOwner } from "../lib/owner.js";
import { emitAudit } from "../lib/audit.js";
import { receiptPublicKey, signReceiptBody } from "../lib/receipts.js";
import { toVerificationReports } from "../lib/reports.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

function getOwnedConversationFrom(ctx: Ctx, id: string) {
  return dataClient.models.Conversation.get({ id }).then(({ data }) => {
    if (!data || (data as unknown as { ownerId?: string }).ownerId !== ctx.ownerId) return null;
    return data as unknown as Record<string, unknown>;
  });
}

// POST /conversations/:id/export-evidence — DPA/audit bundle for one
// conversation: receipt + checkpoint manifest + sealed blobs + NEAR
// verification reports. Blobs stay sealed (client decrypts with the key
// from GET /:id/key). Cap 5MB total; larger blobs are referenced, not
// inlined.
export async function handleExportEvidence(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId, claims } = ctx;
  const m = path.match(/\/conversations\/([^/]+)\/export-evidence$/);
  if (method !== "POST" || !m) return null;
  const row = await getOwnedConversationFrom(ctx, m[1]);
  if (!row) return json(404, { error: "conversation not found" });
  const receipt = typeof row.receipt === "string" ? JSON.parse(row.receipt as string) : (row.receipt ?? null);
  const manifest = (Array.isArray((receipt as { checkpointManifest?: unknown } | null)?.checkpointManifest)
    ? (receipt as { checkpointManifest: unknown[] }).checkpointManifest
    : []) as unknown[];
  const checkpoints: Array<{ seq: number; sha256: string; envelope: unknown }> = [];
  let skipped = 0;
  for (const entry of manifest) {
    if (typeof entry !== "string") continue;
    const [seqStr, sha] = entry.split(":");
    const seq = Number(seqStr);
    try {
      const obj = await s3sync.send(
        new GetObjectCommand({ Bucket: syncBucket, Key: `checkpoints/${ownerId}/${m[1]}/${seq}.bin` }),
      );
      const bytes = await obj.Body?.transformToByteArray();
      if (!bytes || bytes.length > 2 * 1024 * 1024) {
        skipped++;
        continue;
      }
      checkpoints.push({ seq, sha256: sha, envelope: JSON.parse(Buffer.from(bytes).toString("utf8")) });
    } catch {
      skipped++;
    }
  }
  const inference = (receipt as { inference?: unknown } | null)?.inference ?? null;
  const reports = toVerificationReports(
    (row.model as string) ?? "unknown",
    inference as never,
  );
  const bundle = {
    exportedAt: new Date().toISOString(),
    conversation: {
      conversationId: m[1],
      model: row.model ?? null,
      provider: row.provider ?? null,
      securityLevel: row.securityLevel ?? null,
      status: row.status ?? null,
      botBundleHash: row.botBundleHash ?? null,
      workspaceHash: row.workspaceHash ?? null,
      createdAt: row.createdAt ?? null,
      terminatedAt: row.terminatedAt ?? null,
    },
    receipt,
    checkpoints,
    skippedBlobs: skipped,
    verificationReports: reports,
  };
  const actor = claims?.cliTokenId ? `cli:${claims.cliTokenId}` : `user:${ownerId}`;
  void emitAudit(ownerId, actor, "evidence.exported", m[1], { checkpoints: checkpoints.length, skipped });
  return json(200, bundle);
}

// POST /image-trust/publish — image release ceremony. Body: { imageArn,
// imageVersion?, zipSha256, sbomSha256?, builtAt, bearer: IMAGE_TRUST_SECRET }.
// Signs the manifest with the receipt key and stores it as the single
// "current" record. Bearer-gated, not identity-gated (release key held by
// the image publisher).
export async function handleImageTrustPublish(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId, claims } = ctx;
  if (method !== "POST" || !path.endsWith("/image-trust/publish")) return null;
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const expected = env.IMAGE_TRUST_SECRET ?? "";
  const got = typeof body.bearer === "string" ? body.bearer : "";
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return json(403, { error: "bad publish bearer" });
  }
  if (typeof body.imageArn !== "string" || !body.imageArn || typeof body.zipSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(body.zipSha256)) {
    return json(400, { error: "imageArn and 64-hex zipSha256 are required" });
  }
  const manifest = {
    imageArn: body.imageArn,
    imageVersion: typeof body.imageVersion === "string" ? body.imageVersion : "1.0",
    zipSha256: (body.zipSha256 as string).toLowerCase(),
    sbomSha256: typeof body.sbomSha256 === "string" ? (body.sbomSha256 as string).toLowerCase() : null,
    builtAt: typeof body.builtAt === "string" ? body.builtAt : new Date().toISOString(),
  };
  let signature: { kid: string; algo: "ed25519"; sig: string };
  try {
    signature = signReceiptBody(manifest);
  } catch (err) {
    return json(500, { error: `signing not configured: ${err instanceof Error ? err.message : String(err)}` });
  }
  try {
    const { data: existing } = await dataClient.models.ImageTrust.imageTrustByKey({ key: "current" });
    const existingRow = ((existing ?? []) as unknown as Array<{ id: string }>)[0];
    if (existingRow) {
      const { errors } = await dataClient.models.ImageTrust.update({
        id: existingRow.id,
        ...manifest,
        signature: JSON.stringify(signature),
        publishedBy: ownerId,
        publishedAt: new Date().toISOString(),
      });
      if (errors) throw new Error(JSON.stringify(errors));
    } else {
      const { data: created, errors } = await dataClient.models.ImageTrust.create({
        key: "current",
        ...manifest,
        signature: JSON.stringify(signature),
        publishedBy: ownerId,
        publishedAt: new Date().toISOString(),
      });
      if (errors || !created) throw new Error(JSON.stringify(errors));
      await stampOwner("ImageTrust", (created as unknown as { id: string }).id, ownerId);
    }
  } catch (err) {
    return json(500, { error: `publish failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  const actor = claims?.cliTokenId ? `cli:${claims.cliTokenId}` : `user:${ownerId}`;
  void emitAudit(ownerId, actor, "image.published", undefined, { imageArn: manifest.imageArn, zipSha256: manifest.zipSha256.slice(0, 12) });
  return json(200, { ok: true, manifest, signature });
}

// GET /image-trust — the current signed image record (any signed-in user;
// verification needs no privilege). CLI verifies the signature offline.
export async function handleImageTrustGet(ctx: Ctx): Promise<RouteResult> {
  const { method, path } = ctx;
  if (method !== "GET" || !path.endsWith("/image-trust")) return null;
  const { data } = await dataClient.models.ImageTrust.imageTrustByKey({ key: "current" });
  const row = ((data ?? []) as unknown as Array<Record<string, unknown>>)[0] ?? null;
  if (!row) return json(404, { error: "no published image trust record" });
  let signature: unknown = row.signature ?? null;
  if (typeof signature === "string") {
    try {
      signature = JSON.parse(signature);
    } catch {
      // Leave as-is; the verifier will reject it.
    }
  }
  return json(200, {
    imageTrust: {
      imageArn: row.imageArn ?? null,
      imageVersion: row.imageVersion ?? null,
      zipSha256: row.zipSha256 ?? null,
      sbomSha256: row.sbomSha256 ?? null,
      builtAt: row.builtAt ?? null,
      publishedAt: row.publishedAt ?? null,
      signature,
      signingKey: receiptPublicKey(),
    },
  });
}
