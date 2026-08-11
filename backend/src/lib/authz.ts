import { prisma } from "./prisma.js";

/** Athlete.id linked to this user account, or null if this user isn't an athlete. */
export async function getOwnAthleteId(userId: string): Promise<string | null> {
  const athlete = await prisma.athlete.findUnique({ where: { userId }, select: { id: true } });
  return athlete?.id ?? null;
}

/**
 * Every Athlete.id rostered by *any* coach at the given school -- the
 * shared-visibility set. Deliberately a live join through User.schoolId
 * rather than anything snapshotted on CoachAthlete: a coach's entire
 * existing roster becomes visible the instant they join a school, with
 * no backfill step, and would stop being visible the instant they left
 * (if that flow existed) just as cleanly.
 */
export async function getSchoolAthleteIds(schoolId: string): Promise<string[]> {
  const coaches = await prisma.user.findMany({ where: { schoolId }, select: { id: true } });
  if (coaches.length === 0) return [];
  const rows = await prisma.coachAthlete.findMany({
    where: { coachId: { in: coaches.map((c) => c.id) } },
    select: { athleteId: true },
  });
  return [...new Set(rows.map((r) => r.athleteId))];
}

/**
 * All Athlete.ids this coach can see: their own CoachAthlete roster for a
 * solo coach (no school), or every athlete rostered by anyone at their
 * school if they belong to one.
 */
export async function getCoachAthleteIds(coachId: string): Promise<string[]> {
  const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { schoolId: true } });
  if (!coach?.schoolId) {
    const rows = await prisma.coachAthlete.findMany({ where: { coachId }, select: { athleteId: true } });
    return rows.map((r) => r.athleteId);
  }
  return getSchoolAthleteIds(coach.schoolId);
}

export async function isCoachOfAthlete(coachId: string, athleteId: string): Promise<boolean> {
  const ids = await getCoachAthleteIds(coachId);
  return ids.includes(athleteId);
}

/**
 * Authorizes access to a specific athlete's data: a coach may act on any
 * athlete assigned to their roster; an athlete may only act on themself.
 */
export async function canAccessAthlete(
  user: { sub: string; role: "COACH" | "ATHLETE" },
  athleteId: string
): Promise<boolean> {
  if (user.role === "ATHLETE") {
    const ownId = await getOwnAthleteId(user.sub);
    return ownId === athleteId;
  }
  return isCoachOfAthlete(user.sub, athleteId);
}
