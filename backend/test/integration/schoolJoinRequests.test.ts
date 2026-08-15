import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignSchool, createCoach, ensureSchool, ensureSquad, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
  await ensureSquad("GIRLS");
  await ensureSquad("BOYS");
});

async function joinCodeFor(schoolId: string, token: string) {
  const res = await request(app).get(`/api/schools/${schoolId}`).set("Authorization", `Bearer ${token}`);
  return res.body.joinCode as string;
}

const validRequestBody = {
  firstName: "New",
  lastName: "Athlete",
  username: "new.athlete.request",
  email: "new.athlete@example.com",
  password: "TestPass123!",
  squad: "GIRLS",
};

describe("GET /api/join/:code", () => {
  it("resolves a real code to the school's name", async () => {
    const school = await ensureSchool("Lincoln High School");
    const coach = await createCoach({ username: "coach.joincode", firstName: "Join", lastName: "Code" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.joincode");
    const code = await joinCodeFor(school.id, token);
    expect(code).toBeTruthy();

    const res = await request(app).get(`/api/join/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.schoolName).toBe("Lincoln High School");
  });

  it("is case-insensitive", async () => {
    const school = await ensureSchool("Case Insensitive High");
    const coach = await createCoach({ username: "coach.caseinsensitive", firstName: "Case", lastName: "Insensitive" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.caseinsensitive");
    const code = await joinCodeFor(school.id, token);

    const res = await request(app).get(`/api/join/${code.toLowerCase()}`);
    expect(res.status).toBe(200);
  });

  it("404s an unknown code", async () => {
    const res = await request(app).get("/api/join/NOTREAL");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/join/:code", () => {
  it("creates a PENDING SchoolJoinRequest, not a User", async () => {
    const school = await ensureSchool("Request Flow High");
    const coach = await createCoach({ username: "coach.requestflow", firstName: "Request", lastName: "Flow" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.requestflow");
    const code = await joinCodeFor(school.id, token);

    const res = await request(app).post(`/api/join/${code}`).send(validRequestBody);
    expect(res.status).toBe(201);
    expect(res.body.schoolName).toBe("Request Flow High");

    const stored = await prisma.schoolJoinRequest.findFirst({ where: { username: "new.athlete.request" } });
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("PENDING");
    expect(stored!.schoolId).toBe(school.id);

    // No account exists yet -- that's the whole point.
    const user = await prisma.user.findUnique({ where: { username: "new.athlete.request" } });
    expect(user).toBeNull();
  });

  it("404s an unknown code", async () => {
    const res = await request(app).post("/api/join/NOTREAL").send(validRequestBody);
    expect(res.status).toBe(404);
  });

  it("409s a username already taken by a real account", async () => {
    const school = await ensureSchool("Collision High");
    const coach = await createCoach({ username: "coach.collision", firstName: "Collision", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.collision");
    const code = await joinCodeFor(school.id, token);

    const res = await request(app)
      .post(`/api/join/${code}`)
      .send({ ...validRequestBody, username: "coach.collision" });
    expect(res.status).toBe(409);
  });

  it("409s a second pending request from the same email at the same school", async () => {
    const school = await ensureSchool("Dup Request High");
    const coach = await createCoach({ username: "coach.duprequest", firstName: "Dup", lastName: "Request" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.duprequest");
    const code = await joinCodeFor(school.id, token);

    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const second = await request(app)
      .post(`/api/join/${code}`)
      .send({ ...validRequestBody, username: "different.username" });
    expect(second.status).toBe(409);
  });

  it("400s a short password", async () => {
    const school = await ensureSchool("Bad Password High");
    const coach = await createCoach({ username: "coach.badpw", firstName: "Bad", lastName: "Pw" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.badpw");
    const code = await joinCodeFor(school.id, token);

    const res = await request(app)
      .post(`/api/join/${code}`)
      .send({ ...validRequestBody, password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/schools/:id/requests", () => {
  it("shows a pending request to any coach at the school, not just the one whose code was used", async () => {
    const school = await ensureSchool("Shared Queue High");
    const coachA = await createCoach({ username: "coach.queue.a", firstName: "Coach", lastName: "A" });
    const coachB = await createCoach({ username: "coach.queue.b", firstName: "Coach", lastName: "B" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);
    const tokenA = await loginAs("coach.queue.a");
    const tokenB = await loginAs("coach.queue.b");
    const code = await joinCodeFor(school.id, tokenA);

    await request(app).post(`/api/join/${code}`).send(validRequestBody);

    const res = await request(app).get(`/api/schools/${school.id}/requests`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe("new.athlete.request");
    expect(res.body[0].squadName).toBe("GIRLS");
  });

  it("403s a coach who isn't a member of that school", async () => {
    const school = await ensureSchool("Outsider High");
    await createCoach({ username: "coach.outsider", firstName: "Out", lastName: "Sider" });
    const token = await loginAs("coach.outsider");
    const res = await request(app).get(`/api/schools/${school.id}/requests`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/schools/:id/requests/:reqId/approve", () => {
  it("creates a real User+Athlete+CoachAthlete, and the approving coach becomes the roster coach", async () => {
    const school = await ensureSchool("Approve High");
    const coach = await createCoach({ username: "coach.approve", firstName: "Approve", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.approve");
    const code = await joinCodeFor(school.id, token);
    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const request_ = await prisma.schoolJoinRequest.findFirstOrThrow({ where: { username: "new.athlete.request" } });

    const res = await request(app)
      .post(`/api/schools/${school.id}/requests/${request_.id}/approve`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("new.athlete.request");

    const user = await prisma.user.findUniqueOrThrow({ where: { username: "new.athlete.request" } });
    expect(user.role).toBe("ATHLETE");
    const athlete = await prisma.athlete.findUniqueOrThrow({ where: { userId: user.id } });
    const roster = await prisma.coachAthlete.findUnique({ where: { coachId_athleteId: { coachId: coach.id, athleteId: athlete.id } } });
    expect(roster).not.toBeNull();

    const updatedRequest = await prisma.schoolJoinRequest.findUniqueOrThrow({ where: { id: request_.id } });
    expect(updatedRequest.status).toBe("APPROVED");
    expect(updatedRequest.decidedByUserId).toBe(coach.id);

    // The chosen password actually works on a real login.
    const login = await request(app).post("/api/auth/login").send({ username: "new.athlete.request", password: "TestPass123!" });
    expect(login.status).toBe(200);
  });

  it("lets a *different* coach at the same school approve it", async () => {
    const school = await ensureSchool("Cross Approve High");
    const coachA = await createCoach({ username: "coach.crossapprove.a", firstName: "Coach", lastName: "A" });
    const coachB = await createCoach({ username: "coach.crossapprove.b", firstName: "Coach", lastName: "B" });
    await assignSchool(coachA.id, school.id);
    await assignSchool(coachB.id, school.id);
    const tokenA = await loginAs("coach.crossapprove.a");
    const tokenB = await loginAs("coach.crossapprove.b");
    const code = await joinCodeFor(school.id, tokenA);
    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const request_ = await prisma.schoolJoinRequest.findFirstOrThrow({ where: { username: "new.athlete.request" } });

    const res = await request(app)
      .post(`/api/schools/${school.id}/requests/${request_.id}/approve`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(200);

    const athlete = await prisma.athlete.findFirstOrThrow({ where: { user: { username: "new.athlete.request" } } });
    const roster = await prisma.coachAthlete.findUnique({ where: { coachId_athleteId: { coachId: coachB.id, athleteId: athlete.id } } });
    expect(roster).not.toBeNull();
  });

  it("409s if the username was taken by a real account after the request came in", async () => {
    const school = await ensureSchool("Stale Approve High");
    const coach = await createCoach({ username: "coach.staleapprove", firstName: "Stale", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.staleapprove");
    const code = await joinCodeFor(school.id, token);
    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const request_ = await prisma.schoolJoinRequest.findFirstOrThrow({ where: { username: "new.athlete.request" } });

    // Someone else grabs the exact same username via a real account in the meantime.
    await createCoach({ username: "new.athlete.request", firstName: "Sniped", lastName: "It" });

    const res = await request(app)
      .post(`/api/schools/${school.id}/requests/${request_.id}/approve`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it("404s approving an already-decided request", async () => {
    const school = await ensureSchool("Already Decided High");
    const coach = await createCoach({ username: "coach.alreadydecided", firstName: "Already", lastName: "Decided" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.alreadydecided");
    const code = await joinCodeFor(school.id, token);
    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const request_ = await prisma.schoolJoinRequest.findFirstOrThrow({ where: { username: "new.athlete.request" } });

    await request(app).post(`/api/schools/${school.id}/requests/${request_.id}/approve`).set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .post(`/api/schools/${school.id}/requests/${request_.id}/approve`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(404);
  });

  it("403s a coach who isn't a member of that school", async () => {
    const school = await ensureSchool("Approve Outsider High");
    const coach = await createCoach({ username: "coach.approveowner", firstName: "Owner", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const ownerToken = await loginAs("coach.approveowner");
    const code = await joinCodeFor(school.id, ownerToken);
    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const request_ = await prisma.schoolJoinRequest.findFirstOrThrow({ where: { username: "new.athlete.request" } });

    await createCoach({ username: "coach.approveoutsider", firstName: "Out", lastName: "Sider" });
    const outsiderToken = await loginAs("coach.approveoutsider");
    const res = await request(app)
      .post(`/api/schools/${school.id}/requests/${request_.id}/approve`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);

    const user = await prisma.user.findUnique({ where: { username: "new.athlete.request" } });
    expect(user).toBeNull();
  });
});

describe("POST /api/schools/:id/requests/:reqId/reject", () => {
  it("closes the request out with no account ever created", async () => {
    const school = await ensureSchool("Reject High");
    const coach = await createCoach({ username: "coach.reject", firstName: "Reject", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.reject");
    const code = await joinCodeFor(school.id, token);
    await request(app).post(`/api/join/${code}`).send(validRequestBody);
    const request_ = await prisma.schoolJoinRequest.findFirstOrThrow({ where: { username: "new.athlete.request" } });

    const res = await request(app)
      .post(`/api/schools/${school.id}/requests/${request_.id}/reject`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);

    const updated = await prisma.schoolJoinRequest.findUniqueOrThrow({ where: { id: request_.id } });
    expect(updated.status).toBe("REJECTED");
    const user = await prisma.user.findUnique({ where: { username: "new.athlete.request" } });
    expect(user).toBeNull();

    // No longer shows up in the pending queue.
    const queue = await request(app).get(`/api/schools/${school.id}/requests`).set("Authorization", `Bearer ${token}`);
    expect(queue.body).toHaveLength(0);
  });
});

describe("POST /api/schools/:id/regenerate-code", () => {
  it("replaces the code -- the old one stops resolving, the new one works", async () => {
    const school = await ensureSchool("Regenerate High");
    const coach = await createCoach({ username: "coach.regenerate", firstName: "Regen", lastName: "Coach" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.regenerate");
    const oldCode = await joinCodeFor(school.id, token);

    const res = await request(app).post(`/api/schools/${school.id}/regenerate-code`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const newCode = res.body.joinCode as string;
    expect(newCode).not.toBe(oldCode);

    expect((await request(app).get(`/api/join/${oldCode}`)).status).toBe(404);
    expect((await request(app).get(`/api/join/${newCode}`)).status).toBe(200);
  });

  it("doesn't affect requests already submitted under the old code", async () => {
    const school = await ensureSchool("Regenerate Preserve High");
    const coach = await createCoach({ username: "coach.regeneratepreserve", firstName: "Regen", lastName: "Preserve" });
    await assignSchool(coach.id, school.id);
    const token = await loginAs("coach.regeneratepreserve");
    const oldCode = await joinCodeFor(school.id, token);
    await request(app).post(`/api/join/${oldCode}`).send(validRequestBody);

    await request(app).post(`/api/schools/${school.id}/regenerate-code`).set("Authorization", `Bearer ${token}`);

    const queue = await request(app).get(`/api/schools/${school.id}/requests`).set("Authorization", `Bearer ${token}`);
    expect(queue.body).toHaveLength(1);
  });

  it("403s a coach who isn't a member of that school", async () => {
    const school = await ensureSchool("Regenerate Outsider High");
    await createCoach({ username: "coach.regenerateoutsider", firstName: "Out", lastName: "Sider" });
    const token = await loginAs("coach.regenerateoutsider");
    const res = await request(app).post(`/api/schools/${school.id}/regenerate-code`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
