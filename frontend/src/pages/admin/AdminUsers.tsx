import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminUserSummary } from "../../lib/api";

export function AdminUsers() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);

  function refresh(query: string) {
    api.adminUsers(query || undefined).then(setUsers);
  }

  useEffect(() => refresh(""), []);

  return (
    <section>
      <p className="eyebrow-mono">ADMIN</p>
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">Search across every coach and athlete account in the system.</p>

      <div className="panel" style={{ marginTop: 0 }}>
        <input
          className="ath-input"
          placeholder="Search by name, username, or email…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            refresh(e.target.value);
          }}
        />
      </div>

      <div className="panel">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <Link
              key={u.id}
              to={`/admin/users/${u.id}`}
              className="run-item"
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div className="run-item-row">
                <span className="run-item-type">{u.name}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className="injury-pill">{u.role === "COACH" ? "Coach" : "Athlete"}</span>
                  {u.mfaEnabled && <span className="injury-pill">2FA on</span>}
                </div>
              </div>
              <div className="run-item-row" style={{ marginTop: 4 }}>
                <span className="run-item-meta">
                  {u.email} · {u.schoolName ?? (u.role === "COACH" ? "solo (no school)" : "—")}
                  {u.isSuperAdmin ? " · super admin" : ""}
                </span>
              </div>
            </Link>
          ))}
          {users.length === 0 && <p className="page-subtitle">No matching users.</p>}
        </div>
      </div>
    </section>
  );
}
