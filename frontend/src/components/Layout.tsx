import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";

const TABS = [
  { to: "/brief", label: "Brief" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/injuries", label: "Injuries" },
  { to: "/how-it-works", label: "How It Works" },
];

export function Layout() {
  const [view, setView] = useState<"COACH" | "ATHLETE">("COACH");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          RELAY <span className="brand-sub">overreaching radar</span>
        </div>
        <div className="view-toggle">
          <button className={view === "COACH" ? "active" : ""} onClick={() => setView("COACH")}>
            Coach
          </button>
          <button className={view === "ATHLETE" ? "active" : ""} onClick={() => setView("ATHLETE")}>
            Athlete
          </button>
        </div>
      </header>
      <nav className="tabbar">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
