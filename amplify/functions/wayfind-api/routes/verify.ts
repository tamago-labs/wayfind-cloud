import { json } from "../lib/respond.js";
import { canonicalize, receiptPublicKey, verifyReceiptSignature } from "../lib/receipts.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /verify-receipt { receipt } → { ok, valid, kid, checks }.
// Convenience re-check for browser clients (WebCrypto Ed25519 support
// varies). True offline verification is the CLI (`wayfind verify`), which
// checks the signature locally. Public: verification needs no credential.
export async function handleVerifyReceipt(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!path.endsWith("/verify-receipt") || method !== "POST") return null;
  let receipt: unknown = null;
  try {
    receipt = (JSON.parse(event.body ?? "{}") as { receipt?: unknown }).receipt ?? null;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (!receipt || typeof receipt !== "object") return json(400, { error: "receipt is required" });
  const r = receipt as Record<string, unknown>;
  const sig = (r.signature ?? {}) as { kid?: string; algo?: string; sig?: string };
  if (r.class !== "signed" || !sig.sig) {
    return json(200, { ok: true, valid: false, reason: "unsigned receipt (observed only)" });
  }
  let pub: { kid: string; publicKey: string };
  try {
    pub = receiptPublicKey();
  } catch {
    return json(503, { error: "receipt signing not configured" });
  }
  const { signature: _dropped, ...body } = r;
  const valid = sig.kid !== pub.kid ? false : verifyReceiptSignature(body, sig, pub.publicKey);
  return json(200, {
    ok: true,
    valid,
    kid: pub.kid,
    signerMatch: sig.kid === pub.kid,
    checks: [
      { name: "signature present (class signed)", pass: true },
      { name: "signing key is current", pass: sig.kid === pub.kid, detail: `receipt kid ${sig.kid ?? "?"} vs current ${pub.kid}` },
      { name: "Ed25519 signature verifies over canonical receipt", pass: valid },
    ],
  });
}
