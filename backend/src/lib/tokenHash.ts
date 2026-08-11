import crypto from "node:crypto";

/**
 * SHA-256 of a raw token, hex-encoded. Deterministic on purpose (not
 * bcrypt): PasswordResetToken lookups are an equality match
 * (`findUnique({ where: { token } })`), which bcrypt's per-call random
 * salt could never satisfy -- the same raw input hashed twice never
 * matches. Safe here because the raw token already carries 192 bits of
 * entropy (crypto.randomBytes(24)); this only protects against DB-read
 * disclosure (a leaked table can't be used to reset anyone's password),
 * not brute force, which the entropy itself already defeats.
 */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
