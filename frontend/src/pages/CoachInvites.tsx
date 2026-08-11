import { useEffect, useState } from "react";
import { api, type Invite, type Squad } from "../lib/api";

const STATUS_META: Record<Invite["status"], { label: string; color: string }> = {
  PENDING: { label: "Waiting", color: "#d9a53c" },
  ACCEPTED: { label: "Accepted", color: "#4ea373" },
  REJECTED: { label: "Rejected", color: "#cf5236" },
};

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls", BOYS: "Boys" };

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

function acceptUrl(token: string): string {
  return `${window.location.origin}/accept-invite/${token}`;
}

export function CoachInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadId, setSquadId] = useState("");
  const [raw, setRaw] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function refresh() {
    api.invites().then(setInvites);
  }

  useEffect(refresh, []);
  useEffect(() => {
    api.squads().then((s) => {
      setSquads(s);
      setSquadId((current) => current || s[0]?.id || "");
    });
  }, []);

  const emails = parseEmails(raw);
  const invalid = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  async function handleSend() {
    if (emails.length === 0 || invalid.length > 0 || !squadId) return;
    setSending(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.bulkInvite(emails, squadId);
      setFeedback(
        `${res.emailSent ? "Emailed" : "Created"} ${res.created} invite${res.created === 1 ? "" : "s"}` +
          (res.skipped > 0 ? ` · ${res.skipped} already pending or accepted, skipped` : "") +
          (res.emailSent ? "" : " — copy each link below to share it")
      );
      setRaw("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function copyLink(inv: Invite) {
    try {
      await navigator.clipboard.writeText(acceptUrl(inv.token));
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((current) => (current === inv.id ? null : current)), 2000);
    } catch {
      setError("Couldn't copy to clipboard — copy the link manually from the invite instead.");
    }
  }

  async function removeInvite(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      await api.cancelInvite(id);
      setConfirmRemoveId(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that invite");
    } finally {
      setRemovingId((current) => (current === id ? null : current));
    }
  }

  return (
    <section>
      <p className="eyebrow-mono">ROSTER</p>
      <h1 className="page-title">Invite athletes</h1>
      <p className="page-subtitle">
        Paste one email per line (or comma-separated) to bulk-invite athletes to a squad. If email sending isn't
        configured, nothing is actually emailed — copy each invite's link below and share it directly (text,
        email, whatever) instead. Either way, status below only changes when a real athlete actually follows
        that link and creates their account.
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <h2>Bulk invite</h2>
        <label className="field-hint" style={{ display: "block", marginBottom: 4, color: "var(--text-dim-2)" }}>
          Squad
        </label>
        <select
          className="ath-input"
          style={{ marginBottom: 12 }}
          value={squadId}
          onChange={(e) => setSquadId(e.target.value)}
        >
          {squads.map((s) => (
            <option key={s.id} value={s.id}>
              {SQUAD_LABEL[s.name] ?? s.name}
            </option>
          ))}
        </select>
        <textarea
          className="ath-textarea"
          style={{ minHeight: 100 }}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"taylor.nguyen@ridgeline.edu\nmorgan.diaz@ridgeline.edu"}
        />
        {invalid.length > 0 && (
          <p className="error" style={{ marginTop: 8, fontSize: 12.5 }}>
            Not a valid email: {invalid.join(", ")}
          </p>
        )}
        {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
        {feedback && <p className="success" style={{ marginTop: 8 }}>{feedback}</p>}
        <button
          className="btn-primary"
          style={{ marginTop: 12 }}
          disabled={sending || emails.length === 0 || invalid.length > 0 || !squadId}
          onClick={handleSend}
        >
          {sending ? "Sending…" : `Send ${emails.length || ""} invite${emails.length === 1 ? "" : "s"}`.trim()}
        </button>
      </div>

      <div className="panel">
        <h2>Invite status</h2>
        {invites.length === 0 && <p className="page-subtitle">No invites sent yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {invites.map((inv) => {
            const meta = STATUS_META[inv.status];
            const expired = new Date(inv.expiresAt) < new Date();
            return (
              <div key={inv.id} className="run-item" style={{ padding: "12px 16px" }}>
                <div className="run-row">
                  <span className="run-type">{inv.email}</span>
                  <span className="injury-pill" style={{ color: meta.color, borderColor: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <div className="run-row" style={{ marginTop: 8 }}>
                  <span className="run-meta">Sent {new Date(inv.createdAt).toLocaleDateString()}</span>
                  {inv.status === "PENDING" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {!expired && (
                        <button className="btn-secondary" onClick={() => copyLink(inv)}>
                          {copiedId === inv.id ? "Copied!" : "Copy invite link"}
                        </button>
                      )}
                      <button
                        className="btn-secondary"
                        style={confirmRemoveId === inv.id ? { color: "#cf5236", borderColor: "#cf5236" } : undefined}
                        disabled={removingId === inv.id}
                        onClick={() =>
                          confirmRemoveId === inv.id ? removeInvite(inv.id) : setConfirmRemoveId(inv.id)
                        }
                        onBlur={() => setConfirmRemoveId((current) => (current === inv.id ? null : current))}
                      >
                        {removingId === inv.id ? "Removing…" : confirmRemoveId === inv.id ? "Confirm remove?" : "Remove invite"}
                      </button>
                    </div>
                  )}
                </div>
                {inv.status === "PENDING" && expired && (
                  <p style={{ color: "var(--text-dim)", fontSize: 11.5, marginTop: 6 }}>
                    This invite link expired {new Date(inv.expiresAt).toLocaleDateString()} — re-invite to get a
                    fresh one.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
