import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminCoachSummary } from "../../lib/api";

export function AdminCoaches() {
  const [coaches, setCoaches] = useState<AdminCoachSummary[]>([]);

  useEffect(() => {
    api.adminCoaches().then(setCoaches);
  }, []);

  return (
    <section>
      <p className="eyebrow-mono">ADMIN</p>
      <h1 className="page-title">Coaches</h1>
      <p className="page-subtitle">
        {coaches.length} coach{coaches.length === 1 ? "" : "es"} in the system.
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {coaches.map((c) => (
            <Link
              key={c.id}
              to={`/admin/coaches/${c.id}`}
              className="run-item"
              style={{ padding: "12px 16px", textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div className="run-row">
                <span className="run-type">{c.name}</span>
                <span className="injury-pill">{c.athleteCount} athlete{c.athleteCount === 1 ? "" : "s"}</span>
              </div>
              <div className="run-row" style={{ marginTop: 4 }}>
                <span className="run-meta">
                  {c.email} · {c.schoolName ?? "solo (no school)"}
                  {c.isSuperAdmin ? " · super admin" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
