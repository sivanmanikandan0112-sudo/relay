import { describe, expect, it } from "vitest";
// Side-effecting import, same as app.ts's own -- patches Express so an
// async route handler's thrown error is forwarded to error middleware
// instead of becoming an unhandled rejection. Importing it here a second
// time is a no-op (ESM module caching), not a second patch.
import "express-async-errors";
import express from "express";
import request from "supertest";

// Isolated from the real app/DB, same spirit as rateLimit.test.ts --
// proves the mechanism itself works: an async handler that throws
// becomes a clean 500 with this app's usual error shape, not a crashed
// process. This is a direct regression test for a real production
// incident (see app.ts's own comment): before express-async-errors +
// this error middleware were added, an unguarded `await sendEmail(...)`
// that threw inside an async route handler crashed the entire backend
// for every user, not just the one request that triggered it.
function appWithThrowingRoute() {
  const app = express();
  app.get("/boom-sync", () => {
    throw new Error("simulated synchronous failure");
  });
  app.get("/boom-async", async () => {
    await Promise.resolve();
    throw new Error("simulated async failure");
  });
  app.get("/fine", (_req, res) => res.json({ ok: true }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });
  return app;
}

describe("global error handling", () => {
  it("a synchronous throw in a route handler returns a clean 500", async () => {
    const app = appWithThrowingRoute();
    const res = await request(app).get("/boom-sync");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
  });

  it("an async route handler that throws (or rejects) also returns a clean 500 -- this is the actual production bug", async () => {
    const app = appWithThrowingRoute();
    const res = await request(app).get("/boom-async");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
  });

  it("a normal route is completely unaffected", async () => {
    const app = appWithThrowingRoute();
    const res = await request(app).get("/fine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("the process survives an async throw and can serve the very next request", async () => {
    // The actual failure mode in production wasn't "this one request
    // 500s" -- it was "the whole process dies and every subsequent
    // request fails until Railway restarts it". This proves the second
    // half: back-to-back requests, one that throws and one that doesn't,
    // both get real responses from the same still-alive app.
    const app = appWithThrowingRoute();
    const boom = await request(app).get("/boom-async");
    expect(boom.status).toBe(500);
    const fine = await request(app).get("/fine");
    expect(fine.status).toBe(200);
  });
});
