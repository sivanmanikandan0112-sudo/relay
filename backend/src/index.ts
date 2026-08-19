import cron from "node-cron";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { sendCheckinReminders } from "./lib/pushReminder.js";

app.listen(env.port, () => {
  console.log(`Relay API listening on http://localhost:${env.port}`);
});

// Runs every hour on the hour, America/Chicago -- not one fixed slot for
// everyone anymore, since User.reminderHour lets an athlete (or, as a
// fallback for their whole roster, a coach) pick which hour they want
// nudged at instead of a single hardcoded 4pm for the entire app. Every
// run only actually sends to whoever's own effective reminder hour (see
// sendCheckinReminders/effectiveReminderHour in lib/pushReminder.ts)
// matches the hour this run is firing at -- most runs send to nobody,
// which is expected, not a bug. The `timezone` option (not a hand-
// computed UTC hour) means "on the hour" stays pinned to Central
// wall-clock hours through daylight saving changes -- node-cron converts
// each firing to the right UTC instant itself, both in CDT and CST.
// Scheduled here in index.ts, not app.ts -- app.ts is imported by every
// test file via supertest and deliberately has no side effects of its
// own (see its own top-of-file comment); a cron job firing during the
// test suite would be exactly that kind of side effect. No-ops instantly
// (skipped: true) when VAPID keys aren't configured, so this is harmless
// to leave running in every environment, not just production.
//
// There used to be a second fixed run at 7pm, for anyone who still
// hadn't checked in by evening. Removed in favor of a coach-initiated,
// per-athlete "nudge" instead (POST /api/athletes/:id/nudge) -- a coach
// deciding a specific kid needs a push is a better fit than blanket
// re-pinging everyone a second time every single day.
function runReminderJob() {
  sendCheckinReminders()
    .then((result) => {
      if (!result.skipped && (result.sent > 0 || result.pruned > 0)) console.log("[push] check-in reminder run:", result);
    })
    .catch((err) => console.error("[push] check-in reminder run failed:", err));
}

cron.schedule("0 * * * *", runReminderJob, { timezone: "America/Chicago" });
