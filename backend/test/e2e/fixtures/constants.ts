// Split out from seed.ts on purpose: seed.ts runs its seeding logic as a
// top-level side effect when executed directly (`npx tsx
// test/e2e/fixtures/seed.ts`, from globalSetup.ts). Test files need the
// shared password without ever importing -- and re-running -- that file.
export const E2E_PASSWORD = "E2ETestPass1!";
