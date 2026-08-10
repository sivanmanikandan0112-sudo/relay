import { defineConfig } from "vitest/config";

// End-to-end tests: real Express app + a database that's dropped and
// recreated from scratch, then seeded with deterministic fixture data,
// once before the whole suite runs (see globalSetup.ts) -- a genuinely
// fresh database per the assignment, not the shared/reset-between-tests
// one integration tests use. Tests read (and in the athlete-journey case,
// mutate) that one fixed dataset via real HTTP requests through supertest.
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    globalSetup: ["./test/e2e/globalSetup.ts"],
    // All e2e test files share the one fixture database seeded once --
    // running them in parallel would let one file observe another's
    // in-flight mutations (see athleteJourney.test.ts).
    fileParallelism: false,
    testTimeout: 15000,
  },
});
