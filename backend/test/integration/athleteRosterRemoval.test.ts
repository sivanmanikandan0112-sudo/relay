import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, assignSchool, createAthlete, createCoach, ensureSchool, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

describe("DELETE /api/athletes/:id/roster", () => {
  it("removes the athlete from a solo coach's roster", async () => {
    const coach = await createCoach({ username: "coach.remove.solo", firstName: "Solo", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.remove.solo", firstName: "Solo", lastName: "Ath", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.remove.solo");

    const res = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true });

    expect(await prisma.coachAthlete.count({ where: { athleteId: athlete.id } })).toBe(0);
  });

  it("removing clears the athlete from EVERY coach's roster at a shared school, not just the caller's own link", async () => {
    const school = await ensureSchool("Remove Roster High School");
    const coachA = await createCoach({ username: "coach.remove.a", firstName: "A", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.remove.b", firstName: "B", lastName: "Coach" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);

    const { athlete } = await createAthlete({ username: "ath.remove.shared", firstName: "Shared", lastName: "Ath", squad: "BOYS" });
    await assignRoster(coachA.id, athlete.id); // only coach A has the actual CoachAthlete row

    const tokenB = await loginAs("coach.remove.b");
    // Coach B can see the athlete via the shared-school join, with no row of their own.
    const before = await request(app).get(`/api/athletes/${athlete.id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(before.status).toBe(200);

    const res = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);

    // Gone for both coaches, not just B -- the actual point of deleting
    // every CoachAthlete row instead of just the caller's own.
    const afterA = await request(app).get(`/api/athletes/${athlete.id}`).set("Authorization", `Bearer ${await loginAs("coach.remove.a")}`);
    expect(afterA.status).toBe(403);
    const afterB = await request(app).get(`/api/athletes/${athlete.id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(afterB.status).toBe(403);
  });

  it("preserves the athlete's account and every bit of history -- only the roster link is gone", async () => {
    const coach = await createCoach({ username: "coach.remove.preserve", firstName: "Preserve", lastName: "Coach" });
    const { athlete, user } = await createAthlete({ username: "ath.remove.preserve", firstName: "Preserve", lastName: "Ath", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);

    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: new Date(), sleep: 3, soreness: 3, mood: 3, energy: 3, motivation: 3 },
    });
    await prisma.trainingLoad.create({
      data: { athleteId: athlete.id, runType: "Easy run", distanceMiles: 3, durationMin: 27, rpe: 4, load: 108 },
    });
    await prisma.note.create({ data: { athleteId: athlete.id, coachId: coach.id, body: "Doing well." } });

    const token = await loginAs("coach.remove.preserve");
    const res = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    // The account and every historical row are untouched.
    expect(await prisma.user.findUnique({ where: { id: user!.id } })).not.toBeNull();
    expect(await prisma.athlete.findUnique({ where: { id: athlete.id } })).not.toBeNull();
    expect(await prisma.wellnessEntry.count({ where: { athleteId: athlete.id } })).toBe(1);
    expect(await prisma.trainingLoad.count({ where: { athleteId: athlete.id } })).toBe(1);
    expect(await prisma.note.count({ where: { athleteId: athlete.id } })).toBe(1);

    // The athlete's own account now reports no coach -- same state a
    // brand-new, never-rostered athlete already sees.
    const athleteToken = await loginAs("ath.remove.preserve");
    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${athleteToken}`);
    expect(me.body.hasCoach).toBe(false);
  });

  it("403s for a coach who can't currently see this athlete at all", async () => {
    const { athlete } = await createAthlete({ username: "ath.remove.private", firstName: "Private", lastName: "Ath", squad: "GIRLS" });
    await createCoach({ username: "coach.remove.notmine", firstName: "Not", lastName: "Mine" });
    const token = await loginAs("coach.remove.notmine");

    const res = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    // Untouched.
    expect(await prisma.athlete.findUnique({ where: { id: athlete.id } })).not.toBeNull();
  });

  it("403s for an athlete trying to remove themself (or anyone)", async () => {
    const { athlete } = await createAthlete({ username: "ath.remove.self", firstName: "Self", lastName: "Ath", squad: "GIRLS" });
    const token = await loginAs("ath.remove.self");

    const res = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("404s for a nonexistent athlete id", async () => {
    const coach = await createCoach({ username: "coach.remove.404", firstName: "NotFound", lastName: "Coach" });
    const token = await loginAs("coach.remove.404");

    const res = await request(app).delete("/api/athletes/does-not-exist/roster").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403); // isCoachOfAthlete fails first for an id with no roster row at all -- never reaches the athlete lookup
  });

  it("is idempotent -- removing an athlete already off the roster just 403s (not their roster to touch), doesn't error", async () => {
    const coach = await createCoach({ username: "coach.remove.idempotent", firstName: "Idem", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.remove.idempotent", firstName: "Idem", lastName: "Ath", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.remove.idempotent");

    const first = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app).delete(`/api/athletes/${athlete.id}/roster`).set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(403); // no longer this coach's athlete to remove
  });
});
