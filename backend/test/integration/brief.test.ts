import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function latestScore(athleteId: string) {
  return prisma.readinessScore.findFirstOrThrow({ where: { athleteId }, orderBy: [{ year: "desc" }, { week: "desc" }] });
}

describe("PATCH /api/brief/:id/talked-to", () => {
  it("sets talkedToAt, and the same PATCH with talked:false clears it back to null", async () => {
    const coach = await createCoach({ username: "coach.talked.set", firstName: "Talked", lastName: "Coach" });
    const { athlete, user } = await createAthlete({ username: "ath.talked.set", firstName: "Ath", lastName: "Talked", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const athleteToken = await loginAs("ath.talked.set");
    await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${athleteToken}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    const score = await latestScore(athlete.id);
    expect(score.talkedToAt).toBeNull();

    const coachToken = await loginAs("coach.talked.set");
    const res = await request(app)
      .patch(`/api/brief/${score.id}/talked-to`)
      .set("Authorization", `Bearer ${coachToken}`)
      .send({ talked: true });
    expect(res.status).toBe(200);
    expect(res.body.talkedToAt).not.toBeNull();
    expect(await prisma.readinessScore.findUniqueOrThrow({ where: { id: score.id } }).then((s) => s.talkedToAt)).not.toBeNull();

    const cleared = await request(app)
      .patch(`/api/brief/${score.id}/talked-to`)
      .set("Authorization", `Bearer ${coachToken}`)
      .send({ talked: false });
    expect(cleared.status).toBe(200);
    expect(cleared.body.talkedToAt).toBeNull();
    expect(user).toBeTruthy();
  });

  it("404s for a coach who isn't on that athlete's roster", async () => {
    const owner = await createCoach({ username: "coach.talked.owner", firstName: "Owner", lastName: "Coach" });
    await createCoach({ username: "coach.talked.outsider", firstName: "Outsider", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.talked.outsider", firstName: "Ath", lastName: "Outsider", squad: "GIRLS" });
    await assignRoster(owner.id, athlete.id);
    const athleteToken = await loginAs("ath.talked.outsider");
    await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${athleteToken}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    const score = await latestScore(athlete.id);

    const outsiderToken = await loginAs("coach.talked.outsider");
    const res = await request(app)
      .patch(`/api/brief/${score.id}/talked-to`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ talked: true });
    expect(res.status).toBe(404);
    expect(await prisma.readinessScore.findUniqueOrThrow({ where: { id: score.id } }).then((s) => s.talkedToAt)).toBeNull();
  });

  it("404s for a nonexistent readiness score id", async () => {
    await createCoach({ username: "coach.talked.missing", firstName: "Missing", lastName: "Coach" });
    const token = await loginAs("coach.talked.missing");

    const res = await request(app)
      .patch("/api/brief/nonexistent-id/talked-to")
      .set("Authorization", `Bearer ${token}`)
      .send({ talked: true });
    expect(res.status).toBe(404);
  });

  it("400s on a missing/invalid body", async () => {
    const coach = await createCoach({ username: "coach.talked.badbody", firstName: "Bad", lastName: "Body" });
    const { athlete } = await createAthlete({ username: "ath.talked.badbody", firstName: "Ath", lastName: "BadBody", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const athleteToken = await loginAs("ath.talked.badbody");
    await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${athleteToken}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    const score = await latestScore(athlete.id);

    const token = await loginAs("coach.talked.badbody");
    const res = await request(app)
      .patch(`/api/brief/${score.id}/talked-to`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("GET /api/brief includes talkedToAt on each row", async () => {
    const coach = await createCoach({ username: "coach.talked.list", firstName: "List", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.talked.list", firstName: "Ath", lastName: "List", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const athleteToken = await loginAs("ath.talked.list");
    await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${athleteToken}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    const score = await latestScore(athlete.id);
    const coachToken = await loginAs("coach.talked.list");
    await request(app)
      .patch(`/api/brief/${score.id}/talked-to`)
      .set("Authorization", `Bearer ${coachToken}`)
      .send({ talked: true });

    const res = await request(app)
      .get(`/api/brief?week=${score.week}&year=${score.year}`)
      .set("Authorization", `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { id: string }) => r.id === score.id);
    expect(row.talkedToAt).not.toBeNull();
  });
});
