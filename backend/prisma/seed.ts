import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { bandForScore, plainSignal, STATUS_COLOR } from "../src/lib/readiness.js";
import { recomputeReadiness } from "../src/lib/scoring.js";

const prisma = new PrismaClient();

// Shared password for every seeded account, for local testing only.
const SEED_PASSWORD = "Relay2026!";

function currentIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

const NOW = new Date();
const { week: CURRENT_WEEK, year: YEAR } = currentIsoWeek(NOW);
const HISTORY_WEEKS = 5;

type Archetype = "fresh" | "watch" | "risk" | "injured" | "return";

interface AthleteSeed {
  first: string;
  last: string;
  squad: "GIRLS" | "BOYS";
  archetype: Archetype;
}

const ROSTER: AthleteSeed[] = [
  { first: "Maya", last: "Okonkwo", squad: "GIRLS", archetype: "risk" },
  { first: "Sofia", last: "Reyes", squad: "GIRLS", archetype: "risk" },
  { first: "Ava", last: "Thompson", squad: "GIRLS", archetype: "watch" },
  { first: "Lily", last: "Anderson", squad: "GIRLS", archetype: "watch" },
  { first: "Chloe", last: "Bennett", squad: "GIRLS", archetype: "injured" },
  { first: "Emma", last: "Whitfield", squad: "GIRLS", archetype: "return" },
  { first: "Jonah", last: "Pruitt", squad: "BOYS", archetype: "risk" },
  { first: "Ethan", last: "Brooks", squad: "BOYS", archetype: "watch" },
  { first: "Marcus", last: "Webb", squad: "BOYS", archetype: "fresh" },
  { first: "Diego", last: "Alvarez", squad: "BOYS", archetype: "fresh" },
];

const COACHES = [
  { first: "Jordan", last: "Rivera" },
  { first: "Sam", last: "Bennett" },
];

// Coach roster assignments, by athlete username. "lily.anderson" is on
// both, to demonstrate an athlete having more than one coach at once.
const ROSTER_ASSIGNMENTS: Record<string, string[]> = {
  "jordan.rivera": ["maya.okonkwo", "sofia.reyes", "lily.anderson"],
  "sam.bennett": ["ethan.brooks", "marcus.webb", "lily.anderson"],
};

const HISTORY_RANGE: Record<Archetype, [number, number]> = {
  fresh: [70, 92],
  watch: [45, 62],
  risk: [18, 38],
  injured: [30, 55],
  return: [20, 40],
};

function username(first: string, last: string): string {
  return `${first}.${last}`.toLowerCase();
}
function emailFor(first: string, last: string): string {
  return `${username(first, last)}@ridgeline.edu`;
}
function randIn([lo, hi]: [number, number]): number {
  return Math.round(lo + Math.random() * (hi - lo));
}
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400000);
}

async function seedHistory(athleteId: string, name: string, archetype: Archetype) {
  for (let i = HISTORY_WEEKS; i >= 1; i--) {
    const week = CURRENT_WEEK - i;
    const score = randIn(HISTORY_RANGE[archetype]);
    const band = bandForScore(score);
    await prisma.readinessScore.create({
      data: {
        athleteId,
        week,
        year: YEAR,
        score,
        status: band,
        summary: plainSignal(name, band, score < 40 ? 2.5 : score < 65 ? 3.2 : 4.2),
      },
    });
  }
}

async function seedWellnessAndLoad(athleteId: string, archetype: Archetype) {
  const wellnessBase: Record<Archetype, number> = { fresh: 4.3, watch: 3.2, risk: 2.2, injured: 3.0, return: 3.6 };
  const base = wellnessBase[archetype];
  for (let i = 0; i < 5; i++) {
    const jitter = () => Math.max(1, Math.min(5, Math.round(base + (Math.random() - 0.5))));
    await prisma.wellnessEntry.create({
      data: {
        athleteId,
        date: daysAgo(i),
        sleep: jitter(),
        soreness: Math.max(1, Math.min(5, 6 - jitter())),
        mood: jitter(),
        energy: jitter(),
        motivation: jitter(),
      },
    });
  }

  const chronicDaily: Record<Archetype, number> = { fresh: 35, watch: 38, risk: 40, injured: 15, return: 20 };
  const acuteDaily: Record<Archetype, number> = { fresh: 34, watch: 52, risk: 74, injured: 5, return: 18 };

  for (let daysBack = 27; daysBack >= 0; daysBack--) {
    const inAcuteWindow = daysBack < 7;
    const targetLoad = inAcuteWindow ? acuteDaily[archetype] : chronicDaily[archetype];
    const durationMin = 30 + Math.round(Math.random() * 20);
    const rpe = Math.max(1, Math.min(10, Math.round(targetLoad / durationMin) || 4));
    await prisma.trainingLoad.create({
      data: {
        athleteId,
        date: daysAgo(daysBack),
        runType: rpe >= 8 ? "Tempo" : rpe >= 6 ? "Long run" : "Easy",
        distanceMiles: Math.round((durationMin / 8) * 10) / 10,
        durationMin,
        rpe,
        load: rpe * durationMin,
      },
    });
  }
}

