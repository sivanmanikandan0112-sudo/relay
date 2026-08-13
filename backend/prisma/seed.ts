import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { STATUS_COLOR } from "../src/lib/readiness.js";
import { recomputeReadiness } from "../src/lib/scoring.js";
import { dayKey } from "../src/lib/date.js";

const prisma = new PrismaClient();

// Shared password for every seeded account, for local testing only.
const SEED_PASSWORD = "Relay2026!";

const NOW = new Date();
const WEEKS = 8; // how much history to seed, per athlete

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

const COACHES = [{ first: "Jordan", last: "Rivera" }];

// Coach roster assignments, by athlete username. A single coach, with
// every athlete on their roster -- including the injured/return
// archetypes, so their guardrail behavior (status override + the injury
// exclusion in the baseline) is reachable through the coach UI, not just
// the database. CoachAthlete is still a many-to-many join table (an
// athlete could have more than one coach), this seed just doesn't
// exercise that case with only one coach seeded.
const ROSTER_ASSIGNMENTS: Record<string, string[]> = {
  "jordan.rivera": ROSTER.map((a) => `${a.first}.${a.last}`.toLowerCase()),
};

// Weekly mileage totals per archetype, index 0 = this week (most recent)
// through index 7 = 7 weeks ago (oldest) -- read right-to-left for the
// story each archetype tells over the 8 weeks:
//   fresh   - steady all the way through
//   watch   - creeping up week over week (load outpacing fitness)
//   risk    - normal for weeks, then a hard mileage spike the last 2 weeks
//   injured - normal, then crashes to near-zero the last 2 weeks (hurt)
//   return  - normal, crashes mid-history (hurt), then ramps back up (return-to-run)
const WEEKLY_MILEAGE: Record<Archetype, number[]> = {
  fresh: [34, 33, 35, 34, 33, 35, 34, 33],
  watch: [36, 33, 30, 28, 27, 25, 24, 23],
  risk: [50, 45, 30, 29, 28, 30, 27, 29],
  injured: [2, 4, 27, 31, 29, 33, 30, 32],
  return: [17, 11, 6, 3, 2, 28, 30, 27],
};

// Weekly wellness baseline (pre-soreness-inversion average of sleep/mood/
// energy/motivation, 1-5) per archetype, same index convention as above --
// these move with the mileage story: risk's wellness drops as load spikes,
// injured/return dip around the injury and return dips recover with it.
const WEEKLY_WELLNESS: Record<Archetype, number[]> = {
  fresh: [4.3, 4.4, 4.2, 4.3, 4.4, 4.2, 4.3, 4.4],
  watch: [3.1, 3.3, 3.4, 3.6, 3.7, 3.8, 3.9, 4.0],
  risk: [2.1, 2.4, 3.4, 3.6, 3.7, 3.6, 3.8, 3.7],
  injured: [2.6, 2.8, 3.8, 4.0, 3.9, 4.1, 4.0, 4.1],
  return: [3.5, 3.3, 3.0, 2.6, 2.5, 3.9, 4.0, 3.9],
};

function username(first: string, last: string): string {
  return `${first}.${last}`.toLowerCase();
}
function emailFor(first: string, last: string): string {
  return `${username(first, last)}@ridgeline.edu`;
}
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400000);
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Picks `count` distinct day-offsets within a 7-day window that starts
// `weekStartDaysAgo` days back, so runs/check-ins land on different days
// of the week instead of stacking on the same one.
function pickDayOffsets(count: number, weekStartDaysAgo: number): number[] {
  const pool = [0, 1, 2, 3, 4, 5, 6];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, 7)).map((d) => weekStartDaysAgo + d);
}

interface RunPlan {
  runType: string;
  distanceMiles: number;
  rpe: number;
  paceMinPerMile: number;
}

// Splits a week's mileage total into a handful of differently-shaped runs
// (long run, tempo, easy days) instead of one flat repeated number, the
// way an actual training week looks.
function planWeekRuns(weeklyMiles: number): RunPlan[] {
  if (weeklyMiles <= 0) return [];
  if (weeklyMiles < 5) {
    // minimal/rehab mileage -- around an injury or early in a return ramp
    return weeklyMiles < 3
      ? [{ runType: "Easy shakeout", distanceMiles: weeklyMiles, rpe: 3, paceMinPerMile: 10.5 }]
      : [
          { runType: "Easy shakeout", distanceMiles: weeklyMiles * 0.6, rpe: 3, paceMinPerMile: 10.5 },
          { runType: "Easy shakeout", distanceMiles: weeklyMiles * 0.4, rpe: 3, paceMinPerMile: 10.6 },
        ];
  }
  if (weeklyMiles < 15) {
    const long = weeklyMiles * 0.4;
    const rest = weeklyMiles - long;
    return [
      { runType: "Long run", distanceMiles: long, rpe: 6, paceMinPerMile: 9.2 },
      { runType: "Easy", distanceMiles: rest * 0.55, rpe: 4, paceMinPerMile: 9.8 },
      { runType: "Easy", distanceMiles: rest * 0.45, rpe: 4, paceMinPerMile: 9.9 },
    ];
  }
  const long = weeklyMiles * 0.28;
  const tempo = weeklyMiles * 0.18;
  const remaining = weeklyMiles - long - tempo;
  const easyCount = weeklyMiles > 40 ? 4 : 3;
  const easyEach = remaining / easyCount;
  const runs: RunPlan[] = [
    { runType: "Long run", distanceMiles: long, rpe: 6, paceMinPerMile: 8.8 },
    { runType: "Tempo intervals", distanceMiles: tempo, rpe: 8, paceMinPerMile: 7.6 },
  ];
  for (let i = 0; i < easyCount; i++) {
    runs.push({ runType: "Easy", distanceMiles: easyEach, rpe: 4, paceMinPerMile: 9.6 });
  }
  return runs;
}

