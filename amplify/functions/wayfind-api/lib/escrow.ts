import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "crypto";
import { env } from "./clients.js";

/* ---------------- conversation key escrow (hybrid-C) ---------------- */
// The conversation key is derived from the session bearer (dies with the
// VM) and wrapped with the Wayfind-held master key for history rendering
// after the VM is gone. Unwrapped only for the owner over TLS.

export function conversationMasterKey(): Buffer {
  const hex = env.CONVERSATION_MASTER_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("CONVERSATION_MASTER_KEY is not configured (64 hex chars)");
  }
  return Buffer.from(hex, "hex");
}

export function deriveConversationKey(sessionToken: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(sessionToken, "utf8"), "conversation-v1", "wayfind-conversation/v1", 32));
}

export function wrapConversationKey(plaintext: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", conversationMasterKey(), nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return `${nonce.toString("base64url")}.${ct.toString("base64url")}`;
}

export function unwrapConversationKey(wrapped: string): Buffer {
  const dot = wrapped.indexOf(".");
  if (!dot) throw new Error("bad wrapped key format");
  const nonce = Buffer.from(wrapped.slice(0, dot), "base64url");
  const raw = Buffer.from(wrapped.slice(dot + 1), "base64url");
  if (nonce.length !== 12 || raw.length < 16) throw new Error("bad wrapped key bytes");
  const decipher = createDecipheriv("aes-256-gcm", conversationMasterKey(), nonce);
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]);
}

/* ---------------- workspace envelopes (sealed sync, server-side) ---------------- */
// Same wire format as the CLI (src/sandbox/crypto.js) and the agent
// (packages/sandbox/src/tools/crypto.ts): AES-256-GCM, fresh nonce per
// file, AAD binds (path, plaintext sha256). The backend seals browser
// uploads and opens nothing — decrypt happens only at the endpoints.

export function deriveWorkspaceKey(sessionToken: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(sessionToken, "utf8"), "wayfind-workspace-v1", "wayfind-workspace/v1", 32));
}

export function sha256HexBytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sealWorkspaceFile(
  key: Buffer,
  relPath: string,
  plaintext: Buffer,
): { sha256: string; nonce: string; data: string } {
  const sha256 = sha256HexBytes(plaintext);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`${relPath}\n${sha256}`, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { sha256, nonce: nonce.toString("base64"), data: ct.toString("base64") };
}
