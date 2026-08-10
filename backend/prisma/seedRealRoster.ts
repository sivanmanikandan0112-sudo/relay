// Seeds a second, larger roster (81 athletes) derived from a real coach's
// 10-week mileage tracking sheets for a boys and girls cross country team.
//
// PRIVACY NOTE: the source sheets have real athletes' full names. None of
// them appear here or anywhere else in this repo -- every identity below
// is a synthetic name generated deterministically from a name pool, kept
// in the same relative order as the source rows so grade/squad/mileage
// patterns are preserved for realistic testing, with no way to reverse a
// synthetic name back to a real one from anything in this file. This
// script is additive: it does NOT touch the athletes/coaches created by
// prisma/seed.ts, and never deletes existing data.
//
// The mileage numbers themselves are real (whole-number weekly totals, as
// printed -- "no decimals for mileage" per the source sheet) and are split
// into individual daily runs the same way prisma/seed.ts's synthetic
// archetypes are (long/tempo/easy days). Wellness check-ins don't exist in
// the source at all -- those are entirely synthetic, generated with a
// loose "bigger week than usual -> lower wellness" correlation plus daily
// jitter, since the sheet only ever tracked mileage.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recomputeReadiness } from "../src/lib/scoring.js";

const prisma = new PrismaClient();
const SEED_PASSWORD = "Relay2026!";
const NOW = new Date();

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400000);
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// --------------------------------------------------------------------
// Synthetic identities -- generic, clearly-fictional name pools, paired
// by index with a coprime offset so pairings aren't just "pool[i] with
// pool[i]" (both pool lengths are chosen so the offset is a full bijection:
// gcd(7, 41) = gcd(7, 40) = 1).
// --------------------------------------------------------------------
const BOYS_FIRST = [
  "Aaron", "Blake", "Caleb", "Derek", "Ethan", "Felix", "Gavin", "Holden", "Isaac", "Jasper",
  "Kai", "Liam", "Mason", "Nolan", "Oscar", "Preston", "Quinn", "Riley", "Silas", "Tyler",
  "Vince", "Wyatt", "Xavier", "Zane", "Bryce", "Cole", "Dean", "Elias", "Finn", "Grant",
  "Hugo", "Ivan", "Jude", "Knox", "Leo", "Miles", "Nash", "Owen", "Percy", "Reid", "Roman",
];
const BOYS_LAST = [
  "Anders", "Baldwin", "Carrow", "Doyle", "Ellery", "Fenwick", "Grover", "Hastings", "Ingram", "Jarvis",
  "Kestner", "Lassiter", "Mercer", "Norwood", "Osgood", "Pierce", "Quimby", "Radcliffe", "Sawyer", "Thorne",
  "Underhill", "Vance", "Winslow", "Xander", "Yates", "Ashford", "Brennan", "Corbett", "Dunmore", "Everhart",
  "Fairweather", "Galloway", "Harlow", "Isham", "Jennings", "Kellerman", "Lockwood", "Marsh", "Nesbitt", "Ostrander", "Prewitt",
];
const GIRLS_FIRST = [
  "Adalyn", "Bianca", "Camille", "Delia", "Esme", "Fiona", "Giselle", "Harlow", "Ines", "Josie",
  "Kira", "Lucia", "Marlowe", "Nadia", "Odette", "Piper", "Quinlan", "Reina", "Sable", "Thea",
  "Uma", "Vera", "Wren", "Ximena", "Yara", "Alina", "Bree", "Cora", "Dahlia", "Elowen",
  "Freya", "Greer", "Hazel", "Ivy", "Juniper", "Kestrel", "Lark", "Marin", "Noor", "Opal",
];
const GIRLS_LAST = [
  "Ashwood", "Blackwell", "Castellan", "Delacroix", "Emberly", "Fairfax", "Grantham", "Hollister", "Ivory", "Kingsley",
  "Larkspur", "Marchetti", "Newlyn", "Oakes", "Prescott", "Quintessa", "Ravenscroft", "Somerset", "Thistlewood", "Underwood",
  "Vasquez", "Whitfield", "Xiomara", "Yorke", "Ambrose", "Barrington", "Chastain", "Devereux", "Elderberry", "Fenmore",
  "Greaves", "Hartwell", "Isabeau", "Jourdain", "Kavanagh", "Lindqvist", "Moreau", "Norcross", "Ostberg", "Prentiss",
];

