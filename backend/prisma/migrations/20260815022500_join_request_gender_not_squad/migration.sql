-- DropForeignKey
ALTER TABLE "SchoolJoinRequest" DROP CONSTRAINT "SchoolJoinRequest_squadId_fkey";

-- AlterTable
-- Replaces the athlete's own squad guess with their gender, asked
-- directly at /join instead -- see schema.prisma's comment on
-- SchoolJoinRequest.gender. Default backfills any existing row (there's
-- no meaningful gender to infer from an old squad choice, so
-- PREFER_NOT_TO_SAY is the honest default) rather than requiring a
-- nullable column.
ALTER TABLE "SchoolJoinRequest" DROP COLUMN "squadId",
ADD COLUMN "gender" "Gender" NOT NULL DEFAULT 'PREFER_NOT_TO_SAY';
