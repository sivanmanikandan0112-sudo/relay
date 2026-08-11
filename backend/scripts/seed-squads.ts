// Ensures both squads exist. Squads are otherwise only ever created as a
// side effect of prisma/seed.ts, prisma/seedRealRoster.ts, or
// create-account.ts creating an ATHLETE -- so a fresh database with only
// COACH accounts in it (e.g. right after provisioning the first
// production login) has zero squads, and the coach-facing UI has nothing
// to show in any squad picker (invite page, dashboard, etc.) until one
// exists. Idempotent: safe to re-run, upserts by name.
//
// Usage: npm run seed-squads -w backend
import { prisma } from "../src/lib/prisma.js";

const SQUAD_NAMES = ["GIRLS", "BOYS"] as const;

async function main() {
  for (const name of SQUAD_NAMES) {
    const squad = await prisma.squad.upsert({ where: { name }, update: {}, create: { name } });
    console.log(`squad ${squad.name}: ${squad.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
