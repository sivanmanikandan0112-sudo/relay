import request from "supertest";
import { app } from "../../src/app.js";
import { E2E_PASSWORD } from "./fixtures/constants.js";
import { currentIsoWeek } from "../../src/lib/math.js";

export async function loginAs(username: string, password: string = E2E_PASSWORD): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Logs in as an athlete fixture just to read their athleteId off the login response. */
export async function athleteIdFor(username: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ username, password: E2E_PASSWORD });
  if (res.status !== 200) throw new Error(`athleteIdFor(${username}) failed: ${res.status}`);
  return res.body.user.athleteId as string;
}

/** The current ISO week/year, as a `?week=&year=` query string for /api/brief. */
export function thisWeekQuery(): string {
  const { week, year } = currentIsoWeek(new Date());
  return `week=${week}&year=${year}`;
}

export { app };
