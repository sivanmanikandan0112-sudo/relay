import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, assignSchool, createAthlete, createCoach, daysAgo, ensureSchool, resetDb } from "../testDb.js";
import { localDayKey } from "../../src/lib/date.js";
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
    for (const path of [
      "/api/admin/overview",
      "/api/admin/coaches",
      "/api/admin/schools",
      "/api/admin/users",
      "/api/admin/activity/checkins",
      "/api/admin/activity/runs",
      "/api/admin/activity/coach-logins",
    ]) {
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

describe("GET /api/admin/overview -- today's check-in rate", () => {
  it("null (not 0 or NaN) when there are no rostered athletes yet", async () => {
    await createCoach({ username: "coach.rate.empty", firstName: "Rate", lastName: "Empty" });
    await makeSuperAdmin("coach.rate.empty");
    const token = await loginAs("coach.rate.empty");

    const res = await request(app).get("/api/admin/overview").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.activeAthleteCount).toBe(0);
    expect(res.body.checkedInToday).toBe(0);
    expect(res.body.checkinRate).toBeNull();
  });

  it("computes checkedInToday / activeAthleteCount for a realistic mixed day", async () => {
    await createCoach({ username: "coach.rate.mixed", firstName: "Rate", lastName: "Mixed" });
    await makeSuperAdmin("coach.rate.mixed");
    const coach = await createCoach({ username: "coach.rate.mixed2", firstName: "Roster", lastName: "Owner" });

    const { athlete: a1 } = await createAthlete({ username: "ath.rate.a1", firstName: "A1", lastName: "Rate", squad: "GIRLS" });
    const { athlete: a2 } = await createAthlete({ username: "ath.rate.a2", firstName: "A2", lastName: "Rate", squad: "GIRLS" });
    const { athlete: a3 } = await createAthlete({ username: "ath.rate.a3", firstName: "A3", lastName: "Rate", squad: "BOYS" });
    const { athlete: a4 } = await createAthlete({ username: "ath.rate.a4", firstName: "A4", lastName: "Rate", squad: "BOYS" });
    for (const a of [a1, a2, a3, a4]) await assignRoster(coach.id, a.id);

    // Only 2 of the 4 rostered athletes check in today.
    await prisma.wellnessEntry.create({
      data: { athleteId: a1.id, day: localDayKey(new Date()), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    await prisma.wellnessEntry.create({
      data: { athleteId: a2.id, day: localDayKey(new Date()), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    // a3 checked in YESTERDAY, not today -- shouldn't count.
    await prisma.wellnessEntry.create({
      data: { athleteId: a3.id, day: localDayKey(daysAgo(1)), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });

    const token = await loginAs("coach.rate.mixed");
    const res = await request(app).get("/api/admin/overview").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.activeAthleteCount).toBe(4);
    expect(res.body.checkedInToday).toBe(2);
    expect(res.body.checkinRate).toBeCloseTo(0.5);
  });

  it("an athlete removed from every roster drops out of the denominator, even though their account and history remain", async () => {
    await createCoach({ username: "coach.rate.removed", firstName: "Rate", lastName: "Removed" });
    await makeSuperAdmin("coach.rate.removed");
    const coach = await createCoach({ username: "coach.rate.removed2", firstName: "Roster", lastName: "Owner2" });

    const { athlete: staying } = await createAthlete({ username: "ath.rate.staying", firstName: "Staying", lastName: "Rate", squad: "GIRLS" });
    const { athlete: leaving } = await createAthlete({ username: "ath.rate.leaving", firstName: "Leaving", lastName: "Rate", squad: "GIRLS" });
    await assignRoster(coach.id, staying.id);
    await assignRoster(coach.id, leaving.id);

    // Both check in today...
    await prisma.wellnessEntry.create({
      data: { athleteId: staying.id, day: localDayKey(new Date()), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    await prisma.wellnessEntry.create({
      data: { athleteId: leaving.id, day: localDayKey(new Date()), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });

    const token = await loginAs("coach.rate.removed");
    const before = await request(app).get("/api/admin/overview").set("Authorization", `Bearer ${token}`);
    expect(before.body.activeAthleteCount).toBe(2);
    expect(before.body.checkinRate).toBeCloseTo(1);

    // ...then one of them is removed from the roster (their history stays put).
    await prisma.coachAthlete.deleteMany({ where: { athleteId: leaving.id } });

    const after = await request(app).get("/api/admin/overview").set("Authorization", `Bearer ${token}`);
    expect(after.body.activeAthleteCount).toBe(1); // leaving no longer counted
    expect(after.body.checkedInToday).toBe(1); // their earlier check-in today is no longer counted either
    expect(after.body.checkinRate).toBeCloseTo(1); // still 100% -- staying alone, still checked in
    expect(await prisma.wellnessEntry.findFirst({ where: { athleteId: leaving.id } })).not.toBeNull(); // history untouched
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

  it("includes the actual athlete roster by name/squad, and a 7-day checkinRateSeries scoped to this school", async () => {
    await createCoach({ username: "coach.admin4", firstName: "Admin", lastName: "Four" });
    await makeSuperAdmin("coach.admin4");
    const school = await ensureSchool("School Athletes High");
    const coach = await createCoach({ username: "coach.schoolathletes", firstName: "School", lastName: "Athletes" });
    await assignSchool(coach.id, school.id);
    const { athlete } = await createAthlete({ username: "ath.schoolathletes", firstName: "Roster", lastName: "Kid", squad: "BOYS" });
    await assignRoster(coach.id, athlete.id);
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: localDayKey(new Date()), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });

    const token = await loginAs("coach.admin4");
    const res = await request(app).get(`/api/admin/schools/${school.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.athletes).toEqual([{ id: athlete.id, name: "Roster Kid", squadName: "BOYS", gender: null }]);

    expect(res.body.checkinRateSeries).toHaveLength(7);
    const today = res.body.checkinRateSeries[6];
    expect(today.total).toBe(1);
    expect(today.checkedIn).toBe(1);
    expect(today.rate).toBe(1);
    const yesterday = res.body.checkinRateSeries[5];
    expect(yesterday.checkedIn).toBe(0);
    expect(yesterday.rate).toBe(0);
  });

  it("a school with no athletes yet gets a checkinRateSeries of nulls, not zeros", async () => {
    await createCoach({ username: "coach.admin5", firstName: "Admin", lastName: "Five" });
    await makeSuperAdmin("coach.admin5");
    const school = await ensureSchool("School No Athletes High");

    const token = await loginAs("coach.admin5");
    const res = await request(app).get(`/api/admin/schools/${school.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.athletes).toEqual([]);
    for (const point of res.body.checkinRateSeries) {
      expect(point.total).toBe(0);
      expect(point.rate).toBeNull();
    }
  });
});

describe("login records a LoginEvent, deduped per day", () => {
  it("logging in twice the same day still leaves exactly one row", async () => {
    await createCoach({ username: "coach.loginevent", firstName: "Login", lastName: "Event" });
    await loginAs("coach.loginevent");
    await loginAs("coach.loginevent"); // a second real login, same day

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "coach.loginevent" } });
    const events = await prisma.loginEvent.findMany({ where: { userId: user.id } });
    expect(events).toHaveLength(1);
    expect(events[0].role).toBe("COACH");
    expect(events[0].day.getTime()).toBe(localDayKey(new Date()).getTime());
  });

  it("athlete logins are recorded too, with role ATHLETE", async () => {
    await createAthlete({ username: "ath.loginevent", firstName: "Login", lastName: "Event", squad: "GIRLS" });
    await loginAs("ath.loginevent");

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "ath.loginevent" } });
    const event = await prisma.loginEvent.findFirst({ where: { userId: user.id } });
    expect(event?.role).toBe("ATHLETE");
  });
});

describe("GET /api/admin/activity/checkins", () => {
  it("counts distinct athletes who checked in each day, zero-filled for quiet days", async () => {
    await createCoach({ username: "coach.activity.checkins", firstName: "Activity", lastName: "Checkins" });
    await makeSuperAdmin("coach.activity.checkins");
    const { athlete: a } = await createAthlete({ username: "ath.activity.a", firstName: "A", lastName: "Ath", squad: "GIRLS" });
    const { athlete: b } = await createAthlete({ username: "ath.activity.b", firstName: "B", lastName: "Ath", squad: "GIRLS" });

    // Two athletes checked in yesterday, one checked in 3 days ago, nobody today or 2 days ago.
    await prisma.wellnessEntry.create({
      data: { athleteId: a.id, date: daysAgo(1), day: localDayKey(daysAgo(1)), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    await prisma.wellnessEntry.create({
      data: { athleteId: b.id, date: daysAgo(1), day: localDayKey(daysAgo(1)), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    await prisma.wellnessEntry.create({
      data: { athleteId: a.id, date: daysAgo(3), day: localDayKey(daysAgo(3)), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });

    const token = await loginAs("coach.activity.checkins");
    const res = await request(app).get("/api/admin/activity/checkins?days=7").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7); // zero-filled, one point per day regardless of data

    const byDate = new Map(res.body.map((p: { date: string; count: number }) => [p.date, p.count]));
    const iso = (n: number) => localDayKey(daysAgo(n)).toISOString().slice(0, 10);
    expect(byDate.get(iso(1))).toBe(2);
    expect(byDate.get(iso(2))).toBe(0); // a genuinely quiet day, present as a real zero, not missing
    expect(byDate.get(iso(3))).toBe(1);
    expect(byDate.get(iso(0))).toBe(0); // nobody checked in today either
  });
});

describe("GET /api/admin/activity/runs", () => {
  it("counts distinct athletes, not raw run rows -- a two-a-day is still one athlete", async () => {
    await createCoach({ username: "coach.activity.runs", firstName: "Activity", lastName: "Runs" });
    await makeSuperAdmin("coach.activity.runs");
    const { athlete } = await createAthlete({ username: "ath.activity.runs", firstName: "Runs", lastName: "Ath", squad: "GIRLS" });

    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, date: daysAgo(1), runType: "AM", distanceMiles: 2, durationMin: 20, rpe: 3, load: 60 },
    });
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, date: daysAgo(1), runType: "PM", distanceMiles: 4, durationMin: 32, rpe: 7, load: 224 },
    });

    const token = await loginAs("coach.activity.runs");
    const res = await request(app).get("/api/admin/activity/runs?days=7").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const byDate = new Map(res.body.map((p: { date: string; count: number }) => [p.date, p.count]));
    expect(byDate.get(localDayKey(daysAgo(1)).toISOString().slice(0, 10))).toBe(1); // one athlete, not two run rows
  });
});

describe("GET /api/admin/activity/coach-logins", () => {
  it("only counts COACH role logins, not athletes", async () => {
    await createCoach({ username: "coach.activity.logins", firstName: "Activity", lastName: "Logins" });
    await makeSuperAdmin("coach.activity.logins");
    await createCoach({ username: "coach.activity.other", firstName: "Other", lastName: "Coach" });
    await createAthlete({ username: "ath.activity.logins", firstName: "Ath", lastName: "Logins", squad: "GIRLS" });

    await loginAs("coach.activity.other");
    await loginAs("ath.activity.logins"); // shouldn't count toward the coach-logins calendar

    const token = await loginAs("coach.activity.logins"); // this coach's own login also counts, today
    const res = await request(app).get("/api/admin/activity/coach-logins?days=7").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const byDate = new Map(res.body.map((p: { date: string; count: number }) => [p.date, p.count]));
    expect(byDate.get(localDayKey(new Date()).toISOString().slice(0, 10))).toBe(2); // 2 distinct coaches logged in today, not the athlete
  });

  it("400s on an out-of-range days param", async () => {
    await createCoach({ username: "coach.activity.badrange", firstName: "Activity", lastName: "BadRange" });
    await makeSuperAdmin("coach.activity.badrange");
    const token = await loginAs("coach.activity.badrange");
    const res = await request(app).get("/api/admin/activity/coach-logins?days=9999").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
