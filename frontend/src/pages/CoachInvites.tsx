import { useEffect, useState } from "react";
import { api, type Invite } from "../lib/api";

const STATUS_META: Record<Invite["status"], { label: string; color: string }> = {
  PENDING: { label: "Waiting", color: "#d9a53c" },
  ACCEPTED: { label: "Accepted", color: "#4ea373" },
  REJECTED: { label: "Rejected", color: "#cf5236" },
};

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

export function CoachInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [raw, setRaw] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.invites().then(setInvites);
  }

  useEffect(refresh, []);

  const emails = parseEmails(raw);
  const invalid = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  async function handleSend() {
    if (emails.length === 0 || invalid.length > 0) return;
    setSending(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.bulkInvite(emails);
      setFeedback(
        `Sent ${res.created} invite${res.created === 1 ? "" : "s"}` +
          (res.skipped > 0 ? ` · ${res.skipped} already pending or accepted, skipped` : "")
      );
      setRaw("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(id: string, status: Invite["status"]) {
    await api.setInviteStatus(id, status);
    refresh();
  }

  return (
    <section>
      <p className="eyebrow-mono">ROSTER</p>
      <h1 className="page-title">Invite athletes</h1>
      <p className="page-subtitle">
        Paste one email per line (or comma-separated) to bulk-invite athletes. This dev environment has no
        email provider configured, so invites are tracked here but not actually sent — use the status
        buttons below to simulate an athlete's response while testing.
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <h2>Bulk invite</h2>
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
          disabled={sending || emails.length === 0 || invalid.length > 0}
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
                      <button className="btn-secondary" onClick={() => setStatus(inv.id, "ACCEPTED")}>
                        Simulate accept
                      </button>
                      <button className="btn-secondary" onClick={() => setStatus(inv.id, "REJECTED")}>
                        Simulate reject
                      </button>
                    </div>
                  )}
                  {inv.status !== "PENDING" && (
                    <button className="btn-secondary" onClick={() => setStatus(inv.id, "PENDING")}>
                      Reset to waiting
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