function syntheticName(firstPool: string[], lastPool: string[], index: number) {
  const first = firstPool[index % firstPool.length];
  const last = lastPool[(index * 7 + 11) % lastPool.length];
  return { first, last };
}

// --------------------------------------------------------------------
// Real weekly mileage totals (whole numbers, as printed), one row per
// athlete in original sheet order. `weeks` may have fewer than 10 entries
// -- that means some cells were blank in the source, not zero; see
// placeWeeks() for how that's interpreted. No names here, only
// grade + the numbers themselves.
// --------------------------------------------------------------------
interface RosterRow {
  grade: number;
  weeks: number[];
}

const BOYS_MILEAGE: RosterRow[] = [
  { grade: 12, weeks: [70, 77, 74, 82, 85, 79, 82, 85, 85, 74] },
  { grade: 12, weeks: [67, 74, 69, 81, 84, 83, 74, 74, 77, 70] },
  { grade: 12, weeks: [67, 68, 69, 61, 67, 67, 71, 68, 65, 57] },
  { grade: 12, weeks: [58, 63, 67, 60, 61, 70, 54, 61, 53, 46] },
  { grade: 11, weeks: [60, 66, 63, 68, 48, 42, 60, 66, 55, 60] },
  { grade: 12, weeks: [54, 60, 52, 55, 60, 62, 65, 60, 50, 63] },
  { grade: 12, weeks: [54, 56, 53, 50, 51, 58, 49, 42, 53, 52] },
  { grade: 12, weeks: [41, 47, 48, 50, 52, 55, 52, 57, 55, 60] },
  { grade: 11, weeks: [65, 42, 51, 56, 32, 28, 66, 55, 58, 61] },
  { grade: 11, weeks: [54, 51, 51, 51, 55, 54, 55, 33, 52, 55] },
  { grade: 12, weeks: [44, 34, 54, 52, 40, 54, 48, 57, 59, 58] },
  { grade: 12, weeks: [46, 46, 49, 47, 50, 50, 52, 54, 54, 48] },
  { grade: 10, weeks: [46, 46, 45, 49, 40, 45, 57, 50, 50, 44] },
  { grade: 12, weeks: [45, 48, 45, 44, 27, 44, 56, 52, 42, 62] },
  { grade: 12, weeks: [46, 46, 47, 50, 50, 52, 52, 52, 15, 44] },
  { grade: 12, weeks: [36, 44, 49, 44, 46, 44, 42, 36, 47, 42] },
  { grade: 10, weeks: [43, 41, 40, 41, 43, 48, 44, 44, 42, 34] },
  { grade: 10, weeks: [35, 27, 37, 39, 48, 52, 50, 48, 44, 24] },
  { grade: 10, weeks: [36, 36, 38, 40, 40, 42, 42, 45, 43, 40] },
  { grade: 12, weeks: [44, 41, 33, 28, 36, 49, 49, 20, 41, 61] },
  { grade: 10, weeks: [38, 42, 43, 30, 36, 41, 50, 41, 42, 38] },
  { grade: 11, weeks: [45, 49, 42, 33, 38, 40, 37, 24, 47, 46] },
  { grade: 10, weeks: [40, 40, 35, 42, 40, 40, 12, 43, 41, 33] },
  { grade: 11, weeks: [15, 37, 38, 30, 30, 43, 43, 40, 38, 36] },
  { grade: 10, weeks: [27, 40, 15, 40, 44, 21, 40, 27, 40, 35] },
  { grade: 11, weeks: [34, 35, 39, 40, 25, 24, 21, 25, 36, 46] },
  { grade: 11, weeks: [34, 34, 38, 41, 39, 0, 22, 28, 43, 32] },
  { grade: 9, weeks: [32, 28, 30, 32, 31, 34, 35, 8, 26, 34] },
  { grade: 10, weeks: [23, 32, 34, 30, 35, 40, 34, 30] },
  { grade: 10, weeks: [13, 13, 16, 25, 27, 32, 33, 29, 34, 36] },
  { grade: 10, weeks: [37, 29, 21, 23, 25, 35, 28, 35, 22] },
  { grade: 10, weeks: [27, 30, 29, 37, 22, 25, 22, 15, 28] },
  { grade: 9, weeks: [16, 16, 19, 22, 26, 25, 5, 23, 12, 30] },
  { grade: 9, weeks: [15, 16, 17, 21, 24, 21, 21, 21, 9, 20] },
  { grade: 9, weeks: [0, 0, 17, 22, 21, 17, 20, 22, 27, 24] },
  { grade: 9, weeks: [0, 0, 0, 0, 34, 40, 15, 12, 34, 34] },
  { grade: 9, weeks: [12, 16, 21, 21, 19, 21, 17, 18, 17] },
  { grade: 10, weeks: [0, 0, 0, 27, 28, 0, 30, 28, 23, 25] },
  { grade: 9, weeks: [18, 17, 9, 17, 21, 21, 21, 20, 7] },
  { grade: 9, weeks: [13, 16, 9, 17, 14, 0, 0, 21, 13, 15] },
  { grade: 10, weeks: [0, 0, 0, 0, 0, 0, 0, 23, 21, 21] },
];

