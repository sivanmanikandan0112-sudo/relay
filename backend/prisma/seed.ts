import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { bandForScore, plainSignal, STATUS_COLOR } from "../src/lib/readiness.js";
import { recomputeReadiness } from "../src/lib/scoring.js";

const prisma = new PrismaClient();

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
const HISTORY_WEEKS = 5; // weeks before the live-computed current week

type Archetype = "fresh" | "watch" | "risk" | "injured" | "return";

interface AthleteSeed {
  name: string;
  archetype: Archetype;
}

const GIRLS: AthleteSeed[] = [
  { name: "Maya Okonkwo", archetype: "risk" },
  { name: "Sofia Reyes", archetype: "risk" },
  { name: "Ava Thompson", archetype: "watch" },
  { name: "Lily Anderson", archetype: "watch" },
  { name: "Chloe Bennett", archetype: "injured" },
  { name: "Emma Whitfield", archetype: "return" },
  { name: "Priya Chandra", archetype: "fresh" },
  { name: "Noor Hassan", archetype: "fresh" },
  { name: "Zoe Martinez", archetype: "fresh" },
];

const BOYS: AthleteSeed[] = [
  { name: "Jonah Pruitt", archetype: "risk" },
  { name: "Ethan Brooks", archetype: "watch" },
  { name: "Marcus Webb", archetype: "fresh" },
  { name: "Diego Alvarez", archetype: "fresh" },
  { name: "Owen Fitzgerald", archetype: "fresh" },
  { name: "Kai Nakamura", archetype: "fresh" },
];

// Historical score bands per archetype, for the weeks before "now" — purely
// for the sparkline; the current week is always live-computed from real
// seeded wellness/load rows below.
const HISTORY_RANGE: Record<Archetype, [number, number]> = {
  fresh: [70, 92],
  watch: [45, 62],
  risk: [18, 38],
  injured: [30, 55], // trending down before the injury happened
  return: [20, 40], // was low before injury, now recovering
};

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
  // Wellness check-ins for the last 5 days.
  const wellnessBase: Record<Archetype, number> = { fresh: 4.3, watch: 3.2, risk: 2.2, injured: 3.0, return: 3.6 };
  const base = wellnessBase[archetype];
  for (let i = 0; i < 5; i++) {
    const jitter = () => Math.max(1, Math.min(5, Math.round(base + (Math.random() - 0.5))));
    await prisma.wellnessEntry.create({
      data: {
        athleteId,
        date: daysAgo(i),
        sleep: jitter(),
        soreness: Math.max(1, Math.min(5, 6 - jitter())), // higher base -> lower soreness
        mood: jitter(),
        energy: jitter(),
        motivation: jitter(),
      },
    });
  }

  // Training load: a 28-day chronic baseline, with the acute (last 7 days)
  // spiking for "risk"/"watch" archetypes to produce a realistic ACWR.
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
  await prisma.note.deleteMany();
  await prisma.readinessScore.deleteMany();
  await prisma.wellnessEntry.deleteMany();
  await prisma.trainingLoad.deleteMany();
  await prisma.injury.deleteMany();
  await prisma.athlete.deleteMany();

  const girls = await prisma.squad.upsert({ where: { name: "GIRLS" }, update: {}, create: { name: "GIRLS" } });
  const boys = await prisma.squad.upsert({ where: { name: "BOYS" }, update: {}, create: { name: "BOYS" } });

  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.upsert({
    where: { email: "coach@relay.app" },
    update: {},
    create: { email: "coach@relay.app", passwordHash, name: "Coach", role: "COACH" },
  });

  for (const [squad, roster] of [
    [girls, GIRLS],
    [boys, BOYS],
  ] as const) {
    for (const a of roster) {
      const athlete = await prisma.athlete.create({ data: { name: a.name, squadId: squad.id } });

      await seedHistory(athlete.id, a.name, a.archetype);
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

      // Compute the current week live from the seeded wellness/load/injury
      // data above, exactly the way a real submission would.
      await recomputeReadiness(athlete.id, NOW);
    }
  }

  console.log(`Seed complete for week ${CURRENT_WEEK}, ${YEAR}. Status colors:`, STATUS_COLOR);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
