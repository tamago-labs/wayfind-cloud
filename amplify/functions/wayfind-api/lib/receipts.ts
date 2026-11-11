import { createHash, createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "crypto";
import { env } from "./clients.js";

/* ---------------- control-plane receipt signing (Phase 2) ---------------- */
// Ed25519. Private key lives in the WAYFIND_RECEIPT_SIGNING_KEY Amplify
// secret (PKCS#8 PEM — generate offline, see README). Public key is served
// at GET /verify-key (kid = short hash of the SPKI DER). Receipts upgrade
// from class "observed" to "signed" when this signature is attached.
// KMS upgrade path later: same format, signer moves to KMS.

function signingPrivateKey() {
  const pem = env.WAYFIND_RECEIPT_SIGNING_KEY ?? "";
  if (!pem.includes("PRIVATE KEY")) {
    throw new Error("WAYFIND_RECEIPT_SIGNING_KEY is not configured (Ed25519 PKCS#8 PEM)");
  }
  return createPrivateKey(pem);
}

let cachedPublic: { kid: string; publicKeyPem: string } | null = null;

export function receiptPublicKey(): { kid: string; algo: "ed25519"; publicKey: string } {
  if (!cachedPublic) {
    const pubDer = createPublicKey(signingPrivateKey()).export({ type: "spki", format: "der" });
    const pubPem = createPublicKey(signingPrivateKey()).export({ type: "spki", format: "pem" }).toString();
    cachedPublic = {
      kid: createHash("sha256").update(pubDer).digest("hex").slice(0, 16),
      publicKeyPem: pubPem,
    };
  }
  return { kid: cachedPublic.kid, algo: "ed25519", publicKey: cachedPublic.publicKeyPem };
}

/** Canonical JSON: sorted keys, recursive. Signatures must be deterministic. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function signReceiptBody(body: Record<string, unknown>): { kid: string; algo: "ed25519"; sig: string } {
  const sig = edSign(null, Buffer.from(canonicalize(body), "utf8"), signingPrivateKey());
  return { kid: receiptPublicKey().kid, algo: "ed25519", sig: (sig as Buffer).toString("base64url") };
}

export function verifyReceiptSignature(
  body: Record<string, unknown>,
  sig: { kid?: string; algo?: string; sig?: string },
  publicKeyPem: string,
): boolean {
  if (sig?.algo !== "ed25519" || typeof sig.sig !== "string") return false;
  try {
    return edVerify(null, Buffer.from(canonicalize(body), "utf8"), createPublicKey(publicKeyPem), Buffer.from(sig.sig, "base64url"));
  } catch {
    return false;
  }
}
