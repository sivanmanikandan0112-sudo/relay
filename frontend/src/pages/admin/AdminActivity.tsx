import { useEffect, useState } from "react";
import { api, type DailyActivityPoint } from "../../lib/api";
import { ContributionCalendar } from "../../components/ContributionCalendar";

const DAYS = 90;

function CalendarPanel({
  title,
  subtitle,
  data,
  label,
  colorVar,
}: {
  title: string;
  subtitle: string;
  data: DailyActivityPoint[] | null;
  label: string;
  colorVar: string;
}) {
  const total = data?.reduce((sum, d) => sum + d.count, 0) ?? 0;
  const activeDays = data?.filter((d) => d.count > 0).length ?? 0;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 12.5, margin: "2px 0 0" }}>{subtitle}</p>
        </div>
        {data && (
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {total} total · {activeDays}/{DAYS} active days
          </div>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        {data === null ? (
          <p className="page-subtitle" style={{ margin: 0 }}>
            Loading…
          </p>
        ) : (
          <ContributionCalendar data={data} label={label} colorVar={colorVar} />
        )}
      </div>
    </div>
  );
}

// Three independent, system-wide GitHub-contribution-graph-style
// calendars, backed by GET /api/admin/activity/* -- see that route file's
// comment for exactly what each one counts and why. Not phase-gated or
// scoped to a coach/school (see the README's "Data confidence" section
// for that pattern elsewhere) -- this is a system-wide, always-visible
// admin view, same spirit as the rest of the Admin area.
export function AdminActivity() {
  const [checkins, setCheckins] = useState<DailyActivityPoint[] | null>(null);
  const [runs, setRuns] = useState<DailyActivityPoint[] | null>(null);
  const [coachLogins, setCoachLogins] = useState<DailyActivityPoint[] | null>(null);

  useEffect(() => {
    api.adminCheckinActivity(DAYS).then(setCheckins);
    api.adminRunActivity(DAYS).then(setRuns);
    api.adminCoachLoginActivity(DAYS).then(setCoachLogins);
  }, []);

  return (
    <section>
      <p className="eyebrow-mono">ENGAGEMENT</p>
      <h1 className="page-title">Activity</h1>
      <p className="page-subtitle">
        Last {DAYS} days, system-wide. Each square is one day; darker means more people were active that day,
        relative to the busiest day in this window.
      </p>

      <CalendarPanel
        title="Athlete check-ins"
        subtitle="Distinct athletes who submitted a check-in each day"
        data={checkins}
        label="check-in"
        colorVar="#4ea373"
      />
      <CalendarPanel
        title="Athlete runs"
        subtitle="Distinct athletes who logged at least one run each day (a two-a-day still counts once)"
        data={runs}
        label="athlete logging a run"
        colorVar="#3d9c9c"
      />
      <CalendarPanel
        title="Coach logins"
        subtitle="Distinct coaches who logged in each day"
        data={coachLogins}
        label="coach login"
        colorVar="#d9a53c"
      />
    </section>
  );
}
