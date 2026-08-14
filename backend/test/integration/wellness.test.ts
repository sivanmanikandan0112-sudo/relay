import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, daysAgo, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { computeReadinessBreakdown, recomputeReadiness } from "../../src/lib/scoring.js";
import { dayKey } from "../../src/lib/date.js";

beforeEach(async () => {
  await resetDb();
});

async function latestScore(athleteId: string) {
  return prisma.readinessScore.findFirst({ where: { athleteId }, orderBy: [{ year: "desc" }, { week: "desc" }] });
}

describe("POST /api/wellness", () => {
  it("lets an athlete submit their own check-in and recomputes readiness", async () => {
    const { athlete } = await createAthlete({ username: "ath.checkin", firstName: "Ath", lastName: "Checkin", squad: "GIRLS" });
    const token = await loginAs("ath.checkin");

    expect(await latestScore(athlete.id)).toBeNull(); // nothing yet

    const res = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });

    expect(res.status).toBe(201);
    expect(res.body.athleteId).toBe(athlete.id);

    // Recompute fired synchronously as part of the request -- a
    // ReadinessScore row should already exist by the time the response
    // comes back, with a valid score/status shape.
    const score = await latestScore(athlete.id);
    expect(score).not.toBeNull();
    expect(score!.score).toBeGreaterThanOrEqual(0);
    expect(score!.score).toBeLessThanOrEqual(100);
    expect(["FRESH", "EASE_BACK", "BACK_OFF", "RETURN_PROTOCOL", "INJURED"]).toContain(score!.status);
  });

  it("snapshots daysOfHistory on the stored score, and it flows through the API", async () => {
    const { athlete } = await createAthlete({ username: "ath.checkin.days", firstName: "Ath", lastName: "Days", squad: "GIRLS" });
    const coach = await createCoach({ username: "coach.checkin.days", firstName: "Coach", lastName: "Days" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("ath.checkin.days");

    // 20 days of backdated history, then a real submission today -- daysOfHistory should
    // reflect the real span from the oldest entry through today, same as the pipeline itself.
    for (let n = 20; n >= 1; n--) {
      await prisma.wellnessEntry.create({
        data: { athleteId: athlete.id, date: daysAgo(n), day: dayKey(daysAgo(n)), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
      });
    }
    await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });

    const breakdown = await computeReadinessBreakdown(athlete.id);
    const stored = await latestScore(athlete.id);
    expect(stored!.daysOfHistory).toBe(Math.floor(breakdown.daysOfHistory));
    expect(stored!.daysOfHistory).toBeGreaterThanOrEqual(20);

    // The stored snapshot flows straight through the API -- no route-specific
    // logic needed, it's just another column on the same ReadinessScore row.
    const coachToken = await loginAs("coach.checkin.days");
    const history = await request(app)
      .get(`/api/athletes/${athlete.id}/readiness-history`)
      .set("Authorization", `Bearer ${coachToken}`);
    expect(history.status).toBe(200);
    expect(history.body[history.body.length - 1].daysOfHistory).toBe(stored!.daysOfHistory);
  });

  it("a same-day resubmit overwrites today's entry instead of adding another one", async () => {
    const { athlete } = await createAthlete({ username: "ath.checkin.twice", firstName: "Ath", lastName: "Twice", squad: "GIRLS" });
    const token = await loginAs("ath.checkin.twice");

    const first = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 3, soreness: 3, mood: 3, energy: 3, motivation: 3 });
    expect(first.status).toBe(201); // brand new day -> created

    const second = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 5, soreness: 1, mood: 5, energy: 5, motivation: 5, msg: "actually feeling great now" });
    expect(second.status).toBe(200); // same day -> updated, not created
    expect(second.body.id).toBe(first.body.id); // literally the same row

    // Only one row on file for today, and it reflects the *second*
    // submission -- not two rows, and not the first (now-stale) answer.
    const all = await prisma.wellnessEntry.findMany({ where: { athleteId: athlete.id } });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ sleep: 5, soreness: 1, mood: 5, energy: 5, motivation: 5, msg: "actually feeling great now" });

    // The coach-facing list (and anything built from it) sees exactly one entry for today.
    const history = await request(app).get(`/api/wellness/athlete/${athlete.id}`).set("Authorization", `Bearer ${token}`);
    expect(history.body).toHaveLength(1);
  });

  it("doesn't collide across different athletes on the same day, or across different days for the same athlete", async () => {
    const { athlete: athleteA } = await createAthlete({ username: "ath.day.a", firstName: "A", lastName: "Ath", squad: "GIRLS" });
    const { athlete: athleteB } = await createAthlete({ username: "ath.day.b", firstName: "B", lastName: "Ath", squad: "GIRLS" });
    const tokenA = await loginAs("ath.day.a");
    const tokenB = await loginAs("ath.day.b");

    await request(app).post("/api/wellness").set("Authorization", `Bearer ${tokenA}`).send({ sleep: 3, soreness: 3, mood: 3, energy: 3, motivation: 3 });
    const bRes = await request(app).post("/api/wellness").set("Authorization", `Bearer ${tokenB}`).send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    expect(bRes.status).toBe(201); // a different athlete's same-day submission is unrelated, still a create

    // Backdate athlete A's yesterday manually, then submit "today" for real -- two distinct days, two rows.
    await prisma.wellnessEntry.create({
      data: { athleteId: athleteA.id, date: daysAgo(1), day: dayKey(daysAgo(1)), sleep: 2, soreness: 4, mood: 2, energy: 2, motivation: 2 },
    });
    const all = await prisma.wellnessEntry.findMany({ where: { athleteId: athleteA.id } });
    expect(all).toHaveLength(2); // yesterday's backdated row + today's real submission, untouched by each other
  });

  it("rejects an out-of-range rating with 400", async () => {
    await createAthlete({ username: "ath.badinput", firstName: "Ath", lastName: "Bad", squad: "GIRLS" });
    const token = await loginAs("ath.badinput");
    const res = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 9, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    expect(res.status).toBe(400);
  });

  it("rejects a coach trying to submit a check-in (athlete-only route)", async () => {
    await createCoach({ username: "coach.nowellness", firstName: "Coach", lastName: "No" });
    const token = await loginAs("coach.nowellness");
    const res = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    expect(res.status).toBe(403);
  });

  it("actually changes the stored score end-to-end, not just returns 201", async () => {
    const { athlete } = await createAthlete({ username: "ath.reacts", firstName: "Ath", lastName: "Reacts", squad: "GIRLS" });
    const token = await loginAs("ath.reacts");

    // Give the athlete enough history to clear the 14-day minimum-history
    // gate (docs/math-behind-relay.md §9), with generally strong wellness
    // that still has *some* natural day-to-day variance -- an all-identical
    // baseline has sigma=0, which zScore correctly reads as "no measurable
    // deviation" no matter what comes next, and wouldn't exercise the
    // z-score math this test is actually trying to check.
    const strongDays = Array.from({ length: 20 }, (_, i) => i + 1);
    await prisma.wellnessEntry.createMany({
      data: strongDays.map((n) => ({
        athleteId: athlete.id,
        date: daysAgo(n),
        day: dayKey(daysAgo(n)),
        sleep: n % 2 === 0 ? 5 : 4,
        soreness: n % 3 === 0 ? 2 : 1,
        mood: n % 2 === 0 ? 4 : 5,
        energy: n % 4 === 0 ? 4 : 5,
        motivation: n % 2 === 0 ? 5 : 4,
      })),
    });
    await recomputeReadiness(athlete.id);
    const before = await latestScore(athlete.id);
    expect(before).not.toBeNull();

    // Now submit the worst possible check-in through the real HTTP route.
    const res = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 1, soreness: 5, mood: 1, energy: 1, motivation: 1 });
    expect(res.status).toBe(201);

    const after = await latestScore(athlete.id);
    expect(after!.score).toBeLessThan(before!.score);
  });
});

