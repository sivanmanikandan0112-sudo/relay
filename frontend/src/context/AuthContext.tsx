import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "../lib/api";

interface AuthUser {
  id: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("relay_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  async function login(email: string, password: string) {
    const { token, user } = await api.login(email, password);
    localStorage.setItem("relay_token", token);
    localStorage.setItem("relay_user", JSON.stringify(user));
    setUser(user);
  }

  function logout() {
    localStorage.removeItem("relay_token");
    localStorage.removeItem("relay_user");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
