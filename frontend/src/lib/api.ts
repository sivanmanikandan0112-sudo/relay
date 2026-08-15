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
    request<{ token: string; user: AuthUser } | { mfaRequired: true; tempToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  loginWithGoogle: (idToken: string) =>
    request<{ token: string; user: AuthUser } | { mfaRequired: true; tempToken: string }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  mfaVerifyLogin: (tempToken: string, code: string) =>
    request<{ token: string; user: AuthUser }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ tempToken, code }),
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
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean }>("/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  setReadinessVisibility: (share: boolean) =>
    request<{ shared: boolean }>("/me/readiness-visibility", { method: "PATCH", body: JSON.stringify({ share }) }),
  myReadiness: () => request<{ shared: boolean; latest: ReadinessScoreRecord | null }>("/me/readiness"),
  linkGoogle: (idToken: string) => request<{ linked: boolean }>("/me/google-link", { method: "POST", body: JSON.stringify({ idToken }) }),
  unlinkGoogle: () => request<{ linked: boolean }>("/me/google-link", { method: "DELETE" }),

  subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ subscribed: boolean }>("/me/push-subscription", { method: "POST", body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint: string) =>
    request<{ subscribed: boolean }>("/me/push-subscription", { method: "DELETE", body: JSON.stringify({ endpoint }) }),

  mfaStatus: () => request<{ enabled: boolean; backupCodesRemaining: number }>("/mfa/status"),
  mfaSetup: () => request<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>("/mfa/setup", { method: "POST" }),
  mfaVerifySetup: (code: string) =>
    request<{ backupCodes: string[] }>("/mfa/verify-setup", { method: "POST", body: JSON.stringify({ code }) }),
  mfaDisable: (password: string) =>
    request<{ disabled: boolean }>("/mfa/disable", { method: "POST", body: JSON.stringify({ password }) }),

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
  athleteStats: (athleteId: string) => request<AthleteStatsResponse>(`/athletes/${athleteId}/stats`),
  submitWellness: (entry: WellnessInput) =>
    request<WellnessEntry>("/wellness", { method: "POST", body: JSON.stringify(entry) }),
  logRun: (entry: RunInput) => request<Run>("/training-load", { method: "POST", body: JSON.stringify(entry) }),
  runsForAthlete: (athleteId: string) => request<Run[]>(`/training-load/athlete/${athleteId}`),
  deleteRun: (id: string) => request<void>(`/training-load/${id}`, { method: "DELETE" }),

  invites: () => request<Invite[]>("/invites"),
  bulkInvite: (emails: string[]) =>
    request<{ created: number; skipped: number; invites: Invite[]; emailSent: boolean }>("/invites/bulk", {
      method: "POST",
      body: JSON.stringify({ emails }),
    }),
  cancelInvite: (id: string) => request<void>(`/invites/${id}`, { method: "DELETE" }),

  // Public, unauthenticated -- the real half of the invite flow: an
  // invited person follows the link built from their invite's token to
  // look up who invited them, then either create their own account
  // (ATHLETE, or COACH_TO_SCHOOL with no existing account yet) or --
  // authenticated, see acceptInvite below -- confirm joining a school
  // with an account they already have.
  inviteDetails: (token: string) => request<InviteDetails>(`/invite-accept/${token}`),
  acceptInvite: (token: string, input: AcceptInviteInput) =>
    request<{ token: string; user: AuthUser }>(`/invite-accept/${token}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  attachInvite: (token: string) =>
    request<{ schoolId: string; schoolName: string | null }>(`/invite-accept/${token}/attach`, { method: "POST" }),

  mySchool: () => request<{ school: SchoolDetail | null }>("/schools/mine"),
  createSchool: (name: string, location?: string) =>
    request<School & { joinCode: string }>("/schools", { method: "POST", body: JSON.stringify({ name, location }) }),
  school: (id: string) => request<SchoolDetail>(`/schools/${id}`),
  updateSchool: (id: string, name: string, location?: string) =>
    request<School>(`/schools/${id}`, { method: "PATCH", body: JSON.stringify({ name, location }) }),
  inviteCoachToSchool: (schoolId: string, email: string) =>
    request<{ invite: Invite; emailSent: boolean }>(`/schools/${schoolId}/invite-coach`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  regenerateJoinCode: (schoolId: string) =>
    request<{ joinCode: string }>(`/schools/${schoolId}/regenerate-code`, { method: "POST" }),
  schoolJoinRequests: (schoolId: string) => request<SchoolJoinRequestSummary[]>(`/schools/${schoolId}/requests`),
  approveJoinRequest: (schoolId: string, requestId: string) =>
    request<{ athleteId: string; username: string }>(`/schools/${schoolId}/requests/${requestId}/approve`, { method: "POST" }),
  rejectJoinRequest: (schoolId: string, requestId: string) =>
    request<void>(`/schools/${schoolId}/requests/${requestId}/reject`, { method: "POST" }),

  // Public, unauthenticated -- the athlete-initiated side of the
  // join-code flow (see routes/schoolJoin.ts). Never returns a session:
  // submitting creates a pending request, not an account -- see the
  // schema comment on SchoolJoinRequest.
  resolveJoinCode: (code: string) => request<{ schoolName: string }>(`/join/${code}`),
  submitJoinRequest: (code: string, input: JoinRequestInput) =>
    request<{ schoolName: string }>(`/join/${code}`, { method: "POST", body: JSON.stringify(input) }),

  // Super admin only (backend 403s otherwise).
  adminOverview: () => request<AdminOverview>("/admin/overview"),
  adminCoaches: () => request<AdminCoachSummary[]>("/admin/coaches"),
  adminCoachDetail: (id: string) => request<AdminCoachDetail>(`/admin/coaches/${id}`),
  adminSchools: () => request<AdminSchoolSummary[]>("/admin/schools"),
  adminSchoolDetail: (id: string) => request<SchoolDetail>(`/admin/schools/${id}`),
  adminUsers: (q?: string) => request<AdminUserSummary[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  adminUserDetail: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),
  adminResetUserPassword: (id: string) =>
    request<{ sent: boolean; devResetToken?: string; devNote?: string }>(`/admin/users/${id}/reset-password`, {
      method: "POST",
    }),
  adminResetUserMfa: (id: string) => request<{ reset: boolean }>(`/admin/users/${id}/reset-mfa`, { method: "POST" }),
  adminCheckinActivity: (days = 90) => request<DailyActivityPoint[]>(`/admin/activity/checkins?days=${days}`),
  adminRunActivity: (days = 90) => request<DailyActivityPoint[]>(`/admin/activity/runs?days=${days}`),
  adminCoachLoginActivity: (days = 90) => request<DailyActivityPoint[]>(`/admin/activity/coach-logins?days=${days}`),
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
  readinessShared?: boolean;
  schoolId?: string | null;
  schoolName?: string | null;
  isSuperAdmin?: boolean;
  mfaEnabled?: boolean;
  googleLinked?: boolean;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  email: string;
  name: string;
  role: "COACH" | "ATHLETE";
  isSuperAdmin: boolean;
  schoolId: string | null;
  schoolName: string | null;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  athletes?: Array<{ id: string; name: string; squadName: "GIRLS" | "BOYS" }>;
  squadName?: "GIRLS" | "BOYS" | null;
  coaches?: Array<{ id: string; name: string }>;
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

export interface DistancePoint {
  date: string;
  distanceMiles: number;
}

export interface RpePoint {
  date: string;
  rpe: number;
}

export interface PacePoint {
  date: string;
  paceMinPerMile: number;
}

// No sleep/energy averages or series here on purpose -- see
// routes/athletes.ts's comment on GET /:id/stats: those are the
// athlete's own 1-5 subjective check-in self-ratings, not a real
// measurement, and a coach only ever sees them through the day-by-day
// Check-in History table (DetailDrawer.tsx), not averaged into a number
// here alongside RPE/distance.
export interface AthleteStats {
  totalDistanceMiles: number;
  avgPaceMinPerMile: number | null;
  weeklyDistanceMiles: number;
  sessionCount: number;
  avgRpe: number | null;
  distanceSeries: DistancePoint[];
  rpeSeries: RpePoint[];
  paceSeries: PacePoint[];
}

export type DataPhase = "building" | "partial" | "complete";

export interface Workload {
  daysTracked: number;
  phase: DataPhase;
  acuteReady: boolean;
  chronicReady: boolean;
  acuteLoad: number;
  chronicLoad: number;
  acwr: number;
  risk: number;
  status: ReadinessStatus;
}

export interface AthleteStatsResponse {
  stats: AthleteStats;
  workload: Workload;
}

export interface ReadinessScoreRecord {
  id: string;
  athleteId: string;
  week: number;
  year: number;
  score: number;
  status: ReadinessStatus;
  summary: string;
  // Days of history the athlete had on file when this score was computed
  // (snapshotted then, not re-derived from today) -- null for scores
  // computed before this was tracked. See lib/status.ts's dataConfidence().
  daysOfHistory: number | null;
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
  // "YYYY-MM-DD" -- omit for today. Lets an athlete catch up on a recent
  // missed day; the backend caps how far back this can reach.
  day?: string;
}

export interface WellnessEntry extends WellnessInput {
  id: string;
  athleteId: string;
  date: string;
  // Overrides WellnessInput's request-shaped "day?: YYYY-MM-DD" -- on a
  // response, this is always present and is the full stored timestamp
  // for that calendar day (WellnessEntry.day from the backend row).
  day: string;
}

export interface RunInput {
  runType: string;
  distanceMiles?: number;
  durationMin: number;
  rpe: number;
  // Same "YYYY-MM-DD" backdating as WellnessInput.day.
  day?: string;
}

// Omits RunInput's request-only "day" -- a run row has no separate day
// column (unlike WellnessEntry), just `date` below, which already lands
// on the right calendar day for a backdated submission.
export interface Run extends Omit<RunInput, "day"> {
  id: string;
  athleteId: string;
  date: string;
  load: number;
}

export type InviteType = "ATHLETE" | "COACH_TO_SCHOOL";

export interface Invite {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  type: InviteType;
  squadId: string | null;
  schoolId: string | null;
  token: string;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface InviteDetails {
  email: string;
  type: InviteType;
  schoolName: string | null;
  coachName: string;
  // COACH_TO_SCHOOL only -- whether this email already has an account.
  // true means accepting means logging in and confirming (see
  // api.attachInvite), not creating a new account.
  targetAccountExists: boolean;
}

export interface AcceptInviteInput {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  // Required for an ATHLETE invite (unused for COACH_TO_SCHOOL) -- same
  // question as the post-login gender gate; determines the athlete's
  // squad directly instead of a coach guessing at invite time.
  gender?: Gender;
}

export interface School {
  id: string;
  name: string;
  location: string | null;
}

export interface SchoolCoach {
  id: string;
  username: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface SchoolDetail extends School {
  coaches: SchoolCoach[];
  athleteCount: number;
  invites: Invite[];
  joinCode: string;
  pendingRequestCount: number;
}

export interface SchoolJoinRequestSummary {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  gender: Gender;
  createdAt: string;
}

export interface JoinRequestInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  gender: Gender;
}

export interface AdminOverview {
  schoolCount: number;
  coachCount: number;
  athleteCount: number;
  soloCoachCount: number;
}

// One point per calendar day, zero-filled -- see routes/admin.ts's
// activity endpoints and components/ContributionCalendar.tsx.
export interface DailyActivityPoint {
  date: string;
  count: number;
}

export interface AdminCoachSummary {
  id: string;
  username: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  schoolId: string | null;
  schoolName: string | null;
  athleteCount: number;
  createdAt: string;
}

export interface AdminCoachDetail extends Omit<AdminCoachSummary, "athleteCount"> {
  athletes: Array<{ id: string; name: string; squadName: "GIRLS" | "BOYS"; gender: Gender | null }>;
}

export interface AdminSchoolSummary extends School {
  coachCount: number;
  athleteCount: number;
  createdAt: string;
}
