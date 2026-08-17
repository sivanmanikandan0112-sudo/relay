import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, ensureSquad, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { dayKey } from "../../src/lib/date.js";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/squads/:id/checkin-rate", () => {
  it("scopes to this coach's roster in this squad only, and reflects a real check-in", async () => {
    const coach = await createCoach({ username: "coach.checkinrate", firstName: "Rate", lastName: "Coach" });
    const squad = await ensureSquad("GIRLS");
    const { athlete: checkedIn } = await createAthlete({ username: "ath.rate.checkedin", firstName: "Checked", lastName: "In", squad: "GIRLS" });
    const { athlete: notCheckedIn } = await createAthlete({ username: "ath.rate.notin", firstName: "Not", lastName: "In", squad: "GIRLS" });
    await assignRoster(coach.id, checkedIn.id);
    await assignRoster(coach.id, notCheckedIn.id);
    await prisma.wellnessEntry.create({
      data: { athleteId: checkedIn.id, day: dayKey(new Date()), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });

    const token = await loginAs("coach.checkinrate");
    const res = await request(app)
      .get(`/api/squads/${squad.id}/checkin-rate`)
      .query({ days: 3 })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const today = res.body[2];
    expect(today.total).toBe(2);
    expect(today.checkedIn).toBe(1);
    expect(today.rate).toBe(0.5);
  });

  it("excludes athletes not on this coach's own roster, even if they're in the same squad", async () => {
    const coach = await createCoach({ username: "coach.checkinrate.outsider", firstName: "Outsider", lastName: "Coach" });
    const squad = await ensureSquad("BOYS");
    // Another coach's athlete, same squad -- not on coach.checkinrate.outsider's roster.
    const otherCoach = await createCoach({ username: "coach.checkinrate.other", firstName: "Other", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.rate.notmine", firstName: "Not", lastName: "Mine", squad: "BOYS" });
    await assignRoster(otherCoach.id, athlete.id);

    const token = await loginAs("coach.checkinrate.outsider");
    const res = await request(app)
      .get(`/api/squads/${squad.id}/checkin-rate`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const point of res.body) {
      expect(point.total).toBe(0);
      expect(point.rate).toBeNull();
    }
  });

  it("defaults to 7 days when no ?days= is given", async () => {
    const coach = await createCoach({ username: "coach.checkinrate.default", firstName: "Default", lastName: "Coach" });
    const squad = await ensureSquad("GIRLS");

    const token = await loginAs("coach.checkinrate.default");
    const res = await request(app).get(`/api/squads/${squad.id}/checkin-rate`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });
});