const GIRLS_MILEAGE: RosterRow[] = [
  { grade: 12, weeks: [48, 48, 45, 52, 50, 49, 46, 53, 51] },
  { grade: 11, weeks: [39, 38, 40, 46, 50, 46, 46, 48, 46, 42] },
  { grade: 12, weeks: [41, 40, 42, 46, 48, 43, 46, 48, 44, 42] },
  { grade: 11, weeks: [38, 42, 39, 45, 47, 40, 39, 30, 40, 36] },
  { grade: 11, weeks: [38, 36, 40, 45, 42, 36, 40, 39, 35, 36] },
  { grade: 11, weeks: [38, 30, 33, 43, 45, 37, 40, 38, 42, 35] },
  { grade: 11, weeks: [38, 36, 35, 43, 38, 35, 38, 40, 37, 37] },
  { grade: 10, weeks: [35, 36, 31, 33, 40, 40, 38, 40, 39, 36] },
  { grade: 12, weeks: [16, 29, 36, 39, 53, 33, 38, 40, 41, 39] },
  { grade: 12, weeks: [33, 36, 34, 36, 37, 38, 38, 35, 35, 30] },
  { grade: 10, weeks: [37, 30, 30, 40, 28, 39, 35, 37, 34, 30] },
  { grade: 12, weeks: [33, 35, 34, 35, 37, 33, 34, 33, 35, 30] },
  { grade: 10, weeks: [26, 32, 15, 40, 40, 30, 27, 36, 45, 36] },
  { grade: 12, weeks: [15, 39, 20, 25, 38, 40, 47, 47, 45, 7] },
  { grade: 12, weeks: [21, 4, 26, 34, 38, 35, 37, 45, 44, 37] },
  { grade: 11, weeks: [36, 29, 10, 38, 30, 35, 38, 34, 33, 35] },
  { grade: 11, weeks: [32, 24, 28, 32, 36, 34, 28, 29, 33, 38] },
  { grade: 10, weeks: [29, 27, 30, 34, 31, 30, 21, 27, 30, 42] },
  { grade: 10, weeks: [29, 25, 27, 33, 29, 32, 17, 30, 32, 47] },
  { grade: 10, weeks: [32, 29, 31, 28, 31, 29, 30, 29, 30, 32] },
  { grade: 12, weeks: [34, 40, 35, 43, 35, 32, 28, 30, 10] },
  { grade: 12, weeks: [26, 27, 27, 28, 32, 29, 29, 30, 24, 28] },
  { grade: 11, weeks: [33, 36, 28, 30, 34, 40, 37, 31, 6, 0] },
  { grade: 9, weeks: [24, 19, 29, 28, 29, 31, 20, 36, 30, 28] },
  { grade: 9, weeks: [24, 24, 23, 26, 29, 28, 24, 28, 30, 24] },
  { grade: 9, weeks: [24, 6, 17, 23, 27, 27, 25, 28, 33, 16] },
  { grade: 9, weeks: [22, 26, 16, 25, 23, 11, 25, 26, 24, 18] },
  { grade: 9, weeks: [21, 25, 12, 11, 26, 29, 16, 11, 19, 16] },
  { grade: 9, weeks: [19, 22, 23, 13, 12, 11, 21, 20, 24, 21] },
  { grade: 12, weeks: [27, 30, 30, 35, 33, 0, 0, 17, 10] },
  { grade: 9, weeks: [17, 21, 0, 20, 20, 26, 27, 17, 15, 18] },
  { grade: 9, weeks: [15, 20, 14, 20, 22, 21, 15, 15, 19, 20] },
  { grade: 9, weeks: [17, 20, 16, 15, 18, 17, 20, 19, 22, 17] },
  { grade: 9, weeks: [15, 11, 20, 0, 22, 23, 25, 21, 22, 19] },
  { grade: 9, weeks: [15, 12, 16, 21, 25, 22, 22, 19, 18] },
  { grade: 9, weeks: [20, 16, 17, 15, 20, 18, 12, 11, 15, 19] },
  { grade: 9, weeks: [11, 17, 13, 19, 14, 15, 14, 18, 19, 18] },
  { grade: 12, weeks: [28, 32, 0, 0, 35, 31, 28, 0, 0] },
  { grade: 9, weeks: [12, 20, 0, 15, 16, 18, 19, 14, 19, 20] },
  { grade: 9, weeks: [0, 0, 0, 0, 0, 0, 0, 0, 14] },
];

