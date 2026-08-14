import type { NextFunction, Request, Response } from "express";
import { getServiceRoleClient } from "../supabase";

export interface SuperAdminIdentity {
  id: string;
  email: string | null;
}

declare global {
  namespace Express {
    interface Request {
      superAdmin?: SuperAdminIdentity;
    }
  }
}

/**
 * Defence in depth: verifies the live application-user record on every request
 * instead of trusting a claim embedded in a potentially stale access token.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ message: "Authentifizierung erforderlich." });
    return;
  }

  try {
    const { data, error } = await getServiceRoleClient()
      .from("app_benutzer")
      .select("id, aktiv, ist_super_admin")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data || data.aktiv !== true || data.ist_super_admin !== true) {
      res.status(403).json({ message: "System-Verwaltung ist nur für Super-Administratoren verfügbar." });
      return;
    }

    req.superAdmin = { id: data.id, email: req.auth?.email || null };
    next();
  } catch {
    // Any database failure is fail-closed for this privileged area.
    res.status(403).json({ message: "Super-Admin-Berechtigung konnte nicht bestätigt werden." });
  }
}
