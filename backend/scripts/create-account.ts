// Provisions (or resets the password for) a real account with a freshly
// generated random password -- printed once to the terminal and never
// stored anywhere in plaintext, never logged, never committed. This is
// separate from prisma/seed.ts and seedRealRoster.ts on purpose: those
// are demo/test fixtures with a shared known password; this is for a
// real person's real login, most likely against a production database.
//
// Usage:
//   npm run create-account -w backend -- --email you@example.com [--role COACH|ATHLETE] [--first Jane] [--last Doe] [--username jane.doe] [--squad GIRLS|BOYS]
//
// Safe to re-run: an existing account (by email) gets its password reset
// to a new random value instead of erroring.
//
// To run this against a Railway-deployed production database instead of
// your local one, either:
//   1) Railway CLI (recommended, never exposes the production connection
//      string to your shell history): `railway login`, `railway link`,
//      then `railway run --service <backend-service-name> npm run
//      create-account -w backend -- --email you@example.com`
//   2) Or grab the production DATABASE_URL from the Postgres service's
//      Connect tab in the Railway dashboard and prefix this command with
//      it: `DATABASE_URL="postgresql://..." npm run create-account -w
//      backend -- --email you@example.com`
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma.js";

interface Args {
  email: string;
  role: "COACH" | "ATHLETE";
  first: string;
  last: string;
  username: string;
  squad?: "GIRLS" | "BOYS";
}

function parseArgs(): Args {
  const raw: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      raw[key] = value;
      i++;
    }
  }

  const email = raw.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-account -w backend -- --email you@example.com [--role COACH|ATHLETE] [--first Jane] [--last Doe] [--username jane.doe] [--squad GIRLS|BOYS]');
    console.error("--email is required and must look like a real email address.");
    process.exit(1);
  }

  const role = (raw.role?.toUpperCase() as Args["role"]) || "COACH";
  if (role !== "COACH" && role !== "ATHLETE") {
    console.error('--role must be "COACH" or "ATHLETE"');
    process.exit(1);
  }

  const localPart = email.split("@")[0];
  const [guessedFirst, ...guessedLastParts] = localPart.split(/[._-]+/);
  const first = raw.first ?? capitalize(guessedFirst || "New");
  const last = raw.last ?? capitalize(guessedLastParts.join(" ") || "User");
  const username = (raw.username ?? `${first}.${last}`).toLowerCase().replace(/[^a-z0-9._-]/g, "");

  let squad: Args["squad"];
  if (role === "ATHLETE") {
    squad = raw.squad?.toUpperCase() as Args["squad"];
    if (squad !== "GIRLS" && squad !== "BOYS") {
      console.error('--squad "GIRLS" or "BOYS" is required when --role ATHLETE');
      process.exit(1);
    }
  }

  return { email, role, first, last, username, squad };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/** Random, URL-safe, no ambiguous copy-paste characters like +/=. */
function generatePassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function main() {
  const { email, role, first, last, username, squad } = parseArgs();
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  const existingByUsername = existingByEmail ? null : await prisma.user.findUnique({ where: { username } });

  let user;
  let athleteId: string | null = null;

  if (existingByEmail) {
    // Re-running for an account that already exists: just rotate its password.
    user = await prisma.user.update({ where: { id: existingByEmail.id }, data: { passwordHash } });
    const athlete = await prisma.athlete.findUnique({ where: { userId: user.id } });
    athleteId = athlete?.id ?? null;
  } else {
    if (existingByUsername) {
      console.error(`Username "${username}" is already taken by a different account. Pass --username to pick a different one.`);
      process.exit(1);
    }
    user = await prisma.user.create({
      data: { email, username, passwordHash, firstName: first, lastName: last, role },
    });
    if (role === "ATHLETE") {
      const squadRow = await prisma.squad.upsert({ where: { name: squad! }, update: {}, create: { name: squad! } });
      const athlete = await prisma.athlete.create({
        data: { name: `${first} ${last}`, squadId: squadRow.id, userId: user.id },
      });
      athleteId = athlete.id;
    }
  }

  console.log(`\n${existingByEmail ? "Password reset" : "Account created"} for ${email}:\n`);
  console.log(`  email:    ${user.email}`);
  console.log(`  username: ${user.username}`);
  console.log(`  role:     ${user.role}`);
  if (athleteId) console.log(`  athleteId: ${athleteId} (no coach/squad roster assignment made -- add one separately if needed)`);
  console.log(`  password: ${password}`);
  console.log(`\nCopy that password now -- it is not stored anywhere and will not be shown again.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
