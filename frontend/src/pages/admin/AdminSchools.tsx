import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminSchoolSummary } from "../../lib/api";

// Read-only: schools are created by coaches self-service (see
// pages/School.tsx / POST /api/schools), which also joins the creator as
// its first member. There's deliberately no "create a school" action
// here -- an admin-created school with nobody in it, or the admin
// account itself auto-joined as its first "coach" just to create it,
// doesn't make sense.
export function AdminSchools() {
  const [schools, setSchools] = useState<AdminSchoolSummary[]>([]);

  useEffect(() => {
    api.adminSchools().then(setSchools);
  }, []);

  return (
    <section>
      <p className="eyebrow-mono">ADMIN</p>
      <h1 className="page-title">Schools</h1>
      <p className="page-subtitle">
        {schools.length} school{schools.length === 1 ? "" : "s"}.
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schools.map((s) => (
            <Link
              key={s.id}
              to={`/admin/schools/${s.id}`}
              className="run-item"
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div className="run-item-row">
                <span className="run-item-type">{s.name}</span>
                <span className="injury-pill">{s.athleteCount} athlete{s.athleteCount === 1 ? "" : "s"}</span>
              </div>
              <div className="run-item-row" style={{ marginTop: 4 }}>
                <span className="run-item-meta">
                  {s.location ?? "no location on file"} · {s.coachCount} coach{s.coachCount === 1 ? "" : "es"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
