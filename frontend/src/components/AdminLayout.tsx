import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ADMIN_TABS = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/coaches", label: "Coaches" },
  { to: "/admin/schools", label: "Schools" },
  { to: "/admin/users", label: "Users" },
];

// Deliberately its own shell, not a mode of the regular Layout -- this is
// a different information architecture (system-wide, not "my roster"),
// and keeping them visually distinct makes it obvious which one you're
// in. Route-guarded by RequireSuperAdmin in App.tsx before this ever
// renders.
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand">RELAY</div>
          <div className="brand-dash" />
          <div className="brand-sub">admin</div>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-right">
          <Link to="/brief" className="btn-secondary" style={{ textDecoration: "none" }}>
            Back to app
          </Link>
          <div className="user-menu">
            <span className="user-name">
              {user?.name} <span className="user-role">Super admin</span>
            </span>
            <button className="btn-secondary" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <nav className="navbar">
        {ADMIN_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `navbar-tab ${isActive ? "active" : ""}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
