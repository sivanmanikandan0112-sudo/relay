-- Adds the real invite-acceptance flow: a per-invite token + expiry (an
-- invited athlete uses this, unauthenticated, to actually create their
-- account -- see routes/inviteAccept.ts) and the squad the accepted
-- athlete joins.

ALTER TABLE "Invite" ADD COLUMN "squadId" TEXT;
ALTER TABLE "Invite" ADD COLUMN "token" TEXT;
ALTER TABLE "Invite" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Backfill existing rows (from before this migration) with a random,
-- already-expired token -- they predate the real accept flow and were
-- only ever handled via the coach's manual "simulate" status buttons, so
-- there's no real link to preserve for them; expiring them immediately
-- means they can't accidentally be used as a real (if stale) invite.
UPDATE "Invite"
SET "token" = md5(random()::text || clock_timestamp()::text || id),
    "expiresAt" = NOW() - INTERVAL '1 day'
WHERE "token" IS NULL;

ALTER TABLE "Invite" ALTER COLUMN "token" SET NOT NULL;
ALTER TABLE "Invite" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_squadId_fkey"
  FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
