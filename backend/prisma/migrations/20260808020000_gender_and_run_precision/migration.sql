-- Athlete gender, required at athlete login if unset.
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NONBINARY', 'PREFER_NOT_TO_SAY');
ALTER TABLE "Athlete" ADD COLUMN "gender" "Gender";

-- Runs are entered as an HH:MM:SS duration and converted to fractional
-- minutes, so store with sub-minute precision instead of truncating to Int.
ALTER TABLE "TrainingLoad" ALTER COLUMN "durationMin" TYPE DOUBLE PRECISION USING "durationMin"::DOUBLE PRECISION;
ALTER TABLE "TrainingLoad" ALTER COLUMN "load" TYPE DOUBLE PRECISION USING "load"::DOUBLE PRECISION;
