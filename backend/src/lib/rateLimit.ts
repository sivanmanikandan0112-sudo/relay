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

export { buildAuthRateLimiter };