async function main() {
  console.log("Clearing existing data...");
  await prisma.passwordResetToken.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.coachAthlete.deleteMany();
  await prisma.note.deleteMany();
  await prisma.readinessScore.deleteMany();
  await prisma.wellnessEntry.deleteMany();
  await prisma.trainingLoad.deleteMany();
  await prisma.injury.deleteMany();
  await prisma.athlete.deleteMany();
  await prisma.user.deleteMany();

  const girls = await prisma.squad.upsert({ where: { name: "GIRLS" }, update: {}, create: { name: "GIRLS" } });
  const boys = await prisma.squad.upsert({ where: { name: "BOYS" }, update: {}, create: { name: "BOYS" } });
  const squadByName = { GIRLS: girls, BOYS: boys };

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // --- Coaches ---
  const coachByUsername = new Map<string, string>(); // username -> User.id
  for (const c of COACHES) {
    const uname = username(c.first, c.last);
    const user = await prisma.user.create({
      data: {
        username: uname,
        email: emailFor(c.first, c.last),
        passwordHash,
        firstName: c.first,
        lastName: c.last,
        role: "COACH",
      },
    });
    coachByUsername.set(uname, user.id);
  }

  // --- Athletes (User + Athlete profile each) ---
  const athleteByUsername = new Map<string, { athleteId: string; name: string }>();
  for (const a of ROSTER) {
    const uname = username(a.first, a.last);
    const name = `${a.first} ${a.last}`;
    const user = await prisma.user.create({
      data: {
        username: uname,
        email: emailFor(a.first, a.last),
        passwordHash,
        firstName: a.first,
        lastName: a.last,
        role: "ATHLETE",
      },
    });
    const athlete = await prisma.athlete.create({
      data: { name, squadId: squadByName[a.squad].id, userId: user.id },
    });
    athleteByUsername.set(uname, { athleteId: athlete.id, name });

    await seedHistory(athlete.id, name, a.archetype);
    await seedWellnessAndLoad(athlete.id, a.archetype);

    if (a.archetype === "injured") {
      await prisma.injury.create({
        data: { athleteId: athlete.id, description: "Right shin — suspected tibial stress", status: "ACTIVE" },
      });
    }
    if (a.archetype === "return") {
      await prisma.injury.create({
        data: {
          athleteId: athlete.id,
          description: "Left hamstring strain",
          status: "RECOVERING",
          startDate: daysAgo(18),
        },
      });
    }

    await recomputeReadiness(athlete.id, NOW);
  }

  // --- Coach <-> Athlete roster assignments ---
  for (const [coachUsername, athleteUsernames] of Object.entries(ROSTER_ASSIGNMENTS)) {
    const coachId = coachByUsername.get(coachUsername)!;
    for (const au of athleteUsernames) {
      const athleteId = athleteByUsername.get(au)!.athleteId;
      await prisma.coachAthlete.create({ data: { coachId, athleteId } });
    }
  }

  // --- Sample invites for Jordan Rivera, so the Invite screen has data on first load ---
  const jordanId = coachByUsername.get("jordan.rivera")!;
  await prisma.invite.createMany({
    data: [
      { email: "taylor.nguyen@ridgeline.edu", status: "PENDING", invitedById: jordanId },
      { email: "morgan.diaz@ridgeline.edu", status: "ACCEPTED", invitedById: jordanId, respondedAt: daysAgo(2) },
      { email: "casey.kim@ridgeline.edu", status: "REJECTED", invitedById: jordanId, respondedAt: daysAgo(1) },
    ],
  });

  console.log(`\nSeed complete for week ${CURRENT_WEEK}, ${YEAR}.`);
  console.log("Status colors:", STATUS_COLOR);

  console.log("\n=== Login credentials (all use the same password) ===");
  console.log(`Password for every account: ${SEED_PASSWORD}\n`);
  console.log("-- Coaches --");
  for (const c of COACHES) {
    console.log(`  ${username(c.first, c.last).padEnd(16)} (${c.first} ${c.last})`);
  }
  console.log("\n-- Athletes --");
  for (const a of ROSTER) {
    console.log(`  ${username(a.first, a.last).padEnd(16)} (${a.first} ${a.last}, ${a.squad}, ${a.archetype})`);
  }
  console.log("\n-- Roster assignments --");
  for (const [coach, athletes] of Object.entries(ROSTER_ASSIGNMENTS)) {
    console.log(`  ${coach} -> ${athletes.join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
