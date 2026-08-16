import cron from "node-cron";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { sendCheckinReminders } from "./lib/pushReminder.js";

app.listen(env.port, () => {
  console.log(`Relay API listening on http://localhost:${env.port}`);
});

// Runs twice a day, both pinned to America/Chicago (Central) wall-clock
// time -- fixed slots given this app doesn't track a per-athlete
// timezone anywhere (see sendCheckinReminders's own comment). The
// `timezone` option (not a hand-computed UTC hour) means these stay
// pinned to 4pm/7pm Central through daylight saving changes -- node-cron
// converts each to the right UTC trigger moment itself, both in CDT and
// CST. Scheduled here in index.ts, not app.ts -- app.ts is imported by
// every test file via supertest and deliberately has no side effects of
// its own (see its own top-of-file comment); a cron job firing during
// the test suite would be exactly that kind of side effect.
//
// Both slots call the exact same sendCheckinReminders -- it already only
// ever selects athletes with *no check-in yet today*, with no notion of
// "already reminded once", so the 7pm run naturally skips anyone who
// checked in between the two (whether they logged in response to the
// 4pm nudge or on their own) without any extra "already sent today"
// tracking. An athlete who's still not checked in by 7pm just gets a
// second nudge. No-ops instantly (skipped: true) when VAPID keys aren't
// configured, so this is harmless to leave running in every environment,
// not just production.
function runReminderJob(label: string) {
  sendCheckinReminders()
    .then((result) => {
      if (!result.skipped) console.log(`[push] ${label} check-in reminder run:`, result);
    })
    .catch((err) => console.error(`[push] ${label} check-in reminder run failed:`, err));
}

cron.schedule("0 16 * * *", () => runReminderJob("4pm"), { timezone: "America/Chicago" });
cron.schedule("0 19 * * *", () => runReminderJob("7pm"), { timezone: "America/Chicago" });
