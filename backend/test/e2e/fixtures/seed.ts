// Deterministic fixture data for the e2e suite. No randomness anywhere in
// here on purpose -- every e2e test run should see exactly the same
// athletes, history, and (initial) scores, so assertions can rely on
// specific values instead of just "some number came back". Run once per
// e2e suite by test/e2e/globalSetup.ts, against a database that was just
// dropped and recreated from scratch.
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma.js";
import { recomputeReadiness } from "../../../src/lib/scoring.js";
import { E2E_PASSWORD } from "./constants.js";

const NOW = new Date();
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86400000);
}

async function makeAthlete(username: string, first: string, last: string, squadId: string, passwordHash: string) {
  const user = await prisma.user.create({
    data: { username, email: `${username}@e2e.relay`, passwordHash, firstName: first, lastName: last, role: "ATHLETE" },
  });
  const athlete = await prisma.athlete.create({
    data: { name: `${first} ${last}`, squadId, userId: user.id },
  });
  return { user, athlete };
}

async function main() {
  console.log("[e2e seed] Seeding deterministic fixture data...");
  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 4); // low cost factor -- speed, not security, for test data

  const girls = await prisma.squad.upsert({ where: { name: "GIRLS" }, update: {}, create: { name: "GIRLS" } });
  const boys = await prisma.squad.upsert({ where: { name: "BOYS" }, update: {}, create: { name: "BOYS" } });

  const coach1 = await prisma.user.create({
    data: { username: "coach.one", email: "coach.one@e2e.relay", passwordHash, firstName: "Coach", lastName: "One", role: "COACH" },
  });
  const coach2 = await prisma.user.create({
    data: { username: "coach.two", email: "coach.two@e2e.relay", passwordHash, firstName: "Coach", lastName: "Two", role: "COACH" },
  });

  const fresh = await makeAthlete("fresh.athlete", "Fresh", "Athlete", girls.id, passwordHash);
  const struggling = await makeAthlete("struggling.athlete", "Struggling", "Athlete", girls.id, passwordHash);
  const injured = await makeAthlete("injured.athlete", "Injured", "Athlete", girls.id, passwordHash);
  const returning = await makeAthlete("return.athlete", "Return", "Athlete", boys.id, passwordHash);
  const newcomer = await makeAthlete("newcomer.athlete", "Newcomer", "Athlete", boys.id, passwordHash);
  const journey = await makeAthlete("journey.athlete", "Journey", "Athlete", girls.id, passwordHash);
  const isolated = await makeAthlete("isolated.athlete", "Isolated", "Athlete", boys.id, passwordHash);

  await prisma.coachAthlete.createMany({
    data: [
      { coachId: coach1.id, athleteId: fresh.athlete.id },
      { coachId: coach1.id, athleteId: struggling.athlete.id },
      { coachId: coach1.id, athleteId: injured.athlete.id },
      { coachId: coach1.id, athleteId: returning.athlete.id },
      { coachId: coach1.id, athleteId: newcomer.athlete.id },
      { coachId: coach1.id, athleteId: journey.athlete.id },
      { coachId: coach2.id, athleteId: isolated.athlete.id },
    ],
  });

  // fresh.athlete: 21 days of good, slightly-varied wellness + steady easy
  // runs -- past the minimum-history gate, should read as FRESH.
  for (let n = 21; n >= 1; n--) {
    await prisma.wellnessEntry.create({
      data: {
        athleteId: fresh.athlete.id,
        date: daysAgo(n),
        sleep: n % 2 === 0 ? 5 : 4,
        soreness: n % 3 === 0 ? 2 : 1,
        mood: n % 2 === 0 ? 4 : 5,
        energy: n % 4 === 0 ? 4 : 5,
        motivation: n % 2 === 0 ? 5 : 4,
      },
    });
    if (n % 2 === 0) {
      await prisma.trainingLoad.create({
        data: { athleteId: fresh.athlete.id, date: daysAgo(n), runType: "Easy", distanceMiles: 5, durationMin: 45, rpe: 4, load: 180 },
      });
    }
  }

  // struggling.athlete: 21 days of poor, varied wellness + a real mileage
  // spike (heavy tempo work) in the last week -- should read as elevated risk.
  for (let n = 21; n >= 1; n--) {
    await prisma.wellnessEntry.create({
      data: {
        athleteId: struggling.athlete.id,
        date: daysAgo(n),
        sleep: n % 2 === 0 ? 2 : 3,
        soreness: n % 2 === 0 ? 4 : 3,
        mood: n % 2 === 0 ? 2 : 3,
        energy: n % 3 === 0 ? 2 : 3,
        motivation: n % 2 === 0 ? 2 : 3,
      },
    });
    const spiking = n <= 7;
    await prisma.trainingLoad.create({
      data: {
        athleteId: struggling.athlete.id,
        date: daysAgo(n),
        runType: spiking ? "Tempo intervals" : "Easy",
        distanceMiles: 6,
        durationMin: spiking ? 80 : 50,
        rpe: spiking ? 8 : 4,
        load: spiking ? 640 : 200,
      },
    });
  }

  // injured.athlete: 21 days of ordinary history, then an ACTIVE injury
  // that started 3 days ago -- status should read INJURED no matter what
  // the underlying score computes to.
  for (let n = 21; n >= 4; n--) {
    await prisma.wellnessEntry.create({
      data: { athleteId: injured.athlete.id, date: daysAgo(n), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    await prisma.trainingLoad.create({
      data: { athleteId: injured.athlete.id, date: daysAgo(n), runType: "Easy", distanceMiles: 5, durationMin: 45, rpe: 4, load: 180 },
    });
  }
  await prisma.injury.create({
    data: { athleteId: injured.athlete.id, description: "Right shin — suspected tibial stress", status: "ACTIVE", startDate: daysAgo(3) },
  });

  // return.athlete: 21 days of history, an injury from 20 days ago now
  // RECOVERING (open-ended, no endDate) -- status should read
  // RETURN_PROTOCOL, and unlike the ACTIVE case, this data still counts
  // toward the baseline (docs/math-behind-relay.md §9).
  for (let n = 21; n >= 1; n--) {
    await prisma.wellnessEntry.create({
      data: { athleteId: returning.athlete.id, date: daysAgo(n), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    if (n <= 10) {
      await prisma.trainingLoad.create({
        data: {
          athleteId: returning.athlete.id,
          date: daysAgo(n),
          runType: "Easy shakeout",
          distanceMiles: 2,
          durationMin: 20,
          rpe: 3,
          load: 60,
        },
      });
    }
  }
  await prisma.injury.create({
    data: { athleteId: returning.athlete.id, description: "Left hamstring strain", status: "RECOVERING", startDate: daysAgo(20) },
  });

  // newcomer.athlete: only 3 days of history, with numbers that WOULD look
  // alarming if z-scored (a big load, though wellness is fine) -- proves
  // the minimum-history gate holds them at a neutral default instead.
  for (let n = 3; n >= 1; n--) {
    await prisma.wellnessEntry.create({
      data: { athleteId: newcomer.athlete.id, date: daysAgo(n), sleep: 5, soreness: 1, mood: 5, energy: 5, motivation: 5 },
    });
    await prisma.trainingLoad.create({
      data: { athleteId: newcomer.athlete.id, date: daysAgo(n), runType: "Easy", distanceMiles: 8, durationMin: 60, rpe: 5, load: 300 },
    });
  }

  // journey.athlete: reserved exclusively for the athlete-journey e2e test,
  // which submits/deletes real data through the live API -- 21 days of
  // ordinary history so it's past the minimum-history gate and ready to
  // react to whatever that test does next.
  for (let n = 21; n >= 1; n--) {
    await prisma.wellnessEntry.create({
      data: {
        athleteId: journey.athlete.id,
        date: daysAgo(n),
        sleep: n % 2 === 0 ? 4 : 3,
        soreness: n % 2 === 0 ? 2 : 3,
        mood: n % 2 === 0 ? 4 : 3,
        energy: n % 3 === 0 ? 3 : 4,
        motivation: n % 2 === 0 ? 4 : 3,
      },
    });
    if (n % 2 === 0) {
      await prisma.trainingLoad.create({
        data: { athleteId: journey.athlete.id, date: daysAgo(n), runType: "Easy", distanceMiles: 4, durationMin: 38, rpe: 4, load: 152 },
      });
    }
  }

  // isolated.athlete: coach.two's only athlete -- exists purely to prove
  // coach.one can never see them.
  await prisma.wellnessEntry.create({
    data: { athleteId: isolated.athlete.id, date: daysAgo(1), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
  });

  for (const { athlete } of [fresh, struggling, injured, returning, newcomer, journey, isolated]) {
    await recomputeReadiness(athlete.id);
  }

  console.log("[e2e seed] Done: 2 coaches, 7 athletes, all with real computed readiness scores.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
