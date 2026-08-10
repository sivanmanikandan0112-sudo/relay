// coach.one and coach.two have completely separate rosters in the
// fixture (coach.two has only isolated.athlete) -- proves that isolation
// holds across every roster-scoped route, through real login + HTTP
// requests, not just a direct authz.ts unit call.
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, athleteIdFor, loginAs, thisWeekQuery } from "./helpers.js";

let coach1Token: string;
let coach2Token: string;
let isolatedId: string;
let freshId: string;

beforeAll(async () => {
  coach1Token = await loginAs("coach.one");
  coach2Token = await loginAs("coach.two");
  isolatedId = await athleteIdFor("isolated.athlete");
  freshId = await athleteIdFor("fresh.athlete");
});

it("coach.one's brief has 6 athletes and never includes isolated.athlete", async () => {
  const res = await request(app).get(`/api/brief?${thisWeekQuery()}`).set("Authorization", `Bearer ${coach1Token}`);
  expect(res.body).toHaveLength(6);
  expect(res.body.some((r: { athlete: { id: string } }) => r.athlete.id === isolatedId)).toBe(false);
});

it("coach.two's brief has exactly 1 athlete: isolated.athlete", async () => {
  const res = await request(app).get(`/api/brief?${thisWeekQuery()}`).set("Authorization", `Bearer ${coach2Token}`);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].athlete.id).toBe(isolatedId);
});

it("coach.one cannot fetch isolated.athlete's detail directly by id", async () => {
  const res = await request(app).get(`/api/athletes/${isolatedId}`).set("Authorization", `Bearer ${coach1Token}`);
  expect(res.status).toBe(403);
});

it("coach.two cannot fetch fresh.athlete's detail directly by id", async () => {
  const res = await request(app).get(`/api/athletes/${freshId}`).set("Authorization", `Bearer ${coach2Token}`);
  expect(res.status).toBe(403);
});

it("coach.two cannot leave a note on coach.one's athlete", async () => {
  const res = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${coach2Token}`)
    .send({ athleteId: freshId, body: "Should not be allowed" });
  expect(res.status).toBe(403);
});

it("coach.one cannot log an injury for isolated.athlete", async () => {
  const res = await request(app)
    .post("/api/injuries")
    .set("Authorization", `Bearer ${coach1Token}`)
    .send({ athleteId: isolatedId, description: "Should not be allowed" });
  expect(res.status).toBe(403);
});
