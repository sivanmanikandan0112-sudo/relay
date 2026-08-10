import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, resetDb } from "../testDb.js";
import { currentIsoWeek } from "../../src/lib/math.js";
import { recomputeReadiness } from "../../src/lib/scoring.js";

beforeEach(async () => {
  await resetDb();
});

describe("roster scoping across two independent coaches", () => {
  async function twoCoachFixture() {
    const coachA = await createCoach({ username: "coach.alpha", firstName: "Alpha", lastName: "Coach" });
    const coachB = await createCoach({ username: "coach.beta", firstName: "Beta", lastName: "Coach" });
    const { athlete: athleteA } = await createAthlete({ username: "ath.alpha", firstName: "Alpha", lastName: "Ath", squad: "GIRLS" });
    const { athlete: athleteB } = await createAthlete({ username: "ath.beta", firstName: "Beta", lastName: "Ath", squad: "BOYS" });
    await assignRoster(coachA.id, athleteA.id);
    await assignRoster(coachB.id, athleteB.id);
    return { coachA, coachB, athleteA, athleteB };
  }

  it("GET /api/athletes/:id -- a coach can read their own roster athlete, not the other coach's", async () => {
    const { athleteA, athleteB } = await twoCoachFixture();
    const tokenA = await loginAs("coach.alpha");

    const ownRes = await request(app).get(`/api/athletes/${athleteA.id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.id).toBe(athleteA.id);

    const otherRes = await request(app).get(`/api/athletes/${athleteB.id}`).set("Authorization", `Bearer ${tokenA}`);
    expect(otherRes.status).toBe(403);
  });

  it("GET /api/squads -- athlete counts only reflect the requesting coach's own roster", async () => {
    const { coachA } = await twoCoachFixture(); // coachA already has 1 GIRLS athlete (athleteA)
    // Give coach A a second GIRLS athlete, on top of athleteA, so their
    // count (2) is distinguishable from coach B's count (0 GIRLS athletes).
    const { athlete: extra } = await createAthlete({ username: "ath.extra", firstName: "Extra", lastName: "Ath", squad: "GIRLS" });
    await assignRoster(coachA.id, extra.id);

    const tokenA = await loginAs("coach.alpha");
    const squadsRes = await request(app).get("/api/squads").set("Authorization", `Bearer ${tokenA}`);
    expect(squadsRes.status).toBe(200);
    const girls = squadsRes.body.find((s: { name: string }) => s.name === "GIRLS");
    expect(girls.athleteCount).toBe(2);

    const tokenB = await loginAs("coach.beta");
    const squadsResB = await request(app).get("/api/squads").set("Authorization", `Bearer ${tokenB}`);
    const girlsB = squadsResB.body.find((s: { name: string }) => s.name === "GIRLS");
    expect(girlsB.athleteCount).toBe(0); // coach B's only athlete is BOYS
  });

  it("GET /api/brief -- only shows the requesting coach's own roster, ranked worst-first", async () => {
    const { athleteA, athleteB } = await twoCoachFixture();
    await recomputeReadiness(athleteA.id);
    await recomputeReadiness(athleteB.id);
    const { week, year } = currentIsoWeek(new Date());

    const tokenA = await loginAs("coach.alpha");
    const res = await request(app).get(`/api/brief?week=${week}&year=${year}`).set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].athlete.id).toBe(athleteA.id);
  });

  it("GET /api/brief -- rejects a request missing week/year with 400", async () => {
    await twoCoachFixture();
    const tokenA = await loginAs("coach.alpha");
    const res = await request(app).get("/api/brief").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(400);
  });
});

describe("athlete self-access", () => {
  it("an athlete can read their own /api/athletes/:id, not another athlete's", async () => {
    const { athlete: self } = await createAthlete({ username: "ath.self3", firstName: "Self", lastName: "Ath", squad: "GIRLS" });
    const { athlete: other } = await createAthlete({ username: "ath.other3", firstName: "Other", lastName: "Ath", squad: "GIRLS" });
    const token = await loginAs("ath.self3");

    const ownRes = await request(app).get(`/api/athletes/${self.id}`).set("Authorization", `Bearer ${token}`);
    expect(ownRes.status).toBe(200);

    const otherRes = await request(app).get(`/api/athletes/${other.id}`).set("Authorization", `Bearer ${token}`);
    expect(otherRes.status).toBe(403);
  });

  it("an athlete cannot access coach-only routes like /api/squads", async () => {
    await createAthlete({ username: "ath.notcoach", firstName: "Not", lastName: "Coach", squad: "GIRLS" });
    const token = await loginAs("ath.notcoach");
    const res = await request(app).get("/api/squads").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
