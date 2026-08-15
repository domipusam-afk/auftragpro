import type { Express, Request, RequestHandler, Response } from "express";
import bcrypt from "bcryptjs";
import { getServiceRoleClient } from "../supabase";
import { requireAuth } from "../auth-middleware";
import { logAuditEvent } from "./audit";
import { requireSuperAdmin } from "./require-super-admin";
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminSessionTtl,
  readAdminSession,
  requireAdminSession,
  setAdminSessionCookie,
} from "./require-admin-session";

type TenantStatus = "aktiv" | "inaktiv";
type TenantRole = "admin" | "mitarbeiter";

const ADMIN_SESSION_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_SESSION_MAX_FAILURES = 5;
const verifyFailures = new Map<string, number[]>();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedSlug(value: unknown, fallbackName?: string): string | null {
  const input = typeof value === "string" && value.trim() ? value.trim() : fallbackName || "";
  const slug = slugify(input);
  return slug && SLUG_PATTERN.test(slug) ? slug : null;
}

function passwordValid(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function adminPasswordSetValid(value: unknown): value is string {
  return passwordValid(value);
}

function logoDataUrlIsValid(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) return false;
  const encoded = value.slice(value.indexOf(",") + 1);
  try {
    return Buffer.from(encoded, "base64").byteLength <= 500 * 1024;
  } catch {
    return false;
  }
}

async function tenantOr404(res: Response, tenantId: string) {
  const { data, error } = await getServiceRoleClient()
    .from("tenants")
    .select("id, name, slug, status, erstellt_am, aktualisiert_am")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    res.status(404).json({ message: "Firma nicht gefunden." });
    return null;
  }
  return data;
}

async function usersByTenant(tenantId?: string) {
  let query = getServiceRoleClient()
    .from("app_benutzer")
    .select("id, benutzername, rolle, aktiv, tenant_id, erstellt, aktualisiert")
    .order("erstellt", { ascending: true });
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function namesForUsers(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!ids.length) return result;
  const { data, error } = await getServiceRoleClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const wanted = new Set(ids);
  for (const user of data.users) {
    if (wanted.has(user.id)) {
      const candidate = user.user_metadata?.name;
      if (typeof candidate === "string" && candidate.trim()) result.set(user.id, candidate.trim());
    }
  }
  return result;
}

async function userView(rows: Awaited<ReturnType<typeof usersByTenant>>) {
  const names = await namesForUsers(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    email: row.benutzername,
    name: names.get(row.id) || row.benutzername,
    rolle: row.rolle,
    aktiv: row.aktiv,
    tenantId: row.tenant_id,
    erstellt: row.erstellt,
    aktualisiert: row.aktualisiert,
  }));
}

function verifyFailureStatus(userId: string): { blocked: boolean; retryAfter: number } {
  const now = Date.now();
  const active = (verifyFailures.get(userId) || []).filter((time) => now - time < ADMIN_SESSION_FAILURE_WINDOW_MS);
  verifyFailures.set(userId, active);
  if (active.length < ADMIN_SESSION_MAX_FAILURES) return { blocked: false, retryAfter: 0 };
  return { blocked: true, retryAfter: Math.max(1, Math.ceil((ADMIN_SESSION_FAILURE_WINDOW_MS - (now - active[0])) / 1000)) };
}

function registerVerifyFailure(userId: string): void {
  const now = Date.now();
  const active = (verifyFailures.get(userId) || []).filter((time) => now - time < ADMIN_SESSION_FAILURE_WINDOW_MS);
  active.push(now);
  verifyFailures.set(userId, active);
}

function protectedRoute(...handlers: RequestHandler[]): RequestHandler[] {
  return [requireAuth, requireSuperAdmin, ...handlers];
}

function securedRoute(...handlers: RequestHandler[]): RequestHandler[] {
  return [requireAuth, requireSuperAdmin, requireAdminSession, ...handlers];
}

