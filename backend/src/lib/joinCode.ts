import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { randomUnambiguousString } from "./randomCode.js";

// Same unambiguous alphabet as lib/backupCodes.ts (excludes 0/O/1/I/L --
// visually ambiguous when read off a whiteboard or shouted across a
// locker room, which is exactly how a coach hands this out). 6
// characters keeps it short enough to type without a dash, while still
// giving 31^6 (~887 million) possible codes -- collisions are handled by
// retrying below regardless, not relied on to never happen.
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

/**
 * Generates a fresh, guaranteed-unique join code and saves it on the
 * given school, replacing whatever code (if any) it had before. Used
 * both to mint a brand-new school's first code (routes/schools.ts) and
 * for a coach's explicit "regenerate" action -- the old code, if any,
 * simply stops resolving; it isn't stored anywhere else (a
 * SchoolJoinRequest doesn't reference the code it was submitted under),
 * so nothing else needs to change when this rotates.
 */
export async function assignNewJoinCode(schoolId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomUnambiguousString(CODE_LENGTH);
    try {
      await prisma.school.update({ where: { id: schoolId }, data: { joinCode: code } });
      return code;
    } catch (err) {
      // P2002 (unique constraint) means another school already has this
      // exact code -- astronomically unlikely at this alphabet size, but
      // retried with a fresh random draw rather than assumed impossible.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < MAX_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique join code after several attempts");
}

/**
 * Returns a school's join code, lazily generating one on first read if
 * it doesn't have one yet -- covers every school created before this
 * feature shipped (see the migration's own comment for why the column
 * was added nullable rather than backfilled directly).
 */
export async function ensureJoinCode(schoolId: string, currentCode: string | null): Promise<string> {
  if (currentCode) return currentCode;
  return assignNewJoinCode(schoolId);
}
