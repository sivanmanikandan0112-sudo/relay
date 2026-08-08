import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type Squad } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const COACH_TABS = [
  { to: "/brief", label: "Brief" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/injuries", label: "Injuries" },
  { to: "/invite", label: "Invite" },
  { to: "/how-it-works", label: "How it works" },
];

const ATH_TABS = [
  { to: "/checkin", label: "Check-in" },
  { to: "/runs", label: "My Runs" },
  { to: "/athlete-guide", label: "How it works" },
];

function currentIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadId, setSquadId] = useState<string | null>(null);

  const isCoach = user?.role === "COACH";

  useEffect(() => {
    if (!isCoach) return;
    api.squads().then((data) => {
      setSquads(data);
      if (data.length > 0) setSquadId((current) => current ?? data[0].id);
    });
  }, [isCoach]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const tabs = isCoach ? COACH_TABS : ATH_TABS;

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
          <div className="user-menu">
            <span className="user-name">
              {user?.name} <span className="user-role">{user?.role === "COACH" ? "Coach" : "Athlete"}</span>
            </span>
            <button className="btn-secondary" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <nav className="navbar">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `navbar-tab ${isActive ? "active" : ""}`}>
            {tab.label}
          </NavLink>
        ))}
        {isCoach && (
          <>
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
          </>
        )}
      </nav>
      <main className="page">
        <Outlet context={{ squadId }} />
      </main>
    </div>
  );
}
