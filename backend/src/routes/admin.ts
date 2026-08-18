import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin } from "../middleware/requireAuth.js";
import { getCoachAthleteIds, getSchoolAthleteIds } from "../lib/authz.js";
import { getSchoolDetail } from "../lib/schoolDetail.js";
import { issueResetToken } from "../lib/passwordReset.js";
import { emailEnabled, trySendEmail } from "../lib/email.js";
import { groupByDay, localDayKey } from "../lib/date.js";
import { checkinRateSeries } from "../lib/activityStats.js";

// System-wide, read-only view across every school/coach/athlete --
// gated on isSuperAdmin (folded into the JWT, see lib/auth.ts), not any
// per-school membership check. Reuses the exact same visibility helpers
// (getCoachAthleteIds/getSchoolAthleteIds/getSchoolDetail) every
// coach-facing route already uses, just without their normal
// "only your own roster/school" restriction.
export const adminRouter = Router();

adminRouter.use(requireAuth, requireSuperAdmin);

adminRouter.get("/overview", async (_req, res) => {
  // localDayKey, not dayKey -- see lib/date.ts's own comment. Raw UTC
  // "today" runs a full day ahead of Central time for several hours every
  // evening, which used to make this stat read 0% right when a school's
  // real evening check-ins were happening.
  const today = localDayKey(new Date());
  const [schoolCount, coachCount, athleteCount, soloCoachCount, activeAthleteRows] = await Promise.all([
    prisma.school.count(),
    prisma.user.count({ where: { role: "COACH" } }),
    prisma.athlete.count(),
    prisma.user.count({ where: { role: "COACH", schoolId: null } }),
    // "Active" here means currently on *some* coach's roster -- distinct
    // athleteId across CoachAthlete, not the raw athleteCount above.
    // Matters specifically because of "Remove from roster" (see
    // routes/athletes.ts): an athlete who's graduated/quit still has an
    // Athlete row (their history is deliberately preserved), but their
    // never-happening check-ins shouldn't drag the whole team's rate
    // down just because the account still exists.
    prisma.coachAthlete.findMany({ distinct: ["athleteId"], select: { athleteId: true } }),
  ]);
  const activeAthleteIds = activeAthleteRows.map((r) => r.athleteId);
  const activeAthleteCount = activeAthleteIds.length;

  // Scoped to the same activeAthleteIds set as the denominator above --
  // not every WellnessEntry system-wide -- so a removed athlete's old
  // check-in history (still real, still in the database) can never
  // inflate today's rate past what the *current* roster actually did.
  // WellnessEntry.day is already the correctly-resolved local calendar
  // day a check-in belongs to (see resolveSubmissionDay) -- `today` just
  // needs to be anchored the same way (localDayKey, above) to match it.
  const checkedInToday = await prisma.wellnessEntry.findMany({
    where: { day: today, athleteId: { in: activeAthleteIds } },
    distinct: ["athleteId"],
    select: { athleteId: true },
  });

  // Rate only makes sense once someone's actually rostered -- a brand
  // new, roster-less deployment shouldn't show "0% checked in today" as
  // if that were a bad sign.
  const checkinRate = activeAthleteCount > 0 ? checkedInToday.length / activeAthleteCount : null;

  res.json({
    schoolCount,
    coachCount,
    athleteCount,
    soloCoachCount,
    activeAthleteCount,
    checkedInToday: checkedInToday.length,
    checkinRate,
  });
});

adminRouter.get("/coaches", async (_req, res) => {
  const coaches = await prisma.user.findMany({
    where: { role: "COACH" },
    include: { school: true },
    orderBy: { createdAt: "asc" },
  });
  const withCounts = await Promise.all(
    coaches.map(async (c) => ({
      id: c.id,
      username: c.username,
      email: c.email,
      name: `${c.firstName} ${c.lastName}`,
      isSuperAdmin: c.isSuperAdmin,
      schoolId: c.schoolId,
      schoolName: c.school?.name ?? null,
      athleteCount: (await getCoachAthleteIds(c.id)).length,
      createdAt: c.createdAt,
    }))
  );
  res.json(withCounts);
});

adminRouter.get("/coaches/:id", async (req, res) => {
  const coach = await prisma.user.findUnique({ where: { id: req.params.id }, include: { school: true } });
  if (!coach || coach.role !== "COACH") return res.status(404).json({ error: "Not found" });

  const athleteIds = await getCoachAthleteIds(coach.id);
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    include: { squad: true },
    orderBy: { name: "asc" },
  });

  res.json({
    id: coach.id,
    username: coach.username,
    email: coach.email,
    name: `${coach.firstName} ${coach.lastName}`,
    isSuperAdmin: coach.isSuperAdmin,
    schoolId: coach.schoolId,
    schoolName: coach.school?.name ?? null,
    createdAt: coach.createdAt,
    athletes: athletes.map((a) => ({ id: a.id, name: a.name, squadName: a.squad.name, gender: a.gender })),
  });
});

