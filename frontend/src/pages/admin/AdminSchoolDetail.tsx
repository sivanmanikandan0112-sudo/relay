import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type SchoolDetail } from "../../lib/api";

export function AdminSchoolDetail() {
  const { id } = useParams<{ id: string }>();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

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
      setInviteFeedback(res.emailSent ? `Emailed an invite to ${res.invite.email}` : `Invite created for ${res.invite.email}`);
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

      {school.invites.length > 0 && (
        <div className="panel">
          <h2>Pending coach invites</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {school.invites.map((inv) => (
              <div key={inv.id} className="run-item" style={{ padding: "12px 16px" }}>
                <div className="run-row">
                  <span className="run-type">{inv.email}</span>
                  <span className="injury-pill">{inv.status === "PENDING" ? "Waiting" : inv.status === "ACCEPTED" ? "Joined" : "Rejected"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link to="/admin/schools" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        ← Back to schools
      </Link>
    </section>
  );
}
