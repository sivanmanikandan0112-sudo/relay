import crypto from "node:crypto";
import { env } from "./env.js";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  if (!env.mfaEncryptionKey) {
    throw new Error("Missing MFA_ENCRYPTION_KEY (generate with: openssl rand -hex 32)");
  }
  const key = Buffer.from(env.mfaEncryptionKey, "hex");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM");
  }
  return key;
}

/**
 * AES-256-GCM encryption for a TOTP secret at rest -- never store the
 * raw secret. A fresh random 96-bit IV per call (GCM's standard IV size)
 * means the same plaintext never produces the same ciphertext twice.
 * Output is `iv:authTag:ciphertext`, all hex, colon-delimited. Throws
 * (never silently falls back to something insecure) if the encryption
 * key isn't configured or is the wrong length.
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