// Generates 8 full weeks (56 days) of wellness check-ins and logged runs
// for one athlete, with day-to-day and week-to-week variety driven by
// their archetype's mileage/wellness plan above.
async function seedWellnessAndLoad(athleteId: string, archetype: Archetype) {
  const mileagePlan = WEEKLY_MILEAGE[archetype];
  const wellnessPlan = WEEKLY_WELLNESS[archetype];

  for (let week = 0; week < WEEKS; week++) {
    const weekStartDaysAgo = week * 7;
    const weeklyMiles = mileagePlan[week];
    const wellnessBase = wellnessPlan[week];

    const runs = planWeekRuns(weeklyMiles);
    const runDayOffsets = pickDayOffsets(runs.length, weekStartDaysAgo);
    for (let i = 0; i < runs.length; i++) {
      const plan = runs[i];
      const distanceMiles = Math.round(plan.distanceMiles * (0.9 + Math.random() * 0.2) * 100) / 100;
      const pace = plan.paceMinPerMile * (0.95 + Math.random() * 0.1);
      const durationMin = Math.round(distanceMiles * pace * 10) / 10;
      if (distanceMiles <= 0 || durationMin <= 0) continue;
      const rpe = clamp(plan.rpe + Math.round(Math.random() * 2 - 1), 1, 10);
      await prisma.trainingLoad.create({
        data: {
          athleteId,
          date: daysAgo(runDayOffsets[i]),
          runType: plan.runType,
          distanceMiles,
          durationMin,
          rpe,
          load: rpe * durationMin,
        },
      });
    }

    // Check in most days, skipping 1-2 at random -- athletes don't log every single day.
    const checkInCount = Math.random() < 0.5 ? 6 : 5;
    const checkInDayOffsets = pickDayOffsets(checkInCount, weekStartDaysAgo);
    for (const dayOffset of checkInDayOffsets) {
      const jitter = () => clamp(Math.round(wellnessBase + (Math.random() - 0.5) * 1.6), 1, 5);
      const soreness = clamp(Math.round(6 - wellnessBase + (Math.random() - 0.5) * 1.6), 1, 5);
      await prisma.wellnessEntry.create({
        data: {
          athleteId,
          date: daysAgo(dayOffset),
          day: dayKey(daysAgo(dayOffset)),
          sleep: jitter(),
          soreness,
          mood: jitter(),
          energy: jitter(),
          motivation: jitter(),
        },
      });
    }
  }
}

// Walks the real scoring algorithm forward one week at a time, using
// whatever load/wellness/injury data existed as of each checkpoint -- so
// the multi-week trend shown on Brief and the athlete detail drawer is
// genuinely computed from the seeded data, not a fabricated number per
// week. (The most recent week is left to the final recomputeReadiness(...,
// NOW) call in main(), so this covers weeks 7 down to 1.)
async function seedReadinessCheckpoints(athleteId: string) {
  for (let weeksAgo = WEEKS - 1; weeksAgo >= 1; weeksAgo--) {
    await recomputeReadiness(athleteId, daysAgo(weeksAgo * 7));
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

    await seedWellnessAndLoad(athlete.id, a.archetype);

    if (a.archetype === "injured") {
      await prisma.injury.create({
        data: {
          athleteId: athlete.id,
          description: "Right shin — suspected tibial stress",
          status: "ACTIVE",
          startDate: daysAgo(12),
        },
      });
    }
    if (a.archetype === "return") {
      await prisma.injury.create({
        data: {
          athleteId: athlete.id,
          description: "Left hamstring strain",
          status: "RECOVERING",
          startDate: daysAgo(30),
        },
      });
    }

    // Real weekly checkpoints from the data above, then today's live score.
    await seedReadinessCheckpoints(athlete.id);
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
  const inviteToken = () => crypto.randomBytes(24).toString("hex");
  const inviteExpiresAt = daysAgo(-14); // 14 days from now
  await prisma.invite.createMany({
    data: [
      {
        email: "taylor.nguyen@ridgeline.edu",
        status: "PENDING",
        invitedById: jordanId,
        squadId: girls.id,
        token: inviteToken(),
        expiresAt: inviteExpiresAt,
      },
      {
        email: "morgan.diaz@ridgeline.edu",
        status: "ACCEPTED",
        invitedById: jordanId,
        squadId: girls.id,
        token: inviteToken(),
        expiresAt: inviteExpiresAt,
        respondedAt: daysAgo(2),
      },
      {
        email: "casey.kim@ridgeline.edu",
        status: "REJECTED",
        invitedById: jordanId,
        squadId: boys.id,
        token: inviteToken(),
        expiresAt: inviteExpiresAt,
        respondedAt: daysAgo(1),
      },
    ],
  });

  console.log(`\nSeed complete: ${WEEKS} weeks of history per athlete.`);
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