export function registerSuperAdminRoutes(app: Express): void {
  app.post("/api/super-admin/session/setup-password", ...protectedRoute(async (req, res) => {
    try {
      const passwort = req.body?.passwort;
      if (!adminPasswordSetValid(passwort)) {
        return res.status(400).json({ message: "Das Admin-Passwort muss mindestens 10 Zeichen, einen Buchstaben und eine Ziffer enthalten." });
      }
      const client = getServiceRoleClient();
      const { data: existing, error } = await client
        .from("super_admin_settings")
        .select("admin_passwort_hash")
        .eq("benutzer_id", req.superAdmin!.id)
        .maybeSingle();
      if (error) throw error;
      if (existing?.admin_passwort_hash) return res.status(409).json({ message: "Ein Admin-Passwort ist bereits gesetzt." });
      const { error: upsertError } = await client.from("super_admin_settings").upsert({
        benutzer_id: req.superAdmin!.id,
        admin_passwort_hash: await bcrypt.hash(passwort, 12),
        aktualisiert_am: new Date().toISOString(),
      });
      if (upsertError) throw upsertError;
      await logAuditEvent(req, "admin.password_set", "Zusätzliches Admin-Passwort gesetzt", { betroffeneEntitaet: "admin", entitaetId: req.superAdmin!.id });
      return res.json({ ok: true });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.post("/api/super-admin/session/change-password", ...protectedRoute(async (req, res) => {
    try {
      const { altesPasswort, neuesPasswort } = req.body || {};
      if (!adminPasswordSetValid(neuesPasswort)) return res.status(400).json({ message: "Das neue Admin-Passwort muss mindestens 10 Zeichen, einen Buchstaben und eine Ziffer enthalten." });
      const client = getServiceRoleClient();
      const { data: settings, error } = await client.from("super_admin_settings")
        .select("admin_passwort_hash").eq("benutzer_id", req.superAdmin!.id).maybeSingle();
      if (error) throw error;
      if (!settings?.admin_passwort_hash) return res.status(400).json({ message: "Bitte zuerst ein Admin-Passwort festlegen." });
      if (typeof altesPasswort !== "string" || !(await bcrypt.compare(altesPasswort, settings.admin_passwort_hash))) {
        return res.status(401).json({ message: "Das bisherige Admin-Passwort ist nicht korrekt." });
      }
      const { error: updateError } = await client.from("super_admin_settings")
        .update({ admin_passwort_hash: await bcrypt.hash(neuesPasswort, 12), aktualisiert_am: new Date().toISOString() })
        .eq("benutzer_id", req.superAdmin!.id);
      if (updateError) throw updateError;
      await logAuditEvent(req, "admin.password_changed", "Zusätzliches Admin-Passwort geändert", { betroffeneEntitaet: "admin", entitaetId: req.superAdmin!.id });
      return res.json({ ok: true });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.post("/api/super-admin/session/verify", ...protectedRoute(async (req, res) => {
    try {
      const blocked = verifyFailureStatus(req.superAdmin!.id);
      if (blocked.blocked) {
        res.setHeader("Retry-After", String(blocked.retryAfter));
        return res.status(429).json({ message: "Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen.", retryAfter: blocked.retryAfter });
      }
      const { passwort } = req.body || {};
      const { data: settings, error } = await getServiceRoleClient().from("super_admin_settings")
        .select("admin_passwort_hash").eq("benutzer_id", req.superAdmin!.id).maybeSingle();
      if (error) throw error;
      if (!settings?.admin_passwort_hash) return res.status(400).json({ message: "Es wurde noch kein Admin-Passwort festgelegt." });
      if (typeof passwort !== "string" || !(await bcrypt.compare(passwort, settings.admin_passwort_hash))) {
        registerVerifyFailure(req.superAdmin!.id);
        return res.status(401).json({ message: "Admin-Passwort nicht korrekt." });
      }
      verifyFailures.delete(req.superAdmin!.id);
      const adminSessionToken = createAdminSessionToken(req.superAdmin!.id);
      setAdminSessionCookie(res, adminSessionToken);
      return res.json({ ok: true, adminSessionToken, expiresIn: 15 * 60 });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.get("/api/super-admin/session/status", ...protectedRoute(async (req, res) => {
    try {
      const { data, error } = await getServiceRoleClient().from("super_admin_settings")
        .select("admin_passwort_hash").eq("benutzer_id", req.superAdmin!.id).maybeSingle();
      if (error) throw error;
      const sessionAblaufIn = getAdminSessionTtl(req, req.superAdmin!.id);
      return res.json({ passwortGesetzt: Boolean(data?.admin_passwort_hash), sessionAktiv: sessionAblaufIn !== undefined, ...(sessionAblaufIn !== undefined ? { sessionAblaufIn } : {}) });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.post("/api/super-admin/session/logout", ...protectedRoute(async (_req, res) => {
    clearAdminSessionCookie(res);
    return res.json({ ok: true });
  }));

  app.get("/api/super-admin/overview", ...securedRoute(async (_req, res) => {
    try {
      const client = getServiceRoleClient();
      const [{ data: tenants, error: tenantsError }, usersResult, { data: audits, error: auditsError }] = await Promise.all([
        client.from("tenants").select("id, name, slug, status, erstellt_am, aktualisiert_am").order("name"),
        usersByTenant(),
        client.from("super_admin_audit_log").select("id, benutzer_id, aktion, tenant_id, betroffene_entitaet, entitaet_id, beschreibung, metadaten, ip_adresse, user_agent, zeitstempel").order("zeitstempel", { ascending: false }).limit(10),
      ]);
      if (tenantsError) throw tenantsError;
      if (auditsError) throw auditsError;
      const users = usersResult;
      const auditByTenant = new Map<string, string>();
      for (const audit of audits || []) if (audit.tenant_id && !auditByTenant.has(audit.tenant_id)) auditByTenant.set(audit.tenant_id, audit.zeitstempel);
      const tenantRows = (tenants || []).map((tenant) => {
        const memberRows = users.filter((user) => user.tenant_id === tenant.id);
        return { ...tenant, mitarbeiterAnzahl: memberRows.length, aktiveMitarbeiter: memberRows.filter((user) => user.aktiv).length, letzteAktivitaet: auditByTenant.get(tenant.id) || tenant.aktualisiert_am || tenant.erstellt_am };
      });
      const actorNames = await namesForUsers((audits || []).map((audit) => audit.benutzer_id));
      return res.json({ tenants: tenantRows, gesamtTenants: tenantRows.length, gesamtBenutzer: users.length, letzteAuditEintraege: (audits || []).map((audit) => ({ ...audit, benutzerName: actorNames.get(audit.benutzer_id) || audit.benutzer_id })) });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.get("/api/super-admin/tenants", ...securedRoute(async (_req, res) => {
    try {
      const [{ data: tenants, error }, users] = await Promise.all([
        getServiceRoleClient().from("tenants").select("id, name, slug, status, erstellt_am, aktualisiert_am").order("name"),
        usersByTenant(),
      ]);
      if (error) throw error;
      return res.json((tenants || []).map((tenant) => ({ ...tenant, mitarbeiterAnzahl: users.filter((user) => user.tenant_id === tenant.id).length, aktiveMitarbeiter: users.filter((user) => user.tenant_id === tenant.id && user.aktiv).length })));
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.get("/api/super-admin/tenants/:id", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.id));
      if (!tenant) return;
      const [users, settingsResult] = await Promise.all([
        usersByTenant(tenant.id),
        getServiceRoleClient().from("einstellungen").select("schluessel, wert").eq("tenant_id", tenant.id),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      return res.json({ tenant, einstellungen: Object.fromEntries((settingsResult.data || []).map((entry) => [entry.schluessel, entry.wert])), mitarbeiterSummary: { gesamt: users.length, aktiv: users.filter((user) => user.aktiv).length, admins: users.filter((user) => user.rolle === "admin").length } });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.post("/api/super-admin/tenants", ...securedRoute(async (req, res) => {
    let authUserId: string | null = null;
    let tenantId: string | null = null;
    try {
      const { name, slug, adminEmail, adminName, adminPasswort } = req.body || {};
      if (typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Firmenname ist erforderlich." });
      const resolvedSlug = normalizedSlug(slug, name);
      const email = normalizeEmail(adminEmail);
      if (!resolvedSlug) return res.status(400).json({ message: "Der Firmen-Slug ist ungültig." });
      if (!email || typeof adminName !== "string" || !adminName.trim()) return res.status(400).json({ message: "Name und gültige E-Mail des Administrators sind erforderlich." });
      if (!passwordValid(adminPasswort)) return res.status(400).json({ message: "Das temporäre Passwort muss mindestens 10 Zeichen, einen Buchstaben und eine Ziffer enthalten." });
      const client = getServiceRoleClient();
      const { data: duplicate, error: duplicateError } = await client.from("tenants").select("id").eq("slug", resolvedSlug).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return res.status(409).json({ message: "Dieser Firmen-Slug ist bereits vergeben." });

      const { data: authCreated, error: authError } = await client.auth.admin.createUser({ email, password: adminPasswort, email_confirm: true, user_metadata: { name: adminName.trim() } });
      if (authError || !authCreated.user) return res.status(400).json({ message: `Admin-Konto konnte nicht angelegt werden: ${authError?.message || "unbekannter Fehler"}` });
      authUserId = authCreated.user.id;
      const { data: tenant, error: tenantError } = await client.from("tenants").insert({ name: name.trim(), slug: resolvedSlug, status: "aktiv" }).select("id, name, slug, status, erstellt_am, aktualisiert_am").single();
      if (tenantError) throw tenantError;
      tenantId = tenant.id;
      const adminPasswortHash = await bcrypt.hash(adminPasswort, 12);
      const [{ error: settingsError }, { error: userError }, { error: membershipError }, { error: stundensaetzeError }, { error: statusPipelineError }] = await Promise.all([
        client.from("einstellungen").insert([
          { tenant_id: tenant.id, schluessel: "firmenname", wert: name.trim() },
          { tenant_id: tenant.id, schluessel: "firmenlogo", wert: "" },
          { tenant_id: tenant.id, schluessel: "farbe_primaer", wert: "#01696F" },
          { tenant_id: tenant.id, schluessel: "produktname", wert: "AuftragsPro" },
          { tenant_id: tenant.id, schluessel: "mwst_satz", wert: "8.1" },
          { tenant_id: tenant.id, schluessel: "wochenstunden", wert: "42" },
        ]),
        client.from("app_benutzer").insert({ id: authUserId, benutzername: email, passwort_hash: adminPasswortHash, rolle: "admin", tenant_id: tenant.id, aktiv: true }),
        client.from("tenant_memberships").insert({ user_id: authUserId, tenant_id: tenant.id, rolle: "admin", aktiv: true, berechtigungen: {} }),
        client.from("stundensaetze").insert([
          { ort: "Avor", maschinenpark: null, satz: 105, bezeichnung: "Arbeitsvorbereitung", grundsatz: null, tenant_id: tenant.id },
          { ort: "Montage", maschinenpark: null, satz: 130, bezeichnung: "Montage vor Ort", grundsatz: null, tenant_id: tenant.id },
          { ort: "Werkstatt", maschinenpark: "Kleine Maschinen", satz: 10, bezeichnung: "Kleine Maschinen (Säge, Bohrer...)", grundsatz: 115, tenant_id: tenant.id },
          { ort: "Werkstatt", maschinenpark: "Mittlere Maschinen", satz: 20, bezeichnung: "Mittlere Maschinen (Biegemaschine...)", grundsatz: 115, tenant_id: tenant.id },
          { ort: "Werkstatt", maschinenpark: "Grosse Maschinen", satz: 90, bezeichnung: "Grosse Maschinen (CNC, Laser...)", grundsatz: 115, tenant_id: tenant.id },
        ]),
        client.from("auftrag_status_pipeline").insert([
          { tenant_id: tenant.id, label: "Anfrage", reihenfolge: 1, farbe: "orange" },
          { tenant_id: tenant.id, label: "Angebot", reihenfolge: 2, farbe: "blue" },
          { tenant_id: tenant.id, label: "Bestätigt", reihenfolge: 3, farbe: "purple" },
          { tenant_id: tenant.id, label: "In Arbeit", reihenfolge: 4, farbe: "teal" },
          { tenant_id: tenant.id, label: "Rechnung", reihenfolge: 5, farbe: "indigo" },
          { tenant_id: tenant.id, label: "Abgeschlossen", reihenfolge: 6, farbe: "green" },
        ]),
      ]);
      if (settingsError || userError || membershipError || stundensaetzeError || statusPipelineError) {
        throw new Error(settingsError?.message || userError?.message || membershipError?.message || stundensaetzeError?.message || statusPipelineError?.message);
      }
      await logAuditEvent(req, "tenant.create", `Neue Firma '${tenant.name}' angelegt`, { tenantId: tenant.id, betroffeneEntitaet: "tenant", entitaetId: tenant.id });
      await logAuditEvent(req, "user.create", `Administrator '${email}' für '${tenant.name}' angelegt`, { tenantId: tenant.id, betroffeneEntitaet: "user", entitaetId: authUserId });
      return res.status(201).json({ tenant, admin: { email, benutzerId: authUserId } });
    } catch (error) {
      const client = getServiceRoleClient();
      if (tenantId) {
        await client.from("auftrag_status_pipeline").delete().eq("tenant_id", tenantId);
        await client.from("stundensaetze").delete().eq("tenant_id", tenantId);
        await client.from("einstellungen").delete().eq("tenant_id", tenantId);
        await client.from("tenant_memberships").delete().eq("tenant_id", tenantId);
        await client.from("app_benutzer").delete().eq("tenant_id", tenantId);
        await client.from("tenants").delete().eq("id", tenantId);
      }
      if (authUserId) await client.auth.admin.deleteUser(authUserId);
      return res.status(500).json({ message: `Firma konnte nicht vollständig angelegt werden: ${message(error)}` });
    }
  }));

  app.patch("/api/super-admin/tenants/:id", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.id));
      if (!tenant) return;
      const { name, slug, status } = req.body || {};
      const updates: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() };
      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Firmenname ist ungültig." });
        updates.name = name.trim();
      }
      if (slug !== undefined) {
        const resolvedSlug = normalizedSlug(slug);
        if (!resolvedSlug) return res.status(400).json({ message: "Firmen-Slug ist ungültig." });
        const { data: collision, error } = await getServiceRoleClient().from("tenants").select("id").eq("slug", resolvedSlug).neq("id", tenant.id).maybeSingle();
        if (error) throw error;
        if (collision) return res.status(409).json({ message: "Dieser Firmen-Slug ist bereits vergeben." });
        updates.slug = resolvedSlug;
      }
      if (status !== undefined) {
        if (status !== "aktiv" && status !== "inaktiv") return res.status(400).json({ message: "Status muss aktiv oder inaktiv sein." });
        updates.status = status as TenantStatus;
      }
      if (Object.keys(updates).length === 1) return res.status(400).json({ message: "Keine gültigen Änderungen übermittelt." });
      const { data, error } = await getServiceRoleClient().from("tenants").update(updates).eq("id", tenant.id).select("id, name, slug, status, erstellt_am, aktualisiert_am").single();
      if (error) throw error;
      const action = updates.status !== undefined ? "tenant.status_change" : "tenant.rename";
      const description = updates.status !== undefined ? `Firma '${data.name}' auf '${data.status}' gesetzt` : `Firma '${tenant.name}' bearbeitet`;
      await logAuditEvent(req, action, description, { tenantId: tenant.id, betroffeneEntitaet: "tenant", entitaetId: tenant.id, metadaten: { geaenderteFelder: Object.keys(updates).filter((key) => key !== "aktualisiert_am") } });
      return res.json({ tenant: data });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  const setTenantStatus = (status: TenantStatus) => async (req: Request, res: Response) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.id));
      if (!tenant) return;
      const { data, error } = await getServiceRoleClient().from("tenants").update({ status, aktualisiert_am: new Date().toISOString() }).eq("id", tenant.id).select("id, name, slug, status").single();
      if (error) throw error;
      await logAuditEvent(req, status === "aktiv" ? "tenant.activate" : "tenant.deactivate", `Firma '${tenant.name}' ${status === "aktiv" ? "aktiviert" : "deaktiviert"}`, { tenantId: tenant.id, betroffeneEntitaet: "tenant", entitaetId: tenant.id });
      return res.json({ tenant: data });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  };
  app.post("/api/super-admin/tenants/:id/activate", ...securedRoute(setTenantStatus("aktiv")));
  app.post("/api/super-admin/tenants/:id/deactivate", ...securedRoute(setTenantStatus("inaktiv")));

  app.get("/api/super-admin/tenants/:tenantId/benutzer", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.tenantId));
      if (!tenant) return;
      return res.json(await userView(await usersByTenant(tenant.id)));
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.post("/api/super-admin/tenants/:tenantId/benutzer", ...securedRoute(async (req, res) => {
    let authUserId: string | null = null;
    try {
      const tenant = await tenantOr404(res, String(req.params.tenantId));
      if (!tenant) return;
      const { email: rawEmail, name, rolle, passwort } = req.body || {};
      const email = normalizeEmail(rawEmail);
      if (!email || typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Name und gültige E-Mail sind erforderlich." });
      if (rolle !== "admin" && rolle !== "mitarbeiter") return res.status(400).json({ message: "Ungültige Rolle." });
      if (!passwordValid(passwort)) return res.status(400).json({ message: "Das temporäre Passwort muss mindestens 10 Zeichen, einen Buchstaben und eine Ziffer enthalten." });
      const client = getServiceRoleClient();
      const { data: authCreated, error: authError } = await client.auth.admin.createUser({ email, password: passwort, email_confirm: true, user_metadata: { name: name.trim() } });
      if (authError || !authCreated.user) return res.status(400).json({ message: `Benutzer konnte nicht angelegt werden: ${authError?.message || "unbekannter Fehler"}` });
      authUserId = authCreated.user.id;
      const passwortHash = await bcrypt.hash(passwort, 12);
      const [{ error: userError }, { error: membershipError }] = await Promise.all([
        client.from("app_benutzer").insert({ id: authUserId, benutzername: email, passwort_hash: passwortHash, rolle: rolle as TenantRole, tenant_id: tenant.id, aktiv: true }),
        client.from("tenant_memberships").insert({ user_id: authUserId, tenant_id: tenant.id, rolle: rolle as TenantRole, aktiv: true, berechtigungen: {} }),
      ]);
      if (userError || membershipError) throw new Error(userError?.message || membershipError?.message);
      await logAuditEvent(req, "user.create", `Benutzer '${email}' für '${tenant.name}' angelegt`, { tenantId: tenant.id, betroffeneEntitaet: "user", entitaetId: authUserId });
      return res.status(201).json({ benutzer: { id: authUserId, email, name: name.trim(), rolle }, temporaeresPasswort: passwort });
    } catch (error) {
      if (authUserId) await getServiceRoleClient().auth.admin.deleteUser(authUserId);
      return res.status(500).json({ message: `Benutzer konnte nicht vollständig angelegt werden: ${message(error)}` });
    }
  }));

  app.patch("/api/super-admin/tenants/:tenantId/benutzer/:id", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.tenantId));
      if (!tenant) return;
      const { name, rolle, aktiv } = req.body || {};
      const appUpdates: Record<string, unknown> = { aktualisiert: new Date().toISOString() };
      const membershipUpdates: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() };
      if (rolle !== undefined) {
        if (rolle !== "admin" && rolle !== "mitarbeiter") return res.status(400).json({ message: "Ungültige Rolle." });
        appUpdates.rolle = rolle;
        membershipUpdates.rolle = rolle;
      }
      if (aktiv !== undefined) {
        if (typeof aktiv !== "boolean") return res.status(400).json({ message: "Aktiv muss ein Boolean sein." });
        appUpdates.aktiv = aktiv;
        membershipUpdates.aktiv = aktiv;
      }
      if (typeof name === "string" && name.trim()) await getServiceRoleClient().auth.admin.updateUserById(String(req.params.id), { user_metadata: { name: name.trim() } });
      if (Object.keys(appUpdates).length === 1 && name === undefined) return res.status(400).json({ message: "Keine gültigen Änderungen übermittelt." });
      const client = getServiceRoleClient();
      const { data, error } = await client.from("app_benutzer").update(appUpdates).eq("id", String(req.params.id)).eq("tenant_id", tenant.id).select("id, benutzername, rolle, aktiv").maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Benutzer nicht gefunden." });
      if (Object.keys(membershipUpdates).length > 1) {
        const { error: membershipError } = await client.from("tenant_memberships").update(membershipUpdates).eq("user_id", String(req.params.id)).eq("tenant_id", tenant.id);
        if (membershipError) throw membershipError;
      }
      await logAuditEvent(req, "user.update", `Benutzer '${data.benutzername}' für '${tenant.name}' bearbeitet`, { tenantId: tenant.id, betroffeneEntitaet: "user", entitaetId: data.id, metadaten: { geaenderteFelder: [name !== undefined ? "name" : null, rolle !== undefined ? "rolle" : null, aktiv !== undefined ? "aktiv" : null].filter(Boolean) } });
      return res.json({ benutzer: { id: data.id, email: data.benutzername, name: typeof name === "string" && name.trim() ? name.trim() : data.benutzername, rolle: data.rolle, aktiv: data.aktiv } });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.post("/api/super-admin/tenants/:tenantId/benutzer/:id/reset-password", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.tenantId));
      if (!tenant) return;
      const neuesPasswort = req.body?.neuesPasswort;
      if (!passwordValid(neuesPasswort)) return res.status(400).json({ message: "Das neue Passwort muss mindestens 10 Zeichen, einen Buchstaben und eine Ziffer enthalten." });
      const client = getServiceRoleClient();
      const { data: user, error } = await client.from("app_benutzer").select("id, benutzername").eq("id", String(req.params.id)).eq("tenant_id", tenant.id).maybeSingle();
      if (error) throw error;
      if (!user) return res.status(404).json({ message: "Benutzer nicht gefunden." });
      const { error: authError } = await client.auth.admin.updateUserById(user.id, { password: neuesPasswort });
      if (authError) throw authError;
      const neuesPasswortHash = await bcrypt.hash(neuesPasswort, 12);
      const { error: hashError } = await client.from("app_benutzer").update({ passwort_hash: neuesPasswortHash, aktualisiert: new Date().toISOString() }).eq("id", user.id);
      if (hashError) throw hashError;
      await logAuditEvent(req, "user.reset_password", `Passwort für '${user.benutzername}' zurückgesetzt`, { tenantId: tenant.id, betroffeneEntitaet: "user", entitaetId: user.id });
      return res.json({ ok: true, temporaeresPasswort: neuesPasswort });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.get("/api/super-admin/tenants/:tenantId/branding", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.tenantId));
      if (!tenant) return;
      const { data, error } = await getServiceRoleClient().from("einstellungen").select("schluessel, wert").eq("tenant_id", tenant.id).in("schluessel", ["firmenname", "firmenlogo", "farbe_primaer", "produktname"]);
      if (error) throw error;
      const rows = Object.fromEntries((data || []).map((entry) => [entry.schluessel, entry.wert]));
      return res.json({ firmenname: rows.firmenname || tenant.name, firmenlogo: rows.firmenlogo || null, farbe_primaer: rows.farbe_primaer || "#01696F", produktname: rows.produktname || "AuftragsPro" });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.patch("/api/super-admin/tenants/:tenantId/branding", ...securedRoute(async (req, res) => {
    try {
      const tenant = await tenantOr404(res, String(req.params.tenantId));
      if (!tenant) return;
      const body = req.body || {};
      const allowed = ["firmenname", "firmenlogo", "farbe_primaer", "produktname"] as const;
      const changed = allowed.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
      if (!changed.length) return res.status(400).json({ message: "Keine Branding-Änderung übermittelt." });
      if (body.firmenname !== undefined && (typeof body.firmenname !== "string" || !body.firmenname.trim())) return res.status(400).json({ message: "Firmenname ist ungültig." });
      if (body.produktname !== undefined && (typeof body.produktname !== "string" || !body.produktname.trim())) return res.status(400).json({ message: "Produktname ist ungültig." });
      if (body.farbe_primaer !== undefined && (typeof body.farbe_primaer !== "string" || !HEX_COLOR_PATTERN.test(body.farbe_primaer))) return res.status(400).json({ message: "Die Primärfarbe muss im Format #RRGGBB angegeben werden." });
      if (body.firmenlogo !== undefined && !logoDataUrlIsValid(body.firmenlogo)) return res.status(400).json({ message: "Das Logo muss ein PNG-, JPEG- oder WebP-Data-URL mit maximal 500 KB sein." });
      const rows = changed.map((field) => ({ tenant_id: tenant.id, schluessel: field, wert: body[field] === null ? "" : String(body[field]).trim() }));
      const { error } = await getServiceRoleClient().from("einstellungen").upsert(rows, { onConflict: "tenant_id,schluessel" });
      if (error) throw error;
      if (body.firmenname !== undefined) await getServiceRoleClient().from("tenants").update({ name: body.firmenname.trim(), aktualisiert_am: new Date().toISOString() }).eq("id", tenant.id);
      await logAuditEvent(req, "branding.update", `Branding für '${tenant.name}' aktualisiert`, { tenantId: tenant.id, betroffeneEntitaet: "branding", entitaetId: tenant.id, metadaten: { geaenderteFelder: changed } });
      return res.json({ ok: true });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));

  app.get("/api/super-admin/audit-log", ...securedRoute(async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "50"), 10) || 50));
      const offset = Math.max(0, Number.parseInt(String(req.query.offset || "0"), 10) || 0);
      const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId ? req.query.tenantId : null;
      const client = getServiceRoleClient();
      let query = client.from("super_admin_audit_log").select("id, benutzer_id, aktion, tenant_id, betroffene_entitaet, entitaet_id, beschreibung, metadaten, ip_adresse, user_agent, zeitstempel", { count: "exact" }).order("zeitstempel", { ascending: false }).range(offset, offset + limit - 1);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error, count } = await query;
      if (error) throw error;
      const names = await namesForUsers((data || []).map((row) => row.benutzer_id));
      return res.json({ eintraege: (data || []).map((entry) => ({ ...entry, benutzerName: names.get(entry.benutzer_id) || entry.benutzer_id })), gesamtzahl: count || 0 });
    } catch (error) { return res.status(500).json({ message: message(error) }); }
  }));
}
