# Relay

Relay is an "overreaching radar" for high school coaches and athletes. It turns each athlete's
training load, wellness check-ins, and recent trend into a single readiness score, then ranks the
roster so a coach knows exactly who to check in with first — instead of scanning a dashboard.

📐 **How the score is actually computed:** [`docs/math-behind-relay.md`](docs/math-behind-relay.md)
walks through the math and stats step by step, cross-referenced against the real code — see the
original handwritten derivation in [`proofs/`](proofs).

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
│       │                AthleteCheckin, AthleteRuns, AthleteHowItWorks
│       ├── components/  Layout, Sparkline, DetailDrawer, NoteModal, MatchingSection
│       ├── context/      AuthContext
│       └── lib/          api.ts (REST client), status.ts, matching.ts
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
  My Runs / How it works). There's no view-switcher — each role sees its own app.
- **Athlete gender gate**: an athlete with no gender on file is blocked by a full-screen prompt
  right after login — they can't reach any other screen until they set it
  (`PATCH /api/me/gender`). Seeded athletes deliberately start with no gender set, so any athlete
  login demonstrates this.
- **Coach-required gating**: an athlete not yet on *any* coach's roster (`hasCoach: false`) sees no
  Check-in / My Runs / How it works tabs at all — just a "waiting on a coach" notice. Every seeded
  athlete is now assigned to a coach (see [Seeded logins](#seeded-logins)) so the app is fully
  interactive out of the box; to see this gate itself, unassign an athlete — e.g.
  `DELETE FROM "CoachAthlete" WHERE "athleteId" = (SELECT id FROM "Athlete" WHERE name = 'Ava Thompson');`
  — then sign in as them.

### Bulk athlete invites — real signups, email optional

Coaches bulk-invite athletes to a specific squad by email from the **Invite** tab. Accepting an
invite is a **real account-creation flow**, not simulated: each invite gets a unique, 14-day
token (`Invite.token`/`expiresAt`); an invited athlete follows the link built from it —
`/accept-invite/:token`, public, no login required — to a page that shows who invited them and
lets them pick their own username/password. Submitting it creates a real `User` + `Athlete` row,
adds them to the inviting coach's roster in the invited squad, marks the invite `ACCEPTED`, and
logs them straight in (same response shape as `/api/auth/login`) — see
[`routes/inviteAccept.ts`](backend/src/routes/inviteAccept.ts).

Whether the invite email actually *sends* depends on whether [`lib/email.ts`](backend/src/lib/email.ts)
has a real provider configured (`RESEND_API_KEY` — see [Deploying](#deploying-railway-two-services)):
unset (local dev/test, by default), nothing is actually emailed and the Invite screen's **"copy
invite link"** button is how a coach shares it (text, whatever); set, each invite is emailed for
real, on top of the copy-link button still being there as a fallback. The "simulate accept/reject"
buttons are separate from either of those — they flip an invite's status by hand, for demoing the
UI without a real person completing signup.

### Forgot password

Same story: `/api/auth/forgot-password` generates a real, expiring reset token
(`PasswordResetToken`). Without a configured email provider, the response returns the token
directly and the UI shows a "continue to reset" link built from it, instead of emailing it. With
one configured, it emails the reset link for real and the token never appears in the API response
at all — returning it there would defeat the point of proving the requester owns that inbox.

## Data model

- **Squad** — a roster grouping (Girls, Boys)
- **Athlete** — belongs to a squad; optionally linked to a `User` for athlete login; `gender`
  (`FEMALE` / `MALE` / `NONBINARY` / `PREFER_NOT_TO_SAY`), required at login if unset
- **CoachAthlete** — many-to-many roster assignment between coach `User`s and `Athlete`s
- **Invite** — a coach's bulk-invited email + status + target squad + a unique accept token/expiry;
  accepting one for real (`/accept-invite/:token`) creates the `User`/`Athlete`/`CoachAthlete` rows
- **PasswordResetToken** — simulated forgot-password flow
- **WellnessEntry** — daily self-reported sleep, soreness, mood, energy, motivation (1–5 each) plus
  an optional note. An athlete can only ever write their own (the athlete ID comes from the JWT,
  never the request body), and can check in more than once a day.
- **TrainingLoad** — a logged run: athlete-entered title, distance in miles (2 decimal places),
  duration (entered as HH:MM:SS, stored as fractional minutes), RPE → session load (RPE ×
  duration). Same self-only rule as check-ins, and same multiple-per-day allowance (split
  workouts, two-a-days). The athlete confirms a summary of the run before it's saved.
- **ReadinessScore** — a weekly snapshot: score (0–100) + status. Recomputed automatically
  whenever an athlete submits a check-in, logs a run, deletes a run, or their injury status
  changes — see [`lib/scoring.ts`](backend/src/lib/scoring.ts).
- **Injury** — tracked per athlete with status (`ACTIVE` / `RECOVERING` / `RESOLVED`)
- **Note** — a coach's check-in note left on an athlete

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

### Coach's athlete detail view

Clicking an athlete on Brief or the Board opens a detail drawer showing that athlete's full last 7
days: every wellness check-in (all 5 fields, color-coded) and every logged run — not a fixed
number of most-recent rows, so an athlete who checked in or logged runs more than once a day still
shows everything from the week.

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
| `npm run create-account -w backend -- --email you@example.com` | Provision (or reset the password for) one real account with a fresh random password, printed once — see [`scripts/create-account.ts`](backend/scripts/create-account.ts). For a real deployment's database rather than your local one, prefix with `DATABASE_URL="..."` (the database's public/proxy connection string, not its internal one) |
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

All routes are under `/api`. Aside from `/api/auth/*`, `/api/invite-accept/*`, and `/api/health`,
every route requires an `Authorization: Bearer <token>` header, and coach-scoped routes further
filter to that coach's own `CoachAthlete` roster (a coach requesting an athlete not on their
roster gets a 403).

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Log in with username + password, returns a JWT |
| POST | `/api/auth/forgot-password` | Issues a reset token; emails it if configured, else returns it directly |
| POST | `/api/auth/reset-password` | Consume a reset token, set a new password |
| GET | `/api/invite-accept/:token` | Public: look up who invited you (no auth) |
| POST | `/api/invite-accept/:token` | Public: create your account and log in (no auth) |
| GET | `/api/me` | Current user's profile (role, linked athleteId, gender, hasCoach if an athlete) |
| PATCH | `/api/me/gender` | Set your gender (athlete only — required before anything else works) |
| GET | `/api/squads` | Squads with counts, scoped to the coach's roster |
| GET | `/api/squads/:id/athletes` | Coach's roster athletes in a squad |
| GET | `/api/athletes/:id` | Athlete detail (coach-on-roster or the athlete themself) |
| GET | `/api/athletes/:id/readiness-history` | Readiness score history |
| GET | `/api/brief?week=&year=&squadId=` | Weekly brief, ranked worst-first, roster-scoped |
| GET | `/api/notes/athlete/:athleteId` | Notes for an athlete |
| POST | `/api/notes` | Leave a note (coach, must be on the athlete's roster) |
| GET | `/api/injuries?squadId=&status=` | List injuries, roster-scoped (coach only) |
| POST | `/api/injuries` | Log an injury (coach, roster-scoped) |
| PATCH | `/api/injuries/:id` | Update injury status (coach, roster-scoped) |
| POST | `/api/wellness` | Submit a check-in for yourself (athlete only; recomputes readiness) |
| GET | `/api/wellness/athlete/:athleteId` | Wellness history |
| POST | `/api/training-load` | Log a run for yourself (athlete only; recomputes readiness) |
| GET | `/api/training-load/athlete/:athleteId` | Run history |
| DELETE | `/api/training-load/:id` | Delete your own logged run (athlete only) |
| GET | `/api/invites` | Coach's sent invites, including each one's accept token |
| POST | `/api/invites/bulk` | Bulk-create invites for a squad from a list of emails (coach only) |
| PATCH | `/api/invites/:id` | Manually set an invite's status (coach only; demo/testing, not real acceptance) |

## Deploying (Railway, two services)

Both services deploy from this same repo, **Root Directory set to the repo root** for both (not
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
- **Frontend start** is `vite preview --host 0.0.0.0 --port ${PORT:-4173}` — binds every interface
  and Railway's injected `$PORT`, which a plain `vite preview` doesn't do by default.

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

**Frontend:**

| Variable | Required? | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | Yes, once deployed separately from the backend | The backend's public base URL + `/api`, e.g. `https://api.relaycoach.app/api`. Unset, API calls go to `/api` on the frontend's own origin, which only works when a dev proxy or shared origin exists — see [`lib/api.ts`](frontend/src/lib/api.ts). Baked in at **build** time (Vite), so set it before the build runs, not just at runtime. |

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
