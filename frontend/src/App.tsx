import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Brief } from "./pages/Brief";
import { Dashboard } from "./pages/Dashboard";
import { Injuries } from "./pages/Injuries";
import { HowItWorks } from "./pages/HowItWorks";
import { Login } from "./pages/Login";
import { useAuth } from "./context/AuthContext";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/brief" replace />} />
        <Route path="/brief" element={<Brief />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/injuries" element={<Injuries />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
      </Route>
    </Routes>
  );
}
