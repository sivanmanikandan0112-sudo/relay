import { defineConfig } from "vitest/config";

// Unit tests: pure functions only (src/**/*.test.ts), no database, no
// network -- these are the fast, default `npm test`. Integration and e2e
// tests live outside src/ and have their own configs (vitest.integration
// .config.ts, vitest.e2e.config.ts) because they need a real database.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
