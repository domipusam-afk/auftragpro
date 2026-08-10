import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createClient, type JwtPayload, type SupabaseClient } from "@supabase/supabase-js";
import WS from "ws";
import { getAuthMode } from "./auth-context";
import { matchRoutePolicy } from "./route-policy";

const SUPABASE_URL_FALLBACK = "https://rbklkyozbefdjzaufszk.supabase.co";
const SUPABASE_ANON_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJia2xreW96YmVmZGp6YXVmc3prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njk1MTUsImV4cCI6MjA5NDE0NTUxNX0.gcFKMlHay24dzaWZnL0y-oLrVDjGDoFTKmt0z_sTDsc";

const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK;

export interface SupabaseRequestAuth {
  userId: string;
  email: string | null;
  sessionId: string | null;
  tenantId: string;
  rolle: string;
  berechtigungen: unknown;
  mfaErforderlich: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: SupabaseRequestAuth;
    }
  }
}

interface TenantMembershipRow {
  tenant_id: string;
  rolle: string;
  berechtigungen: unknown;
  mfa_erforderlich: boolean;
}

export interface AuthMiddlewareDependencies {
  /**
   * Override points keep the inactive middleware directly unit-testable
   * without inserting production auth users or memberships.
   */
  getClaims?: (accessToken: string) => Promise<JwtPayload | null>;
  getActiveMembership?: (userId: string) => Promise<TenantMembershipRow | null>;
  hasServiceRoleKey?: () => boolean;
}

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function createTokenClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    realtime: {
      transport: WS as unknown as typeof WebSocket,
    },
  });
}

async function getVerifiedClaims(accessToken: string): Promise<JwtPayload | null> {
  const tokenClient = createTokenClient(accessToken);
  const { data, error } = await tokenClient.auth.getClaims(accessToken);
  if (error || !data?.claims || typeof data.claims.sub !== "string") return null;
  return data.claims;
}

function createMembershipClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return null;

  // tenant_memberships and tenants are deliberately protected by
  // service-role-only RLS. The access token is verified first; this separate
  // server-only client only reads the verified user's active membership.
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: WS as unknown as typeof WebSocket,
    },
  });
}

async function getActiveMembership(userId: string): Promise<TenantMembershipRow | null> {
  const membershipClient = createMembershipClient();
  if (!membershipClient) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Supabase Auth membership lookup.");
  }

  const { data, error } = await membershipClient
    .from("tenant_memberships")
    .select("tenant_id, rolle, berechtigungen, mfa_erforderlich, tenants!inner(status)")
    .eq("user_id", userId)
    .eq("aktiv", true)
    .eq("tenants.status", "aktiv")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load Supabase tenant membership: ${error.message}`);
  }

  if (!data) return null;
  return data as TenantMembershipRow;
}

function defaultHasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Creates the future Supabase access-token middleware. Stage 6 does not
 * register this handler in server/routes.ts or server/index.ts; the legacy
 * app_benutzer login remains the only active production authentication path.
 */
export function createRequireAuth(
  dependencies: AuthMiddlewareDependencies = {},
): RequestHandler {
  const resolveClaims = dependencies.getClaims || getVerifiedClaims;
  const resolveMembership = dependencies.getActiveMembership || getActiveMembership;
  const hasServiceRoleKey = dependencies.hasServiceRoleKey || defaultHasServiceRoleKey;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const accessToken = getBearerToken(req.get("authorization"));
    if (!accessToken) {
      res.status(401).json({ message: "Supabase access token fehlt" });
      return;
    }

    let claims: JwtPayload | null;
    try {
      claims = await resolveClaims(accessToken);
    } catch {
      res.status(401).json({ message: "Supabase access token ungültig" });
      return;
    }

    if (!claims || typeof claims.sub !== "string") {
      res.status(401).json({ message: "Supabase access token ungültig" });
      return;
    }

    // The default membership resolver requires the service-role-only RLS
    // policy. A dependency override is used only by isolated tests.
    if (!dependencies.getActiveMembership && !hasServiceRoleKey()) {
      res.status(503).json({ message: "Supabase Auth membership lookup ist noch nicht konfiguriert" });
      return;
    }

    let membership: TenantMembershipRow | null;
    try {
      membership = await resolveMembership(claims.sub);
    } catch {
      res.status(503).json({ message: "Supabase Auth membership lookup ist nicht verfügbar" });
      return;
    }

    if (!membership) {
      res.status(403).json({ message: "Keine aktive Tenant-Mitgliedschaft vorhanden" });
      return;
    }

    req.auth = {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      sessionId: typeof claims.session_id === "string" ? claims.session_id : null,
      tenantId: membership.tenant_id,
      rolle: membership.rolle,
      berechtigungen: membership.berechtigungen,
      mfaErforderlich: membership.mfa_erforderlich,
    };
    next();
  };
}

export const requireAuth = createRequireAuth();

/**
 * Runtime auth bridge. Public routes remain reachable; every known protected
 * API route receives req.auth from a verified Supabase JWT in supabase mode.
 * In legacy mode the signed cookie context remains the sole auth source.
 */
export const supabaseRequestAuthContext: RequestHandler = (req, res, next) => {
  if (!req.path.startsWith("/api") || getAuthMode() !== "supabase") {
    next();
    return;
  }

  const policy = matchRoutePolicy(req.method, req.path);
  if (!policy || policy.access === "public") {
    next();
    return;
  }

  return requireAuth(req, res, next);
};
