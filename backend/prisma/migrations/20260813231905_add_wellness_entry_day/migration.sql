-- One WellnessEntry per athlete per calendar day, going forward: routes/wellness.ts
-- now upserts on (athleteId, day) instead of always inserting a new row, so a
-- same-day resubmit overwrites that day's entry rather than stacking another one.
--
-- This table already has rows from before that change existed, so this migration
-- can't just add the column + constraint -- some athletes genuinely have more than
-- one row for the same calendar day already (that's the exact problem being fixed).
-- Steps, in order: add `day` nullable -> backfill it from the existing `date` ->
-- collapse same-day duplicates, keeping only the most recent (`date` desc, `id` desc
-- as a deterministic tiebreak) -- discarding the same in-between same-day
-- adjustments the app is no longer meant to keep -- then only once the table
-- satisfies the constraint, make `day` required and add the unique index.

-- AddColumn (nullable for now)
ALTER TABLE "WellnessEntry" ADD COLUMN "day" DATE;

-- Backfill from the existing `date` column
UPDATE "WellnessEntry" SET "day" = "date"::date;

-- Collapse pre-existing same-day duplicates, keeping the most recent per (athleteId, day)
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "athleteId", "day" ORDER BY "date" DESC, "id" DESC) AS rn
  FROM "WellnessEntry"
)
DELETE FROM "WellnessEntry"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- Now safe to enforce
ALTER TABLE "WellnessEntry" ALTER COLUMN "day" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "WellnessEntry_athleteId_day_key" ON "WellnessEntry"("athleteId", "day");
