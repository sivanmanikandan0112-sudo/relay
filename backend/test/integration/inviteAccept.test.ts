import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignSchool, createCoach, ensureSchool, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function sendInvite(coachToken: string, email: string) {
  const res = await request(app)
    .post("/api/invites/bulk")
    .set("Authorization", `Bearer ${coachToken}`)
    .send({ emails: [email] });
  return res.body.invites.find((i: { email: string }) => i.email === email) as { id: string; token: string };
}

describe("POST /api/invites/bulk", () => {
  it("400s missing emails -- no squad required anymore", async () => {
    await createCoach({ username: "coach.bulk", firstName: "Coach", lastName: "Bulk" });
    const token = await loginAs("coach.bulk");
    const res = await request(app).post("/api/invites/bulk").set("Authorization", `Bearer ${token}`).send({ emails: [] });
    expect(res.status).toBe(400);
  });

  it("creates invites with no squad assigned -- the invited athlete picks their own squad via gender at accept time", async () => {
    await createCoach({ username: "coach.tokens", firstName: "Coach", lastName: "Tokens" });
    const token = await loginAs("coach.tokens");
    const res = await request(app)
      .post("/api/invites/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ emails: ["a@example.com", "b@example.com"] });
    const invites = res.body.invites as { token: string; expiresAt: string; squadId: string | null }[];
    expect(invites).toHaveLength(2);
    expect(new Set(invites.map((i) => i.token)).size).toBe(2);
    for (const inv of invites) {
      expect(new Date(inv.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(inv.squadId).toBeNull();
    }
  });
});

describe("DELETE /api/invites/:id", () => {
  it("a coach can remove their own pending invite, and its token stops working", async () => {
    await createCoach({ username: "coach.remove", firstName: "Coach", lastName: "Remove" });
    const token = await loginAs("coach.remove");
    const invite = await sendInvite(token, "unwanted@example.com");

    const del = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toBeNull();
    const lookup = await request(app).get(`/api/invite-accept/${invite.token}`);
    expect(lookup.status).toBe(404);
  });

  it("removing it frees the email to be re-invited", async () => {
    await createCoach({ username: "coach.reinvite", firstName: "Coach", lastName: "Reinvite" });
    const token = await loginAs("coach.reinvite");
    const first = await sendInvite(token, "reinvite@example.com");
    await request(app).delete(`/api/invites/${first.id}`).set("Authorization", `Bearer ${token}`);

    const second = await sendInvite(token, "reinvite@example.com");
    expect(second).toBeTruthy();
    expect(second.id).not.toBe(first.id);
  });

  it("404s for another coach's invite", async () => {
    await createCoach({ username: "coach.owner", firstName: "Coach", lastName: "Owner" });
    const ownerToken = await loginAs("coach.owner");
    await createCoach({ username: "coach.intruder", firstName: "Coach", lastName: "Intruder" });
    const intruderToken = await loginAs("coach.intruder");
    const invite = await sendInvite(ownerToken, "notyours@example.com");

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

  it("removes an already-accepted invite -- it's just history at that point, the roster relationship is untouched", async () => {
    await createCoach({ username: "coach.late", firstName: "Coach", lastName: "Late" });
    const token = await loginAs("coach.late");
    const invite = await sendInvite(token, "alreadyjoined@example.com");
    await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "already.joined",
      password: "RealPassword123!",
      firstName: "Already",
      lastName: "Joined",
      gender: "MALE",
    });

    const res = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { username: "already.joined" } })).not.toBeNull();
  });
});

