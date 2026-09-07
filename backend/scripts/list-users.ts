// Read-only: lists every User row (id, username, email, role, name,
// createdAt), sorted by createdAt. Used to eyeball which accounts are
// demo/seed fixtures (prisma/seed.ts, seedRealRoster.ts -- "@ridgeline.edu"
// emails, or the ad-hoc "demo.*"/"coach.demo" accounts) vs real signups,
// before running any destructive cleanup. Also flags any CoachAthlete
// link that crosses between a "@relaydemo.example" account and a
// non-demo one, since that would mean a hard-delete of the demo side
// would orphan a real coach's or athlete's data.
//
// Usage: npm run list-users -w backend
//   (or, against production: railway run --service backend npm run list-users -w backend)
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true, firstName: true, lastName: true, isSuperAdmin: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    console.log(
      `${u.createdAt.toISOString().slice(0, 10)}  ${u.role.padEnd(7)}  ${(u.username ?? "").padEnd(20)}  ${u.email.padEnd(30)}  ${u.firstName} ${u.lastName}${u.isSuperAdmin ? "  [SUPER ADMIN]" : ""}`,
    );
  }
  console.log(`\n${users.length} total users`);

  const isDemo = (email: string) => email.endsWith("@relaydemo.example");
  const demoUserIds = new Set(users.filter((u) => isDemo(u.email)).map((u) => u.id));
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const athletes = await prisma.athlete.findMany({ select: { id: true, userId: true } });
  const athleteUserId = new Map(athletes.map((a) => [a.id, a.userId]));

  const links = await prisma.coachAthlete.findMany({ select: { coachId: true, athleteId: true } });
  console.log(`\n${links.length} coach-athlete links total`);
  let crossLinks = 0;
  for (const l of links) {
    const athleteUId = athleteUserId.get(l.athleteId);
    const coachIsDemo = demoUserIds.has(l.coachId);
    const athleteIsDemo = athleteUId ? demoUserIds.has(athleteUId) : false;
    if (coachIsDemo !== athleteIsDemo) {
      crossLinks++;
      console.log(
        `  CROSS LINK: coach ${emailById.get(l.coachId)} (demo=${coachIsDemo})  <->  athlete ${athleteUId ? emailById.get(athleteUId) : "?"} (demo=${athleteIsDemo})`,
      );
    }
  }
  console.log(`${crossLinks} cross (demo <-> real) coach-athlete links found`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
