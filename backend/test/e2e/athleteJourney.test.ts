// Full athlete journey against the fresh, seeded fixture database: log
// in, set gender, submit a check-in, log a run, watch the score react to
// each, then delete the run and confirm it reacts again. Uses
// journey.athlete exclusively -- no other e2e test file touches it, so
// these mutations can't race or interfere with anything else in the suite.
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs, thisWeekQuery } from "./helpers.js";

let token: string;
let athleteId: string;

beforeAll(async () => {
  token = await loginAs("journey.athlete");
});

describe("login and profile", () => {
  it("logs in and reports an athlete role with no gender set yet", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "journey.athlete", password: "E2ETestPass1!" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("ATHLETE");
    expect(res.body.user.gender).toBeNull();
    expect(res.body.user.hasCoach).toBe(true);
    athleteId = res.body.user.athleteId;
    expect(athleteId).toEqual(expect.any(String));
  });

  it("sets gender via PATCH /api/me/gender", async () => {
    const res = await request(app).patch("/api/me/gender").set("Authorization", `Bearer ${token}`).send({ gender: "PREFER_NOT_TO_SAY" });
    expect(res.status).toBe(200);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.gender).toBe("PREFER_NOT_TO_SAY");
  });
});

describe("check-in submit reacts immediately", () => {
  it("has a real seeded score before doing anything", async () => {
    const res = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("submitting a very good check-in moves the score, and it's reflected immediately after", async () => {
    const before = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    const scoreBefore = before.body[before.body.length - 1].score;

    const checkin = await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 5, soreness: 1, mood: 5, energy: 5, motivation: 5 });
    expect(checkin.status).toBe(201);

    const history = await request(app).get(`/api/wellness/athlete/${athleteId}`).set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body[0]).toMatchObject({ sleep: 5, soreness: 1, mood: 5, energy: 5, motivation: 5 });

    const after = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    const latest = after.body[after.body.length - 1];
    expect(latest).toBeTruthy();
    expect(latest.score).not.toBe(scoreBefore);
  });
});

describe("logging and deleting a run both recompute", () => {
  let runId: string;

  it("logging a hard run changes the score", async () => {
    const before = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    const scoreBefore = before.body[before.body.length - 1].score;

    const res = await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Big tempo session", distanceMiles: 10, durationMin: 75, rpe: 9 });
    expect(res.status).toBe(201);
    expect(res.body.load).toBe(675); // 75 * 9
    runId = res.body.id;

    const after = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    const scoreAfter = after.body[after.body.length - 1].score;
    expect(scoreAfter).not.toBe(scoreBefore);
  });

  it("the run shows up in the athlete's own run list", async () => {
    const res = await request(app).get(`/api/training-load/athlete/${athleteId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === runId)).toBe(true);
  });

  it("deleting that run changes the score again", async () => {
    const before = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    const scoreBefore = before.body[before.body.length - 1].score;

    const del = await request(app).delete(`/api/training-load/${runId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/athletes/${athleteId}/readiness-history`).set("Authorization", `Bearer ${token}`);
    const scoreAfter = after.body[after.body.length - 1].score;
    expect(scoreAfter).not.toBe(scoreBefore);

    const runs = await request(app).get(`/api/training-load/athlete/${athleteId}`).set("Authorization", `Bearer ${token}`);
    expect(runs.body.some((r: { id: string }) => r.id === runId)).toBe(false);
  });
});

describe("shows up correctly on the coach's brief", () => {
  it("coach.one's brief includes journey.athlete with a real numeric score", async () => {
    const coachToken = await loginAs("coach.one");
    const res = await request(app).get(`/api/brief?${thisWeekQuery()}`).set("Authorization", `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    const mine = res.body.find((r: { athlete: { id: string } }) => r.athlete.id === athleteId);
    expect(mine).toBeTruthy();
    expect(mine.score).toEqual(expect.any(Number));
  });
});
