import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminLayout } from "./components/AdminLayout";
import { Brief } from "./pages/Brief";
import { Dashboard } from "./pages/Dashboard";
import { Injuries } from "./pages/Injuries";
import { HowItWorks } from "./pages/HowItWorks";
import { CoachInvites } from "./pages/CoachInvites";
import { School } from "./pages/School";
import { Profile } from "./pages/Profile";
import { AthleteCheckin } from "./pages/AthleteCheckin";
import { AthleteRuns } from "./pages/AthleteRuns";
import { AthleteHowItWorks } from "./pages/AthleteHowItWorks";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Join } from "./pages/Join";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { AcceptInvite } from "./pages/AcceptInvite";
import { DataPolicy } from "./pages/DataPolicy";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminCoaches } from "./pages/admin/AdminCoaches";
import { AdminCoachDetail } from "./pages/admin/AdminCoachDetail";
import { AdminSchools } from "./pages/admin/AdminSchools";
import { AdminSchoolDetail } from "./pages/admin/AdminSchoolDetail";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminUserDetail } from "./pages/admin/AdminUserDetail";
import { AdminActivity } from "./pages/admin/AdminActivity";
import { UpdateToast } from "./components/UpdateToast";
import { useAuth } from "./context/AuthContext";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ role, children }: { role: "COACH" | "ATHLETE"; children: React.ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === "COACH" ? "/brief" : "/checkin"} replace />;
  return children;
}

function RequireSuperAdmin({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSuperAdmin) return <Navigate to={user.role === "COACH" ? "/brief" : "/checkin"} replace />;
  return children;
}

export default function App() {
  return (
    <>
      <UpdateToast />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        <Route path="/data-policy" element={<DataPolicy />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/profile" element={<Profile />} />

          <Route path="/brief" element={<RequireRole role="COACH"><Brief /></RequireRole>} />
          <Route path="/dashboard" element={<RequireRole role="COACH"><Dashboard /></RequireRole>} />
          <Route path="/injuries" element={<RequireRole role="COACH"><Injuries /></RequireRole>} />
          <Route path="/invite" element={<RequireRole role="COACH"><CoachInvites /></RequireRole>} />
          <Route path="/school" element={<RequireRole role="COACH"><School /></RequireRole>} />
          <Route path="/how-it-works" element={<RequireRole role="COACH"><HowItWorks /></RequireRole>} />

          <Route path="/checkin" element={<RequireRole role="ATHLETE"><AthleteCheckin /></RequireRole>} />
          <Route path="/runs" element={<RequireRole role="ATHLETE"><AthleteRuns /></RequireRole>} />
          <Route path="/athlete-guide" element={<RequireRole role="ATHLETE"><AthleteHowItWorks /></RequireRole>} />
        </Route>

        <Route
          element={
            <RequireSuperAdmin>
              <AdminLayout />
            </RequireSuperAdmin>
          }
        >
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/coaches" element={<AdminCoaches />} />
          <Route path="/admin/coaches/:id" element={<AdminCoachDetail />} />
          <Route path="/admin/schools" element={<AdminSchools />} />
          <Route path="/admin/schools/:id" element={<AdminSchoolDetail />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          <Route path="/admin/activity" element={<AdminActivity />} />
        </Route>
      </Routes>
    </>
  );
}
