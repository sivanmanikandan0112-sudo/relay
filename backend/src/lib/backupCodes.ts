import { randomUnambiguousString } from "./randomCode.js";

export const BACKUP_CODE_COUNT = 10;

/** A single backup code, e.g. "7F3KP-Q2XM9" -- crypto-random, unambiguous alphabet, exactly 10 characters. */
export function generateBackupCode(): string {
  const chars = randomUnambiguousString(10);
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, generateBackupCode);
}
