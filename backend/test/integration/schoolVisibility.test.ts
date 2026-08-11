import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, assignSchool, createAthlete, createCoach, ensureSchool, resetDb } from "../testDb.js";
import { currentIsoWeek } from "../../src/lib/math.js";
import { recomputeReadiness } from "../../src/lib/scoring.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

describe("school-shared roster visibility", () => {
  it("a coach's PRE-EXISTING roster becomes visible to a schoolmate immediately, no backfill needed", async () => {
    // Coach A rosters an athlete before either coach has a school.
    const coachA = await createCoach({ username: "coach.preexist", firstName: "PreExist", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.preexist", firstName: "Pre", lastName: "Exist", squad: "GIRLS" });
    await assignRoster(coachA.id, athlete.id);

    // Only afterward does a school get created and both coaches join it.
    const school = await ensureSchool("Flower Mound High School");
    const coachB = await createCoach({ username: "coach.schoolmate", firstName: "School", lastName: "Mate" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);

    await recomputeReadiness(athlete.id);
    const { week, year } = currentIsoWeek(new Date());
    const tokenB = await loginAs("coach.schoolmate");

    const brief = await request(app).get(`/api/brief?week=${week}&year=${year}`).set("Authorization", `Bearer ${tokenB}`);
    expect(brief.status).toBe(200);
    expect(brief.body.map((s: { athlete: { id: string } }) => s.athlete.id)).toContain(athlete.id);

    const squads = await request(app).get("/api/squads").set("Authorization", `Bearer ${tokenB}`);
    const girls = squads.body.find((s: { name: string }) => s.name === "GIRLS");
    expect(girls.athleteCount).toBe(1);

    const athleteDetail = await request(app).get(`/api/athletes/${athlete.id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(athleteDetail.status).toBe(200);
  });

  it("a schoolmate with no personal CoachAthlete row can still add a note, attributed to themself", async () => {
    const school = await ensureSchool("Marcus High School");
    const coachA = await createCoach({ username: "coach.notewriter.a", firstName: "A", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.notewriter.b", firstName: "B", lastName: "Coach" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);
    const { athlete } = await createAthlete({ username: "ath.noted", firstName: "Note", lastName: "d", squad: "BOYS" });
    await assignRoster(coachA.id, athlete.id); // only A has the direct roster row

    const tokenB = await loginAs("coach.notewriter.b");
    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ athleteId: athlete.id, body: "Flagging this for the staff" });
    expect(res.status).toBe(201);
    expect(res.body.coachId).toBe(coachB.id); // attributed to the actual writer, not the roster-owner

    const injuryRes = await request(app)
      .post("/api/injuries")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ athleteId: athlete.id, description: "Tweaked ankle" });
    expect(injuryRes.status).toBe(201);
  });

  it("two coaches at different schools (or no school) stay fully isolated", async () => {
    const schoolX = await ensureSchool("School X");
    const schoolY = await ensureSchool("School Y");
    const coachX = await createCoach({ username: "coach.x", firstName: "X", lastName: "Coach" });
    const coachY = await createCoach({ username: "coach.y", firstName: "Y", lastName: "Coach" });
    await assignSchool(coachX.id, schoolX.id);
    await assignSchool(coachY.id, schoolY.id);
    const { athlete: athX } = await createAthlete({ username: "ath.x", firstName: "Ath", lastName: "X", squad: "GIRLS" });
    await assignRoster(coachX.id, athX.id);

    const tokenY = await loginAs("coach.y");
    const res = await request(app).get(`/api/athletes/${athX.id}`).set("Authorization", `Bearer ${tokenY}`);
    expect(res.status).toBe(403);

    const solo = await createCoach({ username: "coach.solo", firstName: "Solo", lastName: "Coach" });
    const tokenSolo = await loginAs("coach.solo");
    const resSolo = await request(app).get(`/api/athletes/${athX.id}`).set("Authorization", `Bearer ${tokenSolo}`);
    expect(resSolo.status).toBe(403);
    expect(solo).toBeTruthy();
  });

  it("prisma-level: getSchoolAthleteIds returns the union across every coach at the school, de-duplicated", async () => {
    const { getSchoolAthleteIds } = await import("../../src/lib/authz.js");
    const school = await ensureSchool("Union Test High");
    const coachA = await createCoach({ username: "coach.union.a", firstName: "A", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.union.b", firstName: "B", lastName: "Coach" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);
    const { athlete: shared } = await createAthlete({ username: "ath.shared", firstName: "Shared", lastName: "One", squad: "GIRLS" });
    await assignRoster(coachA.id, shared.id);
    await assignRoster(coachB.id, shared.id); // both coaches roster the same athlete

    const ids = await getSchoolAthleteIds(school.id);
    expect(ids).toEqual([shared.id]); // de-duplicated, not [shared.id, shared.id]
    expect(await prisma.coachAthlete.count({ where: { athleteId: shared.id } })).toBe(2);
  });
});
