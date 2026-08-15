// Patches Express's router so an async route handler that throws (or
// whose returned promise rejects) is automatically forwarded to the
// error-handling middleware below, instead of becoming an unhandled
// promise rejection. Express 4 (what this app runs) does NOT do this on
// its own -- without this, any uncaught error in *any* async route
// handler anywhere in this app takes down the whole Node process, not
// just that one request (this actually happened in production: a
// Resend send failure inside routes/schools.ts's approve-request route
// crashed the entire API for every user until Railway auto-restarted
// it). Must be imported before the route files below register their
// handlers -- it works by patching Express's Layer/Router internals.
import "express-async-errors";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { squadsRouter } from "./routes/squads.js";
import { athletesRouter } from "./routes/athletes.js";
import { briefRouter } from "./routes/brief.js";
import { notesRouter } from "./routes/notes.js";
import { injuriesRouter } from "./routes/injuries.js";
import { wellnessRouter } from "./routes/wellness.js";
import { trainingLoadRouter } from "./routes/trainingLoad.js";
import { invitesRouter } from "./routes/invites.js";
import { inviteAcceptRouter } from "./routes/inviteAccept.js";
import { schoolsRouter } from "./routes/schools.js";
import { schoolJoinRouter } from "./routes/schoolJoin.js";
import { adminRouter } from "./routes/admin.js";
import { mfaRouter } from "./routes/mfa.js";

// The Express app itself, with no side effects (no .listen()) -- so
// integration/e2e tests can import it and drive it directly with
// supertest, against whatever DATABASE_URL is set when the process
// started, without needing a real listening port or a second server
// process. src/index.ts is the actual dev/prod entrypoint that starts it.
export const app = express();

// Exactly one hop -- Railway's own edge proxy -- not `true` (which would
// trust the whole forwarded chain). Required for express-rate-limit to
// read the real client IP from X-Forwarded-For correctly instead of
// either throwing or bucketing every visitor under one shared IP.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/squads", squadsRouter);
app.use("/api/athletes", athletesRouter);
app.use("/api/brief", briefRouter);
app.use("/api/notes", notesRouter);
app.use("/api/injuries", injuriesRouter);
app.use("/api/wellness", wellnessRouter);
app.use("/api/training-load", trainingLoadRouter);
app.use("/api/invites", invitesRouter);
app.use("/api/invite-accept", inviteAcceptRouter);
app.use("/api/schools", schoolsRouter);
app.use("/api/join", schoolJoinRouter);
app.use("/api/admin", adminRouter);
app.use("/api/mfa", mfaRouter);

// Last-resort catch-all: anything express-async-errors forwards here (or
// any synchronous throw in a non-async handler) becomes a clean 500,
// same { error: string } shape as every other 4xx/5xx in this app,
// instead of an unhandled rejection that takes the whole process down.
// Must be registered last -- Express identifies error middleware by its
// 4-argument signature, and only routes/middleware registered *before*
// this one are covered by it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled route error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
