import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import supabase from "./supabase";

export const LEGACY_SESSION_COOKIE = "ap_legacy_session";

export interface LegacyRequestAuth {
  userId: string;
  rolle: string;
  berechtigungen: unknown;
}

declare global {
  namespace Express {
    interface Request {
      legacyAuth?: LegacyRequestAuth;
    }
  }
}

interface LegacyUserRow {
  id: string;
  rolle: string;
  berechtigungen: unknown;
  ist_super_admin?: boolean;
  tenant_status?: string | null;
}

export interface LegacySessionDependencies {
  secret?: string;
  getActiveUser?: (userId: string) => Promise<LegacyUserRow | null>;
}

// Render supplies a stable value through render.yaml. The random development
// fallback keeps local shadow-mode testing possible without weakening the
// production cookie configuration.
const developmentSessionSecret = randomBytes(32).toString("base64url");

function resolveSecret(secret?: string): string {
  return secret?.trim() || process.env.LEGACY_SESSION_SECRET?.trim() || developmentSessionSecret;
}

function encodeUserId(userId: string): string {
  return Buffer.from(userId, "utf8").toString("base64url");
}

function decodeUserId(value: string): string | null {
  try {
    const userId = Buffer.from(value, "base64url").toString("utf8");
    return userId.length > 0 ? userId : null;
  } catch {
    return null;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createLegacySessionValue(userId: string, secret?: string): string {
  const payload = `v1.${encodeUserId(userId)}`;
  return `${payload}.${signature(payload, resolveSecret(secret))}`;
}

export function getLegacySessionUserId(cookieValue: string | undefined, secret?: string): string | null {
  if (!cookieValue) return null;
  const [version, encodedUserId, suppliedSignature, ...unexpectedParts] = cookieValue.split(".");
  if (version !== "v1" || !encodedUserId || !suppliedSignature || unexpectedParts.length > 0) return null;

  const payload = `${version}.${encodedUserId}`;
  if (!signaturesMatch(suppliedSignature, signature(payload, resolveSecret(secret)))) return null;
  return decodeUserId(encodedUserId);
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function getActiveLegacyUser(userId: string): Promise<LegacyUserRow | null> {
  // tenants!left liefert den Firmenstatus mit. Super-Admins ohne tenant_id
  // bleiben durch den Left-Join zugreifbar; sie sind der einzige
  // Rettungsanker, wenn eine Firma versehentlich gesperrt wurde.
  const { data, error } = await supabase
    .from("app_benutzer")
    .select("id, rolle, berechtigungen, ist_super_admin, tenants:tenant_id(status)")
    .eq("id", userId)
    .eq("aktiv", true)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const tenants = row.tenants as { status?: string } | null | undefined;
  return {
    id: String(row.id),
    rolle: String(row.rolle ?? ""),
    berechtigungen: row.berechtigungen,
    ist_super_admin: row.ist_super_admin === true,
    tenant_status: tenants?.status ?? null,
  };
}

/**
 * Reads the signed, HTTP-only legacy session cookie and refreshes the legacy
 * user's role and permissions from app_benutzer. It is observational context:
 * a missing/invalid cookie or lookup failure always continues the request.
 */
export function createLegacySessionContext(
  dependencies: LegacySessionDependencies = {},
): RequestHandler {
  const secret = resolveSecret(dependencies.secret);
  const loadUser = dependencies.getActiveUser || getActiveLegacyUser;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.path.startsWith("/api")) {
      next();
      return;
    }

    const userId = getLegacySessionUserId(
      getCookieValue(req.get("cookie"), LEGACY_SESSION_COOKIE),
      secret,
    );
    if (!userId) {
      next();
      return;
    }

    try {
      const user = await loadUser(userId);
      if (user) {
        // Nur aktive Firmen dürfen die Session weiterreichen. Super-Admins
        // sind ausgenommen, damit sie eine gesperrte Firma wieder freigeben
        // können und nicht ausgesperrt werden.
        const tenantOk = user.ist_super_admin === true
          || !user.tenant_status
          || user.tenant_status === "aktiv";
        if (tenantOk) {
          req.legacyAuth = {
            userId: user.id,
            rolle: user.rolle,
            berechtigungen: user.berechtigungen,
          };
        }
      }
    } catch {
      // Shadow mode must never turn a transient user lookup problem into an
      // authentication or availability change for the legacy application.
    }
    next();
  };
}

export const legacySessionContext = createLegacySessionContext();

/**
 * The user id is the sole cookie payload. Role and permissions are loaded on
 * each API request and therefore never become stale client-side claims.
 */
export function setLegacySessionCookie(res: Response, userId: string): void {
  res.cookie(LEGACY_SESSION_COOKIE, createLegacySessionValue(userId), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}
