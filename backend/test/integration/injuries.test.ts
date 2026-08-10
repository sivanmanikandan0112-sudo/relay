import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function latestScore(athleteId: string) {
  return prisma.readinessScore.findFirst({ where: { athleteId }, orderBy: [{ year: "desc" }, { week: "desc" }] });
}

describe("POST /api/injuries", () => {
  it("lets a coach log an injury for their own roster athlete and overrides status to INJURED", async () => {
    const coach = await createCoach({ username: "coach.injury", firstName: "Coach", lastName: "Injury" });
    const { athlete } = await createAthlete({ username: "ath.injury", firstName: "Ath", lastName: "Injury", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.injury");

    const res = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${token}`)
      .send({ athleteId: athlete.id, description: "Right shin — suspected tibial stress" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ACTIVE");

    const score = await latestScore(athlete.id);
    expect(score!.status).toBe("INJURED");
  });

  it("blocks a coach from logging an injury for an athlete NOT on their roster", async () => {
    await createCoach({ username: "coach.notheirs", firstName: "Coach", lastName: "NotTheirs" });
    const { athlete } = await createAthlete({ username: "ath.notrostered", firstName: "Ath", lastName: "NotRostered", squad: "GIRLS" });
    const token = await loginAs("coach.notheirs");
    const res = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${token}`)
      .send({ athleteId: athlete.id, description: "Shouldn't be allowed" });
    expect(res.status).toBe(403);
    expect(await prisma.injury.count({ where: { athleteId: athlete.id } })).toBe(0);
  });

  it("rejects an athlete trying to log an injury (coach-only route)", async () => {
    const { athlete } = await createAthlete({ username: "ath.selfinjure", firstName: "Ath", lastName: "SelfInjure", squad: "GIRLS" });
    const token = await loginAs("ath.selfinjure");
    const res = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${token}`)
      .send({ athleteId: athlete.id, description: "Nope" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/injuries/:id", () => {
  it("moving to RECOVERING overrides status to RETURN_PROTOCOL", async () => {
    const coach = await createCoach({ username: "coach.recover", firstName: "Coach", lastName: "Recover" });
    const { athlete } = await createAthlete({ username: "ath.recover", firstName: "Ath", lastName: "Recover", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.recover");

    const created = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${token}`)
      .send({ athleteId: athlete.id, description: "Hamstring strain" });
    const injuryId = created.body.id as string;

    const patched = await request(app)
      .patch(`/api/injuries/${injuryId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RECOVERING" });
    expect(patched.status).toBe(200);
    expect(patched.body.endDate).toBeNull();

    const score = await latestScore(athlete.id);
    expect(score!.status).toBe("RETURN_PROTOCOL");
  });

  it("moving to RESOLVED sets endDate and returns status to the real score-driven band", async () => {
    const coach = await createCoach({ username: "coach.resolve", firstName: "Coach", lastName: "Resolve" });
    const { athlete } = await createAthlete({ username: "ath.resolve", firstName: "Ath", lastName: "Resolve", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.resolve");

    const created = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${token}`)
      .send({ athleteId: athlete.id, description: "Ankle sprain" });
    const injuryId = created.body.id as string;
    expect((await latestScore(athlete.id))!.status).toBe("INJURED");

    const patched = await request(app)
      .patch(`/api/injuries/${injuryId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RESOLVED" });
    expect(patched.status).toBe(200);
    expect(patched.body.endDate).not.toBeNull();

    const score = await latestScore(athlete.id);
    expect(score!.status).not.toBe("INJURED");
    expect(["FRESH", "EASE_BACK", "BACK_OFF"]).toContain(score!.status);
  });

  it("blocks a coach from updating an injury belonging to another coach's athlete", async () => {
    const ownerCoach = await createCoach({ username: "coach.owner", firstName: "Coach", lastName: "Owner" });
    await createCoach({ username: "coach.intruder", firstName: "Coach", lastName: "Intruder" });
    const { athlete } = await createAthlete({ username: "ath.guarded", firstName: "Ath", lastName: "Guarded", squad: "GIRLS" });
    await assignRoster(ownerCoach.id, athlete.id);
    const ownerToken = await loginAs("coach.owner");

    const created = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ athleteId: athlete.id, description: "Owner's injury" });

    const intruderToken = await loginAs("coach.intruder");
    const res = await request(app)
      .patch(`/api/injuries/${created.body.id}`)
      .set("Authorization", `Bearer ${intruderToken}`)
      .send({ status: "RESOLVED" });
    expect(res.status).toBe(404); // scoped lookup, so it reads as "not found" rather than 403
  });
});

describe("GET /api/injuries", () => {
  it("only returns injuries for the coach's own roster", async () => {
    const coachA = await createCoach({ username: "coach.a", firstName: "Coach", lastName: "A" });
    const coachB = await createCoach({ username: "coach.b", firstName: "Coach", lastName: "B" });
    const { athlete: athleteA } = await createAthlete({ username: "ath.a", firstName: "Ath", lastName: "A", squad: "GIRLS" });
    const { athlete: athleteB } = await createAthlete({ username: "ath.b", firstName: "Ath", lastName: "B", squad: "GIRLS" });
    await assignRoster(coachA.id, athleteA.id);
    await assignRoster(coachB.id, athleteB.id);

    const tokenA = await loginAs("coach.a");
    await request(app).post("/api/injuries").set("Authorization", `Bearer ${tokenA}`).send({ athleteId: athleteA.id, description: "A's injury" });
    const tokenB = await loginAs("coach.b");
    await request(app).post("/api/injuries").set("Authorization", `Bearer ${tokenB}`).send({ athleteId: athleteB.id, description: "B's injury" });

    const res = await request(app).get("/api/injuries").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athlete.id).toBe(athleteA.id);
  });
});
