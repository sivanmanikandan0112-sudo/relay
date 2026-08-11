import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthPayload } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    // An MFA temp token proves the password was correct, nothing more --
    // it must never grant access to an ordinary protected route. Only
    // the unauthenticated POST /api/auth/mfa/verify endpoint consumes
    // these (it reads the token from the request body, not this header).
    if (payload.mfaPending) {
      return res.status(401).json({ error: "MFA verification required" });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Array<"COACH" | "ATHLETE">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
