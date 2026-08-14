import { createContext, useContext, useState, type ReactNode } from "react";
import { api, type AuthUser } from "../lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<AuthUser | { mfaRequired: true; tempToken: string }>;
  loginWithGoogle: (idToken: string) => Promise<AuthUser | { mfaRequired: true; tempToken: string }>;
  verifyMfa: (tempToken: string, code: string) => Promise<AuthUser>;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("relay_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  // Shared by login() and by any other flow that ends with a real
  // token + user in hand without going through POST /auth/login itself
  // (e.g. AcceptInvite, which creates the account and logs it in as one step).
  function setSession(token: string, user: AuthUser) {
    localStorage.setItem("relay_token", token);
    localStorage.setItem("relay_user", JSON.stringify(user));
    setUser(user);
  }

  async function login(username: string, password: string) {
    const result = await api.login(username, password);
    if ("mfaRequired" in result) {
      return result; // caller (Login.tsx) shows the code-entry step next
    }
    setSession(result.token, result.user);
    return result.user;
  }

  // Same {mfaRequired}-or-real-session shape as login() -- a verified
  // Google identity is just a different first factor, so it goes through
  // the exact same MFA branching on the frontend too.
  async function loginWithGoogle(idToken: string) {
    const result = await api.loginWithGoogle(idToken);
    if ("mfaRequired" in result) {
      return result;
    }
    setSession(result.token, result.user);
    return result.user;
  }

  // Completes a two-step MFA login, given the tempToken login() returned.
  async function verifyMfa(tempToken: string, code: string) {
    const { token, user } = await api.mfaVerifyLogin(tempToken, code);
    setSession(token, user);
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

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, verifyMfa, setSession, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
