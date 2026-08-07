# Relay

Relay is an "overreaching radar" for sports coaches. It turns each athlete's training load,
wellness check-ins, and recent trend into a single readiness score, then ranks the squad so a
coach knows exactly who to check in with first — instead of scanning a dashboard.

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
│   │   └── seed.ts
│   └── src/
│       ├── routes/    REST endpoints (auth, squads, athletes, brief, notes, injuries, ...)
│       ├── middleware/
│       ├── lib/
│       └── index.ts
├── frontend/           React SPA
│   └── src/
│       ├── pages/      Brief, Dashboard, Injuries, How It Works, Login,
│       │               Athlete{Home,Checkin,Runs}
│       ├── components/ Layout, SquadSelector, Sparkline, HowItWorksContent
│       ├── context/
│       └── lib/        api.ts (REST client), status.ts (labels/colors)
└── package.json         npm workspaces root
```

## Data model

- **Squad** — a roster grouping (e.g. Girls, Boys)
- **Athlete** — belongs to a squad, optionally linked to a `User` for athlete login
- **WellnessEntry** — daily self-reported sleep, soreness, mood, energy, motivation (1–5 each) plus an optional note
- **TrainingLoad** — a logged run: type, distance, duration, RPE → session load (RPE × duration)
- **ReadinessScore** — a weekly snapshot: score (0–100) + status. Recomputed automatically
  whenever an athlete submits a check-in, logs a run, or their injury status changes — see
  [`lib/scoring.ts`](backend/src/lib/scoring.ts).
- **Injury** — tracked per athlete with status (`ACTIVE` / `RECOVERING` / `RESOLVED`)
- **Note** — a coach's check-in note left on an athlete
- **User** — coach or athlete account (JWT auth)

### Readiness status

Status is score-driven, except an injury always overrides it:

| Status | Meaning | Trigger |
|---|---|---|
| `FRESH` | Steady, no action needed | score ≥ 65 |
| `EASE_BACK` | Load creeping up, worth watching | 40 ≤ score < 65 |
| `BACK_OFF` | Worth a real check-in this week | score < 40 |
| `RETURN_PROTOCOL` | On return-to-run protocol | active `RECOVERING` injury |
| `INJURED` | Out, held out of load tracking | active `ACTIVE` injury |

The score itself combines an acute:chronic training-load ratio (the last 7 days of logged runs vs.
the last 28) with how far recent wellness check-ins sit below a normal baseline — see
[`lib/readiness.ts`](backend/src/lib/readiness.ts) for the exact formula and the plain-language
message generator behind each Brief card.

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

Seeded coach login: `coach@relay.app` / `password123`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev:backend` | Start the API in watch mode |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run build:backend` | Compile the API to `backend/dist` |
| `npm run build:frontend` | Build the SPA to `frontend/dist` |
| `npm run lint` | Lint both workspaces |
| `npm run prisma:migrate -w backend` | Apply Prisma migrations |
| `npm run prisma:seed -w backend` | Seed sample athletes and readiness scores |

## REST API

All routes are under `/api` and (aside from `/api/auth/*` and `/api/health`) require an
`Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a coach account |
| POST | `/api/auth/login` | Log in, returns a JWT |
| GET | `/api/squads` | List squads with athlete counts |
| GET | `/api/squads/:id/athletes` | List athletes in a squad |
| GET | `/api/athletes/:id` | Athlete detail |
| GET | `/api/athletes/:id/readiness-history` | Readiness score history |
| GET | `/api/brief?week=&year=&squadId=` | Weekly brief, ranked worst-first |
| GET | `/api/notes/athlete/:athleteId` | Notes for an athlete |
| POST | `/api/notes` | Leave a note (coach only) |
| GET | `/api/injuries?squadId=&status=` | List injuries |
| POST | `/api/injuries` | Log an injury (coach only) |
| PATCH | `/api/injuries/:id` | Update injury status (coach only) |
| POST | `/api/wellness` | Submit a wellness check-in (also recomputes readiness) |
| GET | `/api/wellness/athlete/:athleteId` | Wellness history |
| POST | `/api/training-load` | Log a run (also recomputes readiness) |
| GET | `/api/training-load/athlete/:athleteId` | Run history |
| DELETE | `/api/training-load/:id` | Delete a logged run |
