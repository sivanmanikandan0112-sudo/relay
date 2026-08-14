import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { app, loginAs } from "./helpers.js";
import { createAthlete, createCoach, resetDb, TEST_PASSWORD } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

/** Runs the full setup -> verify-setup round trip and returns the real secret + backup codes. */
async function enableMfa(token: string) {
  const setup = await request(app).post("/api/mfa/setup").set("Authorization", `Bearer ${token}`);
  expect(setup.status).toBe(200);
  const secret = setup.body.secret as string;

  const code = authenticator.generate(secret);
  const verify = await request(app).post("/api/mfa/verify-setup").set("Authorization", `Bearer ${token}`).send({ code });
  expect(verify.status).toBe(200);
  return { secret, backupCodes: verify.body.backupCodes as string[] };
}

describe("POST /api/mfa/setup", () => {
  it("returns a secret, otpauth URL, and QR code data URL; leaves MFA disabled until confirmed", async () => {
    await createCoach({ username: "coach.mfa.setup", firstName: "Coach", lastName: "Setup" });
    const token = await loginAs("coach.mfa.setup");

    const res = await request(app).post("/api/mfa/setup").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.secret).toEqual(expect.any(String));
    expect(res.body.otpauthUrl).toContain("otpauth://totp/");
    expect(res.body.qrCodeDataUrl).toContain("data:image/png;base64,");

    const status = await request(app).get("/api/mfa/status").set("Authorization", `Bearer ${token}`);
    expect(status.body).toEqual({ enabled: false, backupCodesRemaining: 0 });
  });
});

describe("POST /api/mfa/verify-setup", () => {
  it("wrong code -> 400, stays disabled", async () => {
    await createCoach({ username: "coach.mfa.wrongsetup", firstName: "Coach", lastName: "WrongSetup" });
    const token = await loginAs("coach.mfa.wrongsetup");
    await request(app).post("/api/mfa/setup").set("Authorization", `Bearer ${token}`);

    const res = await request(app).post("/api/mfa/verify-setup").set("Authorization", `Bearer ${token}`).send({ code: "000000" });
    expect(res.status).toBe(400);

    const status = await request(app).get("/api/mfa/status").set("Authorization", `Bearer ${token}`);
    expect(status.body.enabled).toBe(false);
  });

  it("correct code -> 200, 10 backup codes issued, MFA enabled", async () => {
    const coach = await createCoach({ username: "coach.mfa.rightsetup", firstName: "Coach", lastName: "RightSetup" });
    const token = await loginAs("coach.mfa.rightsetup");

    const { backupCodes } = await enableMfa(token);
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10); // all distinct

    const stored = await prisma.mfaBackupCode.count({ where: { userId: coach.id } });
    expect(stored).toBe(10);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: coach.id } });
    expect(user.totpEnabled).toBe(true);
    expect(user.totpSecretEncrypted).not.toBeNull();

    const status = await request(app).get("/api/mfa/status").set("Authorization", `Bearer ${token}`);
    expect(status.body).toEqual({ enabled: true, backupCodesRemaining: 10 });
  });
});