adminRouter.get("/schools", async (_req, res) => {
  const schools = await prisma.school.findMany({ orderBy: { createdAt: "asc" } });
  const withCounts = await Promise.all(
    schools.map(async (s) => ({
      id: s.id,
      name: s.name,
      location: s.location,
      coachCount: await prisma.user.count({ where: { schoolId: s.id } }),
      athleteCount: (await getSchoolAthleteIds(s.id)).length,
      createdAt: s.createdAt,
    }))
  );
  res.json(withCounts);
});

adminRouter.get("/schools/:id", async (req, res) => {
  const detail = await getSchoolDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Not found" });

  // Extra, admin-only fields on top of the same SchoolDetail shape the
  // school's own coaches see (getSchoolDetail is shared with
  // routes/schools.ts) -- the actual athlete roster by name/squad
  // (coach-facing School.tsx deliberately only shows a count, since a
  // coach already sees every athlete via Brief/Dashboard; an admin has
  // no equivalent squad view to fall back on) and a 7-day check-in-rate
  // series scoped to this specific school, same shape as the system-wide
  // activity endpoints below.
  const athleteIds = await getSchoolAthleteIds(req.params.id);
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    include: { squad: true },
    orderBy: { name: "asc" },
  });
  const checkinRateSeries7d = await checkinRateSeries(athleteIds, 7);

  res.json({
    ...detail,
    athletes: athletes.map((a) => ({ id: a.id, name: a.name, squadName: a.squad.name, gender: a.gender })),
    checkinRateSeries: checkinRateSeries7d,
  });
});

// Every account in the system, coach or athlete -- one User table, so
// this is a single query (unlike the two roles being separate models
// somewhere else). Same OR-across-fields search shape used nowhere else
// in this app yet.
const searchSchema = z.object({ q: z.string().trim().min(1).optional() });

adminRouter.get("/users", async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { q } = parsed.data;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { school: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
      isSuperAdmin: u.isSuperAdmin,
      schoolId: u.schoolId,
      schoolName: u.school?.name ?? null,
      mfaEnabled: u.totpEnabled,
      createdAt: u.createdAt,
    }))
  );
});

adminRouter.get("/users/:id", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { school: true } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const base = {
    id: user.id,
    username: user.username,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
    mfaEnabled: user.totpEnabled,
    createdAt: user.createdAt,
  };

  if (user.role === "COACH") {
    const athleteIds = await getCoachAthleteIds(user.id);
    const athletes = await prisma.athlete.findMany({
      where: { id: { in: athleteIds } },
      include: { squad: true },
      orderBy: { name: "asc" },
    });
    return res.json({ ...base, athletes: athletes.map((a) => ({ id: a.id, name: a.name, squadName: a.squad.name })) });
  }

  const athlete = await prisma.athlete.findUnique({ where: { userId: user.id }, include: { squad: true } });
  const coaches = athlete
    ? await prisma.coachAthlete.findMany({ where: { athleteId: athlete.id }, include: { coach: true } })
    : [];
  res.json({
    ...base,
    squadName: athlete?.squad.name ?? null,
    coaches: coaches.map((c) => ({ id: c.coach.id, name: `${c.coach.firstName} ${c.coach.lastName}` })),
  });
});

// Sends the *target* a real reset link -- the admin never sees or sets
// the new password, same as the self-service flow. Reuses issueResetToken
// (lib/passwordReset.ts), so it's the exact same token/expiry/email/
// dev-response behavior as POST /api/auth/forgot-password. Not rate
// limited -- already gated behind requireSuperAdmin, a different threat
// model than the public endpoints (abuse requires already having
// super-admin credentials).
adminRouter.post("/users/:id/reset-password", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const result = await issueResetToken(
    user,
    "Your Relay password has been reset",
    "Your account administrator has initiated a password reset for your Relay account."
  );
  res.json(result);
});

