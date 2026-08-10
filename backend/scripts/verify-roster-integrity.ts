// Runs the full readiness pipeline against every athlete currently in the
// database and flags anything the math or the DB layer shouldn't be able
// to produce: a thrown exception, NaN/Infinity anywhere in the breakdown,
// a score outside [0, 100], or an invalid status. Meant for exactly this
// kind of situation -- a large, messy, real-world-shaped dataset just got
// seeded, and "does every one of these individually compute without
// blowing up" is worth checking directly rather than assuming.
//
// Usage: npm run verify-roster -w backend
import { prisma } from "../src/lib/prisma.js";
import { computeReadinessBreakdown } from "../src/lib/scoring.js";

const VALID_STATUSES = new Set(["FRESH", "EASE_BACK", "BACK_OFF", "RETURN_PROTOCOL", "INJURED"]);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

async function main() {
  const athletes = await prisma.athlete.findMany({ select: { id: true, name: true } });
  console.log(`Checking ${athletes.length} athletes...\n`);

  let ok = 0;
  const problems: string[] = [];

  for (const athlete of athletes) {
    try {
      const b = await computeReadinessBreakdown(athlete.id);

      const checks: [boolean, string][] = [
        [Number.isInteger(b.score) && b.score >= 0 && b.score <= 100, `score out of range: ${b.score}`],
        [VALID_STATUSES.has(b.status), `invalid status: ${b.status}`],
        [isFiniteNumber(b.acuteLoad), `acuteLoad not finite: ${b.acuteLoad}`],
        [isFiniteNumber(b.chronicLoad), `chronicLoad not finite: ${b.chronicLoad}`],
        [isFiniteNumber(b.acwr), `acwr not finite: ${b.acwr}`],
        [isFiniteNumber(b.composite), `composite not finite: ${b.composite}`],
        [isFiniteNumber(b.risk) && b.risk >= 0 && b.risk <= 100, `risk out of [0,100]: ${b.risk}`],
        [isFiniteNumber(b.readiness), `readiness not finite: ${b.readiness}`],
        [b.zLoad === null || isFiniteNumber(b.zLoad), `zLoad is non-finite non-null: ${b.zLoad}`],
        [b.zEffortCost === null || isFiniteNumber(b.zEffortCost), `zEffortCost is non-finite non-null: ${b.zEffortCost}`],
        [b.zWellDaily === null || isFiniteNumber(b.zWellDaily), `zWellDaily is non-finite non-null: ${b.zWellDaily}`],
        [typeof b.summary === "string" && b.summary.length > 0, "summary is empty"],
      ];

      const failed = checks.filter(([pass]) => !pass).map(([, msg]) => msg);
      if (failed.length > 0) {
        problems.push(`${athlete.name}: ${failed.join("; ")}`);
      } else {
        ok++;
      }
    } catch (e) {
      problems.push(`${athlete.name}: THREW -- ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`OK: ${ok}/${athletes.length}`);
  if (problems.length > 0) {
    console.log(`\nPROBLEMS (${problems.length}):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log("No problems found -- every athlete's readiness pipeline computed cleanly.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
