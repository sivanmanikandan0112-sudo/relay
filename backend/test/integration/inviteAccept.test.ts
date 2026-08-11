import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { createCoach, ensureSquad, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function sendInvite(coachToken: string, email: string, squadId: string) {
  const res = await request(app)
    .post("/api/invites/bulk")
    .set("Authorization", `Bearer ${coachToken}`)
    .send({ emails: [email], squadId });
  return res.body.invites.find((i: { email: string }) => i.email === email) as { id: string; token: string };
}

describe("POST /api/invites/bulk", () => {
  it("requires a squadId now, not just emails", async () => {
    await createCoach({ username: "coach.bulk", firstName: "Coach", lastName: "Bulk" });
    const token = await loginAs("coach.bulk");
    const res = await request(app)
      .post("/api/invites/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ emails: ["someone@example.com"] });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown squadId", async () => {
    await createCoach({ username: "coach.badsquad", firstName: "Coach", lastName: "BadSquad" });
    const token = await loginAs("coach.badsquad");
    const res = await request(app)
      .post("/api/invites/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ emails: ["someone@example.com"], squadId: "not-a-real-squad" });
    expect(res.status).toBe(400);
  });

  it("each created invite has a unique token and a future expiry", async () => {
    await createCoach({ username: "coach.tokens", firstName: "Coach", lastName: "Tokens" });
    const token = await loginAs("coach.tokens");
    const squad = await ensureSquad("GIRLS");
    const res = await request(app)
      .post("/api/invites/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ emails: ["a@example.com", "b@example.com"], squadId: squad.id });
    const invites = res.body.invites as { token: string; expiresAt: string }[];
    expect(invites).toHaveLength(2);
    expect(new Set(invites.map((i) => i.token)).size).toBe(2);
    for (const inv of invites) expect(new Date(inv.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("DELETE /api/invites/:id", () => {
  it("a coach can remove their own pending invite, and its token stops working", async () => {
    await createCoach({ username: "coach.remove", firstName: "Coach", lastName: "Remove" });
    const token = await loginAs("coach.remove");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(token, "unwanted@example.com", squad.id);

    const del = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toBeNull();
    const lookup = await request(app).get(`/api/invite-accept/${invite.token}`);
    expect(lookup.status).toBe(404);
  });

  it("removing it frees the email to be re-invited", async () => {
    await createCoach({ username: "coach.reinvite", firstName: "Coach", lastName: "Reinvite" });
    const token = await loginAs("coach.reinvite");
    const squad = await ensureSquad("GIRLS");
    const first = await sendInvite(token, "reinvite@example.com", squad.id);
    await request(app).delete(`/api/invites/${first.id}`).set("Authorization", `Bearer ${token}`);

    const second = await sendInvite(token, "reinvite@example.com", squad.id);
    expect(second).toBeTruthy();
    expect(second.id).not.toBe(first.id);
  });

  it("404s for another coach's invite", async () => {
    await createCoach({ username: "coach.owner", firstName: "Coach", lastName: "Owner" });
    const ownerToken = await loginAs("coach.owner");
    await createCoach({ username: "coach.intruder", firstName: "Coach", lastName: "Intruder" });
    const intruderToken = await loginAs("coach.intruder");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(ownerToken, "notyours@example.com", squad.id);

    const res = await request(app)
      .delete(`/api/invites/${invite.id}`)
      .set("Authorization", `Bearer ${intruderToken}`);
    expect(res.status).toBe(404);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).not.toBeNull();
  });

  it("404s for a nonexistent invite id", async () => {
    await createCoach({ username: "coach.nowhere", firstName: "Coach", lastName: "Nowhere" });
    const token = await loginAs("coach.nowhere");
    const res = await request(app).delete("/api/invites/not-a-real-id").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("refuses to remove an already-accepted invite", async () => {
    await createCoach({ username: "coach.late", firstName: "Coach", lastName: "Late" });
    const token = await loginAs("coach.late");
    const squad = await ensureSquad("BOYS");
    const invite = await sendInvite(token, "alreadyjoined@example.com", squad.id);
    await request(app)
      .post(`/api/invite-accept/${invite.token}`)
      .send({ username: "already.joined", password: "RealPassword123!", firstName: "Already", lastName: "Joined" });

    const res = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).not.toBeNull();
  });
});

describe("GET /api/invite-accept/:token", () => {
  it("returns the inviting coach and squad for a valid token, no auth required", async () => {
    const coach = await createCoach({ username: "coach.details", firstName: "Coach", lastName: "Details" });
    const coachToken = await loginAs("coach.details");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(coachToken, "athlete@example.com", squad.id);

    const res = await request(app).get(`/api/invite-accept/${invite.token}`); // no Authorization header at all
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "athlete@example.com", squadName: "GIRLS", coachName: "Coach Details" });
    expect(coach).toBeTruthy();
  });

  it("404s for a token that doesn't exist", async () => {
    const res = await request(app).get("/api/invite-accept/not-a-real-token");
    expect(res.status).toBe(404);
  });

  it("404s for an expired token", async () => {
    const coach = await createCoach({ username: "coach.expiredinv", firstName: "Coach", lastName: "ExpiredInv" });
    const squad = await ensureSquad("GIRLS");
    const expired = await prisma.invite.create({
      data: {
        email: "late@example.com",
        invitedById: coach.id,
        squadId: squad.id,
        token: "expired-invite-token",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request(app).get(`/api/invite-accept/${expired.token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/invite-accept/:token", () => {
  it("creates a real account, joins the invited squad, and joins the inviting coach's roster", async () => {
    const coach = await createCoach({ username: "coach.accept", firstName: "Coach", lastName: "Accept" });
    const coachToken = await loginAs("coach.accept");
    const squad = await ensureSquad("BOYS");
    const invite = await sendInvite(coachToken, "newkid@example.com", squad.id);

    const res = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "new.kid",
      password: "RealPassword123!",
      firstName: "New",
      lastName: "Kid",
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username: "new.kid", role: "ATHLETE", gender: null, hasCoach: true });

    const athlete = await prisma.athlete.findUnique({ where: { id: res.body.user.athleteId } });
    expect(athlete?.squadId).toBe(squad.id);
    const roster = await prisma.coachAthlete.findUnique({
      where: { coachId_athleteId: { coachId: coach.id, athleteId: res.body.user.athleteId } },
    });
    expect(roster).not.toBeNull();

    const updatedInvite = await prisma.invite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite?.status).toBe("ACCEPTED");
  });

  it("the created account can actually log in afterward", async () => {
    await createCoach({ username: "coach.accept2", firstName: "Coach", lastName: "Accept2" });
    const coachToken = await loginAs("coach.accept2");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(coachToken, "loginproof@example.com", squad.id);
    await request(app)
      .post(`/api/invite-accept/${invite.token}`)
      .send({ username: "login.proof", password: "RealPassword123!", firstName: "Login", lastName: "Proof" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "login.proof", password: "RealPassword123!" });
    expect(login.status).toBe(200);
  });

  it("rejects reusing an already-accepted invite token", async () => {
    await createCoach({ username: "coach.reuse", firstName: "Coach", lastName: "Reuse" });
    const coachToken = await loginAs("coach.reuse");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(coachToken, "onlyonce@example.com", squad.id);
    const first = await request(app)
      .post(`/api/invite-accept/${invite.token}`)
      .send({ username: "only.once", password: "RealPassword123!", firstName: "Only", lastName: "Once" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/invite-accept/${invite.token}`)
      .send({ username: "someone.else", password: "AnotherPassword123!", firstName: "Someone", lastName: "Else" });
    expect(second.status).toBe(404);
  });

  it("rejects a username that's already taken", async () => {
    await createCoach({ username: "coach.dupuser", firstName: "Coach", lastName: "DupUser" });
    const coachToken = await loginAs("coach.dupuser");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(coachToken, "dup@example.com", squad.id);

    const res = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "coach.dupuser", // the coach's own username
      password: "RealPassword123!",
      firstName: "Dup",
      lastName: "User",
    });
    expect(res.status).toBe(409);
  });

  it("rejects a password under 8 characters", async () => {
    await createCoach({ username: "coach.shortpw", firstName: "Coach", lastName: "ShortPw" });
    const coachToken = await loginAs("coach.shortpw");
    const squad = await ensureSquad("GIRLS");
    const invite = await sendInvite(coachToken, "shortpw@example.com", squad.id);

    const res = await request(app)
      .post(`/api/invite-accept/${invite.token}`)
      .send({ username: "short.pw", password: "short", firstName: "Short", lastName: "Pw" });
    expect(res.status).toBe(400);
  });
});
