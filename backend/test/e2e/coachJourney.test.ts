// A coach's real workflow against the fixture: log in, read the weekly
// brief (roster-scoped, worst-first), read the squad breakdown, look at
// one athlete's detail, and leave them a note.
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, athleteIdFor, loginAs, thisWeekQuery } from "./helpers.js";

let coachToken: string;
let freshAthleteId: string;

beforeAll(async () => {
  coachToken = await loginAs("coach.one");
  freshAthleteId = await athleteIdFor("fresh.athlete");
});

describe("GET /api/brief", () => {
  it("includes every one of coach.one's 6 athletes, none of coach.two's", async () => {
    const res = await request(app).get(`/api/brief?${thisWeekQuery()}`).set("Authorization", `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
    const names = res.body.map((r: { athlete: { name: string } }) => r.athlete.name);
    expect(names).toContain("Fresh Athlete");
    expect(names).toContain("Struggling Athlete");
    expect(names).not.toContain("Isolated Athlete");
  });

  it("is ranked worst-first (ascending score)", async () => {
    const res = await request(app).get(`/api/brief?${thisWeekQuery()}`).set("Authorization", `Bearer ${coachToken}`);
    const scores = res.body.map((r: { score: number }) => r.score);
    const sorted = [...scores].sort((a, b) => a - b);
    expect(scores).toEqual(sorted);
  });

  it("can be filtered to a single squad", async () => {
    const squads = await request(app).get("/api/squads").set("Authorization", `Bearer ${coachToken}`);
    const girls = squads.body.find((s: { name: string }) => s.name === "GIRLS");

    const res = await request(app).get(`/api/brief?${thisWeekQuery()}&squadId=${girls.id}`).set("Authorization", `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    // fresh/struggling/injured/journey are GIRLS; return/newcomer are BOYS.
    expect(res.body.length).toBe(4);
  });
});

describe("GET /api/squads", () => {
  it("reports per-squad counts scoped to coach.one's own roster", async () => {
    const res = await request(app).get("/api/squads").set("Authorization", `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    const total = res.body.reduce((sum: number, s: { athleteCount: number }) => sum + s.athleteCount, 0);
    expect(total).toBe(6); // not 7 -- isolated.athlete (coach.two's) isn't counted
  });
});

describe("GET /api/athletes/:id", () => {
  it("returns the athlete's squad and injury history", async () => {
    const res = await request(app).get(`/api/athletes/${freshAthleteId}`).set("Authorization", `Bearer ${coachToken}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Fresh Athlete");
    expect(res.body.squad).toBeTruthy();
    expect(Array.isArray(res.body.injuries)).toBe(true);
  });
});

describe("notes", () => {
  it("a coach can leave a note on their own athlete, and read it back", async () => {
    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", `Bearer ${coachToken}`)
      .send({ athleteId: freshAthleteId, body: "Great week, keep it up!" });
    expect(created.status).toBe(201);

    const list = await request(app).get(`/api/notes/athlete/${freshAthleteId}`).set("Authorization", `Bearer ${coachToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((n: { body: string }) => n.body === "Great week, keep it up!")).toBe(true);
    expect(list.body[0].coach.name).toBe("Coach One");
  });
});
