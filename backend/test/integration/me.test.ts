import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, ensureSquad, resetDb, TEST_PASSWORD } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { recomputeReadiness } from "../../src/lib/scoring.js";

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

describe("PATCH /api/me/reminder-hour", () => {
  it("sets an hour for an athlete, and it's reflected back on GET /api/me", async () => {
    await createAthlete({ username: "ath.reminder.set", firstName: "Sets", lastName: "Hour", squad: "GIRLS" });
    const token = await loginAs("ath.reminder.set");

    const res = await request(app)
      .patch("/api/me/reminder-hour")
      .set("Authorization", `Bearer ${token}`)
      .send({ hour: 20 });
    expect(res.status).toBe(200);
    expect(res.body.reminderHour).toBe(20);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.reminderHour).toBe(20);
  });

  it("works for a coach too -- their own roster's default, not a personal reminder", async () => {
    await createCoach({ username: "coach.reminder.set", firstName: "Sets", lastName: "Hour" });
    const token = await loginAs("coach.reminder.set");

    const res = await request(app)
      .patch("/api/me/reminder-hour")
      .set("Authorization", `Bearer ${token}`)
      .send({ hour: 9 });
    expect(res.status).toBe(200);
    expect(res.body.reminderHour).toBe(9);
  });

  it("hour: null clears it back to unset", async () => {
    await createAthlete({ username: "ath.reminder.clear", firstName: "Clears", lastName: "Hour", squad: "GIRLS" });
    const token = await loginAs("ath.reminder.clear");
    await request(app).patch("/api/me/reminder-hour").set("Authorization", `Bearer ${token}`).send({ hour: 20 });

    const res = await request(app)
      .patch("/api/me/reminder-hour")
      .set("Authorization", `Bearer ${token}`)
      .send({ hour: null });
    expect(res.status).toBe(200);
    expect(res.body.reminderHour).toBeNull();

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.reminderHour).toBeNull();
  });

  it("rejects an hour outside 0-23", async () => {
    await createAthlete({ username: "ath.reminder.oor", firstName: "Out", lastName: "Range", squad: "GIRLS" });
    const token = await loginAs("ath.reminder.oor");

    expect((await request(app).patch("/api/me/reminder-hour").set("Authorization", `Bearer ${token}`).send({ hour: 24 })).status).toBe(400);
    expect((await request(app).patch("/api/me/reminder-hour").set("Authorization", `Bearer ${token}`).send({ hour: -1 })).status).toBe(400);
    expect((await request(app).patch("/api/me/reminder-hour").set("Authorization", `Bearer ${token}`).send({ hour: 4.5 })).status).toBe(400);
  });
});

describe("POST /api/me/onboarding-complete", () => {
  it("is unset for a brand-new athlete, and GET /api/me reflects that", async () => {
    await createAthlete({ username: "ath.onboard.new", firstName: "Brand", lastName: "New", squad: "GIRLS" });
    const token = await loginAs("ath.onboard.new");

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.onboardingCompletedAt).toBeNull();
  });

  it("stamps it, and GET /api/me reflects that afterward -- works for an athlete", async () => {
    await createAthlete({ username: "ath.onboard.done", firstName: "All", lastName: "Done", squad: "GIRLS" });
    const token = await loginAs("ath.onboard.done");

    const res = await request(app).post("/api/me/onboarding-complete").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.onboardingCompletedAt).toBe(true);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.onboardingCompletedAt).not.toBeNull();
  });

  it("works for a coach too, not just an athlete", async () => {
    await createCoach({ username: "coach.onboard.done", firstName: "Coach", lastName: "Done" });
    const token = await loginAs("coach.onboard.done");

    const res = await request(app).post("/api/me/onboarding-complete").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.onboardingCompletedAt).not.toBeNull();
  });

  it("is idempotent -- calling it twice doesn't error", async () => {
    await createAthlete({ username: "ath.onboard.twice", firstName: "Twice", lastName: "Called", squad: "BOYS" });
    const token = await loginAs("ath.onboard.twice");

    expect((await request(app).post("/api/me/onboarding-complete").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(app).post("/api/me/onboarding-complete").set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });
});

