import rateLimit, { type Options } from "express-rate-limit";
import { env } from "./env.js";

// In-memory store -- fine at this app's current scale (a single Railway
// instance). Would need a shared store (e.g. Redis) only if horizontally
// scaled later.
function buildAuthRateLimiter(opts: { windowMs: number; max: number; skip?: Options["skip"] }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    // Same error shape as every other 4xx in this app: { error: string }.
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many attempts. Try again later." });
    },
    // Never rate-limit the test suite -- it logs in ~100+ times across the
    // integration tests via loginAs(). Vitest sets NODE_ENV=test itself,
    // the same env.nodeEnv switch lib/email.ts already uses for its own
    // production-only behavior.
    skip: opts.skip ?? (() => env.nodeEnv === "test"),
  });
}

export const loginLimiter = buildAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
export const forgotPasswordLimiter = buildAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
export const mfaVerifyLimiter = buildAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
// Same threat model as loginLimiter (an unauthenticated attempt to
// establish a session) -- its own instance rather than reusing
// loginLimiter, matching this file's one-limiter-per-route convention.
export const googleLoginLimiter = buildAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
// A join code is short (6 unbiased alphanumeric chars -- see
// lib/joinCode.ts) and only gates seeing a school's *name*, not
// anything sensitive, but still rate-limited as defense-in-depth against
// brute-force code guessing. Looser than joinRequestLimiter below since
// this is a read, not an account-adjacent write.
export const joinCodeLookupLimiter = buildAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
// A public, unauthenticated, account-creation-adjacent write (creates a
// SchoolJoinRequest, not a real account -- see routes/schoolJoin.ts) --
// capped the same as forgotPasswordLimiter, tighter than a plain login attempt.
export const joinRequestLimiter = buildAuthRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

export { buildAuthRateLimiter };
