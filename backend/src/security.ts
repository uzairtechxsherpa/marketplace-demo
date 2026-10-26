import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, save, addDays, nowIso } from "./db.js";
import type { User } from "./types.js";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  return prev.length === next.length && timingSafeEqual(prev, next);
}

export function newId() {
  return randomBytes(16).toString("hex");
}

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function createSession(userId: string) {
  const session = {
    id: newToken(24),
    userId,
    expiresAt: addDays(7),
  };
  db.sessions.push(session);
  save();
  return session;
}

export function setSessionCookie(
  res: Response,
  sessionId: string,
  req?: Request
) {
  const secure = Boolean(
    req &&
      (req.secure ||
        req.get("x-forwarded-proto")?.split(",")[0].trim() === "https")
  );
  res.cookie("sid", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie("sid", { path: "/" });
}

export function userFromRequest(req: Request): User | null {
  const sid = req.cookies?.sid as string | undefined;
  if (!sid) return null;
  const session = db.sessions.find(
    (s) => s.id === sid && new Date(s.expiresAt).getTime() > Date.now()
  );
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  (req as Request & { user: User }).user = user;
  next();
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    hasMicrosoft: Boolean(user.msOid),
    currentOrganizationId: user.currentOrganizationId,
    createdAt: user.createdAt,
  };
}

export { nowIso };