describe("readiness visibility (self-service, athlete-owned)", () => {
  it("defaults to off: GET /api/me reports readinessShared false, GET /api/me/readiness reports shared false with no score", async () => {
    const { athlete } = await createAthlete({ username: "ath.ready.default", firstName: "Ath", lastName: "Default", squad: "GIRLS" });
    await recomputeReadiness(athlete.id); // a real score exists...
    const token = await loginAs("ath.ready.default");

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.readinessShared).toBe(false);

    const readiness = await request(app).get("/api/me/readiness").set("Authorization", `Bearer ${token}`);
    expect(readiness.status).toBe(200);
    expect(readiness.body).toEqual({ shared: false, latest: null }); // ...but withheld, not just absent

    const login = await request(app).post("/api/auth/login").send({ username: "ath.ready.default", password: TEST_PASSWORD });
    expect(login.body.user.readinessShared).toBe(false);
  });

  it("PATCH /api/me/readiness-visibility flips the flag; GET /api/me/readiness then returns the real score", async () => {
    const { athlete } = await createAthlete({ username: "ath.ready.on", firstName: "Ath", lastName: "On", squad: "GIRLS" });
    await recomputeReadiness(athlete.id);
    const score = await prisma.readinessScore.findFirstOrThrow({ where: { athleteId: athlete.id } });
    const token = await loginAs("ath.ready.on");

    const patch = await request(app)
      .patch("/api/me/readiness-visibility")
      .set("Authorization", `Bearer ${token}`)
      .send({ share: true });
    expect(patch.status).toBe(200);
    expect(patch.body).toEqual({ shared: true });

    const updated = await prisma.athlete.findUniqueOrThrow({ where: { id: athlete.id } });
    expect(updated.shareReadinessWithAthlete).toBe(true);

    const readiness = await request(app).get("/api/me/readiness").set("Authorization", `Bearer ${token}`);
    expect(readiness.status).toBe(200);
    expect(readiness.body.shared).toBe(true);
    expect(readiness.body.latest.id).toBe(score.id);
    expect(readiness.body.latest.score).toBe(score.score);
  });

  it("can be turned back off after being on, and GET /api/me/readiness immediately withholds the score again", async () => {
    const { athlete } = await createAthlete({ username: "ath.ready.toggle", firstName: "Ath", lastName: "Toggle", squad: "GIRLS" });
    await recomputeReadiness(athlete.id);
    const token = await loginAs("ath.ready.toggle");

    await request(app).patch("/api/me/readiness-visibility").set("Authorization", `Bearer ${token}`).send({ share: true });
    const off = await request(app).patch("/api/me/readiness-visibility").set("Authorization", `Bearer ${token}`).send({ share: false });
    expect(off.body).toEqual({ shared: false });

    const readiness = await request(app).get("/api/me/readiness").set("Authorization", `Bearer ${token}`);
    expect(readiness.body).toEqual({ shared: false, latest: null });
  });

  it("403s for a coach on both routes -- this is an athlete-only, self-owned setting", async () => {
    await createCoach({ username: "coach.ready", firstName: "Coach", lastName: "Ready" });
    const token = await loginAs("coach.ready");

    const patch = await request(app)
      .patch("/api/me/readiness-visibility")
      .set("Authorization", `Bearer ${token}`)
      .send({ share: true });
    expect(patch.status).toBe(403);

    const get = await request(app).get("/api/me/readiness").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(403);
  });

  it("400s on a non-boolean share value", async () => {
    await createAthlete({ username: "ath.ready.bad", firstName: "Ath", lastName: "Bad", squad: "GIRLS" });
    const token = await loginAs("ath.ready.bad");

    const res = await request(app)
      .patch("/api/me/readiness-visibility")
      .set("Authorization", `Bearer ${token}`)
      .send({ share: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/me/push-subscription with no VAPID keys configured", () => {
  // Unlike pushSubscription.test.ts (which mocks pushEnabled to true to
  // test the route's own upsert/ownership logic), this exercises the
  // real, unmocked lib/push.js -- no VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
  // is set anywhere in this test tier, the same actual state production
  // is in right now (see push.ts's own comment).
  it("503s rather than silently accepting a subscription nothing will ever use", async () => {
    await createAthlete({ username: "ath.push.unconfigured", firstName: "Push", lastName: "Unconfigured", squad: "GIRLS" });
    const token = await loginAs("ath.push.unconfigured");

    const res = await request(app)
      .post("/api/me/push-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "https://push.example.com/x", keys: { p256dh: "a", auth: "b" } });
    expect(res.status).toBe(503);
  });
});

describe("GET /api/me/export", () => {
  it("an athlete's export includes their own check-ins, runs, injuries, and notes from their coach", async () => {
    const coach = await createCoach({ username: "coach.export", firstName: "Exp", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.export", firstName: "Exp", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("ath.export");

    await request(app)
      .post("/api/wellness")
      .set("Authorization", `Bearer ${token}`)
      .send({ sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 });
    await request(app)
      .post("/api/training-load")
      .set("Authorization", `Bearer ${token}`)
      .send({ runType: "Easy 4mi", durationMin: 32, rpe: 4 });
    await prisma.injury.create({ data: { athleteId: athlete.id, description: "Sore knee" } });
    await prisma.note.create({ data: { athleteId: athlete.id, coachId: coach.id, body: "Keep an eye on that knee." } });

    const res = await request(app).get("/api/me/export").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.account.username).toBe("ath.export");
    expect(res.body.checkIns).toHaveLength(1);
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.injuries).toHaveLength(1);
    expect(res.body.coachNotes).toEqual([expect.objectContaining({ body: "Keep an eye on that knee.", from: "Exp Coach" })]);
    expect(res.body.readinessScores.length).toBeGreaterThanOrEqual(1);
  });

  it("a coach's export includes the notes they've written, not a full roster dump", async () => {
    const coach = await createCoach({ username: "coach.export2", firstName: "Exp2", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.export2", firstName: "Exp2", lastName: "Athlete", squad: "BOYS" });
    await assignRoster(coach.id, athlete.id);
    await prisma.note.create({ data: { athleteId: athlete.id, coachId: coach.id, body: "Great progress this week." } });
    const token = await loginAs("coach.export2");

    const res = await request(app).get("/api/me/export").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.account.username).toBe("coach.export2");
    expect(res.body.notesYouWrote).toEqual([expect.objectContaining({ body: "Great progress this week.", about: "Exp2 Athlete" })]);
    expect(res.body.checkIns).toBeUndefined();
  });
});

describe("DELETE /api/me (self-service account deletion)", () => {
  it("wrong currentPassword -> 400, account untouched", async () => {
    await createAthlete({ username: "ath.del.wrong", firstName: "Del", lastName: "Wrong", squad: "GIRLS" });
    const token = await loginAs("ath.del.wrong");

    const res = await request(app)
      .delete("/api/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "not-it" });
    expect(res.status).toBe(400);

    const stillThere = await prisma.user.findUnique({ where: { username: "ath.del.wrong" } });
    expect(stillThere).not.toBeNull();
  });

  it("anonymizes an athlete's account, preserves their history, and removes them from every coach's roster", async () => {
    const coach = await createCoach({ username: "coach.del", firstName: "Del", lastName: "Coach" });
    const { user, athlete } = await createAthlete({ username: "ath.del.real", firstName: "Del", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: new Date(), sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });
    const token = await loginAs("ath.del.real");

    const res = await request(app)
      .delete("/api/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const anonymized = await prisma.user.findUniqueOrThrow({ where: { id: user!.id } });
    expect(anonymized.username).toMatch(/^deleted-/);
    expect(anonymized.email).toMatch(/^deleted-.*@deleted\.relaycoach\.app$/);
    expect(anonymized.firstName).toBe("Deleted");
    expect(anonymized.lastName).toBe("Athlete");

    const anonymizedAthlete = await prisma.athlete.findUniqueOrThrow({ where: { id: athlete.id } });
    expect(anonymizedAthlete.name).toBe("Deleted Athlete");

    // History survives -- this is anonymization, not deletion.
    expect(await prisma.wellnessEntry.count({ where: { athleteId: athlete.id } })).toBe(1);

    // No longer on the coach's roster.
    expect(await prisma.coachAthlete.count({ where: { athleteId: athlete.id } })).toBe(0);

    // The old password (and old username) can never log in again.
    const oldLogin = await request(app).post("/api/auth/login").send({ username: "ath.del.real", password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);
  });

  it("removes a coach's own roster links on deletion, leaving their solo-coached athlete with no coach", async () => {
    const coach = await createCoach({ username: "coach.del.solo", firstName: "Solo", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.del.orphan", firstName: "Orphan", lastName: "Athlete", squad: "BOYS" });
    await assignRoster(coach.id, athlete.id);
    const token = await loginAs("coach.del.solo");

    const res = await request(app)
      .delete("/api/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(await prisma.coachAthlete.count({ where: { athleteId: athlete.id } })).toBe(0);
  });
});
