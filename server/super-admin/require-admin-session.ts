import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_SESSION_COOKIE = "ap_admin_session";
export const ADMIN_SESSION_HEADER = "x-admin-session";
const TTL_SECONDS = 15 * 60;

interface AdminSessionPayload {
  sub: string;
  exp: number;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function secret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) return configured;
  // ADMIN_SESSION_SECRET should be configured explicitly. This deterministic
  // fallback keeps deployments secure as long as their service-role key stays secret.
  return createHash("sha256")
    .update(`${process.env.SUPABASE_SERVICE_ROLE_KEY || "missing-service-role-key"}:admin-session`)
    .digest("hex");
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function cookies(req: Request): Record<string, string> {
  return Object.fromEntries((req.get("cookie") || "").split(";")
    .map((entry) => entry.trim().split("="))
    .filter(([key]) => key)
    .map(([key, value]) => [key, decodeURIComponent(value || "")]));
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createAdminSessionToken(userId: string): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(signingInput)}`;
}

export function readAdminSession(req: Request, expectedUserId?: string): AdminSessionPayload | null {
  const token = req.get(ADMIN_SESSION_HEADER) || cookies(req)[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  const [header, encodedPayload, signature, ...rest] = token.split(".");
  if (!header || !encodedPayload || !signature || rest.length) return null;
  const signingInput = `${header}.${encodedPayload}`;
  if (!signaturesMatch(signature, sign(signingInput))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminSessionPayload;
    if (!parsed || typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    if (expectedUserId && parsed.sub !== expectedUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(res: Response, token: string): void {
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearAdminSessionCookie(res: Response): void {
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

/** Require a recent password re-entry and rotate the short-lived token. */
export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  const userId = req.superAdmin?.id || req.auth?.userId;
  if (!userId || !readAdminSession(req, userId)) {
    res.status(401).json({ reason: "admin_session_expired", message: "Die Admin-Sitzung ist abgelaufen. Bitte Passwort erneut eingeben." });
    return;
  }
  const rolledToken = createAdminSessionToken(userId);
  setAdminSessionCookie(res, rolledToken);
  res.setHeader("X-Admin-Session", rolledToken);
  next();
}

export function getAdminSessionTtl(req: Request, userId: string): number | undefined {
  const payload = readAdminSession(req, userId);
  return payload ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) : undefined;
}
