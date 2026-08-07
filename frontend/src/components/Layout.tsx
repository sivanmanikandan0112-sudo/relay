import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type Squad } from "../lib/api";
import { SquadSelector } from "./SquadSelector";
import { AthleteHome } from "../pages/AthleteHome";

const TABS = [
  { to: "/brief", label: "Brief" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/injuries", label: "Injuries" },
  { to: "/how-it-works", label: "How It Works" },
];

// ISO week number, so the header stays correct without hardcoding a week.
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
        <div className="brand">
          RELAY <span className="brand-sub">overreaching radar</span>
        </div>
        <div className="topbar-right">
          <div className="week-indicator">
            <span className="dot dot-green" />
            Week {currentIsoWeek(now)} · {monthLabel}
          </div>
          <div className="view-toggle">
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
          <nav className="tabbar">
            <div className="tabs">
              {TABS.map((tab) => (
                <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
                  {tab.label}
                </NavLink>
              ))}
            </div>
            <SquadSelector squads={squads} activeSquadId={squadId} onChange={setSquadId} />
          </nav>
          <main className="content">
            <Outlet context={{ squadId }} />
          </main>
        </>
      ) : (
        <main className="content">
          <AthleteHome squads={squads} squadId={squadId} onSquadChange={setSquadId} />
        </main>
      )}
    </div>
  );
}
