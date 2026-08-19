import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AdminCoachDetail as AdminCoachDetailData } from "../../lib/api";

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls", BOYS: "Boys" };

export function AdminCoachDetail() {
  const { id } = useParams<{ id: string }>();
  const [coach, setCoach] = useState<AdminCoachDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .adminCoachDetail(id)
      .then(setCoach)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load that coach"));
  }, [id]);

  if (error) {
    return (
      <section>
        <p className="error">{error}</p>
        <Link to="/admin/coaches">Back to coaches</Link>
      </section>
    );
  }
  if (!coach) return null;

  return (
    <section>
      <p className="eyebrow-mono">ADMIN · COACH</p>
      <h1 className="page-title">{coach.name}</h1>
      <p className="page-subtitle">
        {coach.email} · {coach.schoolName ? <>at {coach.schoolName}</> : "solo coach, no school"}
        {coach.isSuperAdmin ? " · super admin" : ""}
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <h2>
          Visible athletes ({coach.athletes.length})
        </h2>
        {coach.athletes.length === 0 && <p className="page-subtitle">No athletes visible to this coach yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {coach.athletes.map((a) => (
            <div key={a.id} className="run-item">
              <div className="run-item-row">
                <span className="run-item-type">{a.name}</span>
                <span className="run-item-meta">{SQUAD_LABEL[a.squadName] ?? a.squadName}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Link to="/admin/coaches" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        ← Back to coaches
      </Link>
    </section>
  );
}
