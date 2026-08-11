import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { createAthlete, createCoach, ensureSquad, resetDb, TEST_PASSWORD } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

describe("PATCH /api/me/gender", () => {
  it("moves the athlete into the matching squad when they pick Female, regardless of which squad they were invited into", async () => {
    // Invited into BOYS (e.g. a coach bulk-invited them from the Boys
    // side by mistake), but they pick Female at the gender gate.
    const { user, athlete } = await createAthlete({ username: "athlete.girl", firstName: "Girl", lastName: "Athlete", squad: "BOYS" });
    const token = await loginAs("athlete.girl");

    const res = await request(app).patch("/api/me/gender").set("Authorization", `Bearer ${token}`).send({ gender: "FEMALE" });
    expect(res.status).toBe(200);

    const girls = await ensureSquad("GIRLS");
    const updated = await prisma.athlete.findUnique({ where: { id: athlete.id } });
    expect(updated?.gender).toBe("FEMALE");
    expect(updated?.squadId).toBe(girls.id);
    expect(user).toBeTruthy();
  });

  it("moves the athlete into BOYS when they pick Male, regardless of which squad they were invited into", async () => {
    const { athlete } = await createAthlete({ username: "athlete.boy", firstName: "Boy", lastName: "Athlete", squad: "GIRLS" });
    const token = await loginAs("athlete.boy");

    const res = await request(app).patch("/api/me/gender").set("Authorization", `Bearer ${token}`).send({ gender: "MALE" });
    expect(res.status).toBe(200);

    const boys = await ensureSquad("BOYS");
    const updated = await prisma.athlete.findUnique({ where: { id: athlete.id } });
    expect(updated?.squadId).toBe(boys.id);
  });

  it("leaves the invited squad alone for Non-binary / Prefer not to say, since there's no squad to map to", async () => {
    const { athlete } = await createAthlete({ username: "athlete.nb", firstName: "NB", lastName: "Athlete", squad: "BOYS" });
    const boys = await ensureSquad("BOYS");
    const token = await loginAs("athlete.nb");

    const res = await request(app)
      .patch("/api/me/gender")
      .set("Authorization", `Bearer ${token}`)
      .send({ gender: "NONBINARY" });
    expect(res.status).toBe(200);

    const updated = await prisma.athlete.findUnique({ where: { id: athlete.id } });
    expect(updated?.gender).toBe("NONBINARY");
    expect(updated?.squadId).toBe(boys.id); // unchanged
  });
});

describe("PATCH /api/me/password", () => {
  it("wrong currentPassword -> 400, login with the old password still works", async () => {
    await createCoach({ username: "coach.pw.wrong", firstName: "Coach", lastName: "Wrong" });
    const token = await loginAs("coach.pw.wrong");

    const res = await request(app)
      .patch("/api/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "not-the-real-password", newPassword: "BrandNewPass1!" });
    expect(res.status).toBe(400);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.pw.wrong", password: TEST_PASSWORD });
    expect(login.status).toBe(200);
  });

  it("correct currentPassword -> 200, old password stops working, new one logs in", async () => {
    await createCoach({ username: "coach.pw.right", firstName: "Coach", lastName: "Right" });
    const token = await loginAs("coach.pw.right");

    const res = await request(app)
      .patch("/api/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "BrandNewPass1!" });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.pw.right", password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "coach.pw.right", password: "BrandNewPass1!" });
    expect(newLogin.status).toBe(200);
  });

  it("new password under 8 characters -> 400", async () => {
    await createCoach({ username: "coach.pw.short", firstName: "Coach", lastName: "Short" });
    const token = await loginAs("coach.pw.short");

    const res = await request(app)
      .patch("/api/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("works for an athlete too, not just a coach", async () => {
    await createAthlete({ username: "ath.pw", firstName: "Ath", lastName: "Pw", squad: "GIRLS" });
    const token = await loginAs("ath.pw");

    const res = await request(app)
      .patch("/api/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "BrandNewPass1!" });
    expect(res.status).toBe(200);
  });
});
