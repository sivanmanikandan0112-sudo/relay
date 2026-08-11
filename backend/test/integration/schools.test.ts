import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignSchool, createAthlete, createCoach, ensureSchool, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/schools", () => {
  it("creates a school and sets the caller's own schoolId", async () => {
    await createCoach({ username: "coach.founder", firstName: "Founder", lastName: "Coach" });
    const token = await loginAs("coach.founder");

    const res = await request(app)
      .post("/api/schools")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Flower Mound High School", location: "Flower Mound, TX" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Flower Mound High School");

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.schoolId).toBe(res.body.id);
    expect(me.body.schoolName).toBe("Flower Mound High School");
  });

  it("case-insensitive name collision -> 409, does not silently join the existing school", async () => {
    await ensureSchool("Flower Mound High School");
    await createCoach({ username: "coach.duplicate", firstName: "Dup", lastName: "Coach" });
    const token = await loginAs("coach.duplicate");

    const res = await request(app)
      .post("/api/schools")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "flower mound high school" }); // different case, same normalized key
    expect(res.status).toBe(409);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.schoolId).toBeNull(); // not silently joined
  });

  it("a same-tick concurrent create race still only produces one school (DB-level uniqueness, not just a pre-check)", async () => {
    const coachA = await createCoach({ username: "coach.race.a", firstName: "A", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.race.b", firstName: "B", lastName: "Coach" });
    const tokenA = await loginAs("coach.race.a");
    const tokenB = await loginAs("coach.race.b");

    const [resA, resB] = await Promise.all([
      request(app).post("/api/schools").set("Authorization", `Bearer ${tokenA}`).send({ name: "Race High School" }),
      request(app).post("/api/schools").set("Authorization", `Bearer ${tokenB}`).send({ name: "Race High School" }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.school.count({ where: { nameKey: "race high school" } })).toBe(1);
  });

  it("400s if the caller already belongs to a school", async () => {
    const school = await ensureSchool("Existing School");
    const coach = await createCoach({ username: "coach.already", firstName: "Already", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.already");

    const res = await request(app).post("/api/schools").set("Authorization", `Bearer ${token}`).send({ name: "Another School" });
    expect(res.status).toBe(400);
  });

  it("403s for an athlete", async () => {
    await createAthlete({ username: "ath.notcoach2", firstName: "Not", lastName: "Coach", squad: "GIRLS" });
    const token = await loginAs("ath.notcoach2");
    const res = await request(app).post("/api/schools").set("Authorization", `Bearer ${token}`).send({ name: "Nope" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/schools/mine", () => {
  it("returns null for a solo coach", async () => {
    await createCoach({ username: "coach.solo2", firstName: "Solo", lastName: "Coach" });
    const token = await loginAs("coach.solo2");
    const res = await request(app).get("/api/schools/mine").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.school).toBeNull();
  });

  it("returns the school + member coaches + shared athlete count for an affiliated coach", async () => {
    const school = await ensureSchool("Marcus High School");
    const coachA = await createCoach({ username: "coach.mine.a", firstName: "A", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.mine.b", firstName: "B", lastName: "Coach" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);
    const token = await loginAs("coach.mine.a");

    const res = await request(app).get("/api/schools/mine").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.school.name).toBe("Marcus High School");
    expect(res.body.school.coaches).toHaveLength(2);
    expect(res.body.school.athleteCount).toBe(0);
  });
});

describe("GET /api/schools/:id", () => {
  it("403s for a coach who isn't a member of that school", async () => {
    const school = await ensureSchool("Members Only High");
    await createCoach({ username: "coach.outsider", firstName: "Out", lastName: "Sider" });
    const token = await loginAs("coach.outsider");

    const res = await request(app).get(`/api/schools/${school.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
