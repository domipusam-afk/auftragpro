import type { Request } from "express";
import { getServiceRoleClient } from "../supabase";

export interface AuditOptions {
  tenantId?: string | null;
  betroffeneEntitaet?: string | null;
  entitaetId?: string | null;
  metadaten?: Record<string, unknown> | null;
}

/** Writes security-relevant actions without ever persisting credentials. */
export async function logAuditEvent(req: Request, aktion: string, beschreibung: string, opts: AuditOptions = {}): Promise<void> {
  const benutzerId = req.superAdmin?.id || req.auth?.userId;
  if (!benutzerId) return;
  try {
    const forwarded = req.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || req.ip || null;
    const { error } = await getServiceRoleClient().from("super_admin_audit_log").insert({
      benutzer_id: benutzerId,
      aktion,
      tenant_id: opts.tenantId || null,
      betroffene_entitaet: opts.betroffeneEntitaet || null,
      entitaet_id: opts.entitaetId || null,
      beschreibung,
      metadaten: opts.metadaten || null,
      ip_adresse: ip,
      user_agent: req.get("user-agent") || null,
    });
    if (error) console.error("[SUPER_ADMIN_AUDIT]", error.message);
  } catch (error) {
    console.error("[SUPER_ADMIN_AUDIT]", error);
  }
}
