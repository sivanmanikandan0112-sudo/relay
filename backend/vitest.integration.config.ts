import { defineConfig } from "vitest/config";

// Integration tests: real Express app (src/app.ts) + real Postgres, via
// supertest -- but a single shared database that's just reset (all tables
// wiped) between tests, not dropped/recreated each run. See test/testDb.ts.
// Requires DATABASE_URL to already point at a migrated test database when
// the process starts (the test:integration npm script sets this) --
// nothing here manages the database's lifecycle.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    // Integration tests share one Postgres connection pool and mutate the
    // same tables (resetDb wipes everything) -- running test files in
    // parallel would race each other's fixtures, so force them serial.
    fileParallelism: false,
  },
});
