import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, daysAgo, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { computeReadinessBreakdown, recomputeReadiness } from "../../src/lib/scoring.js";

beforeEach(async () => {
  await resetDb();
});

async function latestScore(athleteId: string) {
  return prisma.readinessScore.findFirst({ where: { athleteId }, orderBy: [{ year: "desc" }, { week: "desc" }] });
}

describe("POST /api/training-load", () => {
  it("computes load = rpe * durationMin exactly and recomputes readiness", async () => {
    const { athlete } = await createAthlete({ username: "ath.run", firstName: "Ath", lastName: "Run", squad: "BOYS" });
    const token = await loginAs("ath.run");

    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy 5mi", distanceMiles: 5, durationMin: 50, rpe: 4 });

    expect(res.status).toBe(201);
    expect(res.body.load).toBe(200); // 50 * 4, docs/math-behind-relay.md §1

    const score = await latestScore(athlete.id);
    expect(score).not.toBeNull();
  });

  it("rounds distanceMiles to 2 decimal places server-side", async () => {
    await createAthlete({ username: "ath.round", firstName: "Ath", lastName: "Round", squad: "BOYS" });
    const token = await loginAs("ath.round");
    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy", distanceMiles: 5.6789, durationMin: 40, rpe: 3 });
    expect(res.status).toBe(201);
    expect(res.body.distanceMiles).toBe(5.68);
  });

  it("rejects a coach trying to log a run (athlete-only route)", async () => {
    await createCoach({ username: "coach.norun", firstName: "Coach", lastName: "NoRun" });
    const token = await loginAs("coach.norun");
    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy", durationMin: 30, rpe: 4 });
    expect(res.status).toBe(403);
  });

  it("rejects an RPE outside 1-10 with 400", async () => {
    await createAthlete({ username: "ath.badrpe", firstName: "Ath", lastName: "BadRpe", squad: "BOYS" });
    const token = await loginAs("ath.badrpe");
    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy", durationMin: 30, rpe: 15 });
    expect(res.status).toBe(400);
  });

  it("accepts a backdated day, storing the run under that day (not today) and still recomputing", async () => {
    const { athlete } = await createAthlete({ username: "ath.runbackdate", firstName: "Ath", lastName: "RunBackdate", squad: "BOYS" });
    const token = await loginAs("ath.runbackdate");
    const dayStr = daysAgo(4).toISOString().slice(0, 10);

    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy 5mi", distanceMiles: 5, durationMin: 50, rpe: 4, day: dayStr });
    expect(res.status).toBe(201);
    expect(new Date(res.body.date).toISOString().slice(0, 10)).toBe(dayStr);

    const score = await latestScore(athlete.id);
    expect(score).not.toBeNull();
  });

  it("allows more than one backdated run on the same past day -- no per-day uniqueness for runs", async () => {
    await createAthlete({ username: "ath.runbackdatetwice", firstName: "Ath", lastName: "RunBackdateTwice", squad: "BOYS" });
    const token = await loginAs("ath.runbackdatetwice");
    const dayStr = daysAgo(2).toISOString().slice(0, 10);

    const first = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "AM shakeout", durationMin: 20, rpe: 2, day: dayStr });
    const second = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "PM workout", durationMin: 45, rpe: 7, day: dayStr });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("rejects a future day", async () => {
    await createAthlete({ username: "ath.runfuture", firstName: "Ath", lastName: "RunFuture", squad: "BOYS" });
    const token = await loginAs("ath.runfuture");
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy", durationMin: 30, rpe: 4, day: tomorrow });
    expect(res.status).toBe(400);
  });

  it("rejects a day further back than the allowed catch-up window", async () => {
    await createAthlete({ username: "ath.runtoolold", firstName: "Ath", lastName: "RunTooOld", squad: "BOYS" });
    const token = await loginAs("ath.runtoolold");
    const tooLongAgo = daysAgo(30).toISOString().slice(0, 10);
    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy", durationMin: 30, rpe: 4, day: tooLongAgo });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/training-load/:id", () => {
  it("lets an athlete delete their own run and recomputes readiness", async () => {
    const { athlete } = await createAthlete({ username: "ath.delrun", firstName: "Ath", lastName: "DelRun", squad: "BOYS" });
    const token = await loginAs("ath.delrun");

    // Give enough history to clear the minimum-history gate, with a heavy
    // recent load spike, then record the baseline score with that run in place.
    await prisma.trainingLoad.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        athleteId: athlete.id,
        date: daysAgo(i + 2),
        runType: "Easy",
        distanceMiles: 5,
        durationMin: 40,
        rpe: 4,
        load: 160,
      })),
    });
    const create = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Huge long run", distanceMiles: 20, durationMin: 180, rpe: 9 });
    expect(create.status).toBe(201);
    const runId = create.body.id as string;

    // Assert on the continuous breakdown (ACWR/z_load/readiness), not the
    // rounded, persisted integer score -- a real but small swing can
    // legitimately round to the same integer both times, which would make
    // an "expect(after.score).not.toBe(before.score)" check flaky without
    // this actually being a bug.
    const before = await computeReadinessBreakdown(athlete.id);
    expect(before.acwr).toBeGreaterThan(1); // the huge run is pulling load above adapted level

    const del = await request(app).delete(`/api/training-load/${runId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const after = await computeReadinessBreakdown(athlete.id);
    // Removing a huge recent session should lower the acute load and
    // therefore the ACWR/z_load/readiness -- proving delete recomputes
    // just like create does, not just returns 204.
    expect(after.acwr).toBeLessThan(before.acwr);
    expect(after.readiness).toBeGreaterThan(before.readiness);

    const stillThere = await prisma.trainingLoad.findUnique({ where: { id: runId } });
    expect(stillThere).toBeNull();

    // And the actual persisted ReadinessScore row was updated too, not
    // just the in-memory breakdown -- confirms recomputeReadiness (the
    // route's real code path) is what ran, not a stale row.
    const stored = await latestScore(athlete.id);
    expect(stored!.score).toBe(Math.round(after.readiness));
  });

  it("returns 404 for a run id that doesn't exist", async () => {
    await createAthlete({ username: "ath.del404", firstName: "Ath", lastName: "Del404", squad: "BOYS" });
    const token = await loginAs("ath.del404");
    const res = await request(app).delete("/api/training-load/does-not-exist").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("blocks an athlete from deleting someone else's run", async () => {
    const { athlete: victim } = await createAthlete({ username: "ath.victim", firstName: "Ath", lastName: "Victim", squad: "BOYS" });
    await createAthlete({ username: "ath.attacker", firstName: "Ath", lastName: "Attacker", squad: "BOYS" });
    const run = await prisma.trainingLoad.create({
      data: { athleteId: victim.id, runType: "Easy", durationMin: 30, rpe: 4, load: 120 },
    });
    const token = await loginAs("ath.attacker");
    const res = await request(app).delete(`/api/training-load/${run.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(await prisma.trainingLoad.findUnique({ where: { id: run.id } })).not.toBeNull();
  });
});

describe("GET /api/training-load/athlete/:athleteId", () => {
  it("blocks a coach not on the athlete's roster", async () => {
    await createCoach({ username: "coach.norosterrun", firstName: "Coach", lastName: "NoRosterRun" });
    const { athlete } = await createAthlete({ username: "ath.private", firstName: "Ath", lastName: "Private", squad: "BOYS" });
    const token = await loginAs("coach.norosterrun");
    const res = await request(app).get(`/api/training-load/athlete/${athlete.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows a roster coach to read the athlete's runs", async () => {
    const coach = await createCoach({ username: "coach.rosterrun", firstName: "Coach", lastName: "RosterRun" });
    const { athlete } = await createAthlete({ username: "ath.rosteredrun", firstName: "Ath", lastName: "RosteredRun", squad: "BOYS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.rosterrun");
    const res = await request(app).get(`/api/training-load/athlete/${athlete.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