adminRouter.post("/users/:id/reset-mfa", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!user.totpEnabled) {
    return res.status(400).json({ error: "This user doesn't have two-factor authentication enabled" });
  }

  await prisma.$transaction([
    prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEncrypted: null } }),
  ]);

  // MFA is already cleared at this point regardless of what happens
  // next -- trySendEmail can't fail this response.
  if (emailEnabled) {
    await trySendEmail({
      to: user.email,
      subject: "Your two-factor authentication has been reset",
      html: `<p>Hi ${user.firstName},</p><p>An administrator has reset two-factor authentication on your Relay account. You can re-enable it any time from My Profile.</p><p>If this was unexpected, contact your administrator immediately.</p>`,
    });
  }

  res.json({ reset: true });
});

// --- Activity calendars (GitHub-contribution-graph style) --------------
// Three independent, system-wide daily counts for the admin's activity
// tab: distinct athletes who checked in, distinct athletes who logged a
// run, and distinct coaches who logged in -- each expressed as one
// {date, count} point per day over a rolling window, zero-filled so the
// frontend can draw a full, gapless grid regardless of how sparse the
// real data is.

const activityQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(400).default(90) });

/**
 * {dayKey timestamp -> count} to a zero-filled, oldest-first array
 * covering exactly `days` days through today. Anchored via localDayKey,
 * not dayKey -- raw UTC "today" runs a full day ahead of Central time for
 * several hours every evening, which used to make the very last point in
 * every one of these calendars (what the frontend always reads as
 * "today") land on a UTC day nobody's local clock had reached yet.
 */
function zeroFilledDailyCounts(counts: Map<number, number>, days: number, now: Date): Array<{ date: string; count: number }> {
  const start = new Date(localDayKey(now).getTime() - (days - 1) * 86400000);
  const out: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * 86400000);
    out.push({ date: day.toISOString().slice(0, 10), count: counts.get(day.getTime()) ?? 0 });
  }
  return out;
}

// Checked in -- WellnessEntry is already at most one row per athlete per
// day (see routes/wellness.ts), so a plain per-day row count already
// equals "distinct athletes who checked in", no de-duping needed here.
// Queries/counts on the `day` field directly (already the correctly-
// resolved local calendar day, see resolveSubmissionDay) rather than
// re-deriving a day from the raw `date` timestamp via dayKey -- same
// fix, same reasoning as lib/activityStats.ts's checkinRateSeries.
adminRouter.get("/activity/checkins", async (req, res) => {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { days } = parsed.data;
  const now = new Date();
  const today = localDayKey(now);
  const start = new Date(today.getTime() - (days - 1) * 86400000);

  const entries = await prisma.wellnessEntry.findMany({ where: { day: { gte: start, lte: today } }, select: { day: true } });
  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.day.getTime(), (counts.get(e.day.getTime()) ?? 0) + 1);
  res.json(zeroFilledDailyCounts(counts, days, now));
});

// Logged a run -- TrainingLoad deliberately allows more than one row per
// athlete per day (two-a-days), so this counts *distinct athletes*, not
// raw run rows -- a two-a-day shouldn't make a day look like two people
// were active when it was one. TrainingLoad has no pre-resolved local-day
// field of its own to query on directly (unlike WellnessEntry.day), so
// this still has to derive one from the raw `date` timestamp -- but via
// localDayKey, not dayKey, so an evening run doesn't get miscounted as
// tomorrow's the moment UTC's calendar day rolls over ahead of Central.
adminRouter.get("/activity/runs", async (req, res) => {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { days } = parsed.data;
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);

  const loads = await prisma.trainingLoad.findMany({ where: { date: { gte: start, lte: now } }, select: { date: true, athleteId: true } });
  const counts = new Map<number, number>();
  for (const { day, items } of groupByDay(loads, (l) => l.date, localDayKey)) {
    counts.set(day.getTime(), new Set(items.map((l) => l.athleteId)).size);
  }
  res.json(zeroFilledDailyCounts(counts, days, now));
});

// Coach logged in -- LoginEvent is already at most one row per user per
// day (upserted in routes/auth.ts's buildSession, itself now anchored via
// localDayKey), so again a plain per-day row count already equals
// "distinct coaches who logged in", grouped on the already-correct `day`
// field directly.
adminRouter.get("/activity/coach-logins", async (req, res) => {
  const parsed = activityQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { days } = parsed.data;
  const now = new Date();
  const today = localDayKey(now);
  const start = new Date(today.getTime() - (days - 1) * 86400000);

  const events = await prisma.loginEvent.findMany({
    where: { role: "COACH", day: { gte: start, lte: today } },
    select: { day: true },
  });
  const counts = new Map<number, number>();
  for (const e of events) counts.set(e.day.getTime(), (counts.get(e.day.getTime()) ?? 0) + 1);
  res.json(zeroFilledDailyCounts(counts, days, now));
});
