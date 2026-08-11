import crypto from "node:crypto";

export const BACKUP_CODE_COUNT = 10;

// 32 chars -- excludes 0/O/1/I/L (visually ambiguous when handwritten).
// 256 % 32 === 0, so mapping a random byte via `% 32` is unbiased: every
// character is equally likely, no modulo-bias skew toward the low end
// of the alphabet the way a non-power-of-two divisor would produce.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A single backup code, e.g. "7F3KP-Q2XM9" -- crypto-random, not Math.random(). */
export function generateBackupCode(): string {
  const bytes = crypto.randomBytes(10);
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, generateBackupCode);
}
