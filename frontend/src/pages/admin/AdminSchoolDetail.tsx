import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AdminSchoolDetail as AdminSchoolDetailData } from "../../lib/api";
import { BarChart } from "../../components/BarChart";
import { acceptInviteUrl } from "../../lib/format";

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls", BOYS: "Boys" };

export function AdminSchoolDetail() {
  const { id } = useParams<{ id: string }>();
  const [school, setSchool] = useState<AdminSchoolDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyInviteLink(inv: { id: string; token: string }) {
    try {
      await navigator.clipboard.writeText(acceptInviteUrl(inv.token));
      setCopiedInviteId(inv.id);
      setTimeout(() => setCopiedInviteId((current) => (current === inv.id ? null : current)), 2000);
    } catch {
      setCopyError("Couldn't copy to clipboard — copy the link manually instead.");
    }
  }

  function refresh() {
    if (!id) return;
    api.adminSchoolDetail(id).then(setSchool).catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load that school"));
  }

  useEffect(refresh, [id]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !id) return;
    setInviting(true);
    setInviteError(null);
    setInviteFeedback(null);
    try {
      const res = await api.inviteCoachToSchool(id, inviteEmail.trim());
      setInviteFeedback(
        res.emailSent
          ? `Emailed an invite to ${res.invite.email}`
          : `Invite created for ${res.invite.email} — copy the link below to share it`
      );
      setInviteEmail("");
      refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Couldn't send that invite");
    } finally {
      setInviting(false);
    }
  }

  if (loadError) {
    return (
      <section>
        <p className="error">{loadError}</p>
        <Link to="/admin/schools">Back to schools</Link>
      </section>
    );
  }
  if (!school) return null;

  // Same "already reflected in the Coaches list above" reasoning as the
  // coach-facing School.tsx -- an accepted invite showing "Joined" here
  // too is pure redundancy.
  const pendingInvites = school.invites.filter((inv) => inv.status !== "ACCEPTED");
  const todayRate = school.checkinRateSeries[school.checkinRateSeries.length - 1];

  return (
    <section>
      <p className="eyebrow-mono">ADMIN · SCHOOL</p>
      <h1 className="page-title">{school.name}</h1>
      <p className="page-subtitle">
        {school.location ? `${school.location} — ` : ""}
        {school.coaches.length} coach{school.coaches.length === 1 ? "" : "es"}, {school.athleteCount} shared athlete
        {school.athleteCount === 1 ? "" : "s"}.
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <h2>Coaches</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {school.coaches.map((c) => (
            <div key={c.id} className="run-item" style={{ padding: "12px 16px" }}>
              <div className="run-row">
                <span className="run-type">{c.name}</span>
                {c.isSuperAdmin && <span className="injury-pill">Super admin</span>}
              </div>
              <div className="run-row" style={{ marginTop: 4 }}>
                <span className="run-meta">{c.email}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>
          Athletes ({school.athletes.length})
        </h2>
        {school.athletes.length === 0 && <p className="page-subtitle">No athletes on this school's roster yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {school.athletes.map((a) => (
            <div key={a.id} className="run-item" style={{ padding: "12px 16px" }}>
              <div className="run-row">
                <span className="run-type">{a.name}</span>
                <span className="run-meta">{SQUAD_LABEL[a.squadName] ?? a.squadName}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Check-in activity</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
          Share of this school's rostered athletes who've logged today's check-in, and the last 7 days.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, color: "var(--orange)" }}>
              {todayRate?.rate != null ? `${Math.round(todayRate.rate * 100)}%` : "—"}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)" }}>
              {todayRate ? `${todayRate.checkedIn} / ${todayRate.total} today` : "no roster yet"}
            </div>
          </div>
          <BarChart
            values={school.checkinRateSeries.map((p) => (p.rate ?? 0) * 100)}
            colorVar="var(--orange)"
            width={220}
            height={54}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Invite a coach</h2>
        <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            className="ath-input"
            style={{ flex: 1 }}
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@school.edu"
          />
          <button className="btn-primary" disabled={inviting || !inviteEmail.trim()} onClick={handleInvite}>
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>
        {inviteError && <p className="error" style={{ marginTop: 8 }}>{inviteError}</p>}
        {inviteFeedback && <p className="success" style={{ marginTop: 8 }}>{inviteFeedback}</p>}
      </div>

      {pendingInvites.length > 0 && (
        <div className="panel">
          <h2>Pending coach invites</h2>
          {copyError && (
            <p className="error" style={{ marginBottom: 8 }}>
              {copyError}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingInvites.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();
              return (
                <div key={inv.id} className="run-item" style={{ padding: "12px 16px" }}>
                  <div className="run-row">
                    <span className="run-type">{inv.email}</span>
                    <span className="injury-pill">{inv.status === "PENDING" ? "Waiting" : "Rejected"}</span>
                  </div>
                  {inv.status === "PENDING" && !expired && (
                    <div className="run-row" style={{ marginTop: 8 }}>
                      <span className="run-meta">Link expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                      <button className="btn-secondary" onClick={() => copyInviteLink(inv)}>
                        {copiedInviteId === inv.id ? "Copied!" : "Copy invite link"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Link to="/admin/schools" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        ← Back to schools
      </Link>
    </section>
  );
}
