import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Brief } from "./pages/Brief";
import { Dashboard } from "./pages/Dashboard";
import { Injuries } from "./pages/Injuries";
import { HowItWorks } from "./pages/HowItWorks";
import { CoachInvites } from "./pages/CoachInvites";
import { AthleteCheckin } from "./pages/AthleteCheckin";
import { AthleteRuns } from "./pages/AthleteRuns";
import { AthleteHowItWorks } from "./pages/AthleteHowItWorks";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { AcceptInvite } from "./pages/AcceptInvite";
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

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "COACH" ? "/brief" : "/checkin"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />

        <Route path="/brief" element={<RequireRole role="COACH"><Brief /></RequireRole>} />
        <Route path="/dashboard" element={<RequireRole role="COACH"><Dashboard /></RequireRole>} />
        <Route path="/injuries" element={<RequireRole role="COACH"><Injuries /></RequireRole>} />
        <Route path="/invite" element={<RequireRole role="COACH"><CoachInvites /></RequireRole>} />
        <Route path="/how-it-works" element={<RequireRole role="COACH"><HowItWorks /></RequireRole>} />

        <Route path="/checkin" element={<RequireRole role="ATHLETE"><AthleteCheckin /></RequireRole>} />
        <Route path="/runs" element={<RequireRole role="ATHLETE"><AthleteRuns /></RequireRole>} />
        <Route path="/athlete-guide" element={<RequireRole role="ATHLETE"><AthleteHowItWorks /></RequireRole>} />
      </Route>
    </Routes>
  );
}