describe("GET /api/invite-accept/:token", () => {
  it("returns the inviting coach for a valid token, no auth required", async () => {
    const coach = await createCoach({ username: "coach.details", firstName: "Coach", lastName: "Details" });
    const coachToken = await loginAs("coach.details");
    const invite = await sendInvite(coachToken, "athlete@example.com");

    const res = await request(app).get(`/api/invite-accept/${invite.token}`); // no Authorization header at all
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "athlete@example.com", coachName: "Coach Details" });
    expect(coach).toBeTruthy();
  });

  it("404s for a token that doesn't exist", async () => {
    const res = await request(app).get("/api/invite-accept/not-a-real-token");
    expect(res.status).toBe(404);
  });

  it("404s for an expired token", async () => {
    const coach = await createCoach({ username: "coach.expiredinv", firstName: "Coach", lastName: "ExpiredInv" });
    const expired = await prisma.invite.create({
      data: {
        email: "late@example.com",
        invitedById: coach.id,
        token: "expired-invite-token",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request(app).get(`/api/invite-accept/${expired.token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/invite-accept/:token", () => {
  it("creates a real account, derives the squad from the chosen gender, and joins the inviting coach's roster", async () => {
    const coach = await createCoach({ username: "coach.accept", firstName: "Coach", lastName: "Accept" });
    const coachToken = await loginAs("coach.accept");
    const invite = await sendInvite(coachToken, "newkid@example.com");

    const res = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "new.kid",
      password: "RealPassword123!",
      firstName: "New",
      lastName: "Kid",
      gender: "MALE",
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username: "new.kid", role: "ATHLETE", gender: "MALE", hasCoach: true });

    const athlete = await prisma.athlete.findUnique({ where: { id: res.body.user.athleteId }, include: { squad: true } });
    expect(athlete?.gender).toBe("MALE");
    expect(athlete?.squad.name).toBe("BOYS");
    const roster = await prisma.coachAthlete.findUnique({
      where: { coachId_athleteId: { coachId: coach.id, athleteId: res.body.user.athleteId } },
    });
    expect(roster).not.toBeNull();

    const updatedInvite = await prisma.invite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite?.status).toBe("ACCEPTED");
  });

  it("400s an ATHLETE accept with no gender", async () => {
    await createCoach({ username: "coach.nogender", firstName: "Coach", lastName: "NoGender" });
    const coachToken = await loginAs("coach.nogender");
    const invite = await sendInvite(coachToken, "nogender@example.com");

    const res = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "no.gender",
      password: "RealPassword123!",
      firstName: "No",
      lastName: "Gender",
    });
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { username: "no.gender" } })).toBeNull();
  });

  it("the created account can actually log in afterward", async () => {
    await createCoach({ username: "coach.accept2", firstName: "Coach", lastName: "Accept2" });
    const coachToken = await loginAs("coach.accept2");
    const invite = await sendInvite(coachToken, "loginproof@example.com");
    await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "login.proof",
      password: "RealPassword123!",
      firstName: "Login",
      lastName: "Proof",
      gender: "FEMALE",
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "login.proof", password: "RealPassword123!" });
    expect(login.status).toBe(200);
  });

  it("rejects reusing an already-accepted invite token", async () => {
    await createCoach({ username: "coach.reuse", firstName: "Coach", lastName: "Reuse" });
    const coachToken = await loginAs("coach.reuse");
    const invite = await sendInvite(coachToken, "onlyonce@example.com");
    const first = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "only.once",
      password: "RealPassword123!",
      firstName: "Only",
      lastName: "Once",
      gender: "FEMALE",
    });
    expect(first.status).toBe(201);

    const second = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "someone.else",
      password: "AnotherPassword123!",
      firstName: "Someone",
      lastName: "Else",
      gender: "FEMALE",
    });
    expect(second.status).toBe(404);
  });

  it("rejects a username that's already taken", async () => {
    await createCoach({ username: "coach.dupuser", firstName: "Coach", lastName: "DupUser" });
    const coachToken = await loginAs("coach.dupuser");
    const invite = await sendInvite(coachToken, "dup@example.com");

    const res = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "coach.dupuser", // the coach's own username
      password: "RealPassword123!",
      firstName: "Dup",
      lastName: "User",
      gender: "FEMALE",
    });
    expect(res.status).toBe(409);
  });

  it("rejects a password under 8 characters", async () => {
    await createCoach({ username: "coach.shortpw", firstName: "Coach", lastName: "ShortPw" });
    const coachToken = await loginAs("coach.shortpw");
    const invite = await sendInvite(coachToken, "shortpw@example.com");

    const res = await request(app)
      .post(`/api/invite-accept/${invite.token}`)
      .send({ username: "short.pw", password: "short", firstName: "Short", lastName: "Pw", gender: "FEMALE" });
    expect(res.status).toBe(400);
  });
});

async function sendCoachInvite(coachToken: string, schoolId: string, email: string) {
  const res = await request(app)
    .post(`/api/schools/${schoolId}/invite-coach`)
    .set("Authorization", `Bearer ${coachToken}`)
    .send({ email });
  return res.body.invite as { id: string; token: string };
}

describe("GET /api/invite-accept/:token -- COACH_TO_SCHOOL", () => {
  it("returns type, schoolName, and targetAccountExists: false for a brand-new email", async () => {
    const school = await ensureSchool("Flower Mound High School");
    const coach = await createCoach({ username: "coach.schoolinviter", firstName: "School", lastName: "Inviter" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.schoolinviter");
    const invite = await sendCoachInvite(token, school.id, "newcoach@example.com");

    const res = await request(app).get(`/api/invite-accept/${invite.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "COACH_TO_SCHOOL",
      schoolName: "Flower Mound High School",
      targetAccountExists: false,
    });
  });

  it("targetAccountExists: true when the invited email already has an account", async () => {
    const school = await ensureSchool("Marcus High School");
    const inviter = await createCoach({ username: "coach.marcus.inviter", firstName: "Marcus", lastName: "Inviter" });
    await assignSchool(inviter.id, school.id);
    const inviterToken = await loginAs("coach.marcus.inviter");
    await createCoach({ username: "coach.alreadyexists", firstName: "Already", lastName: "Exists" }); // email: coach.alreadyexists@test.relay
    const invite = await sendCoachInvite(inviterToken, school.id, "coach.alreadyexists@test.relay");

    const res = await request(app).get(`/api/invite-accept/${invite.token}`);
    expect(res.status).toBe(200);
    expect(res.body.targetAccountExists).toBe(true);
  });
});

describe("POST /api/invite-accept/:token -- COACH_TO_SCHOOL, new account", () => {
  it("creates a role: COACH account with schoolId set, no Athlete/CoachAthlete rows", async () => {
    const school = await ensureSchool("New Coach High");
    const coach = await createCoach({ username: "coach.newcoachinviter", firstName: "New", lastName: "CoachInviter" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.newcoachinviter");
    const invite = await sendCoachInvite(token, school.id, "brandnew@example.com");

    const res = await request(app).post(`/api/invite-accept/${invite.token}`).send({
      username: "brand.new",
      password: "RealPassword123!",
      firstName: "Brand",
      lastName: "New",
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: "COACH", schoolId: school.id, isSuperAdmin: false, athleteId: null });

    const created = await prisma.user.findUnique({ where: { username: "brand.new" } });
    expect(created?.role).toBe("COACH");
    expect(created?.schoolId).toBe(school.id);
    expect(await prisma.athlete.findUnique({ where: { userId: created!.id } })).toBeNull();
    expect(await prisma.coachAthlete.count({ where: { coachId: created!.id } })).toBe(0);

    const updatedInvite = await prisma.invite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite?.status).toBe("ACCEPTED");
  });
});

describe("POST /api/invite-accept/:token/attach -- COACH_TO_SCHOOL, existing account", () => {
  it("sets schoolId on the authenticated caller when their email matches the invite", async () => {
    const school = await ensureSchool("Attach High");
    const inviter = await createCoach({ username: "coach.attachinviter", firstName: "Attach", lastName: "Inviter" });
    await assignSchool(inviter.id, school.id);
    const inviterToken = await loginAs("coach.attachinviter");
    await createCoach({ username: "coach.attachtarget", firstName: "Attach", lastName: "Target" }); // coach.attachtarget@test.relay
    const invite = await sendCoachInvite(inviterToken, school.id, "coach.attachtarget@test.relay");

    const targetToken = await loginAs("coach.attachtarget");
    const res = await request(app)
      .post(`/api/invite-accept/${invite.token}/attach`)
      .set("Authorization", `Bearer ${targetToken}`);
    expect(res.status).toBe(200);
    expect(res.body.schoolId).toBe(school.id);

    const updated = await prisma.user.findUnique({ where: { username: "coach.attachtarget" } });
    expect(updated?.schoolId).toBe(school.id);
    const updatedInvite = await prisma.invite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite?.status).toBe("ACCEPTED");
  });

  it("403s when the authenticated caller's email doesn't match the invite", async () => {
    const school = await ensureSchool("Wrong Account High");
    const inviter = await createCoach({ username: "coach.wronginviter", firstName: "Wrong", lastName: "Inviter" });
    await assignSchool(inviter.id, school.id);
    const inviterToken = await loginAs("coach.wronginviter");
    await createCoach({ username: "coach.realtarget", firstName: "Real", lastName: "Target" });
    const invite = await sendCoachInvite(inviterToken, school.id, "coach.realtarget@test.relay");

    const impostor = await createCoach({ username: "coach.impostor", firstName: "Impostor", lastName: "Coach" });
    const impostorToken = await loginAs("coach.impostor");
    const res = await request(app)
      .post(`/api/invite-accept/${invite.token}/attach`)
      .set("Authorization", `Bearer ${impostorToken}`);
    expect(res.status).toBe(403);
    expect(impostor).toBeTruthy();

    const updatedInvite = await prisma.invite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite?.status).toBe("PENDING"); // not consumed by the failed attempt
  });

  it("401s unauthenticated", async () => {
    const school = await ensureSchool("Unauth High");
    const inviter = await createCoach({ username: "coach.unauthinviter", firstName: "Unauth", lastName: "Inviter" });
    await assignSchool(inviter.id, school.id);
    const inviterToken = await loginAs("coach.unauthinviter");
    const invite = await sendCoachInvite(inviterToken, school.id, "someone@example.com");

    const res = await request(app).post(`/api/invite-accept/${invite.token}/attach`);
    expect(res.status).toBe(401);
  });

  it("400s for an ATHLETE-type invite token", async () => {
    await createCoach({ username: "coach.wrongtype", firstName: "Wrong", lastName: "Type" });
    const coachToken = await loginAs("coach.wrongtype");
    const athleteInvite = await sendInvite(coachToken, "athletetarget@example.com");

    const someCoach = await createCoach({ username: "coach.attachattempt", firstName: "Attach", lastName: "Attempt" });
    const someToken = await loginAs("coach.attachattempt");
    const res = await request(app)
      .post(`/api/invite-accept/${athleteInvite.token}/attach`)
      .set("Authorization", `Bearer ${someToken}`);
    expect(res.status).toBe(400);
    expect(someCoach).toBeTruthy();
  });
});