describe("two-phase login with MFA enabled", () => {
  it("POST /api/auth/login returns mfaRequired + tempToken, no real session token", async () => {
    await createCoach({ username: "coach.mfa.login", firstName: "Coach", lastName: "Login" });
    const setupToken = await loginAs("coach.mfa.login");
    await enableMfa(setupToken);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.mfa.login", password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.mfaRequired).toBe(true);
    expect(login.body.tempToken).toEqual(expect.any(String));
    expect(login.body.token).toBeUndefined();
  });

  it("POST /api/auth/mfa/verify with the correct TOTP code issues a real session that works", async () => {
    await createCoach({ username: "coach.mfa.completelogin", firstName: "Coach", lastName: "CompleteLogin" });
    const setupToken = await loginAs("coach.mfa.completelogin");
    const { secret } = await enableMfa(setupToken);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.mfa.completelogin", password: TEST_PASSWORD });
    const { tempToken } = login.body;

    const code = authenticator.generate(secret);
    const verify = await request(app).post("/api/auth/mfa/verify").send({ tempToken, code });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toEqual(expect.any(String));
    expect(verify.body.user).toMatchObject({ username: "coach.mfa.completelogin", mfaEnabled: true });

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${verify.body.token}`);
    expect(me.status).toBe(200);

    // The MFA-verify completion path shares buildSession with plain login
    // (see routes/auth.ts) -- it should get a LoginEvent recorded too, not
    // just plain (no-MFA) logins.
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "coach.mfa.completelogin" } });
    const loginEvent = await prisma.loginEvent.findFirst({ where: { userId: user.id } });
    expect(loginEvent).not.toBeNull();
    expect(loginEvent!.role).toBe("COACH");
  });

  it("wrong TOTP code -> 401", async () => {
    await createCoach({ username: "coach.mfa.wrongcode", firstName: "Coach", lastName: "WrongCode" });
    const setupToken = await loginAs("coach.mfa.wrongcode");
    await enableMfa(setupToken);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.mfa.wrongcode", password: TEST_PASSWORD });
    const res = await request(app).post("/api/auth/mfa/verify").send({ tempToken: login.body.tempToken, code: "000000" });
    expect(res.status).toBe(401);
  });

  // The concrete proof the mfaPending scoping fix actually works: a
  // captured temp token (only proves the password was right) must not
  // be usable against any ordinary protected route.
  it("the temp token itself is rejected by GET /api/me -- it isn't a real session", async () => {
    await createCoach({ username: "coach.mfa.scoping", firstName: "Coach", lastName: "Scoping" });
    const setupToken = await loginAs("coach.mfa.scoping");
    await enableMfa(setupToken);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.mfa.scoping", password: TEST_PASSWORD });
    const { tempToken } = login.body;

    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${tempToken}`);
    expect(res.status).toBe(401);
  });

  it("an unused backup code works once, then is rejected on reuse", async () => {
    await createCoach({ username: "coach.mfa.backup", firstName: "Coach", lastName: "Backup" });
    const setupToken = await loginAs("coach.mfa.backup");
    const { backupCodes } = await enableMfa(setupToken);
    const code = backupCodes[0];

    const login1 = await request(app).post("/api/auth/login").send({ username: "coach.mfa.backup", password: TEST_PASSWORD });
    const first = await request(app).post("/api/auth/mfa/verify").send({ tempToken: login1.body.tempToken, code });
    expect(first.status).toBe(200);

    const login2 = await request(app).post("/api/auth/login").send({ username: "coach.mfa.backup", password: TEST_PASSWORD });
    const second = await request(app).post("/api/auth/mfa/verify").send({ tempToken: login2.body.tempToken, code });
    expect(second.status).toBe(401);
  });

  it("an expired temp token is rejected", async () => {
    await createCoach({ username: "coach.mfa.expired", firstName: "Coach", lastName: "Expired" });
    const setupToken = await loginAs("coach.mfa.expired");
    const coach = await prisma.user.findUniqueOrThrow({ where: { username: "coach.mfa.expired" } });
    await enableMfa(setupToken);

    const expiredTempToken = jwt.sign(
      { sub: coach.id, role: "COACH", mfaPending: true },
      process.env.JWT_SECRET!,
      { expiresIn: "-1s" }
    );
    const res = await request(app).post("/api/auth/mfa/verify").send({ tempToken: expiredTempToken, code: "000000" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/mfa/disable", () => {
  it("wrong password -> 400, stays enabled", async () => {
    await createCoach({ username: "coach.mfa.disable.wrong", firstName: "Coach", lastName: "DisableWrong" });
    const token = await loginAs("coach.mfa.disable.wrong");
    await enableMfa(token);

    const res = await request(app).post("/api/mfa/disable").set("Authorization", `Bearer ${token}`).send({ password: "wrong" });
    expect(res.status).toBe(400);

    const status = await request(app).get("/api/mfa/status").set("Authorization", `Bearer ${token}`);
    expect(status.body.enabled).toBe(true);
  });

  it("correct password -> 200, secret cleared, backup codes deleted, next login has no MFA step", async () => {
    const coach = await createCoach({ username: "coach.mfa.disable.right", firstName: "Coach", lastName: "DisableRight" });
    const token = await loginAs("coach.mfa.disable.right");
    await enableMfa(token);

    const res = await request(app).post("/api/mfa/disable").set("Authorization", `Bearer ${token}`).send({ password: TEST_PASSWORD });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: coach.id } });
    expect(user.totpEnabled).toBe(false);
    expect(user.totpSecretEncrypted).toBeNull();
    expect(await prisma.mfaBackupCode.count({ where: { userId: coach.id } })).toBe(0);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.mfa.disable.right", password: TEST_PASSWORD });
    expect(login.body.mfaRequired).toBeUndefined();
    expect(login.body.token).toEqual(expect.any(String));
  });
});

describe("MFA works for athletes too, not just coaches", () => {
  it("full setup + login round trip", async () => {
    await createAthlete({ username: "ath.mfa", firstName: "Ath", lastName: "Mfa", squad: "GIRLS" });
    const token = await loginAs("ath.mfa");
    const { secret } = await enableMfa(token);

    const login = await request(app).post("/api/auth/login").send({ username: "ath.mfa", password: TEST_PASSWORD });
    expect(login.body.mfaRequired).toBe(true);

    const code = authenticator.generate(secret);
    const verify = await request(app).post("/api/auth/mfa/verify").send({ tempToken: login.body.tempToken, code });
    expect(verify.status).toBe(200);
    expect(verify.body.user.role).toBe("ATHLETE");
  });
});
