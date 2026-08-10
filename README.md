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
│   └── src/
│       ├── routes/     REST endpoints (auth, me, squads, athletes, brief,
│       │               notes, injuries, wellness, training-load, invites)
│       ├── middleware/
│       ├── lib/         authz.ts (roster-based access control), scoring.ts, readiness.ts,
│       │               math.ts (the scoring formulas, unit-tested in math.test.ts)
│       └── index.ts
├── frontend/           React SPA
│   └── src/
│       ├── pages/       Brief, Dashboard, Injuries, CoachInvites, How It Works,
│       │                Login, ForgotPassword, ResetPassword,
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
  Check-in / My Runs / How it works tabs at all — just a "waiting on a coach" notice. Five of the
  ten seeded athletes are intentionally left unassigned so this is easy to demo (e.g. sign in as
  `ava.thompson`).

### Bulk athlete invites

Coaches can bulk-invite athletes by email from the **Invite** tab. This dev environment has no
email provider configured, so invites are tracked (`Invite` model, status `PENDING` /
`ACCEPTED` / `REJECTED`) but not actually delivered — the Invite screen has "simulate
accept/reject" buttons standing in for the athlete's response until a real email flow exists.

### Forgot password

Same story: `/api/auth/forgot-password` generates a real, expiring reset token
(`PasswordResetToken`), but since there's no email provider, the response returns the token
directly and the UI shows a "continue to reset" link built from it instead of emailing it.

## Data model

- **Squad** — a roster grouping (Girls, Boys)
- **Athlete** — belongs to a squad; optionally linked to a `User` for athlete login; `gender`
  (`FEMALE` / `MALE` / `NONBINARY` / `PREFER_NOT_TO_SAY`), required at login if unset
- **CoachAthlete** — many-to-many roster assignment between coach `User`s and `Athlete`s
- **Invite** — a coach's bulk-invited email + status
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

Run `npm run test:backend` to run the math unit tests on their own.

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

| Username | Name | Role | Squad | Roster |
|---|---|---|---|---|
| `jordan.rivera` | Jordan Rivera | Coach | — | maya.okonkwo, sofia.reyes, lily.anderson |
| `sam.bennett` | Sam Bennett | Coach | — | ethan.brooks, marcus.webb, lily.anderson |
| `maya.okonkwo` | Maya Okonkwo | Athlete | Girls | — |
| `sofia.reyes` | Sofia Reyes | Athlete | Girls | — |
| `ava.thompson` | Ava Thompson | Athlete | Girls | — |
| `lily.anderson` | Lily Anderson | Athlete | Girls | — |
| `chloe.bennett` | Chloe Bennett | Athlete | Girls | — |
| `emma.whitfield` | Emma Whitfield | Athlete | Girls | — |
| `jonah.pruitt` | Jonah Pruitt | Athlete | Boys | — |
| `ethan.brooks` | Ethan Brooks | Athlete | Boys | — |
| `marcus.webb` | Marcus Webb | Athlete | Boys | — |
| `diego.alvarez` | Diego Alvarez | Athlete | Boys | — |

`lily.anderson` is deliberately on both coaches' rosters, to demonstrate the many-to-many
relationship. The other 5 athletes (Ava, Chloe, Emma, Jonah, Diego) exist with full readiness/
wellness/training history but aren't assigned to a coach — sign in as either coach and their
roster stays scoped to just their 3.

Every athlete is seeded with **8 weeks of check-ins and logged runs** (`backend/prisma/seed.ts`),
with day-to-day and week-to-week variety instead of one flat repeated number, following one of
five archetypes: `fresh` (steady load throughout), `watch` (load gradually creeping up), `risk`
(a hard mileage spike the last two weeks), `injured` (an active injury with mileage crashing to
near-zero recently), and `return` (an injury a few weeks back, now on a gradual return-to-run
ramp). The multi-week trend shown on Brief and in the athlete detail drawer is computed by
actually running the real scoring algorithm against that data one week at a time — not a
fabricated per-week number — so it reflects the same math described in
[`docs/math-behind-relay.md`](docs/math-behind-relay.md).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev:backend` | Start the API in watch mode |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run build:backend` | Compile the API to `backend/dist` |
| `npm run build:frontend` | Build the SPA to `frontend/dist` |
| `npm run lint` | Lint both workspaces |
| `npm run test:backend` | Run the scoring-math unit tests (`backend/src/lib/math.test.ts`) |
| `npm run prisma:migrate -w backend` | Apply Prisma migrations |
| `npm run prisma:seed -w backend` | Reseed coaches, athletes, rosters, and sample invites |

## REST API

All routes are under `/api`. Aside from `/api/auth/*` and `/api/health`, every route requires an
`Authorization: Bearer <token>` header, and coach-scoped routes further filter to that coach's own
`CoachAthlete` roster (a coach requesting an athlete not on their roster gets a 403).

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Log in with username + password, returns a JWT |
| POST | `/api/auth/forgot-password` | Simulated reset-token issuance (no email provider) |
| POST | `/api/auth/reset-password` | Consume a reset token, set a new password |
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
| GET | `/api/invites` | Coach's sent invites |
| POST | `/api/invites/bulk` | Bulk-create invites from a list of emails (coach only) |
| PATCH | `/api/invites/:id` | Set an invite's status (coach only; simulates the athlete's response) |
