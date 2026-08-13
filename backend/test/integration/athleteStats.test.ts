import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, daysAgo, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { computeReadinessBreakdown } from "../../src/lib/scoring.js";
import { dayKey } from "../../src/lib/date.js";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/athletes/:id/stats", () => {
  it("403s for a coach the athlete isn't rostered to", async () => {
    const { athlete } = await createAthlete({ username: "ath.stats.private", firstName: "Private", lastName: "Ath", squad: "GIRLS" });
    await createCoach({ username: "coach.notmine.stats", firstName: "Not", lastName: "Mine" });
    const token = await loginAs("coach.notmine.stats");
    const res = await request(app).get(`/api/athletes/${athlete.id}/stats`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("a brand-new athlete with zero sessions gets nulls/zeros, not an error, and phase 'building'", async () => {
    const { athlete } = await createAthlete({ username: "ath.stats.empty", firstName: "Empty", lastName: "Ath", squad: "GIRLS" });
    const coach = await createCoach({ username: "coach.stats.empty", firstName: "Coach", lastName: "Empty" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.stats.empty");

    const res = await request(app).get(`/api/athletes/${athlete.id}/stats`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      totalDistanceMiles: 0,
      avgPaceMinPerMile: null,
      weeklyDistanceMiles: 0,
      sessionCount: 0,
      avgRpe: null,
      avgSleep: null,
      avgEnergy: null,
    });
    expect(res.body.workload).toMatchObject({ daysTracked: 0, phase: "building", acuteReady: false, chronicReady: false });
  });

  it("totals/averages match hand-computed values; a distance-less strength session counts toward sessionCount/avgRpe but not distance/pace", async () => {
    const { athlete } = await createAthlete({ username: "ath.stats.totals", firstName: "Totals", lastName: "Ath", squad: "BOYS" });
    const coach = await createCoach({ username: "coach.stats.totals", firstName: "Coach", lastName: "Totals" });
    await assignRoster(coach.id, athlete.id);

    // Two runs with distance: 5mi/50min (rpe 4) and 3mi/24min (rpe 6) -> total 8mi / 74min -> avg pace 9.25 min/mi.
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "Easy 5mi", distanceMiles: 5, durationMin: 50, rpe: 4, load: 200, date: daysAgo(2) },
    });
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "Tempo 3mi", distanceMiles: 3, durationMin: 24, rpe: 6, load: 144, date: daysAgo(1) },
    });
    // One strength session, no distance -- rpe 8.
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "Strength", distanceMiles: null, durationMin: 45, rpe: 8, load: 360, date: daysAgo(1) },
    });
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, sleep: 6, soreness: 3, mood: 4, energy: 5, motivation: 4, date: daysAgo(2), day: dayKey(daysAgo(2)) },
    });
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, sleep: 8, soreness: 2, mood: 5, energy: 7, motivation: 5, date: daysAgo(1), day: dayKey(daysAgo(1)) },
    });

    const token = await loginAs("coach.stats.totals");
    const res = await request(app).get(`/api/athletes/${athlete.id}/stats`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(res.body.stats.totalDistanceMiles).toBe(8);
    expect(res.body.stats.avgPaceMinPerMile).toBeCloseTo(74 / 8, 5);
    expect(res.body.stats.weeklyDistanceMiles).toBe(8); // both runs within the last 7 days
    expect(res.body.stats.sessionCount).toBe(3); // strength session counts here...
    expect(res.body.stats.avgRpe).toBeCloseTo((4 + 6 + 8) / 3, 5); // ...and here...
    expect(res.body.stats.distanceSeries).toHaveLength(2); // ...but not here (distance/pace series exclude it)
    expect(res.body.stats.paceSeries).toHaveLength(2);
    expect(res.body.stats.avgSleep).toBeCloseTo((6 + 8) / 2, 5);
    expect(res.body.stats.avgEnergy).toBeCloseTo((5 + 7) / 2, 5);
  });

  it("rolls up same-day runs (two-a-days) into one trend point each, with a true weighted pace, not one point per run", async () => {
    const { athlete } = await createAthlete({ username: "ath.stats.twoaday", firstName: "TwoADay", lastName: "Ath", squad: "GIRLS" });
    const coach = await createCoach({ username: "coach.stats.twoaday", firstName: "Coach", lastName: "TwoADay" });
    await assignRoster(coach.id, athlete.id);

    // Same day: an AM shakeout (2mi/20min, rpe 3) and a PM tempo (4mi/32min, rpe 7).
    // Both are still individually there for anyone reading the raw log --
    // only the *trend* should collapse them into a single day.
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "AM shakeout", distanceMiles: 2, durationMin: 20, rpe: 3, load: 60, date: daysAgo(1) },
    });
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "PM tempo", distanceMiles: 4, durationMin: 32, rpe: 7, load: 224, date: daysAgo(1) },
    });
    // A separate, earlier single-run day, to prove distinct days still stay distinct.
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "Easy", distanceMiles: 3, durationMin: 27, rpe: 4, load: 108, date: daysAgo(3) },
    });

    const token = await loginAs("coach.stats.twoaday");
    const res = await request(app).get(`/api/athletes/${athlete.id}/stats`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Raw totals still count every individual run.
    expect(res.body.stats.totalDistanceMiles).toBe(9); // 2 + 4 + 3
    expect(res.body.stats.sessionCount).toBe(3);

    // But the trend has one point per day, not one per run: 2 days, not 3 runs.
    expect(res.body.stats.distanceSeries).toHaveLength(2);
    expect(res.body.stats.paceSeries).toHaveLength(2);
    expect(res.body.stats.rpeSeries).toHaveLength(2);

    const twoADayPoint = res.body.stats.distanceSeries.find((d: { distanceMiles: number }) => d.distanceMiles === 6);
    expect(twoADayPoint).toBeTruthy(); // 2mi + 4mi summed into the one two-a-day point

    const twoADayPace = res.body.stats.paceSeries.find((p: { paceMinPerMile: number }) => Math.abs(p.paceMinPerMile - 52 / 6) < 1e-6);
    expect(twoADayPace).toBeTruthy(); // true weighted pace: (20+32)min / (2+4)mi, not an average of 10 and 8 min/mi

    const twoADayRpe = res.body.stats.rpeSeries.find((r: { rpe: number }) => Math.abs(r.rpe - 5) < 1e-6);
    expect(twoADayRpe).toBeTruthy(); // (3 + 7) / 2
  });

  it("phase is 'complete' once the athlete's oldest data is >= 28 days old, and workload numbers match computeReadinessBreakdown directly", async () => {
    const { athlete } = await createAthlete({ username: "ath.stats.phase", firstName: "Phase", lastName: "Ath", squad: "GIRLS" });
    const coach = await createCoach({ username: "coach.stats.phase", firstName: "Coach", lastName: "Phase" });
    await assignRoster(coach.id, athlete.id);

    for (let i = 30; i >= 0; i -= 3) {
      await prisma.trainingLoad.create({
        data: { athleteId: athlete.id, runType: "Easy", distanceMiles: 4, durationMin: 36, rpe: 4, load: 144, date: daysAgo(i) },
      });
    }

    const token = await loginAs("coach.stats.phase");
    const res = await request(app).get(`/api/athletes/${athlete.id}/stats`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workload.phase).toBe("complete");
    expect(res.body.workload.acuteReady).toBe(true);
    expect(res.body.workload.chronicReady).toBe(true);

    const direct = await computeReadinessBreakdown(athlete.id);
    expect(res.body.workload.acuteLoad).toBeCloseTo(direct.acuteLoad, 5);
    expect(res.body.workload.chronicLoad).toBeCloseTo(direct.chronicLoad, 5);
    expect(res.body.workload.acwr).toBeCloseTo(direct.acwr, 5);
    expect(res.body.workload.risk).toBeCloseTo(direct.risk, 5);
    expect(res.body.workload.status).toBe(direct.status);
  });
});
