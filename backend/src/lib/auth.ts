import jwt from "jsonwebtoken";
import { env } from "./env.js";
import type { Role } from "@prisma/client";

export interface AuthPayload {
  sub: string;
  role: Role;
  // Folded into the token like `role` rather than looked up per-request --
  // rarely changes, same staleness profile a demoted coach already has
  // today (up to 7d, this token's own expiry). Optional so tokens issued
  // before this field existed still verify; treated as false when absent.
  isSuperAdmin?: boolean;
  // Marks a short-lived (5 minute) token issued mid-login for an
  // MFA-enabled account, between "password verified" and "TOTP/backup
  // code verified" -- see routes/auth.ts POST /login and POST
  // /mfa/verify. Never set on a real session token. requireAuth rejects
  // any token carrying this, so a captured temp token can't be used
  // against ordinary protected routes -- only the unauthenticated
  // POST /api/auth/mfa/verify endpoint is meant to consume it.
  mfaPending?: boolean;
}

export function signToken(payload: AuthPayload, opts?: { expiresIn: jwt.SignOptions["expiresIn"] }): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: opts?.expiresIn ?? "7d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, env.jwtSecret) as AuthPayload;
}
