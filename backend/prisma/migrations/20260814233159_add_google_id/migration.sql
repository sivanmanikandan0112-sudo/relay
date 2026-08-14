-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- CreateIndex
-- Safe on existing rows: every current row gets googleId = NULL, and
-- Postgres unique indexes treat each NULL as distinct from every other
-- NULL, so no collision is possible no matter how many existing users
-- there are.
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
