// Shared fixture/reset helpers for integration and e2e tests. Both test
// tiers point DATABASE_URL at a real Postgres database dedicated to tests
// (see vitest.integration.config.ts / vitest.e2e.config.ts and the
// test:integration / test:e2e npm scripts, which set DATABASE_URL before
// the process starts) -- this file never touches relay_dev.
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

export const TEST_PASSWORD = "TestPass123!";

// A low bcrypt cost factor keeps the test suite fast -- security isn't a
// concern for throwaway test-database passwords.
const TEST_BCRYPT_COST = 4;

let testPasswordHash: string | null = null;
async function testPasswordHashCached(): Promise<string> {
  if (!testPasswordHash) testPasswordHash = await bcrypt.hash(TEST_PASSWORD, TEST_BCRYPT_COST);
  return testPasswordHash;
}

/**
 * Wipes every table used by the app, in FK-safe order. Safe to call
 * before/after every integration test -- the test database is small and
 * disposable, so a full wipe is simpler and less error-prone than
 * targeted per-test cleanup.
 */
export async function resetDb(): Promise<void> {
  await prisma.passwordResetToken.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.note.deleteMany();
  await prisma.coachAthlete.deleteMany();
  await prisma.readinessScore.deleteMany();
  await prisma.wellnessEntry.deleteMany();
  await prisma.trainingLoad.deleteMany();
  await prisma.injury.deleteMany();
  await prisma.athlete.deleteMany();
  await prisma.user.deleteMany();
  await prisma.squad.deleteMany();
  await prisma.school.deleteMany();
}

export async function ensureSquad(name: "GIRLS" | "BOYS") {
  return prisma.squad.upsert({ where: { name }, update: {}, create: { name } });
}

export async function ensureSchool(name: string, location?: string) {
  const nameKey = name.trim().toLowerCase();
  return prisma.school.upsert({ where: { nameKey }, update: {}, create: { name, nameKey, location } });
}

export async function assignSchool(coachId: string, schoolId: string) {
  return prisma.user.update({ where: { id: coachId }, data: { schoolId } });
}

interface CreateCoachInput {
  username: string;
  firstName: string;
  lastName: string;
}

/** Creates a COACH user with the shared TEST_PASSWORD. */
export async function createCoach({ username, firstName, lastName }: CreateCoachInput) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.relay`,
      passwordHash: await testPasswordHashCached(),
      firstName,
      lastName,
      role: "COACH",
    },
  });
}

interface CreateAthleteInput {
  username: string;
  firstName: string;
  lastName: string;
  squad: "GIRLS" | "BOYS";
  gender?: "FEMALE" | "MALE" | "NONBINARY" | "PREFER_NOT_TO_SAY";
  withUser?: boolean; // false -> athlete profile with no linked login, for edge cases
}

/** Creates an ATHLETE user (unless withUser is false) plus its linked Athlete profile. */
export async function createAthlete({ username, firstName, lastName, squad, gender, withUser = true }: CreateAthleteInput) {
  const squadRow = await ensureSquad(squad);
  const user = withUser
    ? await prisma.user.create({
        data: {
          username,
          email: `${username}@test.relay`,
          passwordHash: await testPasswordHashCached(),
          firstName,
          lastName,
          role: "ATHLETE",
        },
      })
    : null;
  const athlete = await prisma.athlete.create({
    data: {
      name: `${firstName} ${lastName}`,
      squadId: squadRow.id,
      userId: user?.id,
      gender,
    },
  });
  return { user, athlete };
}

export async function assignRoster(coachId: string, athleteId: string) {
  return prisma.coachAthlete.create({ data: { coachId, athleteId } });
}

export function daysAgo(n: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - n * 86400000);
}
