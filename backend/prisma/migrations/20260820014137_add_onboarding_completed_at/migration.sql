-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: every account that already existed before this migration
-- should never see the new one-time "finish setting up" screen out of
-- nowhere on their next ordinary login -- that's meant for genuinely new
-- signups going forward, not a surprise re-onboarding of the entire
-- existing user base. Stamped with each row's own createdAt rather than
-- "now", so the column stays meaningful for real new signups too --
-- someone who onboards for real gets a value close to their own
-- createdAt, same as everyone backfilled here.
UPDATE "User" SET "onboardingCompletedAt" = "createdAt" WHERE "onboardingCompletedAt" IS NULL;
