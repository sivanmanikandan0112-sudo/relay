import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type Squad } from "../lib/api";
import { currentIsoWeek } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { GenderGate } from "./GenderGate";
import { NoCoachNotice } from "./NoCoachNotice";
import { Footer } from "./Footer";

const COACH_TABS = [
  { to: "/brief", label: "Brief" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/injuries", label: "Injuries" },
  { to: "/invite", label: "Invite" },
  { to: "/school", label: "School" },
  { to: "/how-it-works", label: "How it works" },
];

const ATH_TABS = [
  { to: "/checkin", label: "Check-in" },
  { to: "/runs", label: "My Runs" },
  { to: "/athlete-guide", label: "How it works" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [squadId, setSquadId] = useState<string | null>(null);

  const isCoach = user?.role === "COACH";
  const isAthlete = user?.role === "ATHLETE";
  const needsGender = isAthlete && !user?.gender;
  const needsCoach = isAthlete && !!user?.gender && !user?.hasCoach;
  // Profile is exempt from the "waiting on a coach" gate below -- the
  // topbar's own "My Profile" link is always visible regardless of
  // needsCoach, and used to silently do nothing for a coach-less
  // athlete who clicked it: <main> ignored which route was actually
  // active and always rendered NoCoachNotice instead of the real page.
  // That's not just a dead link -- it meant a coach-less athlete had no
  // way to reach their own password/MFA settings, or the self-service
  // data export/account deletion Profile.tsx offers, contradicting
  // "self-service, no coach or admin required" for exactly the athletes
  // most likely to want to delete an abandoned signup.
  const onProfile = location.pathname === "/profile";

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

  // Required at login, before any of the rest of the app is usable.
  if (needsGender) return <GenderGate />;

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
          {user?.isSuperAdmin && (
            <Link to="/admin" className="btn-secondary" style={{ textDecoration: "none" }}>
              Admin
            </Link>
          )}
          <Link to="/profile" className="btn-secondary" style={{ textDecoration: "none" }}>
            My Profile
          </Link>
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

      {!needsCoach && (
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
      )}
      <main className="page">{needsCoach && !onProfile ? <NoCoachNotice /> : <Outlet context={{ squadId }} />}</main>
      <Footer />
    </div>
  );
}
