import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { statusForScore } from "../src/lib/readiness.js";

const prisma = new PrismaClient();

const WEEK = 31;
const YEAR = 2026;

const GIRLS = [
  { name: "Maya Okonkwo", score: 24, summary: "Easy runs are costing more effort than a few weeks ago, and mood and energy have dipped with it — worth a real check-in this week." },
  { name: "Sofia Reyes", score: 37, summary: "Easy runs are costing more effort than a few weeks ago, and mood and energy have dipped with it — worth a real check-in this week." },
  { name: "Ava Thompson", score: 45, summary: "Load is creeping up and sleep has been a little light lately; keep an eye on them and maybe soften the next hard session." },
];

const BOYS = [
  { name: "Ethan Brooks", score: 52, summary: "Trending steady with a slight dip in sleep quality this week." },
];

async function main() {
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

  for (const [squad, roster] of [[girls, GIRLS], [boys, BOYS]] as const) {
    for (const a of roster) {
      const athlete = await prisma.athlete.create({
        data: { name: a.name, squadId: squad.id },
      });
      await prisma.readinessScore.create({
        data: {
          athleteId: athlete.id,
          week: WEEK,
          year: YEAR,
          score: a.score,
          status: statusForScore(a.score),
          summary: a.summary,
        },
      });
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
