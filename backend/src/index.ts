import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { authRouter } from "./routes/auth.js";
import { squadsRouter } from "./routes/squads.js";
import { athletesRouter } from "./routes/athletes.js";
import { briefRouter } from "./routes/brief.js";
import { notesRouter } from "./routes/notes.js";
import { injuriesRouter } from "./routes/injuries.js";
import { wellnessRouter } from "./routes/wellness.js";
import { trainingLoadRouter } from "./routes/trainingLoad.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/squads", squadsRouter);
app.use("/api/athletes", athletesRouter);
app.use("/api/brief", briefRouter);
app.use("/api/notes", notesRouter);
app.use("/api/injuries", injuriesRouter);
app.use("/api/wellness", wellnessRouter);
app.use("/api/training-load", trainingLoadRouter);

app.listen(env.port, () => {
  console.log(`Relay API listening on http://localhost:${env.port}`);
});
