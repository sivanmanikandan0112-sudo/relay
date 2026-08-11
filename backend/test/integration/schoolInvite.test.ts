import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignSchool, createCoach, ensureSchool, resetDb } from "../testDb.js";
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
