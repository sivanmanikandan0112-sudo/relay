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
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, env.jwtSecret) as AuthPayload;
}
