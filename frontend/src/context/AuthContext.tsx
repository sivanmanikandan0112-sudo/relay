import { createContext, useContext, useState, type ReactNode } from "react";
import { api, type AuthUser } from "../lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("relay_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  async function login(username: string, password: string) {
    const { token, user } = await api.login(username, password);
    localStorage.setItem("relay_token", token);
    localStorage.setItem("relay_user", JSON.stringify(user));
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem("relay_token");
    localStorage.removeItem("relay_user");
    setUser(null);
  }

  // For fields that change after login without a full re-auth, e.g. once an
  // athlete sets their gender through the gate.
  function updateUser(patch: Partial<AuthUser>) {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      localStorage.setItem("relay_user", JSON.stringify(next));
      return next;
    });
  }

  return <AuthContext.Provider value={{ user, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
