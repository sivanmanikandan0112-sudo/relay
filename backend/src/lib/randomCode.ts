import crypto from "node:crypto";

// Alphanumeric with visually-ambiguous characters removed (0/O, 1/I/L)
// -- safe to read aloud, write on a whiteboard, or type from memory.
// 26 letters + 10 digits - 5 excluded = 31 characters, not 32 -- an
// earlier version of this file (and lib/backupCodes.ts, which copied
// it) assumed 32 and used `byte % 32`, which silently produced
// `undefined` (and a shorter-than-intended string once joined) for any
// byte whose value was 31, 63, 95, ..., 255 -- about 1 in 32 characters,
// completely missing. randomUnambiguousString below fixes this with
// rejection sampling against the real length instead.
export const UNAMBIGUOUS_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// The largest multiple of the alphabet's length that still fits in a
// byte (31 * 8 = 248). Discarding any byte at or above this before
// taking the modulo gives every character an exactly equal chance,
// rather than the ~1-in-8 characters that would otherwise land a hair
// more often than the rest (256 isn't an exact multiple of 31).
const REJECTION_CEILING = Math.floor(256 / UNAMBIGUOUS_ALPHABET.length) * UNAMBIGUOUS_ALPHABET.length;

function randomChar(): string {
  let byte: number;
  do {
    byte = crypto.randomBytes(1)[0];
  } while (byte >= REJECTION_CEILING);
  return UNAMBIGUOUS_ALPHABET[byte % UNAMBIGUOUS_ALPHABET.length];
}

/**
 * A crypto-random string of exactly `length` characters, drawn from
 * UNAMBIGUOUS_ALPHABET with no modulo bias. Shared by lib/backupCodes.ts
 * (MFA) and lib/joinCode.ts (school join codes) -- both want the same
 * "short, unambiguous, spoken/handwritten out loud" property, just at
 * different lengths.
 */
export function randomUnambiguousString(length: number): string {
  return Array.from({ length }, randomChar).join("");
}
