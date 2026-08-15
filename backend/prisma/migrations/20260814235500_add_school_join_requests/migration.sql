-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "School" ADD COLUMN "joinCode" TEXT;

-- CreateIndex
-- Safe on existing rows: every current School gets joinCode = NULL, and
-- Postgres unique indexes treat each NULL as distinct from every other
-- NULL, so no collision is possible. Existing schools get a real code
-- lazily on next read (see lib/schoolDetail.ts's ensureJoinCode) rather
-- than backfilled here.
CREATE UNIQUE INDEX "School_joinCode_key" ON "School"("joinCode");

-- CreateTable
CREATE TABLE "SchoolJoinRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,

    CONSTRAINT "SchoolJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolJoinRequest_schoolId_status_idx" ON "SchoolJoinRequest"("schoolId", "status");

-- AddForeignKey
ALTER TABLE "SchoolJoinRequest" ADD CONSTRAINT "SchoolJoinRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolJoinRequest" ADD CONSTRAINT "SchoolJoinRequest_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolJoinRequest" ADD CONSTRAINT "SchoolJoinRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
