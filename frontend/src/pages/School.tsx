import { useEffect, useState, type FormEvent } from "react";
import { api, type SchoolDetail, type SchoolJoinRequestSummary } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function School() {
  const { user, updateUser } = useAuth();
  const [school, setSchool] = useState<SchoolDetail | null | undefined>(undefined); // undefined = loading

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [requests, setRequests] = useState<SchoolJoinRequestSummary[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  function refresh() {
    api.mySchool().then((res) => setSchool(res.school));
  }

  function refreshRequests(schoolId: string) {
    api.schoolJoinRequests(schoolId).then(setRequests);
  }

  useEffect(refresh, []);
  useEffect(() => {
    if (school) refreshRequests(school.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id]);

  async function handleRegenerateCode() {
    if (!school) return;
    setRegenerating(true);
    try {
      await api.regenerateJoinCode(school.id);
      refresh();
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopyCode() {
    if (!school) return;
    await navigator.clipboard.writeText(school.joinCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleApprove(reqId: string) {
    if (!school) return;
    setDecidingId(reqId);
    setRequestsError(null);
    try {
      await api.approveJoinRequest(school.id, reqId);
      refreshRequests(school.id);
      refresh();
    } catch (err) {
      setRequestsError(err instanceof Error ? err.message : "Couldn't approve that request");
    } finally {
      setDecidingId(null);
    }
  }

  async function handleReject(reqId: string) {
    if (!school) return;
    setDecidingId(reqId);
    setRequestsError(null);
    try {
      await api.rejectJoinRequest(school.id, reqId);
      refreshRequests(school.id);
    } catch (err) {
      setRequestsError(err instanceof Error ? err.message : "Couldn't reject that request");
    } finally {
      setDecidingId(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createSchool(name.trim(), location.trim() || undefined);
      updateUser({ schoolId: created.id, schoolName: created.name });
      refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create that school");
    } finally {
      setCreating(false);
    }
  }

  function startEditing() {
    if (!school) return;
    setEditName(school.name);
    setEditLocation(school.location ?? "");
    setEditError(null);
    setEditing(true);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!school || !editName.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await api.updateSchool(school.id, editName.trim(), editLocation.trim() || undefined);
      updateUser({ schoolName: updated.name });
      setEditing(false);
      refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't update the school");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !school) return;
    setInviting(true);
    setInviteError(null);
    setInviteFeedback(null);
    try {
      const res = await api.inviteCoachToSchool(school.id, inviteEmail.trim());
      setInviteFeedback(res.emailSent ? `Emailed an invite to ${res.invite.email}` : `Invite created for ${res.invite.email}`);
      setInviteEmail("");
      refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Couldn't send that invite");
    } finally {
      setInviting(false);
    }
  }

  if (school === undefined) {
    return (
      <section>
        <p className="eyebrow-mono">SCHOOL</p>
        <h1 className="page-title">School</h1>
        <p className="page-subtitle">Loading…</p>
      </section>
    );
  }

  if (!school) {
    return (
      <section>
        <p className="eyebrow-mono">SCHOOL</p>
        <h1 className="page-title">School</h1>
        <p className="page-subtitle">
          You're a solo coach right now — your roster is yours alone. Create a school below to share roster
          visibility with the rest of your coaching staff: every coach at the same school automatically sees every
          athlete anyone there has ever invited, no per-athlete re-sharing. Already have a colleague with a school
          set up? Ask them to invite you instead — typing in the exact same name here won't join theirs.
        </p>
        <div className="panel" style={{ marginTop: 0 }}>
          <h2>Create a school</h2>
          <form onSubmit={handleCreate}>
            <label className="field-hint" style={{ display: "block", marginBottom: 4, color: "var(--text-dim-2)" }}>
              School name
            </label>
            <input
              className="ath-input"
              style={{ marginBottom: 12 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Flower Mound High School"
            />
            <label className="field-hint" style={{ display: "block", marginBottom: 4, color: "var(--text-dim-2)" }}>
              Location (optional)
            </label>
            <input
              className="ath-input"
              style={{ marginBottom: 12 }}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Flower Mound, TX"
            />
            {createError && (
              <p className="error" style={{ marginTop: 4 }}>
                {createError}
              </p>
            )}
            <button className="btn-primary" style={{ marginTop: 8 }} disabled={creating || !name.trim()} onClick={handleCreate}>
              {creating ? "Creating…" : "Create school"}
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow-mono">SCHOOL</p>

      {editing ? (
        <div className="panel" style={{ marginTop: 0 }}>
          <h2>Edit school</h2>
          <form onSubmit={handleSaveEdit}>
            <label className="field-hint" style={{ display: "block", marginBottom: 4, color: "var(--text-dim-2)" }}>
              School name
            </label>
            <input
              className="ath-input"
              style={{ marginBottom: 12 }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <label className="field-hint" style={{ display: "block", marginBottom: 4, color: "var(--text-dim-2)" }}>
              Location (optional)
            </label>
            <input
              className="ath-input"
              style={{ marginBottom: 12 }}
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              placeholder="Flower Mound, TX"
            />
            {editError && (
              <p className="error" style={{ marginTop: 4 }}>
                {editError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn-primary" disabled={editSaving || !editName.trim()} onClick={handleSaveEdit}>
                {editSaving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              {school.name}
            </h1>
            <button className="btn-secondary" onClick={startEditing}>
              Edit
            </button>
          </div>
          <p className="page-subtitle">
            {school.location ? `${school.location} — ` : ""}
            {school.coaches.length} coach{school.coaches.length === 1 ? "" : "es"} sharing {school.athleteCount} athlete
            {school.athleteCount === 1 ? "" : "s"}. Anyone you invite here sees every athlete anyone at this school
            has ever rostered, and vice versa — not just the athletes they personally invited.
          </p>
        </>
      )}

      <div className="panel" style={{ marginTop: 0 }}>
        <h2>Coaches</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {school.coaches.map((c) => (
            <div key={c.id} className="run-item" style={{ padding: "12px 16px" }}>
              <div className="run-row">
                <span className="run-type">
                  {c.name} {c.id === user?.id && <span className="run-meta">(you)</span>}
                </span>
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
        <h2>Athlete join code</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
          Share this code with your athletes — they enter it at relaycoach.app/join to request joining {school.name}.
          Nothing happens automatically: each request sits below until a coach here approves it.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              letterSpacing: 4,
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 16px",
            }}
          >
            {school.joinCode}
          </span>
          <button className="btn-secondary" onClick={handleCopyCode}>
            {codeCopied ? "Copied!" : "Copy"}
          </button>
          <button className="btn-secondary" disabled={regenerating} onClick={handleRegenerateCode}>
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>
          Pending join requests {requests.length > 0 && <span className="injury-pill">{requests.length}</span>}
        </h2>
        {requestsError && (
          <p className="error" style={{ marginBottom: 8 }}>
            {requestsError}
          </p>
        )}
        {requests.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No pending requests right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {requests.map((r) => (
              <div key={r.id} className="run-item" style={{ padding: "12px 16px" }}>
                <div className="run-row">
                  <span className="run-type">
                    {r.firstName} {r.lastName} <span className="run-meta">({r.squadName === "GIRLS" ? "Girls" : "Boys"})</span>
                  </span>
                </div>
                <div className="run-row" style={{ marginTop: 4 }}>
                  <span className="run-meta">
                    {r.username} · {r.email}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn-primary" disabled={decidingId === r.id} onClick={() => handleApprove(r.id)}>
                    {decidingId === r.id ? "Working…" : "Approve"}
                  </button>
                  <button className="btn-secondary" disabled={decidingId === r.id} onClick={() => handleReject(r.id)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
        {inviteError && (
          <p className="error" style={{ marginTop: 8 }}>
            {inviteError}
          </p>
        )}
        {inviteFeedback && (
          <p className="success" style={{ marginTop: 8 }}>
            {inviteFeedback}
          </p>
        )}
        <p style={{ color: "var(--text-dim)", fontSize: 11.5, marginTop: 10 }}>
          If they already have a Relay account, they'll need to log in and confirm — this never reassigns someone
          else's account without them signing in themself. If not, the link lets them create one.
        </p>
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
    </section>
  );
}
