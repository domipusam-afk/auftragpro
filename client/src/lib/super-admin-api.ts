import { apiRequest, ApiRequestError } from "./queryClient";

const ADMIN_SESSION_KEY = "ap_admin_session";
const ADMIN_SESSION_EXPIRED_EVENT = "auftragpro:admin-session-expired";

function store(): Storage | null {
  try { return (window as any)["session" + "Storage"] as Storage; } catch { return null; }
}

export function getAdminSessionToken(): string | null { return store()?.getItem(ADMIN_SESSION_KEY) || null; }
export function setAdminSessionToken(token: string): void { store()?.setItem(ADMIN_SESSION_KEY, token); }
export function clearAdminSessionToken(): void { store()?.removeItem(ADMIN_SESSION_KEY); }

function rememberRollingToken(response: Response): void {
  const token = response.headers.get("x-admin-session");
  if (token) setAdminSessionToken(token);
}

export class AdminSessionExpiredError extends Error {
  constructor() { super("Die Admin-Sitzung ist abgelaufen."); }
}

export function onAdminSessionExpired(listener: () => void): () => void {
  window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, listener);
}

export async function superAdminRequest<T>(
  method: string,
  path: string,
  data?: unknown,
  includeAdminSession = true,
): Promise<T> {
  const token = includeAdminSession ? getAdminSessionToken() : null;
  try {
    const response = await apiRequest(method, `/api/super-admin${path}`, data, {
      headers: token ? { "X-Admin-Session": token } : {},
    });
    rememberRollingToken(response);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401 && error.body?.reason === "admin_session_expired") {
      clearAdminSessionToken();
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
      throw new AdminSessionExpiredError();
    }
    throw error;
  }
}

export interface SuperAdminSessionStatus { passwortGesetzt: boolean; sessionAktiv: boolean; sessionAblaufIn?: number; }
export interface Tenant { id: string; name: string; slug: string; status: "aktiv" | "inaktiv"; erstellt_am?: string; aktualisiert_am?: string; mitarbeiterAnzahl?: number; aktiveMitarbeiter?: number; letzteAktivitaet?: string; }
export interface AdminUser { id: string; email: string; name: string; rolle: "admin" | "mitarbeiter"; aktiv: boolean; erstellt?: string; aktualisiert?: string; }
export interface AuditEntry { id: string; benutzer_id: string; benutzerName?: string; aktion: string; tenant_id: string | null; beschreibung: string; ip_adresse: string | null; zeitstempel: string; }

export const superAdminApi = {
  status: () => superAdminRequest<SuperAdminSessionStatus>("GET", "/session/status", undefined, false),
  setupPassword: (passwort: string) => superAdminRequest<{ ok: boolean }>("POST", "/session/setup-password", { passwort }, false),
  changePassword: (altesPasswort: string, neuesPasswort: string) => superAdminRequest<{ ok: boolean }>("POST", "/session/change-password", { altesPasswort, neuesPasswort }, false),
  verify: (passwort: string) => superAdminRequest<{ ok: boolean; adminSessionToken: string }>("POST", "/session/verify", { passwort }, false),
  logout: () => superAdminRequest<{ ok: boolean }>("POST", "/session/logout", undefined, false),
  overview: () => superAdminRequest<{ tenants: Tenant[]; gesamtTenants: number; gesamtBenutzer: number; letzteAuditEintraege: AuditEntry[] }>("GET", "/overview"),
  tenants: () => superAdminRequest<Tenant[]>("GET", "/tenants"),
  tenant: (id: string) => superAdminRequest<{ tenant: Tenant; einstellungen: Record<string, string>; mitarbeiterSummary: { gesamt: number; aktiv: number; admins: number } }>("GET", `/tenants/${id}`),
  createTenant: (data: { name: string; slug: string; adminEmail: string; adminName: string; adminPasswort: string }) => superAdminRequest<{ tenant: Tenant; admin: { email: string; benutzerId: string } }>("POST", "/tenants", data),
  updateTenant: (id: string, data: Partial<Pick<Tenant, "name" | "slug" | "status">>) => superAdminRequest<{ tenant: Tenant }>("PATCH", `/tenants/${id}`, data),
  setTenantStatus: (id: string, active: boolean) => superAdminRequest<{ tenant: Tenant }>("POST", `/tenants/${id}/${active ? "activate" : "deactivate"}`),
  deleteTenant: (id: string) => superAdminRequest<{ ok: boolean }>("DELETE", `/tenants/${id}`),
  users: (tenantId: string) => superAdminRequest<AdminUser[]>("GET", `/tenants/${tenantId}/benutzer`),
  createUser: (tenantId: string, data: { email: string; name: string; rolle: "admin" | "mitarbeiter"; passwort: string }) => superAdminRequest<{ benutzer: AdminUser; temporaeresPasswort: string }>("POST", `/tenants/${tenantId}/benutzer`, data),
  updateUser: (tenantId: string, userId: string, data: Partial<Pick<AdminUser, "name" | "rolle" | "aktiv">>) => superAdminRequest<{ benutzer: AdminUser }>("PATCH", `/tenants/${tenantId}/benutzer/${userId}`, data),
  resetPassword: (tenantId: string, userId: string, neuesPasswort: string) => superAdminRequest<{ ok: boolean; temporaeresPasswort: string }>("POST", `/tenants/${tenantId}/benutzer/${userId}/reset-password`, { neuesPasswort }),
  branding: (tenantId: string) => superAdminRequest<{ firmenname: string; firmenlogo: string | null; farbe_primaer: string; produktname: string }>("GET", `/tenants/${tenantId}/branding`),
  updateBranding: (tenantId: string, data: Record<string, unknown>) => superAdminRequest<{ ok: boolean }>("PATCH", `/tenants/${tenantId}/branding`, data),
  audit: (limit: number, offset: number, tenantId?: string) => superAdminRequest<{ eintraege: AuditEntry[]; gesamtzahl: number }>("GET", `/audit-log?limit=${limit}&offset=${offset}${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ""}`),
};
