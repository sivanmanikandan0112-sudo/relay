-- Expand ReadinessStatus from the old 3-band model to the real 5-state
-- model: score-driven bands (FRESH/EASE_BACK/BACK_OFF) plus injury-driven
-- overrides (RETURN_PROTOCOL/INJURED).
ALTER TYPE "ReadinessStatus" RENAME VALUE 'READY' TO 'FRESH';
ALTER TYPE "ReadinessStatus" ADD VALUE 'RETURN_PROTOCOL';
ALTER TYPE "ReadinessStatus" ADD VALUE 'INJURED';

-- WellnessEntry: replace sleepHours/stress with the real 1-5 rating set
-- (sleep quality, soreness, mood, energy, motivation) plus an optional note.
ALTER TABLE "WellnessEntry" DROP COLUMN "sleepHours";
ALTER TABLE "WellnessEntry" DROP COLUMN "stress";
ALTER TABLE "WellnessEntry" ADD COLUMN "sleep" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "WellnessEntry" ADD COLUMN "motivation" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "WellnessEntry" ADD COLUMN "msg" TEXT;
ALTER TABLE "WellnessEntry" ALTER COLUMN "sleep" DROP DEFAULT;
ALTER TABLE "WellnessEntry" ALTER COLUMN "motivation" DROP DEFAULT;
