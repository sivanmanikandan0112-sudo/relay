// newcomer.athlete has only 3 days of history in the fixture, with a big
// daily load (300) that would read as an alarming spike if z-scored --
// but per docs/math-behind-relay.md §9, an athlete needs ~2-3 weeks of
// data before any of that math is trusted. This proves the gate holds:
// the score should be a bland neutral default, not a false BACK_OFF.
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, athleteIdFor, loginAs } from "./helpers.js";

let coachToken: string;
let newcomerId: string;

beforeAll(async () => {
  coachToken = await loginAs("coach.one");
  newcomerId = await athleteIdFor("newcomer.athlete");
});

it("newcomer.athlete really does have load logged (the gate isn't just hiding a lack of data)", async () => {
  const runs = await request(app).get(`/api/training-load/athlete/${newcomerId}`).set("Authorization", `Bearer ${coachToken}`);
  expect(runs.status).toBe(200);
  expect(runs.body.length).toBe(3);
  expect(runs.body.every((r: { load: number }) => r.load === 300)).toBe(true);
});

it("reads as a neutral FRESH default despite the load, since history is under 14 days", async () => {
  const history = await request(app).get(`/api/athletes/${newcomerId}/readiness-history`).set("Authorization", `Bearer ${coachToken}`);
  expect(history.status).toBe(200);
  const latest = history.body[history.body.length - 1];
  expect(latest.status).toBe("FRESH");
  // The gated/neutral default (all 3 z-scores null -> composite 0) lands
  // in the high 50s -- a wide but meaningful band that's nowhere near a
  // real BACK_OFF/EASE_BACK reading.
  expect(latest.score).toBeGreaterThanOrEqual(55);
  expect(latest.score).toBeLessThanOrEqual(65);
});
