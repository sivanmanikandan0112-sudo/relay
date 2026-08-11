import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, assignSchool, createAthlete, createCoach, ensureSchool, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function makeSuperAdmin(username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
}

describe("requireSuperAdmin gate", () => {
  it("403s a regular coach on every /api/admin/* route", async () => {
    await createCoach({ username: "coach.regular", firstName: "Regular", lastName: "Coach" });
    const token = await loginAs("coach.regular");
    for (const path of ["/api/admin/overview", "/api/admin/coaches", "/api/admin/schools"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("401s an unauthenticated request", async () => {
    const res = await request(app).get("/api/admin/overview");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/overview", () => {
  it("returns system-wide counts", async () => {
    await createCoach({ username: "coach.admin1", firstName: "Admin", lastName: "One" });
    await makeSuperAdmin("coach.admin1");
    const school = await ensureSchool("Overview High");
    const solo = await createCoach({ username: "coach.overviewsolo", firstName: "Solo", lastName: "Overview" });
    const affiliated = await createCoach({ username: "coach.overviewaff", firstName: "Aff", lastName: "Overview" });
    await assignSchool(affiliated.id, school.id);
    await createAthlete({ username: "ath.overview", firstName: "Ath", lastName: "Overview", squad: "GIRLS" });

    const token = await loginAs("coach.admin1");
    const res = await request(app).get("/api/admin/overview").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.schoolCount).toBe(1);
    expect(res.body.athleteCount).toBe(1);
    expect(res.body.coachCount).toBeGreaterThanOrEqual(3); // admin1 + solo + affiliated
    expect(solo).toBeTruthy();
  });
});

describe("GET /api/admin/coaches/:id", () => {
  it("includes the coach's school and their visible (school-shared) athletes", async () => {
    await createCoach({ username: "coach.admin2", firstName: "Admin", lastName: "Two" });
    await makeSuperAdmin("coach.admin2");
    const school = await ensureSchool("Coach Detail High");
    const coachA = await createCoach({ username: "coach.detail.a", firstName: "A", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.detail.b", firstName: "B", lastName: "Coach" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);
    const { athlete } = await createAthlete({ username: "ath.detail", firstName: "Ath", lastName: "Detail", squad: "BOYS" });
    await assignRoster(coachA.id, athlete.id);

    const token = await loginAs("coach.admin2");
    const res = await request(app).get(`/api/admin/coaches/${coachB.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.schoolName).toBe("Coach Detail High");
    expect(res.body.athletes.map((a: { id: string }) => a.id)).toContain(athlete.id); // B sees A's athlete via the school
  });
});

describe("GET /api/admin/schools/:id", () => {
  it("shared roster matches getSchoolAthleteIds", async () => {
    const { getSchoolAthleteIds } = await import("../../src/lib/authz.js");
    await createCoach({ username: "coach.admin3", firstName: "Admin", lastName: "Three" });
    await makeSuperAdmin("coach.admin3");
    const school = await ensureSchool("School Detail High");
    const coach = await createCoach({ username: "coach.schooldetail", firstName: "School", lastName: "Detail" });
    await assignSchool(coach.id, school.id);
    const { athlete } = await createAthlete({ username: "ath.schooldetail", firstName: "Ath", lastName: "SchoolDetail", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);

    const token = await loginAs("coach.admin3");
    const res = await request(app).get(`/api/admin/schools/${school.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.athleteCount).toBe((await getSchoolAthleteIds(school.id)).length);
    expect(res.body.coaches).toHaveLength(1);
  });
});
