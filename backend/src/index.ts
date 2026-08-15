import cron from "node-cron";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { sendCheckinReminders } from "./lib/pushReminder.js";

app.listen(env.port, () => {
  console.log(`Relay API listening on http://localhost:${env.port}`);
});

// Runs once a day at 18:00 UTC (mid-to-late afternoon across continental
// US timezones -- a reasonable single fixed slot given this app doesn't
// track a per-athlete timezone anywhere; see sendCheckinReminders's own
// comment). Scheduled here in index.ts, not app.ts -- app.ts is imported
// by every test file via supertest and deliberately has no side effects
// of its own (see its own top-of-file comment); a cron job firing during
// the test suite would be exactly that kind of side effect. No-ops
// instantly (skipped: true) when VAPID keys aren't configured, so this
// is harmless to leave running in every environment, not just production.
cron.schedule("0 18 * * *", () => {
  sendCheckinReminders()
    .then((result) => {
      if (!result.skipped) console.log("[push] daily check-in reminder run:", result);
    })
    .catch((err) => console.error("[push] daily check-in reminder run failed:", err));
});
