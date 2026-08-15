import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, ensureSquad, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

async function createInvite(opts: {
  email: string;
  invitedById: string;
  squadId: string;
  status?: "PENDING" | "ACCEPTED" | "REJECTED";
}) {
  return prisma.invite.create({
    data: {
      email: opts.email,
      invitedById: opts.invitedById,
      squadId: opts.squadId,
      type: "ATHLETE",
      status: opts.status ?? "PENDING",
      token: crypto.randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

describe("GET /api/invites", () => {
  it("only returns this coach's ATHLETE invites -- never their own COACH_TO_SCHOOL invites", async () => {
    const coach = await createCoach({ username: "coach.invitelist", firstName: "Invite", lastName: "List" });
    const squad = await ensureSquad("GIRLS");
    await createInvite({ email: "athlete@example.com", invitedById: coach.id, squadId: squad.id });
    await prisma.invite.create({
      data: {
        email: "othercoach@example.com",
        invitedById: coach.id,
        type: "COACH_TO_SCHOOL",
        status: "PENDING",
        token: crypto.randomBytes(24).toString("hex"),
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    const token = await loginAs("coach.invitelist");

    const res = await request(app).get("/api/invites").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe("athlete@example.com");
    expect(res.body[0].type).toBe("ATHLETE");
  });
});

describe("DELETE /api/invites/:id", () => {
  it("removes a PENDING invite", async () => {
    const coach = await createCoach({ username: "coach.del.pending", firstName: "Del", lastName: "Pending" });
    const squad = await ensureSquad("GIRLS");
    const invite = await createInvite({ email: "waiting@example.com", invitedById: coach.id, squadId: squad.id });
    const token = await loginAs("coach.del.pending");

    const res = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toBeNull();
  });

  it("removes an ACCEPTED invite, and leaves the athlete's account and roster spot completely untouched", async () => {
    const coach = await createCoach({ username: "coach.del.accepted", firstName: "Del", lastName: "Accepted" });
    const squad = await ensureSquad("GIRLS");
    const { athlete } = await createAthlete({ username: "ath.del.accepted", firstName: "Still", lastName: "Here", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    const invite = await createInvite({ email: "joined@example.com", invitedById: coach.id, squadId: squad.id, status: "ACCEPTED" });
    const token = await loginAs("coach.del.accepted");

    const res = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).toBeNull();

    // The invite row is gone, but nothing about the actual roster relationship changed.
    const stillRostered = await prisma.coachAthlete.findFirst({ where: { coachId: coach.id, athleteId: athlete.id } });
    expect(stillRostered).not.toBeNull();
    expect(await prisma.athlete.findUnique({ where: { id: athlete.id } })).not.toBeNull();
  });

  it("400s trying to remove a REJECTED invite", async () => {
    const coach = await createCoach({ username: "coach.del.rejected", firstName: "Del", lastName: "Rejected" });
    const squad = await ensureSquad("GIRLS");
    const invite = await createInvite({ email: "rejected@example.com", invitedById: coach.id, squadId: squad.id, status: "REJECTED" });
    const token = await loginAs("coach.del.rejected");

    const res = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).not.toBeNull();
  });

  it("404s removing another coach's invite -- left completely untouched", async () => {
    const owner = await createCoach({ username: "coach.del.owner", firstName: "Owner", lastName: "Coach" });
    await createCoach({ username: "coach.del.outsider", firstName: "Outsider", lastName: "Coach" });
    const squad = await ensureSquad("GIRLS");
    const invite = await createInvite({ email: "someone@example.com", invitedById: owner.id, squadId: squad.id, status: "ACCEPTED" });
    const token = await loginAs("coach.del.outsider");

    const res = await request(app).delete(`/api/invites/${invite.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).not.toBeNull();
  });

  it("404s for a nonexistent invite id", async () => {
    await createCoach({ username: "coach.del.missing", firstName: "Del", lastName: "Missing" });
    const token = await loginAs("coach.del.missing");

    const res = await request(app).delete("/api/invites/nonexistent-id").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
