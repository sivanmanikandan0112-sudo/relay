import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type Squad } from "../lib/api";
import { AthleteHome } from "../pages/AthleteHome";

const COACH_TABS = [
  { to: "/brief", label: "Brief" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/injuries", label: "Injuries" },
  { to: "/how-it-works", label: "How it works" },
];

const ATH_TABS = [
  { key: "checkin", label: "Check-in" },
  { key: "runs", label: "My Runs" },
  { key: "how", label: "How it works" },
] as const;

function currentIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function Layout() {
  const [viewMode, setViewMode] = useState<"COACH" | "ATHLETE">("COACH");
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadId, setSquadId] = useState<string | null>(null);
  const [athScreen, setAthScreen] = useState<(typeof ATH_TABS)[number]["key"]>("checkin");

  useEffect(() => {
    api.squads().then((data) => {
      setSquads(data);
      if (data.length > 0) setSquadId((current) => current ?? data[0].id);
    });
  }, []);

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand">RELAY</div>
          <div className="brand-dash" />
          <div className="brand-sub">overreaching&nbsp;radar</div>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-right">
          <div className="week-indicator">
            <span className="week-dot" />
            <span>
              Week {currentIsoWeek(now)} · {monthLabel}
            </span>
          </div>
          <div className="role-toggle">
            <button className={viewMode === "COACH" ? "active" : ""} onClick={() => setViewMode("COACH")}>
              Coach
            </button>
            <button className={viewMode === "ATHLETE" ? "active" : ""} onClick={() => setViewMode("ATHLETE")}>
              Athlete
            </button>
          </div>
        </div>
      </header>

      {viewMode === "COACH" ? (
        <>
          <nav className="navbar">
            {COACH_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => `navbar-tab ${isActive ? "active" : ""}`}
              >
                {tab.label}
              </NavLink>
            ))}
            <div className="navbar-spacer" />
            <div className="navbar-squad">
              <span className="navbar-squad-label">SQUAD</span>
              {squads.map((squad) => (
                <button
                  key={squad.id}
                  className={`squad-pill ${squadId === squad.id ? "active" : ""}`}
                  style={{ borderColor: squadId === squad.id ? (squad.name === "GIRLS" ? "#d97fb0" : "#7fb0d9") : undefined }}
                  onClick={() => setSquadId(squad.id)}
                >
                  <span className="dot" style={{ background: squad.name === "GIRLS" ? "#d97fb0" : "#7fb0d9" }} />
                  {squad.name === "GIRLS" ? "Girls" : "Boys"} <span className="count">{squad.athleteCount}</span>
                </button>
              ))}
            </div>
          </nav>
          <main className="page">
            <Outlet context={{ squadId }} />
          </main>
        </>
      ) : (
        <>
          <nav className="navbar">
            {ATH_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`navbar-tab ${athScreen === tab.key ? "active" : ""}`}
                onClick={() => setAthScreen(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <main className="page">
            <AthleteHome squads={squads} squadId={squadId} onSquadChange={setSquadId} screen={athScreen} />
          </main>
        </>
      )}
    </div>
  );
}
