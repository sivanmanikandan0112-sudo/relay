// Prints every intermediate number in the docs/math-behind-relay.md
// pipeline for one athlete -- the daily load series, the acute/chronic
// EWMA and ACWR, all three z-scores, the composite, the logistic risk
// score, and the final readiness/status -- without writing anything to
// the database. Useful for manually testing the math against real seeded
// data instead of only ever seeing the one collapsed final score.
//
// Usage:
//   npm run inspect -w backend -- "Maya Okonkwo"
//   npm run inspect -w backend -- maya.okonkwo
//
// Accepts either an athlete's full name or their username. Matches the
// prisma schema/prisma.ts already used by the rest of the backend, so it
// reads against whatever DATABASE_URL your .env points at.

import { prisma } from "../src/lib/prisma.js";
import { computeReadinessBreakdown } from "../src/lib/scoring.js";

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: npm run inspect -w backend -- "<athlete name or username>"');
    process.exit(1);
  }

  const athlete = await prisma.athlete.findFirst({
    where: {
      OR: [{ name: { equals: query, mode: "insensitive" } }, { user: { username: query } }],
    },
  });

  if (!athlete) {
    console.error(`No athlete found matching "${query}".`);
    process.exit(1);
  }

  const b = await computeReadinessBreakdown(athlete.id);

  const fmt = (n: number | null, digits = 3) => (n === null ? "null (no signal)" : n.toFixed(digits));

  console.log(`\n=== ${b.athleteName} — readiness breakdown as of ${b.now.toISOString()} ===\n`);

  console.log("-- §9 minimum-history gate --");
  console.log(`  days of history:     ${b.daysOfHistory.toFixed(1)}`);
  console.log(`  enough history?      ${b.hasEnoughHistory} (needs >= 14 days)`);

  console.log("\n-- §3-4 EWMA load / ACWR --");
  console.log(`  acute EWMA (7d):     ${b.acuteLoad.toFixed(2)}`);
  console.log(`  chronic EWMA (28d):  ${b.chronicLoad.toFixed(2)}`);
  console.log(`  ACWR:                ${b.acwr.toFixed(3)}`);

  console.log("\n-- §6 z-scores --");
  console.log(`  z_load:              ${fmt(b.zLoad)}`);
  console.log(
    `  z_effortCost:        ${fmt(b.zEffortCost)}  (recent=${fmt(b.effortCostRecent, 2)}, baseline n=${b.effortCostBaselineSize})`
  );
  console.log(
    `  z_wellDaily:         ${fmt(b.zWellDaily)}  (recent=${fmt(b.wellDailyRecent, 2)}, baseline n=${b.wellDailyBaselineSize})`
  );

  console.log("\n-- §7-8 composite / logistic --");
  console.log(`  C (composite):       ${b.composite.toFixed(3)}`);
  console.log(`  R (risk, 0-100):     ${b.risk.toFixed(2)}`);
  console.log(`  readiness (100-R):   ${b.readiness.toFixed(2)}`);

  console.log("\n-- §9 final status --");
  console.log(`  score (stored):      ${b.score}`);
  console.log(`  band:                ${b.band}`);
  console.log(`  active injury?       ${b.activeInjury}`);
  console.log(`  recovering injury?   ${b.recoveringInjury}`);
  console.log(`  status (displayed):  ${b.status}`);
  console.log(`  summary:             "${b.summary}"`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
