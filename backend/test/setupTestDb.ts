// Ensures the integration-test database exists and has every migration
// applied. Does NOT touch its data -- test/testDb.ts's resetDb() wipes
// tables between tests instead. For a truly fresh database (drop +
// recreate), see test/e2e/globalSetup.ts, used only by the e2e suite.
import { execSync } from "node:child_process";
import { userInfo } from "node:os";

const DEFAULT_TEST_DATABASE_URL = `postgresql://${userInfo().username}@localhost:5432/relay_test`;
const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");

try {
  execSync(`createdb ${dbName}`, { stdio: "pipe" });
  console.log(`Created database "${dbName}".`);
} catch {
  // Already exists -- fine, this script is meant to be safe to rerun.
}

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
