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
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; name: string; role: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  squads: () => request<Array<{ id: string; name: string; athleteCount: number }>>("/squads"),
  brief: (week: number, year: number, squadId?: string) =>
    request<ReadinessScore[]>(
      `/brief?week=${week}&year=${year}${squadId ? `&squadId=${squadId}` : ""}`
    ),
  injuries: (squadId?: string) =>
    request<Injury[]>(`/injuries${squadId ? `?squadId=${squadId}` : ""}`),
  addNote: (athleteId: string, body: string) =>
    request("/notes", { method: "POST", body: JSON.stringify({ athleteId, body }) }),
};

export interface ReadinessScore {
  id: string;
  athleteId: string;
  week: number;
  year: number;
  score: number;
  status: "READY" | "EASE_BACK" | "BACK_OFF";
  summary: string;
  athlete: { id: string; name: string; squadId: string };
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
