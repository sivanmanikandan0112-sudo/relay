import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { statusForScore } from "../src/lib/readiness.js";

const prisma = new PrismaClient();

// Same ISO-8601 week calculation the frontend uses, so seeded data always
// lines up with "this week" no matter when the seed script runs.
function currentIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

const { week: CURRENT_WEEK, year: YEAR } = currentIsoWeek(new Date());
const HISTORY_WEEKS = 6; // weeks CURRENT_WEEK-5 .. CURRENT_WEEK

const firstName = (name: string) => name.split(" ")[0];

const BACK_OFF_SUMMARY = (name: string) =>
  `${firstName(name)}'s easy runs are costing more effort than a few weeks ago, and their mood and energy have dipped with it — worth a real check-in this week.`;

const EASE_BACK_SUMMARY = (name: string) =>
  `${firstName(name)}'s load is creeping up and their sleep has been a little light lately; keep an eye on them and maybe soften the next hard day.`;

const READY_SUMMARY = () => "Trending steady this week — no action needed.";

interface AthleteSeed {
  name: string;
  finalScore: number;
}

// Final-week scores match the reference design; everyone else is a steady
// "no news" athlete filled in so each squad has a realistic roster.
const GIRLS: AthleteSeed[] = [
  { name: "Maya Okonkwo", finalScore: 24 },
  { name: "Sofia Reyes", finalScore: 37 },
  { name: "Ava Thompson", finalScore: 45 },
  { name: "Lily Anderson", finalScore: 54 },
  { name: "Priya Chandra", finalScore: 78 },
  { name: "Noor Hassan", finalScore: 82 },
  { name: "Emma Whitfield", finalScore: 74 },
  { name: "Zoe Martinez", finalScore: 88 },
];

const BOYS: AthleteSeed[] = [
  { name: "Ethan Brooks", finalScore: 52 },
  { name: "Marcus Webb", finalScore: 71 },
  { name: "Diego Alvarez", finalScore: 85 },
  { name: "Owen Fitzgerald", finalScore: 79 },
  { name: "Kai Nakamura", finalScore: 91 },
  { name: "Jonah Pruitt", finalScore: 68 },
];

function summaryFor(name: string, score: number): string {
  const status = statusForScore(score);
  if (status === "BACK_OFF") return BACK_OFF_SUMMARY(name);
  if (status === "EASE_BACK") return EASE_BACK_SUMMARY(name);
  return READY_SUMMARY();
}

// Walk backwards from the final score with small random steps so each
// athlete has a plausible multi-week trend for the sparkline.
function trendScores(finalScore: number): number[] {
  const scores = [finalScore];
  let current = finalScore;
  for (let i = 1; i < HISTORY_WEEKS; i++) {
    const drift = Math.round((Math.random() - 0.5) * 16);
    current = Math.max(5, Math.min(98, current + drift));
    scores.push(current);
  }
  return scores.reverse();
}

async function main() {
  await prisma.note.deleteMany();
  await prisma.readinessScore.deleteMany();
  await prisma.wellnessEntry.deleteMany();
  await prisma.trainingLoad.deleteMany();
  await prisma.injury.deleteMany();
  await prisma.athlete.deleteMany();

  const girls = await prisma.squad.upsert({
    where: { name: "GIRLS" },
    update: {},
    create: { name: "GIRLS" },
  });
  const boys = await prisma.squad.upsert({
    where: { name: "BOYS" },
    update: {},
    create: { name: "BOYS" },
  });

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
      const athlete = await prisma.athlete.create({
        data: { name: a.name, squadId: squad.id },
      });

      const weeklyScores = trendScores(a.finalScore);
      for (let i = 0; i < HISTORY_WEEKS; i++) {
        const week = CURRENT_WEEK - (HISTORY_WEEKS - 1 - i);
        const score = weeklyScores[i];
        await prisma.readinessScore.create({
          data: {
            athleteId: athlete.id,
            week,
            year: YEAR,
            score,
            status: statusForScore(score),
            summary: summaryFor(a.name, score),
          },
        });
      }
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
