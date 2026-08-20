import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { createAthlete, createCoach, resetDb, TEST_PASSWORD } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { hashToken } from "../../src/lib/tokenHash.js";

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/auth/login", () => {
  it("logs in a coach with the right username/password and returns a bearer token", async () => {
    await createCoach({ username: "coach.test", firstName: "Coach", lastName: "Test" });
    const res = await request(app).post("/api/auth/login").send({ username: "coach.test", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username: "coach.test", role: "COACH" });
  });

  it("logs in an athlete and reports athleteId/gender/hasCoach", async () => {
    const { user } = await createAthlete({ username: "ath.test", firstName: "Ath", lastName: "Lete", squad: "GIRLS" });
    const res = await request(app).post("/api/auth/login").send({ username: "ath.test", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: "ATHLETE", gender: null, hasCoach: false });
    expect(res.body.user.athleteId).toEqual(expect.any(String));
    expect(user).toBeTruthy();
  });

  it("includes reminderHour and onboardingCompletedAt in the login response, not just GET /api/me -- both null for a fresh account", async () => {
    // Both fields used to be built independently here from GET /api/me's
    // own response shape and quietly fell out of sync -- a fresh login
    // would omit them entirely (undefined) until Layout.tsx's own
    // mount-time /me refetch caught up moments later. Asserted directly
    // here so that drift can't silently reappear.
    await createCoach({ username: "coach.loginfields", firstName: "Login", lastName: "Fields" });
    const res = await request(app).post("/api/auth/login").send({ username: "coach.loginfields", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty("reminderHour", null);
    expect(res.body.user).toHaveProperty("onboardingCompletedAt", null);
  });

  it("rejects a wrong password with 401, not 200 with a bad token", async () => {
    await createCoach({ username: "coach.test", firstName: "Coach", lastName: "Test" });
    const res = await request(app).post("/api/auth/login").send({ username: "coach.test", password: "totally-wrong" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("rejects a username that doesn't exist with the same 401 (no user enumeration)", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "nobody.here", password: "whatever123" });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed request body with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/forgot-password + /api/auth/reset-password", () => {
  it("issues a reset token for a real username and lets it be used to set a new password", async () => {
    await createCoach({ username: "coach.reset", firstName: "Coach", lastName: "Reset" });

    const forgot = await request(app).post("/api/auth/forgot-password").send({ username: "coach.reset" });
    expect(forgot.status).toBe(200);
    expect(forgot.body.sent).toBe(true);
    const token = forgot.body.devResetToken as string;
    expect(token).toEqual(expect.any(String));

    const reset = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "BrandNewPass1!" });
    expect(reset.status).toBe(200);
    expect(reset.body.reset).toBe(true);

    // Old password no longer works, new one does.
    const oldLogin = await request(app).post("/api/auth/login").send({ username: "coach.reset", password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ username: "coach.reset", password: "BrandNewPass1!" });
    expect(newLogin.status).toBe(200);
  });

  it("returns sent:true even for a username that doesn't exist, without leaking a token", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ username: "nobody.here" });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.devResetToken).toBeUndefined();
  });

  it("rejects reusing an already-consumed reset token", async () => {
    await createCoach({ username: "coach.reset2", firstName: "Coach", lastName: "Reset2" });
    const forgot = await request(app).post("/api/auth/forgot-password").send({ username: "coach.reset2" });
    const token = forgot.body.devResetToken as string;

    const first = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "FirstPass1!" });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "SecondPass1!" });
    expect(second.status).toBe(400);
  });

  it("rejects an expired reset token", async () => {
    const coach = await createCoach({ username: "coach.expired", firstName: "Coach", lastName: "Expired" });
    const expiredToken = "expired-token-123";
    // Stored hashed, same as the real route does -- sending the raw
    // token in the request body below is what a real reset link would
    // contain; this specifically exercises the expiry check, not a
    // "not found" false-positive from a hash mismatch.
    await prisma.passwordResetToken.create({
      data: { userId: coach.id, token: hashToken(expiredToken), expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app).post("/api/auth/reset-password").send({ token: expiredToken, newPassword: "NewPass123!" });
    expect(res.status).toBe(400);
  });

  it("stores the reset token hashed, not raw", async () => {
    await createCoach({ username: "coach.hashed", firstName: "Coach", lastName: "Hashed" });
    const forgot = await request(app).post("/api/auth/forgot-password").send({ username: "coach.hashed" });
    const rawToken = forgot.body.devResetToken as string;

    const record = await prisma.passwordResetToken.findFirst({ orderBy: { createdAt: "desc" } });
    expect(record?.token).not.toBe(rawToken);
    expect(record?.token).toBe(hashToken(rawToken));
  });
});

describe("bearer auth on protected routes", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/api/squads");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage bearer token", async () => {
    const res = await request(app).get("/api/squads").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("accepts a real token from login", async () => {
    await createCoach({ username: "coach.bearer", firstName: "Coach", lastName: "Bearer" });
    const token = await loginAs("coach.bearer");
    const res = await request(app).get("/api/squads").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

