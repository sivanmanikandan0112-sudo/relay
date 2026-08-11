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
app.use("/api/admin", adminRouter);
app.use("/api/mfa", mfaRouter);
