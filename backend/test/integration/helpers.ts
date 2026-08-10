import request from "supertest";
import { app } from "../../src/app.js";
import { TEST_PASSWORD } from "../testDb.js";

/** Logs in as `username` (the shared TEST_PASSWORD unless overridden) and returns the bearer token. */
export async function loginAs(username: string, password: string = TEST_PASSWORD): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${username}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export { app };
