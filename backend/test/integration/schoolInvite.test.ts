import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignSchool, createCoach, ensureSchool, ensureSquad, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/schools/:id/invite-coach", () => {
  it("403s for a coach who isn't a member of that school", async () => {
    const school = await ensureSchool("Flower Mound High School");
    await createCoach({ username: "coach.notmember", firstName: "Not", lastName: "Member" });
    const token = await loginAs("coach.notmember");

    const res = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "newcoach@example.com" });
    expect(res.status).toBe(403);
  });

  it("201s and creates a COACH_TO_SCHOOL invite for a member of the school", async () => {
    const school = await ensureSchool("Marcus High School");
    const coach = await createCoach({ username: "coach.inviter", firstName: "Inviter", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.inviter");

    const res = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "melissa@fmhs.edu" });
    expect(res.status).toBe(201);
    expect(res.body.invite.email).toBe("melissa@fmhs.edu");
    expect(res.body.invite.type).toBe("COACH_TO_SCHOOL");
    expect(res.body.invite.schoolId).toBe(school.id);
    expect(res.body.invite.squadId).toBeNull();

    const stored = await prisma.invite.findUnique({ where: { id: res.body.invite.id } });
    expect(stored?.status).toBe("PENDING");
  });

  it("409s on a duplicate pending invite to the same email for the same school", async () => {
    const school = await ensureSchool("Duplicate Invite High");
    const coach = await createCoach({ username: "coach.dupinviter", firstName: "Dup", lastName: "Inviter" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.dupinviter");

    await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "again@example.com" });
    const second = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "again@example.com" });
    expect(second.status).toBe(409);
  });

  it("a super admin can invite into a school they don't belong to", async () => {
    const school = await ensureSchool("Super Admin Target High");
    const admin = await createCoach({ username: "coach.superadmin", firstName: "Super", lastName: "Admin" });
    await prisma.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    const token = await loginAs("coach.superadmin");

    const res = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "invited-by-admin@example.com" });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/schools/:id/invites/:inviteId/resend", () => {
  it("rotates the token and pushes expiresAt back out, and the old link stops working", async () => {
    const school = await ensureSchool("Resend Coach Invite High");
    const coach = await createCoach({ username: "coach.resendinvite.sender", firstName: "Sender", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.resendinvite.sender");

    const created = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "resend.coach@example.com" });
    const oldToken = created.body.invite.token as string;

    const res = await request(app)
      .post(`/api/schools/${school.id}/invites/${created.body.invite.id}/resend`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invite.token).not.toBe(oldToken);
    expect(new Date(res.body.invite.expiresAt).getTime()).toBeGreaterThan(new Date(created.body.invite.expiresAt).getTime());

    const oldLookup = await request(app).get(`/api/invite-accept/${oldToken}`);
    expect(oldLookup.status).toBe(404);
    const newLookup = await request(app).get(`/api/invite-accept/${res.body.invite.token}`);
    expect(newLookup.status).toBe(200);
  });

  it("any member coach can resend, not just whoever originally sent it -- matches the shared, school-wide invite list", async () => {
    const school = await ensureSchool("Resend Any Member High");
    const sender = await createCoach({ username: "coach.resendany.sender", firstName: "Sender", lastName: "Coach" });
    const schoolmate = await createCoach({ username: "coach.resendany.mate", firstName: "Mate", lastName: "Coach" });
    await assignSchool(sender.id, school.id);
    await assignSchool(schoolmate.id, school.id);
    const senderToken = await loginAs("coach.resendany.sender");
    const mateToken = await loginAs("coach.resendany.mate");

    const created = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ email: "resend.any@example.com" });

    const res = await request(app)
      .post(`/api/schools/${school.id}/invites/${created.body.invite.id}/resend`)
      .set("Authorization", `Bearer ${mateToken}`);
    expect(res.status).toBe(200);
  });

  it("403s for a coach who isn't a member of that school", async () => {
    const school = await ensureSchool("Resend Outsider High");
    const member = await createCoach({ username: "coach.resendoutsider.member", firstName: "Member", lastName: "Coach" });
    await assignSchool(member.id, school.id);
    await createCoach({ username: "coach.resendoutsider.outsider", firstName: "Outsider", lastName: "Coach" });
    const memberToken = await loginAs("coach.resendoutsider.member");
    const outsiderToken = await loginAs("coach.resendoutsider.outsider");

    const created = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ email: "resend.outsider@example.com" });

    const res = await request(app)
      .post(`/api/schools/${school.id}/invites/${created.body.invite.id}/resend`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("400s resending an ACCEPTED invite", async () => {
    const school = await ensureSchool("Resend Accepted High");
    const coach = await createCoach({ username: "coach.resendaccepted", firstName: "Resend", lastName: "Accepted" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.resendaccepted");

    const created = await request(app)
      .post(`/api/schools/${school.id}/invite-coach`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "resend.accepted@example.com" });
    await prisma.invite.update({ where: { id: created.body.invite.id }, data: { status: "ACCEPTED" } });

    const res = await request(app)
      .post(`/api/schools/${school.id}/invites/${created.body.invite.id}/resend`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("404s resending an ATHLETE-type invite through this school-scoped route", async () => {
    const school = await ensureSchool("Resend Wrongtype High");
    const coach = await createCoach({ username: "coach.resendwrongtype", firstName: "Wrong", lastName: "Type" });
    await assignSchool(coach.id, school.id);
    const squad = await ensureSquad("GIRLS");
    const invite = await prisma.invite.create({
      data: {
        email: "resend.wrongtype2@example.com",
        invitedById: coach.id,
        type: "ATHLETE",
        squadId: squad.id,
        status: "PENDING",
        token: crypto.randomBytes(24).toString("hex"),
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    const token = await loginAs("coach.resendwrongtype");

    const res = await request(app)
      .post(`/api/schools/${school.id}/invites/${invite.id}/resend`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