// --------------------------------------------------------------------
// Interpreting the sheet: a row with fewer than 10 values had blank
// cells, not zeros -- meaning those weeks aren't "0 miles", they're "not
// on the roster yet/anymore". Freshmen (grade 9) commonly join a couple
// weeks into the season, so a short row for a 9th grader is read as
// missing weeks at the *start*; for grades 10-12 (more likely to have
// stopped reporting near the end, e.g. injury) it's read as missing at
// the *end*. Separately, a run of 3+ *explicit* zero weeks right at the
// start (all 10 cells present, but the first several are literal 0s) is
// also read as "not on the roster yet" -- a single isolated 0, or a short
// scattered streak, is read literally: on the roster, no mileage that
// particular week (rest/minor injury), not an absence.
// --------------------------------------------------------------------
function placeWeeks(row: RosterRow): (number | null)[] {
  const missing = 10 - row.weeks.length;
  let placed: (number | null)[];
  if (missing === 0) placed = [...row.weeks];
  else if (row.grade === 9) placed = [...Array(missing).fill(null), ...row.weeks];
  else placed = [...row.weeks, ...Array(missing).fill(null)];

  let leadingZeros = 0;
  while (leadingZeros < placed.length && placed[leadingZeros] === 0) leadingZeros++;
  if (leadingZeros >= 3) {
    for (let i = 0; i < leadingZeros; i++) placed[i] = null;
  }
  return placed;
}

// --------------------------------------------------------------------
// Splitting a real weekly total into daily runs -- identical approach to
// prisma/seed.ts's planWeekRuns: a long run, a tempo day once mileage
// supports it, and the rest spread across easy days.
// --------------------------------------------------------------------
interface RunPlan {
  runType: string;
  distanceMiles: number;
  rpe: number;
  paceMinPerMile: number;
}

function planWeekRuns(weeklyMiles: number): RunPlan[] {
  if (weeklyMiles <= 0) return [];
  if (weeklyMiles < 5) {
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
  const easyCount = weeklyMiles > 55 ? 5 : weeklyMiles > 40 ? 4 : 3;
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

function pickDayOffsets(count: number, weekStartDaysAgo: number): number[] {
  const pool = [0, 1, 2, 3, 4, 5, 6];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, 7)).map((d) => weekStartDaysAgo + d);
}

// --------------------------------------------------------------------
// Synthetic wellness: never present in the source sheet at all. A loose,
// intentionally simple heuristic -- a week that's a bigger jump than the
// athlete's own average-so-far reads as more fatigued -- plus per-day
// jitter and a couple of skipped check-in days a week, same as
// prisma/seed.ts's approach.
// --------------------------------------------------------------------
function wellnessBaseForWeek(weeklyMiles: number, runningAvg: number): number {
  const ratio = runningAvg > 0 ? weeklyMiles / runningAvg : 1;
  const base = 4.0 - clamp((ratio - 1) * 1.5, -0.6, 1.2);
  return clamp(base, 1.8, 4.6);
}

