import { prisma } from "./prisma.js";
import { getSchoolAthleteIds } from "./authz.js";
import { ensureJoinCode } from "./joinCode.js";

// Shared by routes/schools.ts (a school's own members) and
// routes/admin.ts (a super admin looking at any school) -- same shape,
// different access gates at the route level.
export async function getSchoolDetail(schoolId: string) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return null;

  const coaches = await prisma.user.findMany({
    where: { schoolId, role: "COACH" },
    select: { id: true, username: true, email: true, firstName: true, lastName: true, isSuperAdmin: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const athleteIds = await getSchoolAthleteIds(schoolId);
  const invites = await prisma.invite.findMany({
    where: { schoolId, type: "COACH_TO_SCHOOL" },
    orderBy: { createdAt: "desc" },
  });
  const pendingRequestCount = await prisma.schoolJoinRequest.count({ where: { schoolId, status: "PENDING" } });
  const joinCode = await ensureJoinCode(school.id, school.joinCode);

  return {
    id: school.id,
    name: school.name,
    location: school.location,
    joinCode,
    coaches: coaches.map((c) => ({
      id: c.id,
      username: c.username,
      email: c.email,
      name: `${c.firstName} ${c.lastName}`,
      isSuperAdmin: c.isSuperAdmin,
    })),
    athleteCount: athleteIds.length,
    invites,
    pendingRequestCount,
  };
}
