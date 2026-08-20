# Relay

Relay is an "overreaching radar" for high school coaches and athletes. It turns each athlete's
training load, wellness check-ins, and recent trend into a single readiness score, then ranks the
roster so a coach knows exactly who to check in with first — instead of scanning a dashboard.

📐 **How the score is actually computed:** [`docs/math-behind-relay.md`](docs/math-behind-relay.md)
walks through the math and stats step by step, cross-referenced against the real code — see the
original handwritten derivation in [`proofs/`](proofs).

🚀 **Deployment stack** (Squarespace, Cloudflare, Railway, Resend): see [Deploying](#deploying) below.

## Tech stack

| Layer     | Choice |
|-----------|--------|
| Frontend  | React SPA (Vite + TypeScript, React Router) |
| Backend   | Node.js + TypeScript (Express) |
| Database  | PostgreSQL (Prisma ORM) |
| API style | REST (JSON over HTTP, JWT bearer auth) |

## Project structure

```
relay/
├── backend/           Express API, Prisma schema & migrations
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts     Seeds coaches, athletes, rosters, sample invites
│   ├── scripts/
│   │   └── inspect-athlete.ts   Prints one athlete's full readiness breakdown
│   ├── test/
│   │   ├── testDb.ts    Shared fixture/reset helpers (integration tier)
│   │   ├── integration/ Route tests against a shared, reset-between-tests database
│   │   └── e2e/          Full journeys against a freshly seeded database (globalSetup.ts,
│   │                    fixtures/seed.ts)
│   └── src/
│       ├── app.ts       The Express app (routes/middleware), importable with no side effects
│       ├── index.ts     Thin entrypoint: imports app.ts and calls .listen()
│       ├── routes/     REST endpoints (auth, me, squads, athletes, brief,
│       │               notes, injuries, wellness, training-load, invites,
│       │               inviteAccept -- public, real account creation)
│       ├── middleware/
│       └── lib/         authz.ts (roster-based access control), scoring.ts, readiness.ts,
│                       math.ts (the scoring formulas, unit-tested alongside readiness.ts)
├── frontend/           React SPA
│   └── src/
│       ├── pages/       Brief, Dashboard, Injuries, CoachInvites, How It Works,
│       │                Login, ForgotPassword, ResetPassword, AcceptInvite,
│       │                AthleteCheckin, AthleteHistory, AthleteHowItWorks
│       ├── components/  Layout, Sparkline, DetailDrawer, NoteModal, InjuryModal, MatchingSection,
│       │                AthleteStats, WorkloadAnalysis, CheckinHistoryGrid (shared coach/athlete)
│       ├── hooks/        usePushNotifications, useReminderHour, useReadinessVisibility
│       │                (shared between Profile.tsx and OnboardingSetup.tsx)
│       ├── context/      AuthContext
│       └── lib/          api.ts (REST client), status.ts, format.ts
├── docs/
│   └── math-behind-relay.md   The scoring math/stats, cross-referenced against the code
├── proofs/             Scanned handwritten derivation the doc above is based on
└── package.json          npm workspaces root
```

## Accounts & roster model

Every login is a real account (`User`) with a `role` of `COACH` or `ATHLETE`:

- A **coach** only ever sees the athletes assigned to them, via the `CoachAthlete` join table — a
  many-to-many relationship, so one athlete can be coached by more than one coach at once.
- An **athlete** account is linked 1:1 to an `Athlete` profile (`Athlete.userId`). Athletes only
  ever see and act on their own profile — the app derives their athlete ID from the logged-in
  session, never from a client-supplied value, so an athlete can't submit a check-in or log a run
  for anyone but themselves.
- After login, coaches land on **Brief** and only see the Coach tabs (Brief / Dashboard / Injuries
  / Invite / How it works); athletes land on **Check-in** and only see the Athlete tabs (Check-in /
  History / How it works). There's no view-switcher — each role sees its own app.
- **Athlete gender gate**: an athlete with no gender on file is blocked by a full-screen prompt
  right after login — they can't reach any other screen until they set it
  (`PATCH /api/me/gender`). Seeded athletes deliberately start with no gender set, so any athlete
  login demonstrates this.
- **Coach-required gating**: an athlete not yet on *any* coach's roster (`hasCoach: false`) sees no
  Check-in / History / How it works tabs at all — just a "waiting on a coach" notice. Every seeded
  athlete is now assigned to a coach (see [Seeded logins](#seeded-logins)) so the app is fully
  interactive out of the box; to see this gate itself, unassign an athlete — e.g.
  `DELETE FROM "CoachAthlete" WHERE "athleteId" = (SELECT id FROM "Athlete" WHERE name = 'Ava Thompson');`
  — then sign in as them.

### Bulk athlete invites — real signups, email optional

Coaches bulk-invite athletes by email from the **Invite** tab — no squad choice at invite time.
Accepting an invite is a **real account-creation flow**, not simulated: each invite gets a unique,
14-day token (`Invite.token`/`expiresAt`); an invited athlete follows the link built from it —
`/accept-invite/:token`, public, no login required — to a page that shows who invited them, asks
their gender (same question and options as the post-login gender gate), and lets them pick their
own username/password. Submitting it creates a real `User` + `Athlete` row — gender set directly
from their answer, squad derived from it (see [`lib/gender.ts`](backend/src/lib/gender.ts)'s
`GENDER_TO_SQUAD`) — adds them to the inviting coach's roster, marks the invite `ACCEPTED`, and
logs them straight in (same response shape as `/api/auth/login`) — see
[`routes/inviteAccept.ts`](backend/src/routes/inviteAccept.ts). Asking the athlete instead of the
coach removes a guess a coach was always making on the athlete's behalf before even knowing who'd
click the link, and an athlete who accepts this way never hits the gender gate again afterward,
since it's already on file.

Whether the invite email actually *sends* depends on whether [`lib/email.ts`](backend/src/lib/email.ts)
has a real provider configured (`RESEND_API_KEY` — see [Deploying](#deploying-railway-two-services)):
unset (local dev/test, by default), nothing is actually emailed and the Invite screen's **"copy
invite link"** button is how a coach shares it (text, whatever); set, each invite is emailed for
real, on top of the copy-link button still being there as a fallback. Either way, status shown on
the Invite screen (waiting/accepted) only ever changes as a side effect of a real signup — there
is no way, in the UI or the API, to set it by hand.

A coach can **remove** a still-pending invite outright (`DELETE /api/invites/:id`, "Remove invite"
on the Invite screen — two clicks, the second confirms) if they've decided that person shouldn't
be invited anymore: the row is deleted, the old link stops working, and the email is free to be
re-invited later. This is different from setting status by hand — it's not pretending a real
response happened, it's un-inviting someone.

A coach can also **clear** an already-`ACCEPTED` invite off the same list ("Clear from list" —
same two-click confirm), once it's just clutter in their invite history. This only deletes the
`Invite` row itself; the athlete's account and their actual roster spot (`CoachAthlete`) are a
separate, untouched relationship. `REJECTED` invites aren't clearable from either screen today.

A coach can also **resend** any still-`PENDING` invite ("Resend" on the Invite screen —
`POST /api/invites/:id/resend`) — most useful once the original's 14-day link has expired (the
skip logic in `POST /invites/bulk` otherwise makes that email un-invitable again without deleting
the old row first), but works just as well as a plain nudge on one that hasn't expired yet. Resend
doesn't just re-send the same link: it rotates the invite onto a brand-new token and pushes
`expiresAt` back out a full 14 days (see [`lib/inviteResend.ts`](backend/src/lib/inviteResend.ts)'s
shared `rotateInviteToken`) — the old link stops working the moment the new one is issued, same
"old one dies the instant a new one exists" spirit as regenerating a school's join code. If email
sending is configured, resending emails the fresh link too; either way the status list's own "copy
invite link" button always reflects the current, live token afterward.

### School join code — athlete self-service, coach-approved

The reverse direction from a bulk invite: instead of a coach sending an invite to a specific
email, an athlete who knows their school's short join code requests to join it themself, from the
public `/join` page — and a coach approves or rejects that request before any account exists.

- Every `School` has a `joinCode` (6 characters, the same unambiguous alphabet as MFA backup codes
  — excludes `0`/`O`/`1`/`I`/`L`) — short and human-typeable on purpose, unlike an `Invite.token`,
  since a coach reads this one aloud or posts it somewhere for a whole roster rather than sending
  it to one person. Shown on the coach's **School** tab with **Copy** and **Regenerate** actions;
  regenerating just replaces it going forward — the old code stops resolving, but any requests
  already submitted under it are untouched (they don't store the code itself). New schools get a
  code at creation; any school from before this feature existed gets one lazily generated the next
  time it's read (`ensureJoinCode` in [`lib/joinCode.ts`](backend/src/lib/joinCode.ts)).
- `/join` (public, two steps): first `GET /api/join/:code` resolves the code to a school **name**
  only, so a visitor confirms what they're requesting ("Request to join Lincoln High?") before
  typing anything personal; then `POST /api/join/:code` submits their proposed name, username,
  email, password, and gender as a `SchoolJoinRequest` row with `status: PENDING`.
- **No `User` is created at request time** — same rule as everywhere else in this app: an account
  only exists once someone with authority has agreed to it. The chosen password sits hashed on the
  request row until a coach decides.
- Since a school's roster is already shared across every coach there, pending requests are a
  **shared queue** — any coach at the school can see and act on one (`GET /api/schools/:id/requests`
  on the **School** tab), not just whoever's code was used. **Approve**
  (`POST /api/schools/:id/requests/:reqId/approve`) creates the real `User` (role `ATHLETE`) +
  `Athlete` + `CoachAthlete` in one transaction — exactly mirroring `inviteAccept.ts`'s own
  ATHLETE-invite branch — and makes the *approving* coach that athlete's roster coach. **Reject**
  (`POST /api/schools/:id/requests/:reqId/reject`) just closes the request out; no account ever
  existed, nothing to undo. Approving re-checks the username/email for collisions at decision time,
  not just at submission — days could have passed.
- The gender the athlete answers at `/join` is set directly on their new `Athlete` row, and the
  matching squad is derived from it via [`lib/gender.ts`](backend/src/lib/gender.ts)'s
  `GENDER_TO_SQUAD` — same mapping the bulk-invite accept flow and the post-login gender gate
  (`routes/me.ts`'s `PATCH /gender`) both use.

### Backdating a check-in or run

An athlete's Check-in screen has a **LOGGING FOR** day picker (defaulting to Today) so a missed
day can be caught up on, not just today's — and since [check-ins and runs live on the same page
now](#logging-a-run-lives-on-the-check-in-page-not-a-separate-tab), one picker catches up *both*
for that day, not one at a time on two different screens. The backend accepts an optional `day`
("YYYY-MM-DD") on `POST /api/wellness` and `POST /api/training-load`, resolved by
[`lib/date.ts`](backend/src/lib/date.ts)'s `resolveSubmissionDay` — rejecting anything in the
future or further back than `BACKDATE_WINDOW_DAYS` (currently 7, reusing `ACUTE_WINDOW_DAYS` from
the scoring math rather than inventing a separate constant: a week is enough to catch up after a
missed weekend without opening a wide-open history-editing surface, and it's already the exact
window that drives the acute load calc). A backdated check-in still upserts on that day (one per
athlete per day, same rule as today), and a backdated run still stacks freely with others on the
same day (no per-day uniqueness for runs, unchanged — a two-a-day just means adding a run twice
under the same picked day). Submitting a backdated entry refreshes *today's* live readiness score
as always, and additionally refreshes the backdated day's own week's stored `ReadinessScore`
snapshot — otherwise a corrected day sitting in an earlier ISO week would never update the row the
multi-week trend chart actually reads.

### Logging a run lives on the Check-in page, not a separate tab

Runs used to only be loggable from their own **My Runs** tab — a real problem, not just an
inconvenience, since RPE × duration is half of what the readiness pipeline's own load calc runs
on ([`lib/scoring.ts`](backend/src/lib/scoring.ts)'s `effortCost`). An athlete could fully submit a
check-in and never open the other tab, and the readiness score for that day would quietly compute
on wellness alone, missing the training-load half of its own signal — with nothing anywhere
telling them anything was incomplete.

`AthleteCheckin.tsx` now has a "runs for [day]" section right below the check-in form, governed by
the *same* `selectedDay` the check-in itself uses — no second, independent day picker. It shows
whatever runs are already logged for that day (with a remove button each), and an "+ Add a run"
button that reveals the same run-entry form (title, distance, duration, RPE,
[`ConfirmRunModal`](frontend/src/components/ConfirmRunModal.tsx) confirmation) the old My Runs tab
had — closing and reopening it (rather than clearing) after each save, so a two-a-day is just
adding a second run under the same day, not a separate flow. A day with zero runs and just a
check-in is never treated as incomplete — most rest days genuinely have no run to log, and the UI
never implies otherwise (no "did you forget?" nag, just a plain "no runs logged — perfectly normal
on a rest day").

Matching a `TrainingLoad` row to the selected day needed real care: unlike `WellnessEntry`,
`TrainingLoad` has no persisted local-day field, only a raw `date` timestamp — matching it with
`r.date.slice(0, 10)` (always UTC) would silently reintroduce the exact same evening-timezone bug
[fixed elsewhere in this app](#today-is-the-athletes-local-calendar-day-not-utc): an 8pm Central
run logged today would slice to tomorrow's UTC date and vanish from today's list. Matched instead
via `todayKey(new Date(r.date))` — the browser's own local calendar day for that run's timestamp,
same function the day picker's own options already use.

**My Runs** is now **History** (`AthleteHistory.tsx`, still at the `/runs` route — only the tab
label and the page's own job changed, not the URL) — purely a read-only look back, not a place to
log anything new. It reuses [`AthleteStats`](frontend/src/components/AthleteStats.tsx) and
[`CheckinHistoryGrid`](frontend/src/components/CheckinHistoryGrid.tsx) (the exact same components
the coach's own detail drawer uses — extracted from `DetailDrawer.tsx` into
`CheckinHistoryGrid.tsx` specifically so both places share one implementation), just with a
30-day window instead of the drawer's cramped 7-day one, since this is a full page an athlete
visits specifically to look for a trend, not a side panel. `AthleteStats`'s own trend charts
(distance/pace/RPE) aren't day-windowed at all — they already span an athlete's entire logged
history — so the 30-day window only bounds the two literal day-by-day lists (check-ins, runs)
below them.

[`WorkloadAnalysis`](frontend/src/components/WorkloadAnalysis.tsx) — the acute/chronic/ACWR/risk
numbers — is the one piece from the coach's drawer **deliberately left out unless the athlete has
opted into seeing their own readiness score** (`user.readinessShared`, same flag as
[Athlete readiness visibility](#athlete-readiness-visibility-self-service-off-by-default) below).
Those numbers are colored by the exact same Fresh/Ease back/Back off band the readiness status
itself uses — showing them unconditionally would quietly hand every athlete the same "number to
manage toward" that opt-in exists specifically to keep hidden by default. `AthleteStats` itself
(distance, pace, session count, average RPE, and their trend charts) has no such gate — that's an
athlete looking at their own training log, not an overtraining signal in disguise.

### Check-in streak

An athlete's Check-in page shows a "**N-day streak**" badge alongside their "N check-ins" count
over the last 30 days. Those used to be the same number — the badge just reused the raw count of
check-ins in the window, which isn't what a streak means: 15 check-ins scattered across a gappy
30-day span isn't a "15-day streak." `lib/format.ts`'s `computeStreak()` walks backward day by day
from today, counting consecutive days with an entry, and stops at the first gap — treating a
missing *today* as not-yet-broken (there's still time left in the day) but a missing yesterday
*and* today as broken. `AthleteCheckin.tsx` now computes the two numbers separately.

### "Today" is the athlete's local calendar day, not UTC

`lib/format.ts`'s `todayKey()` — what `AthleteCheckin.tsx` calls "today", for both the check-in
itself and any run logged alongside it — computes the browser's *local* calendar day
(`now.getFullYear()`/`getMonth()`/`getDate()`), not `now.toISOString().slice(0, 10)` (always UTC),
which is what it used to be. The old UTC version was a real, frequently-hit bug for anyone west of
UTC (every US timezone): from local evening until UTC midnight, UTC's calendar day has already
rolled over to "tomorrow" while the athlete is still very much living in "today" — for Central time
that's roughly 7pm–midnight local, every single day, not a rare edge case. An evening check-in
submitted with no explicit `day` (this page used to omit it for "today", relying on the backend's
own UTC `now` to decide) would silently land on tomorrow's bucket; the next calendar day's morning
page load would then also call that same UTC day "today", pre-filling the form with last night's
answers as if already submitted — while the real yesterday showed nothing at all.
`AthleteCheckin.tsx` now always passes `day` explicitly (the local `selectedDay` it already
computes), never omitting it, so the
backend's own `resolveSubmissionDay` ([`lib/date.ts`](backend/src/lib/date.ts)) never has to guess
via its own UTC clock. No backend changes were needed — the backdating machinery described above
already handled "resolved day differs from the server's own today" correctly, since that's exactly
what a genuine backdated submission already looked like; this fix just makes an athlete's own
evening "today" submissions take that same already-correct path instead of the UTC-`now` shortcut.

A residual version of the same bug lived one level deeper, in `routes/wellness.ts` and
`routes/trainingLoad.ts`: after resolving the correct local `day`, both routes called
`recomputeReadiness` twice — once unconditionally with the raw `now`, and once conditionally with
the resolved `date` only if it differed from "today". During that same evening UTC-rollover window,
the unconditional call could recompute the *wrong* ISO week's `ReadinessScore` row (`now`'s week,
not the athlete's actual local-today week), leaving the right week's row stale. Fixed by swapping
which call is unconditional: the already-resolved local `date` now always recomputes, and the raw
`now` is only used for the conditional second pass (refreshing *today's* live score too, when a
backdated entry lands on an earlier day).

**A third, separate version of the same mistake lived in every server-side "what day is it right
now" computation that has no caller-supplied local day to anchor to at all** — unlike the two fixes
above, which are about resolving *a specific submission's* day (always driven by the browser's own
local clock once it reaches the backend), this is about code with no submission to key off of:
check-in-rate stats, activity calendars, "has this athlete already checked in today" gates. All of
it used to fall back to `dayKey(new Date())` — the *server's* raw UTC calendar day — which runs a
full day ahead of Central time for several hours every single evening, so a coach checking the
Board at 8pm could see **"0 checked in today"** while the team had genuinely already checked in; the
real activity was sitting in what the UI called "yesterday" instead. `lib/date.ts` now has a second
helper, `localDayKey()`, anchored to `America/Chicago` (via `Intl.DateTimeFormat`) instead of raw
UTC — the same single-timezone assumption the daily push reminder cron already made explicit with
its own `timezone: "America/Chicago"` option, just applied consistently everywhere else "today"
gets computed with no local day of its own to go on. This replaced `dayKey(new Date())` in:

- [`lib/activityStats.ts`](backend/src/lib/activityStats.ts)'s `checkinRateSeries` — the Board's
  "X% checked in today" stat and the admin school-detail equivalent. This one had a second bug on
  top of the wrong "today" anchor: it queried and bucketed by `WellnessEntry`'s raw `date` timestamp
  (re-deriving a day via `dayKey`) instead of the already-correctly-resolved `day` field, so even a
  genuinely same-evening check-in could get miscounted onto the wrong bucket. Now queries and
  buckets on `day` directly — nothing left to re-derive.
- `routes/admin.ts`'s `/overview` (`checkinRate`) and its three `/activity/*` calendars
  (`checkins`/`runs`/`coach-logins`) — same "today" anchor fix, plus the same `date`-vs-`day`
  re-bucketing fix for `/activity/checkins` (`WellnessEntry`) and `/activity/coach-logins`
  (`LoginEvent`, which already had a `day` field). `/activity/runs` has no such field to fall back on
  — `TrainingLoad` only ever stores a raw `date` — so it still derives a day from that timestamp, now
  via `localDayKey` instead of `dayKey` (`lib/date.ts`'s `groupByDay` gained an optional key-function
  parameter for exactly this case).
- `routes/auth.ts`'s `buildSession` — the `LoginEvent.day` a coach's login gets recorded under,
  which every activity calendar above and the admin overview's own login-based stats read back.
- `routes/athletes.ts`'s nudge route and `lib/pushReminder.ts`'s daily reminder — both gate on "has
  this athlete already checked in today"; both used to ask that question with the same wrong UTC
  anchor, so an athlete who'd genuinely already checked in this evening could still get nudged again,
  or a coach's manual nudge could 400 as "no device" for the wrong reason after silently treating a
  real check-in as if it hadn't happened yet.
- `lib/date.ts`'s `resolveSubmissionDay` itself — its "today" (used for the future-submission guard
  and the backdate-window floor) is now `localDayKey`-anchored too, for consistency; in practice this
  only ever makes the allowed window very slightly *more* permissive during the same evening window,
  never less, since Central time never runs ahead of UTC.

Found by a coach reporting real athletes at their school whose evening check-ins didn't seem to
count toward the day's stat — traced by reading the actual data through a temporary read-only script
against the production database (see [`lib/activityStats.ts`](backend/src/lib/activityStats.ts) and
[`routes/admin.ts`](backend/src/routes/admin.ts)), the same way the original UTC bug above was
diagnosed. See [`date.test.ts`](backend/src/lib/date.test.ts) and
[`test/integration/activityStats.test.ts`](backend/test/integration/activityStats.test.ts) for the
regression coverage, including a deterministic evening-UTC-rollover case rather than one that only
occasionally fails depending on when the suite happens to run.

### Forgot password

Same story: `/api/auth/forgot-password` generates a real, expiring reset token
(`PasswordResetToken`). Without a configured email provider, the response returns the token
directly and the UI shows a "continue to reset" link built from it, instead of emailing it. With
one configured, it emails the reset link for real and the token never appears in the API response
at all — returning it there would defeat the point of proving the requester owns that inbox. The
token is stored **hashed** (SHA-256, [`lib/tokenHash.ts`](backend/src/lib/tokenHash.ts)) — a DB
leak alone can't be used to reset anyone's password. (Contrast with an invite's token, which stays
raw on purpose — invite links are meant to be forwarded/shared; a reset link's whole point is
proving private inbox ownership.)

### Change password

A signed-in user changes their own password from **My Profile** (`/profile`, both roles) — current
password required, same as any other sensitive self-service action in this app
(`PATCH /api/me/password`).

### Rate limiting

`POST /api/auth/login` and `POST /api/auth/forgot-password` are rate-limited per IP
([`lib/rateLimit.ts`](backend/src/lib/rateLimit.ts), `express-rate-limit`) — 10 login attempts / 5
password-reset requests per 15 minutes. Automatically skipped when `NODE_ENV=test` (Vitest's own
default) so the test suite's many real logins aren't affected; active everywhere else, including
local dev. Requires `app.set("trust proxy", 1)` (exactly one hop — Railway's own edge) for the
limiter to read the real client IP correctly behind Railway's proxy.

### Error handling

Every uncaught error in an async route handler is forwarded to a single error-handling middleware
(`app.ts`, registered last) via [`express-async-errors`](https://www.npmjs.com/package/express-async-errors),
which returns a clean `500 { error: "..." }` instead of leaking the raw error. This isn't just
tidiness: **Express 4 (what this app runs) does not do this automatically** — an uncaught error in
a plain `async (req, res) => {...}` handler becomes an unhandled promise rejection, which crashes
the entire Node process, taking the whole API down for every user until Railway restarts it, not
just failing that one request. This actually happened in production once: an unguarded
`sendEmail()` call inside the join-request approval route threw on a bad recipient address and
took the API offline. `express-async-errors` (imported first, before any route file, in `app.ts`)
closes that gap app-wide, and [`lib/email.ts`](backend/src/lib/email.ts)'s `trySendEmail` (used
everywhere a real mutation already succeeded and the email is just a courtesy notification, as
opposed to `sendEmail`'s own callers where sending *is* the deliverable, like forgot-password)
additionally makes sure a flaky email provider can never affect the response at all, on top of the
process-level safety net. See [`app.test.ts`](backend/src/app.test.ts) for the regression tests.

On the frontend, a failed data-load isn't always worth an error banner — `Dashboard.tsx`'s
supplementary check-in-rate card, for instance, deliberately still fails silently
(`.catch(() => {})`): losing that one small stat card should degrade quietly, the same as "no data
yet," not raise the same alarm as the main board failing to load. But the *main* fetches on
`Dashboard.tsx` and `Injuries.tsx` used the same silent `.catch(() => {})` for their primary data —
a genuine load failure (auth hiccup, network blip, server error) would leave the page looking
empty with zero indication anything went wrong, unlike `Brief.tsx`, which already showed a proper
error banner on its own equivalent fetch. Both pages now set an `error` state and render the same
`<p className="error">` banner `Brief.tsx` already used, instead of swallowing the failure.

### Schools — shared roster visibility across a coaching staff

A `Coach` (any `User` with `role: COACH`) may optionally belong to one `School`. Coaches at the
same school automatically share visibility of every athlete anyone there has ever rostered — not
just the ones they personally invited. A solo coach (no school) keeps today's behavior exactly:
their own `CoachAthlete` roster, nothing more.

This is a **live join**, not anything stamped on `CoachAthlete`/`Invite` at invite time: every
roster-scoped route (`getCoachAthleteIds`/`getSchoolAthleteIds` in
[`lib/authz.ts`](backend/src/lib/authz.ts)) checks the requesting coach's *current* `schoolId` on
every request. That means joining a school makes a coach's entire pre-existing roster visible
schoolwide immediately, with no backfill step, and it's the single choke-point every other route
already goes through — nothing else had to change to pick up shared visibility.

**Self-service, not admin-driven**: any coach can type in a school name (`POST /api/schools`) to
create one and become its first member — but only if that exact name (case-insensitive) doesn't
already exist (409 if it does, race-safe via a DB-level unique constraint on a normalized
`nameKey` — not just a pre-check). Joining an *existing* school always goes through a real invite,
never by independently typing the same name — that would let anyone claim membership, and the
whole shared roster that comes with it, with zero consent from anyone already there.

Any member coach can rename their school afterward (`PATCH /api/schools/:id`, "Edit" on the
**School** tab — e.g. to fix a typo) — same 409-on-collision handling as creating one; renaming to
the school's own current name is a no-op.

A coach at a school can invite another coach into it (`POST /api/schools/:id/invite-coach`,
single email — see the **School** tab). This reuses the same `Invite`/token/expiry/email
machinery as the athlete bulk-invite (`Invite.type: COACH_TO_SCHOOL` instead of `ATHLETE`), and
branches at accept time:
- **No account yet for that email** — the existing `/accept-invite/:token` create-account form,
  reused as-is; creates a `User` with `role: COACH` and `schoolId` set directly (no `Athlete`/
  `CoachAthlete` rows — a coach's visibility comes entirely from the live join above).
- **An account already exists for that email** — never silently reassigned. The account owner
  must sign in as *themself* and explicitly confirm (`POST /api/invite-accept/:token/attach`,
  authenticated, checks the caller's own email matches the invite) — the same link renders a
  distinct "log in to confirm you're joining" panel instead of a signup form.

Any coach at that school — not just whoever sent it — can **resend** a still-`PENDING` invite from
the **School** tab's "Pending coach invites" list (`POST /api/schools/:id/invites/:inviteId/resend`),
open to any school member on purpose since that list is already shared/school-wide rather than
scoped to whoever personally sent each one (matching `GET /api/schools/mine`'s own visibility).
Same `rotateInviteToken` behavior as the athlete-invite resend above — fresh token, expiry pushed
back a full 14 days, old link stops working immediately.

That same "Pending coach invites" list — on both the coach-facing **School** tab and the admin-facing
school detail page — also has its own **"Copy invite link"** button per pending row, matching the
fallback the athlete bulk-invite screen already had. Built from the shared
`acceptInviteUrl(token)` helper ([`lib/format.ts`](frontend/src/lib/format.ts)) so both pages
construct the exact same URL shape; a real gap before this, since without a configured email
provider a coach previously had no way at all to hand a coach-to-school invite link to anyone.

### Super admin

`User.isSuperAdmin` (folded into the JWT like `role`, checked by `requireSuperAdmin` — see
[`middleware/requireAuth.ts`](backend/src/middleware/requireAuth.ts)) unlocks a read-only,
system-wide `/admin` area: every school, every coach, every athlete, independent of any school
membership. Granted via `create-account.ts --make-super-admin` (see [Scripts](#scripts)) — there's
no self-service path to it, on purpose. Deliberately read-only for creating/inviting: an admin can
still invite a coach into any school (`POST /api/schools/:id/invite-coach` allows a super admin to
bypass the normal "must already belong to this school" check), but there's no admin-only
school-creation action, since that would either create an empty school or auto-join the admin's
own account as a member just to create one — self-service creation already covers it.

The admin area also has a **Users** tab (`/admin/users`): search every coach and athlete by
name/username/email, and two account-recovery actions on a user's detail page — "Send password
reset email" (reuses the same `issueResetToken` helper and email as the self-service forgot-password
flow — the admin never sees or sets the new password themself) and "Reset 2FA" (clears the target's
MFA state outright; they can re-enable it from their own My Profile whenever they want). Both notify
the target when email is configured.

An **Activity** tab (`/admin/activity`) shows three independent, system-wide, GitHub-contribution-
graph-style calendars over a rolling 90 days — `components/ContributionCalendar.tsx`, no charting
library, same "just inline-styled squares" spirit as `BarChart.tsx`/`Sparkline.tsx`. Each is a
distinct-people-active count, not a raw event count, so none of them get inflated by someone doing
the same thing more than once in a day:

- **Athlete check-ins** — distinct athletes who submitted a check-in that day. WellnessEntry is
  already at most one row per athlete per day (see above), so this is a plain per-day row count.
- **Athlete runs** — distinct athletes who logged *at least one* run that day. TrainingLoad
  deliberately allows more than one row per athlete per day (two-a-days), so this one actually
  de-dupes by athlete rather than counting rows.
- **Coach logins** — distinct coaches who logged in that day. Backed by a new `LoginEvent` table
  (one row per user per day, upserted — see below), filtered to `role: COACH`.

`LoginEvent` is written from `buildSession()` in [`routes/auth.ts`](backend/src/routes/auth.ts) —
the one function both the plain-login and MFA-verify-completion paths already share, so both real
ways to end up with a session get recorded from a single call site. It's pure activity-tracking:
nothing else in the app reads this table, and it plays no role in auth itself. All three endpoints
(`GET /api/admin/activity/{checkins,runs,coach-logins}?days=`) zero-fill the full window so the
frontend always draws a complete, gapless grid — a quiet day is a real `{count: 0}` point, not a
missing one. Color intensity is relative to the busiest day *in that window*, same as GitHub's own
scaling — there's no single fixed scale that would mean the same thing across three very different
metrics.

**Today's check-in rate** — a snapshot stat (`GET /api/admin/overview`, shown as a tile on
**Overview** and again as a summary line above the check-ins calendar on **Activity**): what
fraction of currently-rostered athletes have submitted *today's* check-in, right now. The
denominator is deliberately `activeAthleteCount` — distinct athletes with at least one
`CoachAthlete` row — not the raw `athleteCount` shown next to it, and `checkedInToday` is scoped
to that same active set. That distinction only exists because of [Removing an athlete from the
roster](#removing-an-athlete-from-the-roster): an athlete who's graduated or quit keeps their
account and full check-in history (by design), and none of that history should either inflate or
appear in "today's" rate once they're off every coach's roster. `checkinRate` is `null`, not `0`,
when there are no rostered athletes yet — "nobody's rostered" isn't the same claim as "a bad day."

### Two-factor authentication (TOTP)

Optional, self-service, both roles — enabled from **My Profile** (`/profile`). Scan the QR code
(or enter the key manually) in any TOTP authenticator app (Google Authenticator, Authy, etc.),
confirm with the 6-digit code it shows, and you're given 10 one-time backup codes (shown once,
never again — same one-time-visibility convention as a dev-mode reset token or a freshly
`create-account`'d password). From then on, logging in is two steps: password, then a 6-digit code
or a backup code.

- **`totpSecretEncrypted`** is AES-256-GCM ciphertext, never the raw secret — see
  [`lib/crypto.ts`](backend/src/lib/crypto.ts). Requires `MFA_ENCRYPTION_KEY` (64 hex chars / 32
  bytes, `openssl rand -hex 32`) to be set — unlike email, there's no simulate fallback; setup
  fails loudly rather than ever storing a secret insecurely.
- **Backup codes** (`MfaBackupCode`) are generated with `crypto.randomBytes` (not `Math.random()`)
  through a 31-character alphabet that excludes visually ambiguous characters (`0`/`O`/`1`/`I`/`L`)
  — [`lib/randomCode.ts`](backend/src/lib/randomCode.ts)'s `randomUnambiguousString`, shared with
  school join codes, uses rejection sampling rather than a plain `byte % 31` so every character is
  genuinely equally likely (31 doesn't evenly divide 256, so a naive modulo would be slightly
  biased) — and stored bcrypt-hashed. Each works once.
- **Login** becomes two calls when `totpEnabled`: `POST /api/auth/login` returns
  `{ mfaRequired: true, tempToken }` (a real session isn't issued yet) instead of a token, and
  `POST /api/auth/mfa/verify` (public, rate-limited, accepts a TOTP code or a backup code) issues
  the real session. The `tempToken` is a normal JWT with an extra `mfaPending` claim and a 5-minute
  expiry — `requireAuth` rejects any token carrying that claim outright, on every ordinary route, so
  a captured temp token (which only proves the password was correct) can't be used for anything
  else in the 5 minutes before it expires.

### Public landing page

`/` is a public landing page (`frontend/src/pages/Home.tsx`, outside `RequireAuth`) — a short pitch
split into a **For coaches** and a **For athletes** card, for anyone who lands on
`relaycoach.app` cold, before any login exists. A signed-in visitor hitting `/` is redirected
straight to their own app (Brief or Check-in) instead of seeing the pitch again; that redirect used
to live in a dedicated `HomeRedirect` component and now lives in `Home.tsx` itself, since there's no
longer a case where `/` renders anything else for a logged-out visitor.

The hero's **Get started** button, and the athlete card's own CTA, both lead to `/join` — the
school join-code flow above. That's deliberate: **there is no public, self-service way to create a
coach account.** An earlier version of this app had one (`POST /api/auth/signup`); it was removed
on purpose — coach accounts are now only ever created by an admin running
[`create-account.ts`](backend/scripts/create-account.ts) or by an existing coach's
`invite-coach` (see [Schools](#schools--shared-roster-visibility-across-a-coaching-staff) above).
The coach card on the landing page is informational only, with no button, and points a coach who
already has an account at **Sign in**.

### Search indexing — what's discoverable, what isn't

Three routes are meant to show up in search results and preview well when shared:
[`/`](frontend/src/pages/Home.tsx) (the landing page), [`/join`](frontend/src/pages/Join.tsx) (the
school join-code flow — a legitimate public discovery path, e.g. a coach texting an athlete "search
Relay and use code X" instead of a direct link), and
[`/data-policy`](frontend/src/pages/DataPolicy.tsx) (a real privacy page, normal and expected to be
indexable the same way any site's privacy policy is). Every other route is either behind
`RequireAuth` or a single-use tokenized link (`/accept-invite/:token`, `/reset-password`) that has
no business showing up in a search result — not because it needs new protection (the actual access
control is still `RequireAuth`/JWT, entirely server-side and unrelated to any of this), but so a
login-walled or expired-link URL never becomes a dead link sitting in someone's search history.

[`public/robots.txt`](frontend/public/robots.txt) enforces this **deny-by-default**, not
allow-by-default: `Disallow: /` blocks everything, and only `Allow: /$`, `Allow: /join$`, and
`Allow: /data-policy$` (the trailing `$` anchors each to an *exact* path match, both supported by
Google's own robots.txt parser) carve out the three indexable routes. This app has roughly a dozen
other authenticated routes (`/brief`, `/dashboard`, `/checkin`, `/admin/*`, ...) that an
allow-by-default-plus-selective-`Disallow` approach would have to enumerate and keep in sync by
hand — miss one, and it's silently crawlable. Deny-by-default means any new authenticated route
added later is automatically excluded with zero extra work, which is the actual property this
feature is supposed to guarantee. [`public/sitemap.xml`](frontend/public/sitemap.xml) lists the
same three URLs, referenced from `robots.txt`'s own `Sitemap:` line.

`index.html` carries a meta description, canonical URL, Open Graph, and Twitter Card tags for link
previews — the description text is copied verbatim from `Home.tsx`'s own hero copy rather than
written fresh, so a search snippet and the actual landing page never say two different things about
what this app is. `og:image`/`twitter:image` point at the existing `icon-512.png` — a square app
icon, not a proper 1200×630 social card, fine for launch but a real OG image is a nice-to-have, not
done here. Since this is a client-rendered SPA with one static `index.html`, all three indexable
pages share that one `<title>` by default; each of the three (`Home.tsx`, `Join.tsx`,
`DataPolicy.tsx`) sets `document.title` itself on mount so a tab or search result reflects which
page it actually is, and so navigating between them client-side (no full page reload) doesn't leave
one page's title stuck on-screen for another.

Getting Google to actually notice and crawl this is a manual, one-time step outside the
codebase — add and verify the production domain in
[Google Search Console](https://search.google.com/search-console), submit the sitemap URL there
directly, and use the URL Inspection tool on `/` to confirm Google's crawler can render the SPA
shell rather than getting stuck on a blank page before the JS bundle loads.

### Progressive Web App

The frontend is installable — "Add to Home Screen" on a phone, or the install icon in a desktop
browser's address bar — and works offline for the app shell (though check-in data itself always
still needs a live connection; see caching strategy below). Built with
[`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) using the **`injectManifest`** strategy
rather than the plugin's simpler `generateSW` default, specifically because push notifications
(planned next) need a hand-written `push`/`notificationclick` handler in the same service worker
file — `generateSW` only lets you configure caching rules, not add arbitrary event listeners.

- **Manifest + icons** — `frontend/vite.config.ts`'s `VitePWA({ manifest: {...} })` generates
  `manifest.webmanifest` at build time (name, `display: "standalone"`, theme/background color
  matching the app's own dark navy). Icons live as plain files in `frontend/public/`: `icon-192.png`
  / `icon-512.png` for normal display, plus dedicated `icon-maskable-*.png` variants (content scaled
  to ~70% and centered) for Android's adaptive-icon masking, and `apple-touch-icon.png` (180×180,
  no baked-in rounding) since iOS ignores the manifest's icon list entirely and only ever reads the
  `<link rel="apple-touch-icon">` in `index.html`. All of these are generated from the source
  artwork by trimming to its actual content bounding box and recompositing onto a same-size canvas
  at a *vertically* centered position (background color sampled from the source image's own corner
  pixel) — the source art itself sits noticeably closer to the bottom than the top, which every icon
  file inherited until this fix; the `icon-maskable-*` variants had the exact same lopsided crop and
  were the last two still needing it.
- **Service worker** — [`frontend/src/sw.ts`](frontend/src/sw.ts), built by the same Vite/Rollup
  pipeline as the app itself (not a hand-copied static file), then registered by
  `vite-plugin-pwa`'s injected runtime. `precacheAndRoute(self.__WB_MANIFEST)` (Workbox) precaches
  the whole built app shell (JS/CSS/HTML/icons) for offline load. `/api/*` requests deliberately use
  a **`NetworkFirst`** strategy, not cache-first — a stale readiness score or check-in history would
  be actively misleading for a training-load tool, so the network is always tried first, with the
  cache only as a fallback if it's unreachable.
- **Update flow** — `registerType: "prompt"`, not `"autoUpdate"`: a new deployed version sits
  "waiting" rather than silently swapping the running app out from under someone mid check-in.
  [`components/UpdateToast.tsx`](frontend/src/components/UpdateToast.tsx), mounted once at the
  `App` root (so it works on every page regardless of auth state) via `virtual:pwa-register/react`'s
  `useRegisterSW`, shows a small "A new version of Relay is available" toast with a **Refresh**
  button that calls `updateServiceWorker(true)` to activate the waiting worker and reload.
- **Local testing note** — the service worker only activates against a real production build
  (`devOptions.enabled: false` in `vite.config.ts` — `vite dev`'s own HMR server doesn't need one).
  Use the `relay-frontend-preview` launch config (`npm run preview -w frontend`, port 4173) after
  `npm run build -w frontend` to test installability/offline/update behavior locally, not the
  regular dev server. That config's `vite preview` doesn't inherit `server.proxy` the way `vite dev`
  does, so `vite.config.ts` also has its own `preview.proxy` copy of the same `/api` rule.
- **In-app install instructions** — both How It Works pages spell out the actual steps
  (iPhone/iPad: Safari's Share icon → **Add to Home Screen**; Android: Chrome's ⋮ menu →
  **Install app**), not just "it's installable." The athlete page
  ([`AthleteHowItWorks.tsx`](frontend/src/pages/AthleteHowItWorks.tsx)) frames it around push
  reminders specifically, since **iOS only delivers Web Push to an installed, standalone-launched
  icon — a plain Safari tab can silently hold a "successful" subscription that never actually
  shows a notification** (discovered firsthand: a subscription created before an icon
  reinstall keeps accepting pushes from the server with no error, it just never displays). The
  callout also tells an athlete how to recover from exactly that — flip reminders off and back on
  in **Profile** after reinstalling the icon, which re-subscribes against the current install. The
  coach page ([`HowItWorksContent.tsx`](frontend/src/components/HowItWorksContent.tsx)) covers the
  same install steps without the reminder framing, since coaches never get push notifications
  themselves (`Profile.tsx`'s push section is gated to `role === "ATHLETE"` only).

### Push notifications

Optional, athlete-only, self-service: "remind me on this device if I haven't checked in yet."
Ships fully code-complete but **inert** until a real VAPID keypair is configured — same
code-complete-but-disabled convention as [Google sign-in](#google-sign-in) — so this deployment
runs exactly as it did before this feature until that's done (see
[Push notification setup](#push-notification-setup) below).

- **One row per device, not per account** ([`PushSubscription`](backend/prisma/schema.prisma) --
  `userId`, `endpoint`, the `p256dh`/`auth` keys the push service needs to encrypt the payload).
  Someone who opts in on their phone and their laptop gets two rows and both get reminded; there's
  no single "push enabled" flag on `User`. `endpoint` is globally unique (it's a real per-device
  identity from the browser's push service), so re-subscribing the same device is an upsert, not a
  duplicate.
- **Backend** — [`lib/push.ts`](backend/src/lib/push.ts)'s `trySendPush` wraps
  [`web-push`](https://www.npmjs.com/package/web-push), never throws (same `trySendEmail` spirit as
  [error handling](#error-handling) above), and returns `"sent"` / `"gone"` (the push service
  confirms the subscription is dead — 404/410) / `"failed"` (transient, safe to retry) /
  `"unconfigured"`. `POST`/`DELETE /api/me/push-subscription` (both roles, no `requireRole` --
  subscribing itself isn't role-specific) save/remove one device's row, scoped to the caller's own
  account.
- **The daily reminder, at a configurable hour** — [`lib/pushReminder.ts`](backend/src/lib/pushReminder.ts)'s
  `sendCheckinReminders`, driven by a `node-cron` job in [`src/index.ts`](backend/src/index.ts) that
  fires **every hour, on the hour, America/Chicago** (`node-cron`'s `timezone` option, not a
  hand-computed UTC hour, so "on the hour" stays pinned to Central wall-clock hours across daylight
  saving changes) — not the single fixed 4pm slot this used to be. Each run finds every athlete with
  at least one subscription and no check-in yet *today*, computes their own *effective* reminder
  hour, and only actually sends to whoever's effective hour matches the hour this run is firing
  at — most runs match nobody, which is expected, not a bug. `User.reminderHour` (nullable `Int`,
  0-23, self-service via **My Profile**, `PATCH /api/me/reminder-hour`) is both roles' knob on the
  same field, read differently depending on who set it:
  - An **athlete's** own `reminderHour`, if they've set one, always wins outright.
  - Otherwise, the **earliest** `reminderHour` set by any coach on their roster (a school-shared
    roster can have several coaches with different preferences — earliest means nobody's reminder
    ever arrives *later* than a coach wanted, only ever earlier) — a coach's own Profile page frames
    this as "default reminder time for your team," not a personal reminder, since coaches are never
    the ones who get pushed.
  - Otherwise, `DEFAULT_REMINDER_HOUR` (4pm) — the original fixed behavior, now just the fallback
    once nobody in the chain has expressed a preference, not the only option.

  [`lib/pushReminder.ts`](backend/src/lib/pushReminder.ts)'s `effectiveReminderHour` is the pure
  function this resolution runs through, and [`lib/date.ts`](backend/src/lib/date.ts)'s `localHour`
  is what tells each hourly run what hour it actually is right now, Central time (same
  `Intl.DateTimeFormat`-based approach as `localDayKey`, just the hour component instead of the
  day). Deletes any subscription the push service reports as `"gone"`, same as before. Coaches are
  never sent a reminder themselves — the query only ever joins through `Athlete`, so a coach's own
  subscription (the push toggle itself is athlete-only in the UI, but the endpoint doesn't enforce
  that) simply never matches; their `reminderHour` is only ever read as a fallback for their
  athletes. Still no per-athlete *timezone* tracked anywhere in this app — this makes the *hour*
  configurable within the app's single reference timezone (Central), not full per-user IANA
  timezone support; a school in a different timezone entirely is still a future problem, not one
  this closes.

  There used to be a second fixed run at 7pm, for anyone still missing a check-in by evening —
  removed in favor of the coach-initiated nudge below, a better fit than blanket-repinging the whole
  roster a second time every day.
- **Coach-initiated nudge** — `POST /api/athletes/:id/nudge` (coach + roster scoped), a "Nudge to
  check in" button on an athlete's detail drawer (shown only when they haven't checked in yet
  today). Reuses the exact same "hasn't checked in yet today" gate and `trySendPush`/prune-on-`"gone"`
  pattern as the daily reminder — 400s with a clear reason if the athlete already checked in or has
  no device subscribed, so a coach always gets real feedback instead of a button that silently does
  nothing.
- **Service worker** — the actual reason `injectManifest` (not the simpler `generateSW`) was picked
  for the whole [PWA setup](#progressive-web-app) in the first place: `push` and `notificationclick`
  handlers in [`src/sw.ts`](frontend/src/sw.ts) show the OS notification and deep-link to `/checkin`
  on click, focusing an already-open tab there instead of piling up duplicates.
- **Frontend** — [`lib/push.ts`](frontend/src/lib/push.ts) wraps `pushManager.subscribe`/
  `unsubscribe` directly (no wrapper library, same convention as `lib/google.ts`). The **My
  Profile** toggle (athlete-only) requests notification permission, subscribes, and POSTs the
  result to the backend; unchecking it does the reverse. Gated on `VITE_VAPID_PUBLIC_KEY` being set
  at build time (`PUSH_CONFIGURED`) exactly like `GOOGLE_CONFIGURED` -- unset, the whole section
  just doesn't render.

### Google sign-in

Optional, additional login method — **linked to an existing account**, not a signup bypass.
Signing in with Google never creates an account by itself: `POST /api/auth/google` 404s for any
Google identity that isn't already linked to a `User`, with a message pointing the visitor back to
password sign-in. This was a deliberate choice over auto-provisioning, matching every other
account-creation path in this app: an account only ever exists once someone with real authority
has agreed to it (an admin, an inviting coach, or an approving coach on a join request), never as
an incidental side effect of which button someone happened to click.

- **Linking**: from **My Profile**, `POST /api/me/google-link` verifies a real Google ID token
  server-side (`google-auth-library`'s `OAuth2Client.verifyIdToken`,
  [`lib/google.ts`](backend/src/lib/google.ts)) and only links it if the token's **verified** email
  exactly matches the signed-in account's own email — so no one can link a Google identity to an
  account that isn't provably theirs. `User.googleId` is a new, separate, nullable-unique column;
  it never replaces `passwordHash` — every account keeps a real password regardless of whether
  Google is also linked, and can unlink (`DELETE /api/me/google-link`) at any time. A Google
  identity already linked elsewhere 409s rather than silently stealing the link.
- **Signing in**: `POST /api/auth/google` looks up the account by `googleId` and, once found, goes
  through the exact same `sessionOrMfaChallenge()` path as password login — a linked account with
  TOTP enabled still gets the `{mfaRequired: true, tempToken}` challenge first. Google sign-in is
  never a way to skip 2FA.
- **Frontend**: [`lib/google.ts`](frontend/src/lib/google.ts) loads Google's own Identity Services
  script and renders Google's own button — no custom "Sign in with Google" UI to keep in sync with
  their branding requirements. Both the button on **Login** and the whole link/unlink panel on
  **Profile** are gated on `VITE_GOOGLE_CLIENT_ID` being set at build time
  (`GOOGLE_CONFIGURED` in each file) — unset, neither renders anything at all (no dangling divider,
  no broken button), so the app is fully functional with Google sign-in simply not configured yet,
  which is the actual state of this deployment right now. See
  [Google sign-in setup](#google-sign-in-setup) below for what's needed to turn it on.

## Data model

- **Squad** — a roster grouping (Girls, Boys)
- **Athlete** — belongs to a squad; optionally linked to a `User` for athlete login; `gender`
  (`FEMALE` / `MALE` / `NONBINARY` / `PREFER_NOT_TO_SAY`), required at login if unset
- **CoachAthlete** — many-to-many roster assignment between coach `User`s and `Athlete`s
- **School** — an optional shared-visibility group for coaches (see
  [Schools](#schools--shared-roster-visibility-across-a-coaching-staff)); a `User` with
  `role: COACH` may optionally belong to one, via `User.schoolId`. Also holds a short, unique
  `joinCode` athletes use to self-request joining (see below)
- **Invite** — an email + status + type (`ATHLETE` or `COACH_TO_SCHOOL`) + an optional school (for
  `COACH_TO_SCHOOL`) + a unique accept token/expiry; accepting one for real
  (`/accept-invite/:token`) creates the account (and, for `ATHLETE`, the `Athlete`/`CoachAthlete`
  rows too, with squad derived from the gender the athlete answers on that same form). `squadId`
  still exists on the model but is no longer set or read for `ATHLETE` invites — squad comes from
  the athlete's own gender answer now, not a coach's choice at invite time
- **SchoolJoinRequest** — the reverse of an `Invite`: an athlete's proposed name/username/email/
  password (hashed) + gender + status (`PENDING`/`APPROVED`/`REJECTED`), submitted via a school's
  `joinCode` at the public `/join` page. No `User` exists until a coach at that school approves it
  (see [School join code](#school-join-code--athlete-self-service-coach-approved) above)
- **PasswordResetToken** — simulated forgot-password flow
- **WellnessEntry** — daily self-reported sleep, soreness, mood, energy, motivation (1–5 each) plus
  an optional note. An athlete can only ever write their own (the athlete ID comes from the JWT,
  never the request body). One row per athlete per calendar day (`@@unique([athleteId, day])`) —
  resubmitting the same day **overwrites** that day's row (`POST /api/wellness` upserts on it)
  rather than stacking another entry, so a coach only ever sees the athlete's *final* answer for a
  given day, both in the raw check-in list and in any trend built from it.
- **TrainingLoad** — a logged run: athlete-entered title, distance in miles (2 decimal places),
  duration (entered as HH:MM:SS, stored as fractional minutes), RPE → session load (RPE ×
  duration). Same self-only rule as check-ins, and same multiple-per-day allowance (split
  workouts, two-a-days). The athlete confirms a summary of the run before it's saved.
- **ReadinessScore** — a weekly snapshot: score (0–100) + status. Recomputed automatically
  whenever an athlete submits a check-in, logs a run, deletes a run, or their injury status
  changes — see [`lib/scoring.ts`](backend/src/lib/scoring.ts). Also snapshots
  `daysOfHistory` — how much history the athlete had on file *at the moment that score was
  computed* (not re-derived later from today's day-count) — purely so the UI can show a "still
  settling in" caveat on a new athlete's number without it silently reading as confident;
  doesn't change the score itself. See [Data confidence](#data-confidence) below. Also holds
  `talkedToAt` (nullable) — see ["Fit them into your week"](#fit-them-into-your-week) below.
- **Injury** — tracked per athlete with status (`ACTIVE` / `RECOVERING` / `RESOLVED`)
- **Note** — a coach's check-in note left on an athlete
- **PushSubscription** — one row per device's Web Push subscription (endpoint + encryption keys),
  owned by a `User`; see [Push notifications](#push-notifications)

### Readiness status

Status is score-driven, except an injury always overrides it:

| Status | Meaning | Trigger |
|---|---|---|
| `FRESH` | Steady, no action needed | score > 55 |
| `EASE_BACK` | Load creeping up, worth watching | 30 < score ≤ 55 |
| `BACK_OFF` | Worth a real check-in this week | score ≤ 30 |
| `RETURN_PROTOCOL` | On return-to-run protocol | active `RECOVERING` injury |
| `INJURED` | Out, held out of load tracking | active `ACTIVE` injury |

The score is the real pipeline derived in [`docs/math-behind-relay.md`](docs/math-behind-relay.md),
implemented end to end in [`lib/math.ts`](backend/src/lib/math.ts) (pure, unit-tested formulas —
see [`lib/math.test.ts`](backend/src/lib/math.test.ts), each test checked against the notes' own
worked examples) and wired up by [`lib/scoring.ts`](backend/src/lib/scoring.ts): an EWMA-smoothed
acute:chronic load ratio, a per-athlete z-score each for load, run efficiency, and wellness, a
weighted composite of the three, and a logistic transform into a bounded 0–100 risk score. It
recomputes automatically — and immediately — whenever an athlete submits a check-in, logs a run, or
deletes a run (`recomputeReadiness`, called from the wellness/training-load routes), or their
injury status changes. An athlete needs about two weeks of data on file before the score reflects
any of that pipeline; before that it reads as a fixed neutral default rather than a guess built on
too little history. The original handwritten derivation it's based on is scanned into
[`proofs/`](proofs).

Run `npm run test:backend` to run the math unit tests on their own. To see every intermediate
number the pipeline produces for a real seeded athlete (EWMA load, each z-score, the composite, the
logistic risk score) rather than only the final stored score, run
`npm run inspect -w backend -- "Maya Okonkwo"` (name or username both work) —
[`backend/scripts/inspect-athlete.ts`](backend/scripts/inspect-athlete.ts).

### Data confidence

A readiness score is real math the moment an athlete has *any* history — but it's noisier for a
brand-new athlete than it will be once the pipeline has settled. Two thresholds, both already
load-bearing elsewhere in the pipeline, not invented for this: `MIN_HISTORY_DAYS` (14 — below
this the z-score pipeline has no signal at all yet, so the stored score is a flat neutral default,
not a real read on the athlete) and `CHRONIC_WINDOW_DAYS` (28 — the chronic-load EWMA's own window;
below this the score is real but hasn't fully settled). `ReadinessScore.daysOfHistory` snapshots
which of these applied *at the time* a given week's score was computed (see above), and
[`lib/status.ts`](frontend/src/lib/status.ts)'s `dataConfidence()` turns that into a small amber
"⚠" caveat everywhere a score is shown — a tooltip badge on Brief/the Board where space is tight,
a full sentence on the coach's detail-drawer header and the athlete's own opt-in readiness card
where there's room. Once `daysOfHistory >= 28`, `dataConfidence()` returns nothing — no caveat, the
number is fully trusted. This is a separate, score-level version of the same display-confidence
idea `getDataPhase`/`WorkloadAnalysis.tsx` already applied to the raw ACWR/risk numbers further
down the same drawer — that one's still there too, unchanged; this one covers the headline number
those numbers don't.

### "Fit them into your week"

Below the Brief's ranked list sits a second panel that turns the ranking into an actual to-do
list: the coach's N highest-priority runners this week (a stepper controls N, 1–8, default 3;
ephemeral component state, not persisted — cheap to change on a whim), each with a checkmark for
"I've actually talked to them." [`components/MatchingSection.tsx`](frontend/src/components/MatchingSection.tsx)
sorts every non-`INJURED`/non-`RETURN_PROTOCOL` athlete by score ascending (lowest = needs it
most) and slices to N — the same exclusion the Brief's own ranked list already uses, since an
injured or return-protocol athlete's status is already known and expected, not something a
check-in resolves. If N exceeds the number of actually-flagged athletes, the extra spots simply
fill in with the next-lowest-score (often `FRESH`) athletes — a coach who wants to check in with
more people than are strictly flagged this week can just raise the count.

The checkmark is real, persisted state — `ReadinessScore.talkedToAt` (nullable `DateTime`), set
via `PATCH /api/brief/:id/talked-to` (`{talked: boolean}`, scoped to the coach's own roster,
`talked: false` clears it back to `null`) — not a client-only toggle that vanishes on refresh.
It lives directly on that week's `ReadinessScore` row rather than a separate model: the
`@@unique([athleteId, week, year])` constraint already guarantees exactly one row per
athlete-week to hang it on, and it naturally resets itself every Monday since next week's score
is a brand-new row.

This replaced an earlier version that assigned a fixed set of time slots (e.g. "Tue lunch") to
athletes via a real weighted bipartite-match solver — the matching algorithm itself was correct,
but *availability* was fake: `deriveAvailability(name)` derived a deterministic pseudo-schedule
from a checksum of the athlete's own name, with zero connection to actual risk. That meant a
high-risk athlete could hash into zero overlap with whichever slot times happened to be offered
and simply never get matched to anything — the solver would then correctly (and silently) fill
those slots with lower-risk athletes who *did* hash into availability instead, which looked like
exactly the "ranks flagged athletes lowest" bug it was supposedly solving. Found via the real
demo dataset: two flagged boys both happened to hash to "Wed PM" only, none of the three default
slots, so all three slots filled with `FRESH` athletes instead. Dropping the fake availability
model entirely — no slots, no schedule, just "these are your top N people" plus a real
"did I talk to them" record — removes the whole class of bug rather than patching the hash.

### Coach notes — where the athlete actually sees them

A coach leaves a note on an athlete (`POST /api/notes`, `{athleteId, body}`) from the "Note" button
on a Brief card, a Board lane, or an athlete's detail drawer —
[`components/NoteModal.tsx`](frontend/src/components/NoteModal.tsx). It's a real, persisted `Note`
row from the moment it's sent, not a dummy input: `GET /api/notes/athlete/:athleteId` is already
gated by the same `canAccessAthlete` every self-access endpoint uses, so the athlete themself can
always read it back.

The gap was purely on the frontend, and only a partial one: the athlete's runs page (now
`AthleteHistory.tsx`, then still `AthleteRuns.tsx`/"My Runs") already had a "NOTES FROM YOUR COACH"
section rendering every note with the coach's name and date — but `AthleteCheckin.tsx`, the page an
athlete actually lands on first, had none. A note only ever showed up if the athlete happened to
visit the other page too, which for anyone who mostly just checks in and leaves, they might never
do. `AthleteCheckin.tsx` now fetches and renders the same section, in the same style, so a note
reaches the athlete on the very page a coach's own workflow assumes it does — still true after the
runs page's own later rename and rewrite into History (see
[Logging a run lives on the Check-in page](#logging-a-run-lives-on-the-check-in-page-not-a-separate-tab)).

### First-login setup — a one-time, skippable prompt

Push notifications, reminder hour, and (athlete-only) readiness-score visibility all live
permanently in **My Profile** — but nothing ever pointed a brand-new user there, so someone who
never happened to go looking would never know push reminders existed at all.
[`OnboardingSetup.tsx`](frontend/src/components/OnboardingSetup.tsx) shows these three, once, right
after an account's very first login (after [`GenderGate`](frontend/src/components/GenderGate.tsx)
for an athlete, since squad assignment has to be settled first) — same architecture as
`GenderGate`, gated in `Layout.tsx` alongside it, but **skippable**: a "Skip for now — I'll do this
later in My Profile" link sits right next to the real controls, and either path (save or skip)
marks it done and never shows again. Unlike gender, forcing a decision on "do you want
notifications?" before someone's even checked in once is worse UX than letting them defer it, so
this deliberately doesn't block the way `GenderGate` does.

Both roles get it — a coach's reminder-hour is genuinely worth surfacing immediately (a team in a
different timezone than the 4pm default), and it shows regardless of whether a not-yet-rostered
athlete has a coach yet, so it's out of the way for good the moment they finally do get one, rather
than stacking a second interstitial on top of their first real check-in. Backed by
`User.onboardingCompletedAt` (nullable `DateTime`, `POST /api/me/onboarding-complete` to stamp it) —
shipping this **backfilled every pre-existing account's own `createdAt`** into that column as part
of the migration itself, so the entire existing user base didn't suddenly see a "finish setting up"
screen out of nowhere on their next ordinary login; only genuinely new signups going forward see it.

The push-toggle, reminder-hour picker, and readiness-visibility checkbox are the exact same
state/logic Profile.tsx already had — factored out into three shared hooks
([`hooks/usePushNotifications.ts`](frontend/src/hooks/usePushNotifications.ts),
[`useReminderHour.ts`](frontend/src/hooks/useReminderHour.ts),
[`useReadinessVisibility.ts`](frontend/src/hooks/useReadinessVisibility.ts)) so both Profile.tsx and
`OnboardingSetup.tsx` share one implementation instead of two copies of the same subscribe/save
logic with different surrounding copy.

While building this, `POST /api/auth/login`'s response (and the two account-creation-and-login-in-
one-step paths in `routes/inviteAccept.ts`) turned out to already have been missing `reminderHour`
from their own hand-built `user` object — present in `GET /api/me`'s response the whole time, never
in the one a fresh login actually returns. Harmless in practice once
[`Layout.tsx`'s own mount-time `/me` refetch](#data-export-and-account-deletion-self-service)
fills it in moments later, but worth fixing directly rather than leaning on that refetch to paper
over three independently-hand-built copies of the same response shape quietly drifting apart.

### Athlete readiness visibility (self-service, off by default)

The readiness score is coach-only by default — deliberately, so an athlete's daily check-in stays
an honest answer instead of something to manage toward a number they can see. An athlete can opt in
to seeing their own current score from **My Profile** (`/profile`), with the tradeoff spelled out
right there in the toggle's copy, and can switch it back off anytime — a coach cannot set this on an
athlete's behalf. On, it shows on the athlete's own Check-in page
([`AthleteCheckin.tsx`](frontend/src/pages/AthleteCheckin.tsx)), same score/status/summary a coach
sees. Backed by `Athlete.shareReadinessWithAthlete` (`@default(false)`), `PATCH
/api/me/readiness-visibility` to toggle it, and `GET /api/me/readiness` to read it — the latter
returns `{shared: false, latest: null}` rather than a 403 when the athlete has opted out, since
withholding it is their own choice, not an authorization failure. No new computation: both read the
same `ReadinessScore` row the coach-facing endpoints already do.

### Coach's athlete detail view

Clicking an athlete on Brief or the Board opens a detail drawer showing that athlete's full last 7
days: one wellness check-in per day (all 5 fields, color-coded — WellnessEntry is one row per
athlete per day, see above) and every logged run — not a fixed number of most-recent rows, so an
athlete who logged more than one run in a day (a two-a-day) still shows every individual run from
the week.

The distance/pace/RPE trend charts on this same view (`GET /api/athletes/:id/stats`) are
day-granular too, for the same reason: a two-a-day rolls up into **one point** for that day (summed
distance, a true weighted pace — total duration over total distance for the day, not an average of
each run's own pace — and a **duration-weighted RPE**, same idea), rather than one point per
individual run.

Both the day-by-day trend's RPE and the season-long **Average RPE** stat tile are duration-weighted
(`Σ(rpe × duration) / Σduration`), not a flat mean of each session's own RPE — the same reasoning
already applied to pace. A flat mean treats a 15-minute recovery jog at RPE 2 and a 90-minute tempo
run at RPE 8 as equal contributions to "the average," which reads as "medium effort" even though
the athlete spent six times as long at the hard end. Weighting by duration also matches how RPE is
actually used everywhere else in this app — `load = rpe × duration` is the literal session-load
formula the readiness pipeline's own `effortCost` already runs on every logged session (see
[`lib/scoring.ts`](backend/src/lib/scoring.ts)) — so the displayed average now reflects the same
notion of effort the acute/chronic/ACWR numbers below it are built from, instead of a differently-
weighted number that happened to sit next to them. Purely a display change — this stat was never
fed into any calculation itself, only ever shown in [`AthleteStats.tsx`](frontend/src/components/AthleteStats.tsx).

Sleep and energy deliberately have **no** averaged number or trend chart anywhere in Stats, unlike
RPE/distance — those are the athlete's own 1–5 subjective check-in self-rating, not a real
measurement, and averaging a Likert scale into "4.2/5" implies a precision that isn't there. A
coach only ever sees those numbers through the Check-in History table above (real per-day
values, color-coded), never collapsed into a stat tile or sparkline.

The drawer also has two always-different sections, both backed by
[`GET /api/athletes/:id/stats`](backend/src/routes/athletes.ts):

- **Stats** — always visible, no matter how little history exists: season-to-date total distance,
  average pace, this week's distance, session count, average RPE, and small charts (distance-over-time
  bars, RPE/pace trend lines — even a single logged session draws something, not an empty chart). A
  strength/cross-training session with no distance still counts toward session count and average
  RPE, just not distance or pace.
- **Workload analysis** — the *same* acute/chronic EWMA load, ACWR, and 0–100 risk score the
  readiness pipeline above already computes for every athlete, just surfaced as raw numbers
  instead of only the final rounded status. Phase-gated on how many days of history exist, using
  the pipeline's own acute (7-day) and chronic (28-day) window lengths as the boundaries — a
  separate, purely-presentational confidence layer from the two-week minimum that gates the
  readiness score itself:
  - **Under 7 days** — a progress bar ("Building baseline — N / 7 days"), no numbers yet.
  - **7–27 days** — the numbers, with an "Inconclusive — N / 28 days" banner and neutral/amber
    coloring rather than the full status color.
  - **28+ days** — full confidence, colored by the same Fresh/Ease back/Back off band shown
    everywhere else in the app (deliberately one risk scale across the whole app, not a second,
    differently-thresholded one that could disagree with the status pill next to it).

### Logging and managing injuries

A coach logs an injury from either the **Injuries** page ("+ Log injury", with an athlete picker
scoped to the currently-selected squad) or an athlete's own detail drawer ("+ Log injury" under
INJURY STATUS, athlete already picked). Both open the same
[`InjuryModal.tsx`](frontend/src/components/InjuryModal.tsx) — just a description and, on the
Injuries page only, which athlete. `POST /api/injuries` (`{athleteId, description}`) always
starts the injury at `ACTIVE`/"Out" and stamps `startDate` as *now* — there's no backdating an
injury's start the way check-ins and runs can be backdated, since the whole point (suppressing
risk flags for genuinely-injured slow paces) only matters going forward from today.

From there, a coach flips status forward as the athlete progresses: **Start return-to-run
protocol** (`ACTIVE` → `RECOVERING`) once they're back to easy running at reduced paces, then
**Mark resolved** (→ `RESOLVED`, either status can go straight there, stamps `endDate`) once
they're fully back. Both actions call `PATCH /api/injuries/:id` (`{status}`) and immediately
`recomputeReadiness` for that athlete server-side — this is *why* logging/updating an injury from
a drawer opened off Brief or the Board also refreshes that page's own list (a new `onChanged`
prop on `DetailDrawer`, alongside the existing `onRemoved` used for roster removal — `onChanged`
leaves the drawer open since the athlete didn't disappear, just their status changed), not only
the drawer itself.

This backend side (`routes/injuries.ts`) already existed and was already fully tested — the gap
was purely that no frontend UI ever called `POST`/`PATCH /api/injuries`, so there was genuinely no
way to log one before this.

`RESOLVED` injuries are never deleted from the DB, but both the **Injuries** page and an athlete's
detail drawer used to filter them out entirely — a cleared injury simply vanished from view with no
way to see it again. Both now surface that history: the Injuries page has a collapsible "Show
resolved injuries (N)" panel below the active list, and the detail drawer lists a short "✓ Cleared"
line (with the date range) under INJURY STATUS for each of that athlete's past injuries. Purely a
frontend change — no new endpoint, both pages already had the full `injuries` array in hand and
were just throwing the resolved ones away client-side.

### Check-in rate — coach and admin, roster/school-scoped

A small stat, not a calendar: "X% checked in today" plus a 7-day bar graph, backed by
[`lib/activityStats.ts`](backend/src/lib/activityStats.ts)'s `checkinRateSeries` — a zero-filled
daily `{date, checkedIn, total, rate}` series, same shape as `routes/admin.ts`'s existing
system-wide activity endpoints, just parameterized on whatever athlete-ID list the caller passes
in instead of always being every athlete everywhere. `total` is the *current* roster size held
constant across the whole series (this app doesn't track roster membership historically), and
`rate` is `null` rather than `0` when `total` is 0 — an empty roster isn't a bad check-in day.

- **Coach-facing** — `GET /api/squads/:id/checkin-rate?days=` (default 7, coach + squad scoped via
  `getCoachAthleteIds`), shown on the Board (Dashboard.tsx) right under the status summary row.
- **Admin-facing** — folded into `GET /api/admin/schools/:id`'s existing response as
  `checkinRateSeries` (always 7 days), scoped to that school's whole shared roster via
  `getSchoolAthleteIds`. Shown on `AdminSchoolDetail.tsx`.

### Admins can now see a school's actual athlete roster, not just a count

`GET /api/admin/schools/:id` also now returns an `athletes` array (name, squad, gender) — the
same shape `adminCoachDetail`'s own `athletes` list already uses. Coach-facing `School.tsx`
deliberately still only shows an athlete *count*, not names, since a coach already sees every one
of them individually via Brief/Dashboard; an admin has no equivalent squad view to fall back on,
so this was a real gap, not a deliberate omission being reversed.

`AdminSchoolDetail.tsx`'s Athletes panel groups that list into **Girls/Boys sections** (each with
its own count) instead of one flat list with a per-row squad label, matching how every other squad
view in the app already separates the two.

This same panel — and List rows across eight other pages (`School.tsx`, `CoachInvites.tsx`,
`Injuries.tsx`, and five more admin pages) — had a real, longstanding CSS bug: every one of these
rows used classes named `run-row`/`run-type`/`run-meta`, but only `run-item-row`/`run-item-type`/
`run-item-meta` (missing the `-item-` infix) actually existed in `index.css`. The typo'd classes
matched no rule at all, so every one of these rows rendered with no flex layout, no gap, and no
font treatment — name and label text ran together with plain browser defaults (e.g. "Carter
ColeBoys"). Several call sites had even compensated by hand, adding an inline `padding` override on
the outer `.run-item` wrapper to get *some* spacing back, without ever finding the real cause —
removed now that the correct classes supply their own padding, to avoid doubling it up. Fixed by
renaming every occurrence to the classes that actually exist.

### An accepted coach invite no longer also lingers in "Pending coach invites"

Both `School.tsx` (coach-facing) and `AdminSchoolDetail.tsx` (admin-facing) used to keep showing
an `ACCEPTED` `COACH_TO_SCHOOL` invite in the "Pending coach invites" list with a "Joined" pill —
purely redundant, since that coach is already listed in the **Coaches** panel directly above the
moment they accept. Both pages now filter `ACCEPTED` out of that list client-side (the API still
returns every invite regardless of status, in case anything else ever needs the full history) —
`REJECTED` invites still show, since that's real history with nowhere else to see it.

### Removing an athlete from the roster

A **Remove from roster** button at the bottom of the same detail drawer (behind an inline confirm
step) lets a coach take an athlete off the active roster — for someone who's graduated, quit, or
transferred elsewhere. Deliberately **not** an account deletion: the athlete's `User`/`Athlete`
rows and every check-in, run, readiness score, injury, and note stay exactly as they are —
`DELETE /api/athletes/:id/roster` only removes the `CoachAthlete` link(s). The athlete falls back
to the same "waiting on a coach" state a brand-new, never-rostered athlete already sees; re-inviting
or re-approving them later picks their full history right back up, nothing was ever lost.

Any coach who can currently see the athlete may do this — the same `isCoachOfAthlete` check every
other coach-facing athlete route already uses (see
[Schools](#schools--shared-roster-visibility-across-a-coaching-staff)), not narrowed to "only the
coach who originally added them." It deletes **every** `CoachAthlete` row for that athlete, not
just the calling coach's own — necessary because of how shared-school visibility actually works
(`getSchoolAthleteIds` in [`lib/authz.ts`](backend/src/lib/authz.ts)): any coach at the athlete's
school sees them the moment *any* coach there has a roster row for them, regardless of whose row
it is, so leaving even one other coach's row in place would mean the athlete never actually
disappears from the shared roster this action is meant to clean up.

This was a deliberate, narrower alternative to a real account-deletion feature — see this
project's own commit history for the reasoning: permanently destroying a real athlete's check-in
and run history over a roster-cleanup request is a much bigger, harder-to-undo action than the
actual problem ("this person isn't running with us anymore") calls for.

### Data export and account deletion (self-service)

Two self-service rights, both roles, from **My Profile** — no coach, admin, or email required:

- **Download my data** (`GET /api/me/export`) — every row this app has stored under the caller's
  own account, as one JSON document the browser downloads directly (client-side `Blob` + a
  throwaway `<a download>`, no server-side file storage involved). An athlete's export is their
  account fields, athlete profile, check-ins, runs, injuries, readiness scores, and every note
  their coach has left them; a coach's own export is much smaller — their account fields plus the
  notes *they've* personally written (their roster/school membership isn't really "their" data in
  the same sense, and is already visible to them live in the app).
- **Delete my account** (`DELETE /api/me`, `{currentPassword}`, same "prove you're really you right
  now" bar as change-password/MFA-disable) — **anonymizes, not hard-deletes**, the same
  "history survives, identity doesn't" shape [removing an athlete from the roster](#removing-an-athlete-from-the-roster)
  above already established, just one step further: username, email, first/last name, and any
  linked sign-in method (Google, MFA, push subscriptions, reset tokens) are all scrubbed to a
  random placeholder or removed outright, so the account can never be logged into again by any
  means — but check-ins, runs, injuries, readiness scores, and notes all stay exactly as they are,
  the same reasoning the roster-removal feature already spelled out (permanently destroying real
  training history over an identity request is a bigger, harder-to-undo action than the actual ask
  calls for). An athlete is also immediately removed from every coach's roster (`Athlete.name`
  becomes "Deleted Athlete"); a coach's own roster links are removed the same way, and any athlete
  left with no coach at all falls back to the existing `NoCoachNotice` "waiting on a coach" state —
  the same one a brand-new, never-rostered athlete already sees.

Backed by [`lib/randomCode.ts`](backend/src/lib/randomCode.ts)'s existing `randomUnambiguousString`
(already used for join codes and MFA backup codes) for the placeholder username/email, and a real
`bcrypt` hash of a value nobody will ever type for the scrambled password — not a blank or
predictable string, so there's no way back in even by guessing.

A public **Data & privacy** page (`/data-policy`, [`pages/DataPolicy.tsx`](frontend/src/pages/DataPolicy.tsx),
linked from every page's footer and from Profile) plainly describes what's collected, why, who can
see it, and these two rights — a real, honest description of what this app actually does, but
deliberately not a substitute for a lawyer-drafted privacy policy or a school district's own formal
data-processing agreement. There's no in-app parental-consent capture mechanism (no e-signature
flow, no attestation checkbox) — that's left to whatever consent process a school already runs
outside the app, same as it already handles any other permission-slip-style requirement.

Shipping this surfaced a real, pre-existing bug that would have quietly defeated both of these
rights for one specific group: an athlete stuck waiting on a coach (signed up, but never actually
added to anyone's roster). `Layout.tsx`'s `<main>` decided what to render purely from `needsCoach`,
ignoring which route was actually active — so the topbar's "My Profile" link (always visible,
regardless of `needsCoach`) silently did nothing for these athletes; clicking it kept the URL at
`/profile` but `<main>` still rendered the "waiting on a coach" notice instead of the real page. No
way to reach password/MFA settings, and — the two things that made this worth calling out — no way
to export their data or delete an abandoned signup, for exactly the athletes most likely to want
to. Fixed by exempting `/profile` specifically from that gate (`useLocation()` checked alongside
`needsCoach`); every other athlete-only tab (Check-in, History) still correctly stays hidden until
they're actually rostered, since those still wouldn't do anything useful yet.

A second, related bug turned up while auditing for more of the same: `needsCoach` (and every other
gate that reads straight off the logged-in `user` object — `isSuperAdmin`, `schoolId`, `gender`,
`reminderHour`, all of it) comes entirely from a copy of `AuthUser` cached in `localStorage` at
login time. Every existing self-service action already patches that cache locally right after the
change it makes (`updateUser(...)`, see `AuthContext.tsx`) — but nothing ever caught up a change
made by *someone else*. Most consequential: a coach adding an athlete to their roster changes that
athlete's real `hasCoach` server-side, but an already-open tab's cached copy stayed stale — an
athlete could be fully rostered and still see "waiting on a coach" indefinitely in that tab, with
no way to know it was already fixed on the coach's end, short of guessing to log out and back in.
`GET /api/me` (`api.me()`) existed the whole time but was never actually called anywhere in the
frontend. Fixed with one fetch-and-merge into the cached user on `Layout.tsx`'s mount (every fresh
page load or new tab, not a continuous poll — fails silently on error, keeping the cached value as
a reasonable fallback rather than risking a spurious logout over a flaky request). This closes the
gap for the common case (closing and reopening the app, or a plain reload) but not for a coach
connecting an athlete while that athlete's tab stays open and untouched the whole time — a true
fix for that would need either a poll or a push-driven refresh, neither of which this change adds.

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL running locally (`brew install postgresql@16 && brew services start postgresql@16`)

### Setup

```bash
npm install

# Backend: configure env and set up the database
cp backend/.env.example backend/.env   # edit DATABASE_URL if needed
createdb relay_dev
npm run prisma:migrate -w backend
npm run prisma:seed -w backend
```

### Run

```bash
# Terminal 1
npm run dev:backend    # http://localhost:4000

# Terminal 2
npm run dev:frontend   # http://localhost:5173 (proxies /api to the backend)
```

### Seeded logins

The seed script prints every username on completion. Every account uses the same password:

**Password:** `Relay2026!`

| Username | Name | Role | Squad | Archetype |
|---|---|---|---|---|
| `jordan.rivera` | Jordan Rivera | Coach | — | — |
| `maya.okonkwo` | Maya Okonkwo | Athlete | Girls | risk |
| `sofia.reyes` | Sofia Reyes | Athlete | Girls | risk |
| `ava.thompson` | Ava Thompson | Athlete | Girls | watch |
| `lily.anderson` | Lily Anderson | Athlete | Girls | watch |
| `chloe.bennett` | Chloe Bennett | Athlete | Girls | injured |
| `emma.whitfield` | Emma Whitfield | Athlete | Girls | return |
| `jonah.pruitt` | Jonah Pruitt | Athlete | Boys | risk |
| `ethan.brooks` | Ethan Brooks | Athlete | Boys | watch |
| `marcus.webb` | Marcus Webb | Athlete | Boys | fresh |
| `diego.alvarez` | Diego Alvarez | Athlete | Boys | fresh |

Jordan is the only seeded coach, with all 10 athletes on his roster — including Chloe (injured)
and Emma (return-to-run), so the injury and return-to-run guardrails in
[`lib/scoring.ts`](backend/src/lib/scoring.ts) are reachable straight from his Brief/Injuries
tabs. `CoachAthlete` is still a many-to-many join table in the schema (an athlete can have more
than one coach at once) — the seed just doesn't currently create a second coach to demonstrate
that with. Add one via `prisma.user.create({ ..., role: "COACH" })` and a matching `CoachAthlete`
row if you need to exercise that case.

Every athlete is seeded with **8 weeks of check-ins and logged runs** (`backend/prisma/seed.ts`),
with day-to-day and week-to-week variety instead of one flat repeated number, following one of
five archetypes: `fresh` (steady load throughout), `watch` (load gradually creeping up), `risk`
(a hard mileage spike the last two weeks), `injured` (an active injury with mileage crashing to
near-zero recently), and `return` (an injury a few weeks back, now on a gradual return-to-run
ramp). The multi-week trend shown on Brief and in the athlete detail drawer is computed by
actually running the real scoring algorithm against that data one week at a time — not a
fabricated per-week number — so it reflects the same math described in
[`docs/math-behind-relay.md`](docs/math-behind-relay.md).

### Real-roster dataset (larger, messier, anonymized)

`npm run prisma:seed:real-roster -w backend` seeds a second, additive dataset — it never touches
the 10-athlete demo above — derived from a real cross country coach's 10-week mileage tracking
sheets for a boys and girls team (81 athletes, 1 new coach: `coach.mileage` /
`Relay2026!`). This exists to stress-test the app against real, messy, large-scale data: uneven
week-to-week mileage, athletes who joined partway through the season, explicit zero-mileage
(rest/injury) weeks, and grades/squads with very different absolute training volumes.

**Every identity in it is synthetic.** The source sheets have real students' full names; none of
them appear anywhere in this repo — [`backend/prisma/seedRealRoster.ts`](backend/prisma/seedRealRoster.ts)
generates a deterministic pseudonym for each row from a fixed name pool, keeping only grade,
squad, and the real (whole-number) weekly mileage totals, which get split into individual daily
runs the same way the archetype seed's `planWeekRuns` does. Wellness check-ins don't exist in the
source at all (it only ever tracked mileage) — those are entirely synthetic, loosely correlated
with each week being a bigger or smaller jump than that athlete's own average so far. Missing
weeks (blank cells in the source, not printed zeros) are read as "not on the roster yet" for
grade 9 (joined mid-season) or "stopped reporting" for grades 10–12, and a run of 3+ leading zero
weeks is read the same way regardless of grade — see the comments in `seedRealRoster.ts` for the
exact rule.

`npm run verify-roster -w backend` ([`backend/scripts/verify-roster-integrity.ts`](backend/scripts/verify-roster-integrity.ts))
runs the full readiness pipeline against every athlete currently in the database and flags
anything that shouldn't be possible — a thrown exception, NaN/Infinity anywhere in the breakdown,
a score outside `[0, 100]`, or an invalid status — useful after seeding either dataset, and
especially after any change to the scoring pipeline.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev:backend` | Start the API in watch mode |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run build:backend` | Compile the API to `backend/dist` |
| `npm run build:frontend` | Build the SPA to `frontend/dist` |
| `npm run lint` | Lint both workspaces |
| `npm run test:backend` | Unit tests only (fast, no database) |
| `npm run test:backend:integration` | Integration tests (real API + a shared test database) |
| `npm run test:backend:e2e` | End-to-end tests (fresh database, deterministic seed) |
| `npm run test:backend:all` | All three tiers, in order |
| `npm run inspect -w backend -- "<name or username>"` | Print one athlete's full readiness breakdown |
| `npm run verify-roster -w backend` | Check every athlete's readiness pipeline for NaN/out-of-range/thrown errors |
| `npm run create-account -w backend -- --email you@example.com [--make-super-admin]` | Provision (or reset the password for) one real account with a fresh random password, printed once — see [`scripts/create-account.ts`](backend/scripts/create-account.ts). `--make-super-admin` grants the system-wide admin role (coach accounts only) — the only way to grant it, on purpose, no self-service path. For a real deployment's database rather than your local one, prefix with `DATABASE_URL="..."` (the database's public/proxy connection string, not its internal one) |
| `npm run prisma:migrate -w backend` | Apply Prisma migrations |
| `npm run prisma:seed -w backend` | Reseed coaches, athletes, rosters, and sample invites |
| `npm run prisma:seed:real-roster -w backend` | Additively seed the 81-athlete anonymized real-mileage dataset |

## Testing

Three tiers, each with its own vitest config, none of them ever touching `relay_dev`:

| Tier | Command | What it exercises | Database |
|---|---|---|---|
| Unit | `npm run test:backend` | Every formula in [`docs/math-behind-relay.md`](docs/math-behind-relay.md) (`backend/src/lib/math.test.ts`) plus `readiness.ts`'s status/message logic — pure functions, no I/O | none |
| Integration | `npm run test:backend:integration` | Every route (auth, wellness, training-load, injuries, roster scoping) through the real Express app via [supertest](https://github.com/ladjs/supertest), asserting on real Postgres rows | `relay_test`, reset between tests |
| End-to-end | `npm run test:backend:e2e` | Full multi-step journeys — an athlete logging in and reacting to check-ins/runs, a coach's brief/notes/roster isolation, the injury guardrails, the minimum-history gate — against one fixed, deterministic dataset | `relay_test`, **dropped and recreated from scratch** before the suite runs |

The integration and e2e tiers both run against a real `relay_test` Postgres database (never `relay_dev`) — `npm run test:backend:integration` creates and migrates it automatically the first time, wiping just its tables between tests. `npm run test:backend:e2e` goes further: [`backend/test/e2e/globalSetup.ts`](backend/test/e2e/globalSetup.ts) drops and recreates the whole database before the suite starts, applies every migration, then seeds it with a fixed, non-random fixture — [`backend/test/e2e/fixtures/seed.ts`](backend/test/e2e/fixtures/seed.ts): 2 coaches and 7 athletes covering every archetype the e2e tests need (steady, struggling/spiking, an active injury, a return-to-run injury, a brand-new athlete under the 14-day minimum-history gate, and an athlete on a second coach's roster to prove isolation) — so every run starts from exactly the same state. Point either tier at a different database with `TEST_DATABASE_URL=postgresql://...`.

`npm run test:backend:all` runs all three in order and stops at the first failure.

## REST API

All routes are under `/api`. Aside from `/api/auth/*`, `/api/invite-accept/:token` (GET/POST, not
`/attach`), `/api/join/:code` (GET/POST), and `/api/health`, every route requires an
`Authorization: Bearer <token>` header.
Coach-scoped routes filter to whatever `getCoachAthleteIds` resolves to (see
[Schools](#schools--shared-roster-visibility-across-a-coaching-staff)) — a solo coach's own
`CoachAthlete` roster, or every athlete rostered by anyone at their school; requesting an athlete
outside that set gets a 403. `/api/admin/*` further requires `isSuperAdmin`.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Log in with username + password. Returns a JWT, or `{mfaRequired, tempToken}` if 2FA is enabled |
| POST | `/api/auth/google` | Public, rate-limited: sign in with a verified Google ID token. 404s if that identity isn't already linked to an account; otherwise same `{mfaRequired, tempToken}`-or-session shape as `/login` |
| POST | `/api/auth/mfa/verify` | Complete a two-step login: `{tempToken, code}` (TOTP or backup code) → real JWT (public, rate-limited) |
| POST | `/api/auth/forgot-password` | Issues a reset token; emails it if configured, else returns it directly (rate-limited) |
| POST | `/api/auth/reset-password` | Consume a reset token, set a new password |
| GET | `/api/invite-accept/:token` | Public: look up who invited you, invite type, and (COACH_TO_SCHOOL) whether that email already has an account (no auth) |
| POST | `/api/invite-accept/:token` | Public: create your account and log in — role/effects depend on invite type (no auth) |
| POST | `/api/invite-accept/:token/attach` | Confirm joining a school with an account you already have (authenticated; caller's email must match the invite) |
| GET | `/api/me` | Current user's profile (role, linked athleteId, gender, hasCoach, schoolId/schoolName, isSuperAdmin) |
| PATCH | `/api/me/gender` | Set your gender (athlete only — also moves you into the matching squad) |
| PATCH | `/api/me/password` | Change your own password (both roles; requires current password) |
| POST | `/api/me/google-link` | Link your account to a Google identity — requires the token's verified email to match your own |
| DELETE | `/api/me/google-link` | Unlink Google from your account |
| PATCH | `/api/me/readiness-visibility` | Athlete only: opt in/out of seeing your own readiness score |
| GET | `/api/me/readiness` | Athlete only: your current readiness if you've opted in (`{shared: false, latest: null}` otherwise) |
| POST | `/api/me/push-subscription` | Save this device's Web Push subscription (both roles; 503 if VAPID isn't configured) |
| DELETE | `/api/me/push-subscription` | Remove this device's subscription (scoped to your own account) |
| PATCH | `/api/me/reminder-hour` | Set (0-23) or clear (`null`) your check-in-reminder hour — your own for an athlete, your roster's default for a coach; see [Push notifications](#push-notifications) |
| POST | `/api/me/onboarding-complete` | Marks the one-time first-login setup screen as seen (finished or skipped, same effect); see [First-login setup](#first-login-setup--a-one-time-skippable-prompt) |
| GET | `/api/me/export` | Download every row this app has stored under your own account, as one JSON document; see [Data export and account deletion](#data-export-and-account-deletion-self-service) |
| DELETE | `/api/me` | Permanently anonymize your account (requires current password) — history stays, identity doesn't; see [Data export and account deletion](#data-export-and-account-deletion-self-service) |
| GET | `/api/mfa/status` | Your own 2FA state: `{enabled, backupCodesRemaining}` |
| POST | `/api/mfa/setup` | Generate a pending TOTP secret + QR code (not yet enabled) |
| POST | `/api/mfa/verify-setup` | Confirm setup with a 6-digit code → enables 2FA, returns 10 backup codes (shown once) |
| POST | `/api/mfa/disable` | Turn off 2FA (requires current password) |
| POST | `/api/schools` | Self-service: create a school and become its first member (coach only; 409 if the name already exists) |
| PATCH | `/api/schools/:id` | Rename a school / change its location (member or super admin only; 409 if the new name collides) |
| GET | `/api/schools/mine` | Your own school (member coaches, shared roster size, pending coach invites) — null if solo |
| GET | `/api/schools/:id` | A school's detail (member or super admin only) |
| POST | `/api/schools/:id/invite-coach` | Invite a coach into this school by email (member or super admin only) |
| POST | `/api/schools/:id/regenerate-code` | Replace this school's join code (member or super admin only) |
| GET | `/api/schools/:id/requests` | Pending `SchoolJoinRequest`s for this school, shared across every coach there (member or super admin only) |
| POST | `/api/schools/:id/requests/:reqId/approve` | Create the real athlete account + roster row for a pending request (member or super admin only) |
| POST | `/api/schools/:id/requests/:reqId/reject` | Close a pending request out with no account created (member or super admin only) |
| GET | `/api/join/:code` | Public: resolve a school join code to its name, no auth |
| POST | `/api/join/:code` | Public, rate-limited: submit a `SchoolJoinRequest` — never creates an account, no auth |
| GET | `/api/admin/overview` \| `/coaches` \| `/coaches/:id` \| `/schools` \| `/schools/:id` \| `/users` \| `/users/:id` | Read-only, system-wide, `/users` supports `?q=` search (super admin only) |
| POST | `/api/admin/users/:id/reset-password` | Send the target a password reset email (super admin only) |
| POST | `/api/admin/users/:id/reset-mfa` | Clear the target's 2FA state, notify them by email (super admin only) |
| GET | `/api/admin/activity/checkins` \| `/runs` \| `/coach-logins` | Zero-filled daily activity counts, `?days=` (default 90, max 400) (super admin only) |
| GET | `/api/squads` | Squads with counts, scoped to the coach's roster |
| GET | `/api/squads/:id/athletes` | Coach's roster athletes in a squad |
| GET | `/api/squads/:id/checkin-rate?days=` | Zero-filled daily check-in-rate series for a squad's roster (default 7 days), see [Check-in rate](#check-in-rate--coach-and-admin-rosterschool-scoped) |
| GET | `/api/athletes/:id` | Athlete detail (coach-on-roster or the athlete themself) |
| GET | `/api/athletes/:id/readiness-history` | Readiness score history |
| GET | `/api/athletes/:id/stats` | Always-visible session stats + phase-gated workload/ACWR numbers |
| POST | `/api/athletes/:id/nudge` | Push-notify one athlete who hasn't checked in yet today (coach, roster-scoped; 503 if push isn't configured, 400 if they already checked in or have no device) — see [Push notifications](#push-notifications) |
| DELETE | `/api/athletes/:id/roster` | Remove an athlete from the active roster (coach only) — history/account untouched, see [above](#removing-an-athlete-from-the-roster) |
| GET | `/api/brief?week=&year=&squadId=` | Weekly brief, ranked worst-first, roster-scoped |
| PATCH | `/api/brief/:id/talked-to` | Mark/clear "talked to this athlete" on one week's readiness score (`{talked: boolean}`, coach must be on that athlete's roster) — see ["Fit them into your week"](#fit-them-into-your-week) |
| GET | `/api/notes/athlete/:athleteId` | Notes for an athlete |
| POST | `/api/notes` | Leave a note (coach, must be on the athlete's roster) |
| GET | `/api/injuries?squadId=&status=` | List injuries, roster-scoped (coach only) |
| POST | `/api/injuries` | Log an injury (coach, roster-scoped) |
| PATCH | `/api/injuries/:id` | Update injury status (coach, roster-scoped) |
| POST | `/api/wellness` | Submit a check-in for yourself (athlete only; recomputes readiness) — 201 if that day's first, 200 if it overwrote that day's existing entry. Optional `day` ("YYYY-MM-DD") backdates it, within the allowed catch-up window |
| GET | `/api/wellness/athlete/:athleteId` | Wellness history |
| POST | `/api/training-load` | Log a run for yourself (athlete only; recomputes readiness). Optional `day` backdates it, same window as `/api/wellness` |
| GET | `/api/training-load/athlete/:athleteId` | Run history |
| DELETE | `/api/training-load/:id` | Delete your own logged run (athlete only) |
| GET | `/api/invites` | Coach's sent invites, including each one's accept token |
| POST | `/api/invites/bulk` | Bulk-create invites from a list of emails, no squad needed (coach only) |
| DELETE | `/api/invites/:id` | Remove a still-pending invite, or clear an already-accepted one off the list (coach only, must be their own; 400 for a rejected invite) |
| POST | `/api/invites/:id/resend` | Rotate a still-pending athlete invite onto a fresh token/expiry and re-send it (coach only, must be their own; 400 if not pending) |
| POST | `/api/schools/:id/invites/:inviteId/resend` | Same rotate-and-resend, for a coach-to-school invite (any member coach of that school, not just the sender; 400 if not pending) |

## Deploying

Production (`relaycoach.app`) runs on four pieces, each doing one job:

| Piece | Role |
|---|---|
| [Squarespace](https://domains.squarespace.com) | Domain **registrar** — `relaycoach.app` was purchased here. Squarespace itself serves nothing; DNS is delegated to Cloudflare (below). |
| [Cloudflare](https://dash.cloudflare.com) | **DNS.** `relaycoach.app` (frontend) and `api.relaycoach.app` (backend) are `CNAME`/proxy records pointed at their respective Railway services. Cloudflare also terminates TLS at the edge. |
| [Railway](https://railway.app) | **Hosting**, all three moving parts of the app, as separate services in one project: `frontend` (static SPA build, served by `serve`), `backend` (the Express API), and `Postgres` (managed database plugin). Each has its own deploy pipeline off this repo; see the table below. |
| [Resend](https://resend.com) | **Transactional email** (password resets, invite emails) — only active in production; see the dual-mode explanation further down. |

Request flow: browser → Cloudflare (DNS + TLS) → Railway `frontend`/`backend` service → (backend only) Railway `Postgres`. Changing any DNS record or adding a new subdomain happens in Cloudflare; changing what actually runs happens in Railway; changing what domain the app answers on at all happens in Squarespace.

### Railway (two app services + Postgres)

Both app services deploy from this same repo, **Root Directory set to the repo root** for both (not
`backend/`/`frontend/` — this is an npm workspaces monorepo; a per-service root directory would
lose the workspace-hoisted `node_modules` and the root `package-lock.json`). Point each service's
build/start at its own workspace with `-w`:

| Service | Build command | Start command |
|---|---|---|
| Backend | `npm run build -w backend` | `npm run start -w backend` |
| Frontend | `npm run build -w frontend` | `npm run start -w frontend` |

- **Backend build** (`prisma generate && tsc`) and **start** (`prisma migrate deploy && node dist/index.js`)
  both run Prisma steps automatically — every deploy regenerates the client and applies any new
  migrations before the server starts. No manual migration step needed.
- **Frontend start** is `serve -s dist -l tcp://0.0.0.0:${PORT:-4173}` ([`serve`](https://github.com/vercel/serve),
  not `vite preview` — Vite's own docs say `preview` isn't meant for production). `-s` is the
  SPA flag: any path that isn't a static file (e.g. `/accept-invite/:token`, `/reset-password`
  hit directly, not via client-side navigation) falls back to `index.html` instead of 404ing.

### Environment variables

**Backend:**

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Point at Railway's Postgres plugin — it can inject this automatically if the plugin's attached to the service |
| `JWT_SECRET` | Yes | A real random secret in production, not the local dev placeholder |
| `PORT` | No | Railway sets this automatically |
| `RESEND_API_KEY` | No | Unset → password resets and invite emails **simulate** (logged server-side, token/link returned directly in the API response — same dev-friendly behavior as always). Set → they **actually send** through [Resend](https://resend.com) and the token/link stops appearing in API responses. See [`lib/email.ts`](backend/src/lib/email.ts). |
| `EMAIL_FROM` | No (if using Resend) | e.g. `"Relay <admin@relaycoach.app>"` — the sending domain must be verified in Resend first (see below) |
| `FRONTEND_URL` | No (if using Resend) | The frontend's public URL, used to build links inside real emails, e.g. `https://relaycoach.app` |
| `MFA_ENCRYPTION_KEY` | **Yes, before anyone enables 2FA** | 64 hex characters (32 bytes) for AES-256-GCM — generate with `openssl rand -hex 32`. Unlike email, there's no simulate fallback: MFA setup fails with a clear error if this is missing rather than ever storing a TOTP secret insecurely. Use a different key per environment; never commit a real one. |
| `GOOGLE_CLIENT_ID` | No | Enables `POST /api/auth/google` and `/api/me/google-link` to actually verify tokens. Unset, the routes still exist but any call fails loudly (`verifyGoogleIdToken` throws before doing anything) rather than silently accepting an unverified identity. See [Google sign-in setup](#google-sign-in-setup). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | No | Enables [push notifications](#push-notifications). Unset, `POST /api/me/push-subscription` 503s and both daily reminder jobs no-op (`skipped: true`) — see [Push notification setup](#push-notification-setup). Generate with `npx web-push generate-vapid-keys`. |
| `VAPID_SUBJECT` | No | A `mailto:` or `https:` URL push services may contact if this server misbehaves. Defaults to `mailto:admin@relaycoach.app`. Only meaningful once the two keys above are set. |

**Frontend:**

| Variable | Required? | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | Yes, once deployed separately from the backend | The backend's public base URL + `/api`, e.g. `https://api.relaycoach.app/api`. Unset, API calls go to `/api` on the frontend's own origin, which only works when a dev proxy or shared origin exists — see [`lib/api.ts`](frontend/src/lib/api.ts). Baked in at **build** time (Vite), so set it before the build runs, not just at runtime. |
| `VITE_GOOGLE_CLIENT_ID` | No | Same OAuth client ID as the backend's `GOOGLE_CLIENT_ID` — not a secret, it's meant to be embedded in the frontend bundle. Unset, the "Sign in with Google" button and the Profile link/unlink panel just don't render — see [Google sign-in setup](#google-sign-in-setup). Baked in at **build** time. |
| `VITE_VAPID_PUBLIC_KEY` | No | Same VAPID public key as the backend's `VAPID_PUBLIC_KEY` — not a secret, meant to be embedded in the frontend bundle (the private half never leaves the server). Unset, the "remind me" toggle on Profile just doesn't render — see [Push notification setup](#push-notification-setup). Baked in at **build** time. |

### Push notification setup

Push notifications ([above](#push-notifications)) ship fully code-complete but **inert** until a
real VAPID keypair exists — right now neither `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` nor
`VITE_VAPID_PUBLIC_KEY` is set anywhere, so the app runs exactly as it did before this feature,
with no partial/broken toggle. To turn it on:

1. Generate a keypair: `npx web-push generate-vapid-keys` (run from `backend/`, where `web-push` is
   already a dependency). This prints a public and a private key — no external service or account
   needed, unlike Google sign-in's OAuth client.
2. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on the Railway **backend** service to those two
   values, and (optionally) `VAPID_SUBJECT` to a real contact `mailto:` address.
3. Set `VITE_VAPID_PUBLIC_KEY` on the Railway **frontend** service to the *same public key* (never
   the private key), then redeploy the frontend — baked in at build time, so an env-var-only change
   on Railway still needs a rebuild, not just a restart.
4. Once all three are set, the "Check-in reminders" toggle appears on Profile for athletes
   automatically — no further code changes — and both daily reminder cron jobs in
   [`index.ts`](backend/src/index.ts) start actually sending instead of no-opping.

### Google sign-in setup

Google sign-in ([above](#google-sign-in)) ships fully code-complete but **disabled** until a real
OAuth client ID exists — right now neither `GOOGLE_CLIENT_ID` nor `VITE_GOOGLE_CLIENT_ID` is set
anywhere, so the app runs exactly as it did before this feature, with no partial/broken UI. To turn
it on:

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create (or
   pick) a project, then **Create Credentials → OAuth client ID → Application type: Web
   application**.
2. Under **Authorized JavaScript origins**, add every origin the frontend is actually served from —
   `https://relaycoach.app` for production, plus `http://localhost:5173` for local dev. No path, no
   trailing slash. (No redirect URI is needed — Google Identity Services' button flow returns the
   credential to the page directly via JavaScript, it doesn't redirect.)
3. If prompted to configure the **OAuth consent screen** first, External user type, app name
   "Relay", and the app's own support email is enough to get a working client ID; it can stay in
   "Testing" publishing status while iterating, but move it to "In production" before real users hit
   it, or Google will cap it to a small list of manually-added test users.
4. Copy the generated **Client ID** (looks like `123456789-abc...apps.googleusercontent.com`) — the
   **Client secret** on the same screen is not used anywhere in this flow (verification happens with
   the ID token itself, not a server-side code exchange) and doesn't need to be stored anywhere.
5. Set `GOOGLE_CLIENT_ID` on the Railway **backend** service and `VITE_GOOGLE_CLIENT_ID` on the
   Railway **frontend** service, both to that same client ID, then redeploy the frontend (it's
   baked in at build time — an env-var-only change on Railway still needs a rebuild, not just a
   restart).
6. Once both are set, the "Sign in with Google" button appears on Login and the link/unlink panel
   appears on Profile automatically — no further code changes. Link an existing account first
   (Profile → Continue with Google) before testing sign-in with it, since Google sign-in never
   auto-creates an account.

### Resend: sending from a custom domain like `admin@relaycoach.app`

Yes, this works, and will send consistently — but only after the sending domain is **verified** in
the Resend dashboard first. Add the domain there, add the SPF (`TXT`) and DKIM (`CNAME`) records it
gives you at your DNS provider (a DMARC `TXT` record is optional but recommended), wait for it to
show verified, then `EMAIL_FROM` can use that domain. Before verification, Resend won't send from a
custom address at all. This is also what keeps the mail out of spam — an unverified sending domain
gets flagged hard by Gmail/Outlook regardless of the app's code. Double-check current sending
limits on Resend's own pricing page before assuming a given plan covers expected volume; free-tier
caps have changed over time.

If `RESEND_API_KEY` is set in an environment where `NODE_ENV` isn't `production`, or vice versa
(`NODE_ENV=production` with no key set), the app logs a warning on startup rather than failing
silently — check the server logs after a deploy if emails aren't showing up as expected.
