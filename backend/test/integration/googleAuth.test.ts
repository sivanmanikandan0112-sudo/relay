import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { createCoach, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

// Unlike every other integration test in this suite, this one mocks a
// single function -- verifyGoogleIdToken -- instead of exercising the
// real thing end to end. That's not a shortcut: a real Google ID token
// is signed by Google's own private key, which nothing but Google's own
// servers can produce, so there's no way to generate a genuinely valid
// one in a test environment (unlike TOTP in mfa.test.ts, which IS
// testable for real, since the app and otplib share the same secret).
// Every route's *own* logic around that call -- email matching, the MFA
// gate, already-linked rejection, 404 for an unrecognized identity --
// is still exercised for real, against a real database.
vi.mock("../../src/lib/google.js", () => ({ verifyGoogleIdToken: vi.fn() }));
import { verifyGoogleIdToken } from "../../src/lib/google.js";
const mockVerify = vi.mocked(verifyGoogleIdToken);

beforeEach(async () => {
  await resetDb();
  mockVerify.mockReset();
});

function fakeIdentity(overrides: Partial<{ googleId: string; email: string; emailVerified: boolean; name: string | null }> = {}) {
  return { googleId: "google-sub-123", email: "someone@example.com", emailVerified: true, name: "Some One", ...overrides };
}

describe("POST /api/me/google-link", () => {
  it("links when the Google account's verified email matches the caller's own account email", async () => {
    const coach = await createCoach({ username: "coach.googlelink", firstName: "Google", lastName: "Link" });
    const token = await loginAs("coach.googlelink");
    mockVerify.mockResolvedValueOnce(fakeIdentity({ email: coach.email }));

    const res = await request(app).post("/api/me/google-link").set("Authorization", `Bearer ${token}`).send({ idToken: "fake" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: coach.id } })).googleId).toBe("google-sub-123");
  });

  it("rejects when the Google account's email doesn't match the caller's own -- can't link someone else's identity", async () => {
    const coach = await createCoach({ username: "coach.googlemismatch", firstName: "Google", lastName: "Mismatch" });
    const token = await loginAs("coach.googlemismatch");
    mockVerify.mockResolvedValueOnce(fakeIdentity({ email: "someone-else@example.com" }));

    const res = await request(app).post("/api/me/google-link").set("Authorization", `Bearer ${token}`).send({ idToken: "fake" });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: coach.id } })).googleId).toBeNull();
  });

  it("rejects an unverified email even if it matches", async () => {
    const coach = await createCoach({ username: "coach.googleunverified", firstName: "Google", lastName: "Unverified" });
    const token = await loginAs("coach.googleunverified");
    mockVerify.mockResolvedValueOnce(fakeIdentity({ email: coach.email, emailVerified: false }));

    const res = await request(app).post("/api/me/google-link").set("Authorization", `Bearer ${token}`).send({ idToken: "fake" });
    expect(res.status).toBe(400);
  });

  it("409s linking a Google identity already linked to a different account -- the original link is untouched", async () => {
    const first = await createCoach({ username: "coach.googlefirst", firstName: "First", lastName: "Coach" });
    const firstToken = await loginAs("coach.googlefirst");
    mockVerify.mockResolvedValueOnce(fakeIdentity({ googleId: "shared-google-id", email: first.email }));
    await request(app).post("/api/me/google-link").set("Authorization", `Bearer ${firstToken}`).send({ idToken: "fake" });

    const second = await createCoach({ username: "coach.googlesecond", firstName: "Second", lastName: "Coach" });
    const secondToken = await loginAs("coach.googlesecond");
    mockVerify.mockResolvedValueOnce(fakeIdentity({ googleId: "shared-google-id", email: second.email }));
    const res = await request(app).post("/api/me/google-link").set("Authorization", `Bearer ${secondToken}`).send({ idToken: "fake" });
    expect(res.status).toBe(409);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).googleId).toBe("shared-google-id");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second.id } })).googleId).toBeNull();
  });

  it("401s if the ID token itself fails verification", async () => {
    const token = await loginAs((await createCoach({ username: "coach.googlebadtoken", firstName: "Bad", lastName: "Token" })).username);
    mockVerify.mockRejectedValueOnce(new Error("invalid signature"));

    const res = await request(app).post("/api/me/google-link").set("Authorization", `Bearer ${token}`).send({ idToken: "garbage" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/me/google-link", () => {
  it("unlinks, freeing the identity up to be linked elsewhere", async () => {
    const coach = await createCoach({ username: "coach.googleunlink", firstName: "Google", lastName: "Unlink" });
    await prisma.user.update({ where: { id: coach.id }, data: { googleId: "some-google-id" } });
    const token = await loginAs("coach.googleunlink");

    const res = await request(app).delete("/api/me/google-link").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: coach.id } })).googleId).toBeNull();
  });
});

describe("POST /api/auth/google", () => {
  it("404s for a Google identity not linked to any account -- never auto-creates one", async () => {
    mockVerify.mockResolvedValueOnce(fakeIdentity({ googleId: "unknown-google-id" }));
    const res = await request(app).post("/api/auth/google").send({ idToken: "fake" });
    expect(res.status).toBe(404);
    expect(await prisma.user.count()).toBe(0);
  });

  it("logs in the linked account with a real session", async () => {
    const coach = await createCoach({ username: "coach.googlelogin", firstName: "Google", lastName: "Login" });
    await prisma.user.update({ where: { id: coach.id }, data: { googleId: "login-google-id" } });
    mockVerify.mockResolvedValueOnce(fakeIdentity({ googleId: "login-google-id" }));

    const res = await request(app).post("/api/auth/google").send({ idToken: "fake" });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username: "coach.googlelogin", googleLinked: true });

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  it("still requires MFA if the linked account has it enabled -- Google sign-in doesn't skip the second factor", async () => {
    const coach = await createCoach({ username: "coach.googlemfa", firstName: "Google", lastName: "Mfa" });
    await prisma.user.update({
      where: { id: coach.id },
      data: { googleId: "mfa-google-id", totpEnabled: true, totpSecretEncrypted: "fake:fake:fake" },
    });
    mockVerify.mockResolvedValueOnce(fakeIdentity({ googleId: "mfa-google-id" }));

    const res = await request(app).post("/api/auth/google").send({ idToken: "fake" });
    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.tempToken).toEqual(expect.any(String));
    expect(res.body.token).toBeUndefined();
  });

  it("401s if the Google token itself fails verification", async () => {
    mockVerify.mockRejectedValueOnce(new Error("invalid signature"));
    const res = await request(app).post("/api/auth/google").send({ idToken: "garbage" });
    expect(res.status).toBe(401);
  });

  it("400s a missing idToken", async () => {
    const res = await request(app).post("/api/auth/google").send({});
    expect(res.status).toBe(400);
  });
});
