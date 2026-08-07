-- TrainingLoad: capture what kind of run it was and how far, so "My Runs"
-- can show a real log instead of just a load number.
ALTER TABLE "TrainingLoad" ADD COLUMN "runType" TEXT NOT NULL DEFAULT 'Easy';
ALTER TABLE "TrainingLoad" ADD COLUMN "distanceMiles" DOUBLE PRECISION;
ALTER TABLE "TrainingLoad" ALTER COLUMN "runType" DROP DEFAULT;
