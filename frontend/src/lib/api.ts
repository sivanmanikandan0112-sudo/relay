import type { ReadinessStatus } from "./status";

// "/api" works locally because vite.config.ts proxies it to the backend
// dev server -- but that proxy only exists in `vite dev`, not in the
// static output `vite build` produces. Deployed as a separate service
// (e.g. Railway, its own domain from the backend), a relative "/api" path
// would hit the frontend's own origin and 404 every request. Set
// VITE_API_BASE_URL at build time to the backend's real base URL
// (e.g. "https://relay-backend.up.railway.app/api") to fix that; unset,
// nothing changes from today's behavior.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("relay_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  forgotPassword: (username: string) =>
    request<{ sent: boolean; devResetToken?: string; devNote?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ reset: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),
  me: () => request<AuthUser>("/me"),
  setGender: (gender: Gender) =>
    request<{ gender: Gender }>("/me/gender", { method: "PATCH", body: JSON.stringify({ gender }) }),

  squads: () => request<Squad[]>("/squads"),
  athletesInSquad: (squadId: string) => request<Athlete[]>(`/squads/${squadId}/athletes`),
  athleteDetail: (athleteId: string) => request<AthleteDetail>(`/athletes/${athleteId}`),
  wellnessForAthlete: (athleteId: string) => request<WellnessEntry[]>(`/wellness/athlete/${athleteId}`),
  brief: (week: number, year: number, squadId?: string) =>
    request<ReadinessScore[]>(
      `/brief?week=${week}&year=${year}${squadId ? `&squadId=${squadId}` : ""}`
    ),
  injuries: (squadId?: string) =>
    request<Injury[]>(`/injuries${squadId ? `?squadId=${squadId}` : ""}`),
  addNote: (athleteId: string, body: string) =>
    request<Note>("/notes", { method: "POST", body: JSON.stringify({ athleteId, body }) }),
  notesForAthlete: (athleteId: string) => request<Note[]>(`/notes/athlete/${athleteId}`),
  readinessHistory: (athleteId: string) =>
    request<ReadinessScoreRecord[]>(`/athletes/${athleteId}/readiness-history`),
  submitWellness: (entry: WellnessInput) =>
    request<WellnessEntry>("/wellness", { method: "POST", body: JSON.stringify(entry) }),
  logRun: (entry: RunInput) => request<Run>("/training-load", { method: "POST", body: JSON.stringify(entry) }),
  runsForAthlete: (athleteId: string) => request<Run[]>(`/training-load/athlete/${athleteId}`),
  deleteRun: (id: string) => request<void>(`/training-load/${id}`, { method: "DELETE" }),

  invites: () => request<Invite[]>("/invites"),
  bulkInvite: (emails: string[], squadId: string) =>
    request<{ created: number; skipped: number; invites: Invite[]; emailSent: boolean }>("/invites/bulk", {
      method: "POST",
      body: JSON.stringify({ emails, squadId }),
    }),
  // Public, unauthenticated -- the real half of the invite flow: an
  // invited athlete follows the link built from their invite's token to
  // look up who invited them, then create their own account.
  inviteDetails: (token: string) => request<InviteDetails>(`/invite-accept/${token}`),
  acceptInvite: (token: string, input: AcceptInviteInput) =>
    request<{ token: string; user: AuthUser }>(`/invite-accept/${token}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export type Gender = "FEMALE" | "MALE" | "NONBINARY" | "PREFER_NOT_TO_SAY";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: "COACH" | "ATHLETE";
  athleteId: string | null;
  squadId?: string | null;
  gender?: Gender | null;
  hasCoach?: boolean;
}

export interface Squad {
  id: string;
  name: "GIRLS" | "BOYS";
  athleteCount: number;
}

export interface Athlete {
  id: string;
  name: string;
  squadId: string;
}

export interface AthleteDetail extends Athlete {
  squad: Squad;
  injuries: Injury[];
}

export interface ReadinessScoreRecord {
  id: string;
  athleteId: string;
  week: number;
  year: number;
  score: number;
  status: ReadinessStatus;
  summary: string;
}

export interface ReadinessScore extends ReadinessScoreRecord {
  athlete: Athlete & { readinessScores: ReadinessScoreRecord[] };
}

export interface Injury {
  id: string;
  athleteId: string;
  description: string;
  status: "ACTIVE" | "RECOVERING" | "RESOLVED";
  startDate: string;
  endDate: string | null;
  athlete: { id: string; name: string };
}

export interface Note {
  id: string;
  athleteId: string;
  body: string;
  createdAt: string;
  coach: { id: string; name: string };
}

export interface WellnessInput {
  sleep: number;
  soreness: number;
  mood: number;
  energy: number;
  motivation: number;
  msg?: string;
}

export interface WellnessEntry extends WellnessInput {
  id: string;
  athleteId: string;
  date: string;
}

export interface RunInput {
  runType: string;
  distanceMiles?: number;
  durationMin: number;
  rpe: number;
}

export interface Run extends RunInput {
  id: string;
  athleteId: string;
  date: string;
  load: number;
}

export interface Invite {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  squadId: string | null;
  token: string;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface InviteDetails {
  email: string;
  squadName: "GIRLS" | "BOYS" | null;
  coachName: string;
}

export interface AcceptInviteInput {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}
