// Runs once before the entire e2e suite: drops and recreates the test
// database from scratch (a *fresh* database, per the assignment, not just
// a wiped one), applies every migration, then seeds it with the
// deterministic fixture data in fixtures/seed.ts. Never touches relay_dev
// -- it only ever operates on whatever database DATABASE_URL points at,
// which the test:e2e npm script points at relay_test (or TEST_DATABASE_URL
// if set).
import { execSync } from "node:child_process";
import { userInfo } from "node:os";

export default async function setup() {
  const databaseUrl = process.env.DATABASE_URL ?? `postgresql://${userInfo().username}@localhost:5432/relay_test`;
  const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (dbName === "relay_dev" || dbName === "") {
    throw new Error(`Refusing to run e2e tests against database "${dbName}" -- this drops and recreates it.`);
  }

  console.log(`\n[e2e] Rebuilding a fresh "${dbName}" database...`);
  execSync(`dropdb --if-exists ${dbName}`, { stdio: "inherit" });
  execSync(`createdb ${dbName}`, { stdio: "inherit" });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });
  execSync("npx tsx test/e2e/fixtures/seed.ts", { stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl } });
  console.log("[e2e] Fresh database ready.\n");
}
