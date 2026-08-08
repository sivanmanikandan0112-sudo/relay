import { prisma } from "./prisma.js";

/** Athlete.id linked to this user account, or null if this user isn't an athlete. */
export async function getOwnAthleteId(userId: string): Promise<string | null> {
  const athlete = await prisma.athlete.findUnique({ where: { userId }, select: { id: true } });
  return athlete?.id ?? null;
}

/** All Athlete.ids assigned to this coach via the CoachAthlete roster. */
export async function getCoachAthleteIds(coachId: string): Promise<string[]> {
  const rows = await prisma.coachAthlete.findMany({ where: { coachId }, select: { athleteId: true } });
  return rows.map((r) => r.athleteId);
}

export async function isCoachOfAthlete(coachId: string, athleteId: string): Promise<boolean> {
  const row = await prisma.coachAthlete.findUnique({
    where: { coachId_athleteId: { coachId, athleteId } },
  });
  return !!row;
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
