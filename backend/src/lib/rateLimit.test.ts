import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { buildAuthRateLimiter } from "./rateLimit.js";

// Isolated from the real app/DB on purpose -- this proves the limiter
// itself actually enforces a limit when NOT skipped, without touching
// the shared integration test suite (which relies on the real app's
// login/forgot-password limiters being skipped in NODE_ENV=test -- see
// buildAuthRateLimiter's default `skip`). `skip: () => false` here
// overrides that default explicitly, since this test's whole point is
// checking the limiter fires.
function appWithLimiter(max: number) {
  const app = express();
  // Needed so the limiter honors the X-Forwarded-For header set by the
  // "separate IPs" test below -- without it, every request resolves to
  // the same loopback socket address regardless of the header.
  app.set("trust proxy", true);
  app.use(buildAuthRateLimiter({ windowMs: 60_000, max, skip: () => false }));
  app.get("/probe", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("buildAuthRateLimiter", () => {
  it("allows requests up to the limit, then 429s with the app's usual error shape", async () => {
    const app = appWithLimiter(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/probe");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: "Too many attempts. Try again later." });
  });

  it("tracks separate IPs independently", async () => {
    const app = appWithLimiter(1);
    const first = await request(app).get("/probe").set("X-Forwarded-For", "1.1.1.1");
    expect(first.status).toBe(200);
    // A different simulated client IP isn't blocked by the first one's usage.
    const second = await request(app).get("/probe").set("X-Forwarded-For", "2.2.2.2");
    expect(second.status).toBe(200);
  });
});