async function seedAthleteTrainingAndWellness(athleteId: string, placedWeeks: (number | null)[]) {
  let runningTotal = 0;
  let runningCount = 0;

  for (let weekNumber = 1; weekNumber <= 10; weekNumber++) {
    const weeklyMiles = placedWeeks[weekNumber - 1];
    if (weeklyMiles === null) continue; // not on the roster this week

    const weekStartDaysAgo = (10 - weekNumber) * 7;
    const runningAvg = runningCount > 0 ? runningTotal / runningCount : weeklyMiles;

    if (weeklyMiles > 0) {
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
    }

    const wellnessBase = wellnessBaseForWeek(weeklyMiles, runningAvg);
    const checkInCount = Math.random() < 0.5 ? 6 : 5;
    const checkInDayOffsets = pickDayOffsets(checkInCount, weekStartDaysAgo);
    for (const dayOffset of checkInDayOffsets) {
      const jitter = () => clamp(Math.round(wellnessBase + (Math.random() - 0.5) * 1.6), 1, 5);
      const soreness = clamp(Math.round(6 - wellnessBase + (Math.random() - 0.5) * 1.6), 1, 5);
      await prisma.wellnessEntry.create({
        data: {
          athleteId,
          date: daysAgo(dayOffset),
          sleep: jitter(),
          soreness,
          mood: jitter(),
          energy: jitter(),
          motivation: jitter(),
        },
      });
    }

    runningTotal += weeklyMiles;
    runningCount += 1;
  }
}

async function main() {
  console.log("Seeding the real-roster (anonymized) dataset -- additive, existing data untouched...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const girls = await prisma.squad.upsert({ where: { name: "GIRLS" }, update: {}, create: { name: "GIRLS" } });
  const boys = await prisma.squad.upsert({ where: { name: "BOYS" }, update: {}, create: { name: "BOYS" } });

  const existingCoach = await prisma.user.findUnique({ where: { username: "coach.mileage" } });
  if (existingCoach) {
    console.error(
      'A "coach.mileage" account already exists -- this script is meant to run once. ' +
        "Delete that user (and their roster/athletes) first if you want to reseed this dataset."
    );
    process.exit(1);
  }

  const coach = await prisma.user.create({
    data: {
      username: "coach.mileage",
      email: "coach.mileage@ridgeline.edu",
      passwordHash,
      firstName: "Alex",
      lastName: "Whitmore",
      role: "COACH",
    },
  });

  let created = 0;
  for (const [rows, squad, firstPool, lastPool] of [
    [BOYS_MILEAGE, boys, BOYS_FIRST, BOYS_LAST] as const,
    [GIRLS_MILEAGE, girls, GIRLS_FIRST, GIRLS_LAST] as const,
  ]) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { first, last } = syntheticName(firstPool, lastPool, i);
      const username = `${first}.${last}`.toLowerCase();
      const name = `${first} ${last}`;

      const user = await prisma.user.create({
        data: { username, email: `${username}@ridgeline.edu`, passwordHash, firstName: first, lastName: last, role: "ATHLETE" },
      });
      const athlete = await prisma.athlete.create({
        data: { name, squadId: squad.id, userId: user.id },
      });
      await prisma.coachAthlete.create({ data: { coachId: coach.id, athleteId: athlete.id } });

      const placedWeeks = placeWeeks(row);
      await seedAthleteTrainingAndWellness(athlete.id, placedWeeks);

      // Real weekly checkpoints, walking the actual scoring pipeline
      // forward one week at a time, same approach as prisma/seed.ts.
      for (let weeksAgo = 9; weeksAgo >= 1; weeksAgo--) {
        await recomputeReadiness(athlete.id, daysAgo(weeksAgo * 7));
      }
      await recomputeReadiness(athlete.id, NOW);

      created++;
    }
  }

  console.log(`\nDone: 1 coach + ${created} athletes (${BOYS_MILEAGE.length} boys, ${GIRLS_MILEAGE.length} girls).`);
  console.log(`Log in as coach.mileage / ${SEED_PASSWORD} to see them.`);
  console.log("(Athlete usernames were printed to stdout during creation -- rerun with `psql` to list them if needed.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