describe("GET /api/wellness/athlete/:athleteId", () => {
  it("lets an athlete read their own wellness history", async () => {
    const { athlete } = await createAthlete({ username: "ath.self", firstName: "Ath", lastName: "Self", squad: "GIRLS" });
    const token = await loginAs("ath.self");
    const res = await request(app).get(`/api/wellness/athlete/${athlete.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("blocks an athlete from reading a different athlete's wellness history", async () => {
    const { athlete: other } = await createAthlete({ username: "ath.other", firstName: "Ath", lastName: "Other", squad: "GIRLS" });
    await createAthlete({ username: "ath.self2", firstName: "Ath", lastName: "Self2", squad: "GIRLS" });
    const token = await loginAs("ath.self2");
    const res = await request(app).get(`/api/wellness/athlete/${other.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("lets a roster coach read their athlete's wellness history", async () => {
    const coach = await createCoach({ username: "coach.roster", firstName: "Coach", lastName: "Roster" });
    const { athlete } = await createAthlete({ username: "ath.rostered", firstName: "Ath", lastName: "Rostered", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.roster");
    const res = await request(app).get(`/api/wellness/athlete/${athlete.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("blocks a coach from reading an athlete NOT on their roster", async () => {
    await createCoach({ username: "coach.norosternp", firstName: "Coach", lastName: "NoRoster" });
    const { athlete } = await createAthlete({ username: "ath.unrostered", firstName: "Ath", lastName: "Unrostered", squad: "GIRLS" });
    const token = await loginAs("coach.norosternp");
    const res = await request(app).get(`/api/wellness/athlete/${athlete.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
