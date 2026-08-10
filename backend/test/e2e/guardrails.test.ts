// Read-only checks of the injured/return-to-run guardrails against the
// seeded fixture (docs/math-behind-relay.md §9) -- deliberately doesn't
// mutate injured.athlete or return.athlete, since other e2e test files
// (and re-runs within the same suite invocation) rely on their seeded
// state staying put. The "resolving an injury flips status back" mutation
// case is covered at the integration tier instead (test/integration/injuries.test.ts).
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, athleteIdFor, loginAs, thisWeekQuery } from "./helpers.js";

let coachToken: string;

beforeAll(async () => {
  coachToken = await loginAs("coach.one");
});

it("an ACTIVE injury reads as INJURED, regardless of the underlying score", async () => {
  const id = await athleteIdFor("injured.athlete");
  const detail = await request(app).get(`/api/athletes/${id}`).set("Authorization", `Bearer ${coachToken}`);
  expect(detail.status).toBe(200);
  expect(detail.body.injuries[0]).toMatchObject({ status: "ACTIVE" });

  const history = await request(app).get(`/api/athletes/${id}/readiness-history`).set("Authorization", `Bearer ${coachToken}`);
  expect(history.status).toBe(200);
  expect(history.body[history.body.length - 1].status).toBe("INJURED");
});

it("a RECOVERING injury reads as RETURN_PROTOCOL", async () => {
  const id = await athleteIdFor("return.athlete");
  const detail = await request(app).get(`/api/athletes/${id}`).set("Authorization", `Bearer ${coachToken}`);
  expect(detail.body.injuries[0]).toMatchObject({ status: "RECOVERING" });

  const history = await request(app).get(`/api/athletes/${id}/readiness-history`).set("Authorization", `Bearer ${coachToken}`);
  expect(history.body[history.body.length - 1].status).toBe("RETURN_PROTOCOL");
});

it("both guardrail athletes are excluded from FRESH's 'no action needed' framing on the brief", async () => {
  const res = await request(app).get(`/api/brief?${thisWeekQuery()}`).set("Authorization", `Bearer ${coachToken}`);
  const byName = Object.fromEntries(res.body.map((r: { athlete: { name: string }; status: string }) => [r.athlete.name, r.status]));
  expect(byName["Injured Athlete"]).toBe("INJURED");
  expect(byName["Return Athlete"]).toBe("RETURN_PROTOCOL");
});
