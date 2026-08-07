import type { ReadinessStatus } from "./status";

const BASE_URL = "/api";

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
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; name: string; role: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
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
};

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
  athleteId: string;
  sleep: number;
  soreness: number;
  mood: number;
  energy: number;
  motivation: number;
  msg?: string;
}

export interface WellnessEntry extends WellnessInput {
  id: string;
  date: string;
}

export interface RunInput {
  athleteId: string;
  runType: string;
  distanceMiles?: number;
  durationMin: number;
  rpe: number;
}

export interface Run extends RunInput {
  id: string;
  date: string;
  load: number;
}
