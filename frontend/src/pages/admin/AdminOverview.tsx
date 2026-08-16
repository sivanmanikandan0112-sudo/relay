import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminOverview as AdminOverviewData } from "../../lib/api";

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="panel" style={{ marginTop: 0, flex: 1, minWidth: 160 }}>
      <p className="eyebrow-mono" style={{ marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{value}</p>
      {sub && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 0" }}>{sub}</p>
      )}
    </div>
  );
}

export function AdminOverview() {
  const [data, setData] = useState<AdminOverviewData | null>(null);

  useEffect(() => {
    api.adminOverview().then(setData);
  }, []);

  return (
    <section>
      <p className="eyebrow-mono">SYSTEM OVERVIEW</p>
      <h1 className="page-title">Admin</h1>
      <p className="page-subtitle">Everything in Relay, across every school and every coach.</p>

      {data && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatTile label="Schools" value={data.schoolCount} />
          <StatTile label="Coaches" value={data.coachCount} />
          <StatTile label="Athletes" value={data.athleteCount} />
          <StatTile label="Solo coaches (no school)" value={data.soloCoachCount} />
          <StatTile
            label="Today's check-in rate"
            value={data.checkinRate === null ? "—" : `${Math.round(data.checkinRate * 100)}%`}
            sub={
              data.activeAthleteCount > 0
                ? `${data.checkedInToday} of ${data.activeAthleteCount} rostered athletes`
                : "No rostered athletes yet"
            }
          />
        </div>
      )}

      <div className="panel">
        <h2>Jump to</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/admin/coaches" className="btn-secondary" style={{ textDecoration: "none" }}>
            All coaches
          </Link>
          <Link to="/admin/schools" className="btn-secondary" style={{ textDecoration: "none" }}>
            All schools
          </Link>
        </div>
      </div>
    </section>
  );
}
