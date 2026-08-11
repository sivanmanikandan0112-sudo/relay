import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { authenticator } from "otplib";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, resetDb, TEST_PASSWORD } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function makeSuperAdmin(username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
}

describe("GET /api/admin/users", () => {
  it("searches across both coaches and athletes by name/email/username", async () => {
    await createCoach({ username: "coach.admin4", firstName: "Admin", lastName: "Four" });
    await makeSuperAdmin("coach.admin4");
    await createCoach({ username: "coach.findme", firstName: "Findme", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.findme", firstName: "Findme", lastName: "Athlete", squad: "GIRLS" });

    const token = await loginAs("coach.admin4");
    const res = await request(app).get("/api/admin/users?q=findme").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.map((u: { name: string }) => u.name);
    expect(names).toEqual(expect.arrayContaining(["Findme Coach", "Findme Athlete"]));
    const roles = res.body.map((u: { role: string }) => u.role);
    expect(roles).toEqual(expect.arrayContaining(["COACH", "ATHLETE"]));
    expect(athlete).toBeTruthy();
  });

  it("with no query, returns users generally (not an error)", async () => {
    await createCoach({ username: "coach.admin5", firstName: "Admin", lastName: "Five" });
    await makeSuperAdmin("coach.admin5");
    const token = await loginAs("coach.admin5");
    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /api/admin/users/:id", () => {
  it("for an athlete, includes role ATHLETE and their coach(es)", async () => {
    await createCoach({ username: "coach.admin6", firstName: "Admin", lastName: "Six" });
    await makeSuperAdmin("coach.admin6");
    const coach = await createCoach({ username: "coach.owner2", firstName: "Owner", lastName: "Two" });
    const { athlete } = await createAthlete({ username: "ath.detail2", firstName: "Ath", lastName: "Detail2", squad: "BOYS" });
    await assignRoster(coach.id, athlete.id);

    const token = await loginAs("coach.admin6");
    const res = await request(app).get(`/api/admin/users/${athlete.userId}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ATHLETE");
    expect(res.body.coaches).toEqual([expect.objectContaining({ name: "Owner Two" })]);
  });

  it("404s for a nonexistent id", async () => {
    await createCoach({ username: "coach.admin7", firstName: "Admin", lastName: "Seven" });
    await makeSuperAdmin("coach.admin7");
    const token = await loginAs("coach.admin7");
    const res = await request(app).get("/api/admin/users/not-a-real-id").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/users/:id/reset-password", () => {
  it("issues a token for the target that works end-to-end through the real reset route", async () => {
    await createCoach({ username: "coach.admin8", firstName: "Admin", lastName: "Eight" });
    await makeSuperAdmin("coach.admin8");
    const target = await createCoach({ username: "coach.target", firstName: "Target", lastName: "Coach" });

    const adminToken = await loginAs("coach.admin8");
    const reset = await request(app)
      .post(`/api/admin/users/${target.id}/reset-password`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(reset.status).toBe(200);
    expect(reset.body.devResetToken).toEqual(expect.any(String));

    const complete = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: reset.body.devResetToken, newPassword: "AdminSetThis1!" });
    expect(complete.status).toBe(200);

    const login = await request(app).post("/api/auth/login").send({ username: "coach.target", password: "AdminSetThis1!" });
    expect(login.status).toBe(200);
  });

  it("404s for a nonexistent user", async () => {
    await createCoach({ username: "coach.admin9", firstName: "Admin", lastName: "Nine" });
    await makeSuperAdmin("coach.admin9");
    const token = await loginAs("coach.admin9");
    const res = await request(app).post("/api/admin/users/not-a-real-id/reset-password").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/users/:id/reset-mfa", () => {
  it("clears MFA state on the target; their next login has no MFA step", async () => {
    await createCoach({ username: "coach.admin10", firstName: "Admin", lastName: "Ten" });
    await makeSuperAdmin("coach.admin10");
    const target = await createCoach({ username: "coach.hasmfa", firstName: "HasMfa", lastName: "Coach" });

    const targetToken = await loginAs("coach.hasmfa");
    const setup = await request(app).post("/api/mfa/setup").set("Authorization", `Bearer ${targetToken}`);
    const code = authenticator.generate(setup.body.secret);
    await request(app).post("/api/mfa/verify-setup").set("Authorization", `Bearer ${targetToken}`).send({ code });

    const adminToken = await loginAs("coach.admin10");
    const res = await request(app)
      .post(`/api/admin/users/${target.id}/reset-mfa`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(user.totpEnabled).toBe(false);
    expect(await prisma.mfaBackupCode.count({ where: { userId: target.id } })).toBe(0);

    const login = await request(app).post("/api/auth/login").send({ username: "coach.hasmfa", password: TEST_PASSWORD });
    expect(login.body.mfaRequired).toBeUndefined();
  });

  it("400s if the target doesn't have MFA enabled", async () => {
    await createCoach({ username: "coach.admin11", firstName: "Admin", lastName: "Eleven" });
    await makeSuperAdmin("coach.admin11");
    const target = await createCoach({ username: "coach.nomfa", firstName: "NoMfa", lastName: "Coach" });

    const adminToken = await loginAs("coach.admin11");
    const res = await request(app)
      .post(`/api/admin/users/${target.id}/reset-mfa`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
