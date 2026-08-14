import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import multer from "multer";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import supabase, { getServiceRoleClient, getSupabaseAuthClient, runWithSupabaseClient } from "./supabase";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { fileURLToPath } from "url";
import { finanzenSummen, berechneVorkalkulationsAngebotspreis, rechnungBruttoBetrag, MWST_SATZ_RECHNUNG } from "../shared/schema";
import { setLegacySessionCookie } from "./legacy-session";
import { getAuthMode } from "./auth-context"; import { STATUS_GESAMT_EXCLUDED, STATUS_IN_BEARBEITUNG } from "../shared/dashboardStatus";
import { createDownloadToken, validateAndConsumeDownloadToken } from "./download-tokens";
import { isRoutePolicyAllowed, matchRoutePolicy } from "./route-policy";
import {
  isDashboardReminderSettingId,
  isDashboardWidgetId,
  normalizeDashboardPreferences,
  type DashboardPreferences,
  type DashboardReminderSettings,
  type DashboardWidgetId,
} from "../shared/dashboardWidgets";
import { getDefaultTenantId } from "./tenant-context";
import { berechneAuftragIstKosten, ladeFinanzenUebersichtZeilen, stundensatzFuer, zurichKalenderjahr } from "./deckungsbeitrag";
import { berechneAuftragVorkalkulation } from "./vorkalkulation";
import { registerSuperAdminRoutes } from "./super-admin/routes";

// Tenant logos are stored as data URLs in the tenant-scoped settings table.
// Only image data URLs are decoded for native PDF rendering; hosted URLs are used by
// HTML PDFs directly and deliberately never fetched server-side.
function logoBytesFromDataUrl(value: string | null | undefined): Uint8Array | null {
  if (!value || !/^data:image\/(?:png|jpe?g);base64,/i.test(value)) return null;
  const encoded = value.slice(value.indexOf(",") + 1);
  try { return new Uint8Array(Buffer.from(encoded, "base64")); } catch { return null; }
}

function getFuhrwerkPath(): string {
  if (typeof __dirname !== "undefined") {
    const p1 = path.join(__dirname, "fuhrwerk-hintergrund.jpg");
    if (fs.existsSync(p1)) return p1;
  }
  try {
    const metaUrl = import.meta?.url;
    if (metaUrl) {
      const p2 = path.join(path.dirname(fileURLToPath(metaUrl)), "fuhrwerk-hintergrund.jpg");
      if (fs.existsSync(p2)) return p2;
    }
  } catch {}
  const candidates = [
    path.join(process.cwd(), "server", "fuhrwerk-hintergrund.jpg"),
    path.join(process.cwd(), "dist", "fuhrwerk-hintergrund.jpg"),
    path.join(process.cwd(), "fuhrwerk-hintergrund.jpg"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function nextNr(prefix: string, list: { nr?: string }[]): string {
  const yy = String(new Date().getFullYear()).slice(-2); // "26"
  const yearPrefix = `${prefix}${yy}`;                  // z.B. "A26"
  let max = 0;
  for (const item of list) {
    const nr = (item.nr || "").toString();
    if (nr.startsWith(yearPrefix)) {
      const num = parseInt(nr.slice(yearPrefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  // Fallback: altes Format "A-YYYY-NNNN" ebenfalls einlesen
  const oldPrefix = `${prefix}-${new Date().getFullYear()}-`;
  for (const item of list) {
    const nr = (item.nr || "").toString();
    if (nr.startsWith(oldPrefix)) {
      const num = parseInt(nr.slice(oldPrefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `${yearPrefix}${String(max + 1).padStart(4, "0")}`;
}

function asError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const obj = e as any;
    // Supabase error objects have .message and .details/.hint
    if (obj.message) {
      const parts = [String(obj.message)];
      if (obj.details) parts.push(`Details: ${obj.details}`);
      if (obj.hint) parts.push(`Hint: ${obj.hint}`);
      if (obj.code) parts.push(`Code: ${obj.code}`);
      return parts.join(' | ');
    }
    return JSON.stringify(e);
  }
  return String(e);
}

type DownloadExportQuery = {
  readonly von?: string;
  readonly bis?: string;
  readonly typ?: string;
  readonly zeitraum?: string;
};

type ExportDownloadInput = {
  readonly query: DownloadExportQuery;
  readonly tenantId?: string;
};

type DocumentDownloadInput = {
  readonly auftragId: string;
  readonly documentId: string;
  readonly tenantId: string;
};

function exportQueryFromRequest(req: Request): DownloadExportQuery {
  const { von, bis, typ, zeitraum } = req.query;
  return {
    von: typeof von === "string" ? von : undefined,
    bis: typeof bis === "string" ? bis : undefined,
    typ: typeof typ === "string" ? typ : undefined,
    zeitraum: typeof zeitraum === "string" ? zeitraum : undefined,
  };
}

function exportQueryFromSearchParams(searchParams: URLSearchParams): DownloadExportQuery {
  return {
    von: searchParams.get("von") || undefined,
    bis: searchParams.get("bis") || undefined,
    typ: searchParams.get("typ") || undefined,
    zeitraum: searchParams.get("zeitraum") || undefined,
  };
}

function allowedDownloadPath(value: unknown): URL | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.length > 2_048) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "http://download.local");
  } catch {
    return null;
  }

  if (parsed.hash) return null;
  const isFibuOrQ3 = parsed.pathname === "/api/export/fibu" || parsed.pathname === "/api/export/q3";
  const isDocument = /^\/api\/auftraege\/[^/?#]+\/dokumente\/[^/?#]+\/download$/.test(parsed.pathname);
  return isFibuOrQ3 || isDocument ? parsed : null;
}

// Helper: generate random backup codes
function generateBackupCodes(): string[] {
  return Array.from({ length: 8 }, () =>
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

// Berechnet das Gültig-bis-Datum einer Offerte. "gueltigkeit" ist entweder ein
// ISO-Datum oder ein Text wie "30 Tage" (relativ zum Offerten-Datum). Gleiche
// Interpretation wie im PDF-Rendering (siehe /api/offerten/:id/pdf).
function berechneGueltigBis(datum: string | null | undefined, gueltigkeit: string | null | undefined): Date | null {
  const basis = datum ? new Date(datum) : new Date();
  if (isNaN(basis.getTime())) return null;
  const raw = String(gueltigkeit || "").trim();
  if (!raw) return null;
  const alsDatum = new Date(raw);
  if (!isNaN(alsDatum.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(raw)) return alsDatum;
  const match = raw.match(/(\d+)\s*Tage?/i);
  if (match) {
    const tage = parseInt(match[1], 10);
    const bis = new Date(basis);
    bis.setDate(bis.getDate() + tage);
    return bis;
  }
  return null;
}

// Setzt offene Offerten, deren Gültigkeit überschritten ist, automatisch auf
// Status "abgelaufen". Wird beim Start und danach periodisch aufgerufen
// (siehe server/index.ts) sowie einmalig bei jedem Aufruf von GET /api/offerten.
export async function markiereAbgelaufeneOfferten(tenantId?: string): Promise<number> {
  let offeneQuery = supabase
    .from("offerten")
    .select("id,datum,gueltigkeit")
    .eq("status", "offen");
  if (tenantId) offeneQuery = offeneQuery.eq("tenant_id", tenantId);
  const { data: offene, error } = await offeneQuery;
  if (error || !offene || offene.length === 0) return 0;
  const heute = new Date();
  const abgelaufeneIds: string[] = [];
  for (const o of offene) {
    const gueltigBis = berechneGueltigBis(o.datum, o.gueltigkeit);
    if (gueltigBis && gueltigBis.getTime() < heute.getTime()) {
      abgelaufeneIds.push(o.id);
    }
  }
  if (abgelaufeneIds.length === 0) return 0;
  let updateQuery = supabase.from("offerten").update({ status: "abgelaufen" }).in("id", abgelaufeneIds);
  if (tenantId) updateQuery = updateQuery.eq("tenant_id", tenantId);
  const { error: updErr } = await updateQuery;
  if (updErr) return 0;
  return abgelaufeneIds.length;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  registerSuperAdminRoutes(app);

  // ============= AUTH =============

  // ─── Login-Sperre (Brute-Force Schutz) ──────────────────────────────────
  // Zählung der Fehlversuche bleibt in-memory (pro IP+Benutzername), aber ab
  // MAX_VERSUCHE wird das Konto dauerhaft in der Datenbank gesperrt (Spalte
  // app_benutzer.gesperrt) statt nur zeitbasiert für 15 Minuten. Eine
  // dauerhafte Sperre kann ausschliesslich ein Admin in der
  // Benutzerverwaltung wieder aufheben (Entsperren oder Passwort-Reset).
  const loginVersuche = new Map<string, { count: number }>();
  const MAX_VERSUCHE = 5;

  function getLoginKey(req: any, benutzername: string) {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "unknown";
    return `${ip}:${benutzername.toLowerCase().trim()}`;
  }

  function registriereFehlversuch(key: string) {
    const e = loginVersuche.get(key) || { count: 0 };
    e.count += 1;
    loginVersuche.set(key, e);
    return e.count;
  }

  // Sperrt das Konto dauerhaft in der DB, sobald MAX_VERSUCHE erreicht ist.
  // Nutzt den Service-Role-Client, da zu diesem Zeitpunkt noch keine
  // authentifizierte Identität existiert (Login ist ja gerade gescheitert).
  async function sperreKontoDauerhaft(normalizedUsername: string) {
    try {
      const client = getAuthMode() === "supabase" ? getServiceRoleClient() : supabase;
      await client
        .from("app_benutzer")
        .update({ gesperrt: true, gesperrt_am: new Date().toISOString() })
        .eq("benutzername", normalizedUsername);
    } catch (e) {
      console.error("[Login-Sperre] Konnte Konto nicht dauerhaft sperren:", e);
    }
  }

  // ─── Sensible Einstellungs-Keys ────────────────────────────────────────
  // Server-Secrets dürfen niemals im Client ausgeliefert oder von Nicht-Admins
  // verändert werden. Login-Hintergrund ist explizit öffentlich zugänglich.
  const SENSITIVE_SETTING_KEYS = new Set<string>([
    "smtp_passwort", "smtp_pass", "app_passwort",
  ]);
  const ADMIN_ONLY_SETTING_KEYS = new Set<string>([
    ...Array.from(SENSITIVE_SETTING_KEYS),
    "smtp_host", "smtp_port", "smtp_user", "smtp_ssl", "smtp_von",
  ]);
  // Branding is readable within the tenant so the whole UI can render it, but only
  // administrators may change it via the regular settings endpoint.
  const BRANDING_SETTING_KEYS = new Set<string>([
    "firmenname", "firmenlogo", "farbe_primaer", "produktname",
  ]);

  async function ladeTenantEinstellungen(identity: DashboardPreferenceIdentity): Promise<Array<{ schluessel: string; wert: string | null }>> {
    const { data, error } = await identity.client
      .from("einstellungen")
      .select("schluessel,wert")
      .eq("tenant_id", identity.tenantId);
    if (error) throw error;
    return (data || []) as Array<{ schluessel: string; wert: string | null }> ;
  }

  function einstellungenMap(rows: Array<{ schluessel: string; wert: string | null }>): Record<string, string> {
    return Object.fromEntries(rows.map((row) => [row.schluessel, row.wert || ""]));
  }

  function firmennameAusSettings(settings: Record<string, string>): string {
    return settings.firmenname?.trim() || "AuftragsPro";
  }
  const PUBLIC_SETTING_KEYS = new Set<string>([
    "login_hintergrund",
  ]);

  // Step 1: Login with username + password. AUTH_MODE is read for every
  // request: legacy keeps the established bcrypt flow below verbatim, while
  // supabase returns the GoTrue session for Bearer-authenticated API calls.
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { benutzername, passwort, vertrauensToken } = req.body;
      if (!benutzername || !passwort)
        return res.status(400).json({ ok: false, message: "Benutzername und Passwort erforderlich" });

      // Exakte Gross-/Kleinschreibung erzwingen: Benutzernamen/E-Mails werden im
      // System immer klein gespeichert. Wer beim Login auch nur einen
      // Grossbuchstaben verwendet, wird abgelehnt statt stillschweigend über
      // GoTrue's case-insensitiven E-Mail-Vergleich hereingelassen zu werden.
      const rawUsername = String(benutzername).trim();
      const normalizedUsername = rawUsername.toLowerCase();
      const key = getLoginKey(req, normalizedUsername);

      const GESPERRT_MSG = "Konto gesperrt wegen zu vieler Fehlversuche. Bitte einen Administrator kontaktieren, um das Konto zu entsperren.";

      // Dauerhafte DB-Sperre hat Vorrang vor allem anderen — unabhängig von IP,
      // Zeit oder korrektem Passwort. Nur ein Admin kann sie aufheben.
      const pruefeDbSperre = async (): Promise<boolean> => {
        try {
          const client = getAuthMode() === "supabase" ? getServiceRoleClient() : supabase;
          const { data } = await client
            .from("app_benutzer")
            .select("gesperrt")
            .eq("benutzername", normalizedUsername)
            .maybeSingle();
          return !!data?.gesperrt;
        } catch {
          return false;
        }
      };
      if (await pruefeDbSperre()) {
        return res.status(423).json({ ok: false, message: GESPERRT_MSG, gesperrt: true, dauerhaft: true });
      }

      // Registriert einen Fehlversuch; sperrt das Konto dauerhaft in der DB,
      // sobald MAX_VERSUCHE erreicht ist, und liefert die passende Antwort.
      const fehlversuch = async () => {
        const count = registriereFehlversuch(key);
        const verbleibend = MAX_VERSUCHE - count;
        if (verbleibend <= 0) {
          await sperreKontoDauerhaft(normalizedUsername);
          loginVersuche.delete(key);
          return res.status(423).json({ ok: false, message: GESPERRT_MSG, gesperrt: true, dauerhaft: true });
        }
        return res.status(401).json({
          ok: false,
          message: `Benutzername oder Passwort falsch (${verbleibend} Versuch${verbleibend === 1 ? "" : "e"} verbleibend)`,
        });
      };

      if (rawUsername !== normalizedUsername) {
        return fehlversuch();
      }

      if (getAuthMode() === "supabase") {
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedUsername);
        let email = normalizedUsername;
        let serviceClient;
        try {
          serviceClient = getServiceRoleClient();
          // Historic non-email login names are resolved before sign-in. Email
          // input deliberately goes straight to GoTrue as the cutover contract
          // requires; the app-user record is still checked by authenticated id.
          if (!isEmail) {
            const { data: legacyUser, error: lookupError } = await serviceClient
              .from("app_benutzer")
              .select("benutzername")
              .eq("benutzername", normalizedUsername)
              .eq("aktiv", true)
              .maybeSingle();
            if (lookupError || !legacyUser || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(legacyUser.benutzername || ""))) {
              return fehlversuch();
            }
            email = String(legacyUser.benutzername).toLowerCase().trim();
          }
        } catch {
          return res.status(503).json({ ok: false, message: "Supabase-Login ist serverseitig noch nicht konfiguriert" });
        }

        const { data: signInData, error: signInError } = await getSupabaseAuthClient().auth.signInWithPassword({
          email,
          password: String(passwort),
        });
        if (signInError || !signInData.session || !signInData.user) {
          return fehlversuch();
        }

        // The UUID is the trust boundary: a matching email alone must never
        // grant access if auth.users and app_benutzer drifted during import.
        const { data: user, error: userError } = await serviceClient
          .from("app_benutzer")
          .select("id, benutzername, rolle, berechtigungen, ist_super_admin")
          .eq("id", signInData.user.id)
          .eq("aktiv", true)
          .maybeSingle();
        if (userError || !user) {
          return res.status(403).json({ ok: false, message: "Für dieses Supabase-Konto ist kein aktiver AuftragsPro-Benutzer vorhanden" });
        }

        loginVersuche.delete(key);
        // Transitional fallback only; Etappe 13 removes this legacy cookie.
        setLegacySessionCookie(res, user.id);
        return res.json({
          ok: true,
          requires2fa: false,
          user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle, berechtigungen: user.berechtigungen || null, ist_super_admin: user.ist_super_admin === true },
          session: {
            access_token: signInData.session.access_token,
            refresh_token: signInData.session.refresh_token,
            expires_at: signInData.session.expires_at,
          },
        });
      }

      const { data: user, error } = await supabase
        .from("app_benutzer")
        .select("*")
        .eq("benutzername", normalizedUsername)
        .eq("aktiv", true)
        .single();

      if (error || !user) {
        return fehlversuch();
      }

      const pwOk = await bcrypt.compare(passwort, user.passwort_hash);
      if (!pwOk) {
        return fehlversuch();
      }

      // Login erfolgreich → Fehlversuche zurücksetzen
      loginVersuche.delete(key);

      // 2FA: prüfen ob Gerät vertrauenswürdig ist
      if (user.totp_aktiv) {
        // Vertrauens-Token prüfen
        if (vertrauensToken && user.vertrauens_tokens) {
          const tokens: any[] = JSON.parse(user.vertrauens_tokens || "[]");
          const now = Date.now();
          const gueltig = tokens.find((t: any) => t.token === vertrauensToken && t.ablauf > now);
          if (gueltig) {
            // Gerät bekannt → kein 2FA nötig
            setLegacySessionCookie(res, user.id);
            return res.json({ ok: true, requires2fa: false, user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle, berechtigungen: user.berechtigungen || null, ist_super_admin: user.ist_super_admin === true } });
          }
        }
        return res.json({ ok: true, requires2fa: true, userId: user.id });
      }

      setLegacySessionCookie(res, user.id);
      return res.json({
        ok: true,
        requires2fa: false,
        user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle, berechtigungen: user.berechtigungen || null, ist_super_admin: user.ist_super_admin === true }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: asError(e) });
    }
  });

  // ─── Passwort vergessen (Self-Service Reset per E-Mail-Link) ──────────────
  // Schritt 1: Nutzer gibt E-Mail ein. Wir erzeugen (falls Konto existiert und
  // SMTP für den Tenant konfiguriert ist) einen kurzlebigen Token und
  // verschicken den Reset-Link. Die Antwort ist bewusst IMMER identisch, damit
  // niemand über diesen Endpoint herausfinden kann, welche E-Mails registriert
  // sind (Enumeration-Schutz).
  app.post("/api/auth/passwort-vergessen", async (req, res) => {
    const genericOk = { ok: true, message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen versendet." };
    try {
      const { benutzername } = req.body;
      if (!benutzername || typeof benutzername !== "string") return res.json(genericOk);
      // Bewusst case-insensitiv: Ziel ist Zustellung, nicht Authentifizierung.
      const normalizedUsername = benutzername.toLowerCase().trim();
      if (!normalizedUsername) return res.json(genericOk);

      const { data: user } = await supabase
        .from("app_benutzer")
        .select("id, benutzername, tenant_id")
        .eq("benutzername", normalizedUsername)
        .eq("aktiv", true)
        .maybeSingle();
      if (!user) return res.json(genericOk);

      const { data: smtpRows } = await supabase
        .from("einstellungen")
        .select("schluessel, wert")
        .eq("tenant_id", user.tenant_id)
        .in("schluessel", ["smtp_host", "smtp_port", "smtp_user", "smtp_passwort", "smtp_pass", "smtp_von", "smtp_from", "smtp_ssl", "firmenname", "app_url"]);
      const sm: Record<string, string> = {};
      for (const row of smtpRows || []) sm[row.schluessel] = row.wert || "";
      const smtpHost = sm.smtp_host || "";
      const smtpPort = Number(sm.smtp_port) || 587;
      const smtpUser = sm.smtp_user || "";
      const smtpPass = sm.smtp_passwort || sm.smtp_pass || "";
      const smtpFrom = sm.smtp_von || sm.smtp_from || smtpUser;
      const smtpSsl = sm.smtp_ssl || "starttls";
      if (!smtpHost || !smtpUser || !smtpPass) return res.json(genericOk); // kein SMTP konfiguriert → still ignorieren

      const crypto = await import("crypto");
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const ablauf = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 Stunde gültig

      const { error: insertError } = await supabase
        .from("passwort_reset_tokens")
        .insert({ benutzer_id: user.id, token_hash: tokenHash, ablauf });
      if (insertError) throw insertError;

      const appUrl = (sm.app_url || "https://auftragpro.onrender.com").replace(/\/$/, "");
      const resetLink = `${appUrl}/#/passwort-zuruecksetzen?token=${rawToken}`;

      const nodemailer = await import("nodemailer");
      const secure = smtpSsl === "ssl" || smtpPort === 465;
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: secure ? undefined : { ciphers: "SSLv3" },
      });
      await transporter.sendMail({
        from: `"${sm.firmenname || "AuftragsPro"}" <${smtpFrom || smtpUser}>`,
        to: user.benutzername,
        subject: "Passwort zurücksetzen — AuftragsPro",
        text: `Du hast angefordert, dein Passwort zurückzusetzen. Öffne diesen Link (gültig für 1 Stunde):\n\n${resetLink}\n\nFalls du das nicht warst, kannst du diese E-Mail ignorieren.`,
        html: `<div style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;"><p>Du hast angefordert, dein Passwort zurückzusetzen.</p><p><a href="${resetLink}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Neues Passwort festlegen</a></p><p style="color:#666;font-size:9pt;">Der Link ist 1 Stunde gültig. Falls du das nicht warst, kannst du diese E-Mail ignorieren.</p></div>`,
      });

      return res.json(genericOk);
    } catch (e) {
      console.error("[Passwort-Vergessen] Fehler:", e);
      return res.json(genericOk); // niemals Fehlerdetails an Client, um Enumeration zu verhindern
    }
  });

  // Schritt 2: Nutzer klickt Link, gibt neues Passwort ein. Token wird gegen
  // den gehashten Wert geprüft, muss ungenutzt und nicht abgelaufen sein.
  app.post("/api/auth/passwort-zuruecksetzen", async (req, res) => {
    try {
      const { token, neuesPasswort } = req.body;
      if (!token || typeof token !== "string") return res.status(400).json({ ok: false, message: "Ungültiger Link." });
      if (!neuesPasswort || typeof neuesPasswort !== "string" || neuesPasswort.length < 12)
        return res.status(400).json({ ok: false, message: "Passwort muss mindestens 12 Zeichen haben." });

      const crypto = await import("crypto");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const { data: resetRow } = await supabase
        .from("passwort_reset_tokens")
        .select("id, benutzer_id, ablauf, verwendet_am")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!resetRow || resetRow.verwendet_am || new Date(resetRow.ablauf).getTime() < Date.now()) {
        return res.status(400).json({ ok: false, message: "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an." });
      }

      const { data: user } = await supabase
        .from("app_benutzer")
        .select("id, aktiv, gesperrt")
        .eq("id", resetRow.benutzer_id)
        .maybeSingle();
      if (!user || !user.aktiv) return res.status(400).json({ ok: false, message: "Konto nicht gefunden oder inaktiv." });
      // Ein wegen zu vieler Fehlversuche dauerhaft gesperrtes Konto darf sich
      // nicht selbst per E-Mail-Link entsperren — sonst hätte die Sperre keine
      // Schutzwirkung gegen einen Angreifer, der zusätzlich Zugriff aufs Postfach hat.
      // Nur ein Administrator kann in diesem Fall entsperren (Benutzerverwaltung).
      if (user.gesperrt) {
        return res.status(423).json({ ok: false, message: "Dieses Konto ist gesperrt. Bitte kontaktiere einen Administrator, um es zu entsperren." });
      }

      if (getAuthMode() === "supabase") {
        const serviceClient = getServiceRoleClient();
        const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(user.id, { password: neuesPasswort });
        if (updateAuthError) throw updateAuthError;
      } else {
        const hash = await bcrypt.hash(neuesPasswort, 12);
        await supabase.from("app_benutzer").update({ passwort_hash: hash, aktualisiert: new Date().toISOString() }).eq("id", user.id);
      }

      await supabase
        .from("passwort_reset_tokens")
        .update({ verwendet_am: new Date().toISOString() })
        .eq("id", resetRow.id);

      return res.json({ ok: true, message: "Passwort wurde erfolgreich zurückgesetzt. Du kannst dich jetzt anmelden." });
    } catch (e) {
      return res.status(500).json({ ok: false, message: asError(e) });
    }
  });

  // Step 2: Verify TOTP code
  app.post("/api/auth/verify-2fa", async (req, res) => {
    try {
      const { userId, code, geraetMerken } = req.body;
      if (!userId || !code)
        return res.status(400).json({ ok: false, message: "Fehlende Daten" });

      const { data: user } = await supabase
        .from("app_benutzer")
        .select("*")
        .eq("id", userId)
        .eq("aktiv", true)
        .single();

      if (!user) return res.status(401).json({ ok: false, message: "Benutzer nicht gefunden" });

      // Check backup codes first
      if (user.backup_codes && user.backup_codes.includes(code.toUpperCase())) {
        await supabase
          .from("app_benutzer")
          .update({ backup_codes: user.backup_codes.filter((c: string) => c !== code.toUpperCase()) })
          .eq("id", userId);
        setLegacySessionCookie(res, user.id);
        return res.json({ ok: true, user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle, berechtigungen: user.berechtigungen || null, ist_super_admin: user.ist_super_admin === true } });
      }

      // Verify TOTP
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
      if (delta === null)
        return res.status(401).json({ ok: false, message: "Falscher 2FA Code" });

      // Gerät 30 Tage merken
      let neuerVertrauensToken: string | undefined;
      if (geraetMerken) {
        neuerVertrauensToken = uid();
        const ablauf = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 Tage
        const tokens: any[] = JSON.parse(user.vertrauens_tokens || "[]");
        // Abgelaufene bereinigen + neuen hinzufügen
        const aktuell = tokens.filter((t: any) => t.ablauf > Date.now());
        aktuell.push({ token: neuerVertrauensToken, ablauf, erstellt: Date.now() });
        await supabase.from("app_benutzer").update({ vertrauens_tokens: JSON.stringify(aktuell) }).eq("id", userId);
      }

      setLegacySessionCookie(res, user.id);
      return res.json({
        ok: true,
        user: { id: user.id, benutzername: user.benutzername, rolle: user.rolle, berechtigungen: user.berechtigungen || null, ist_super_admin: user.ist_super_admin === true },
        ...(neuerVertrauensToken ? { vertrauensToken: neuerVertrauensToken } : {})
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: asError(e) });
    }
  });

  // Setup 2FA: generate secret + QR code
  // Bindung an authentifizierte Session — der Client darf keine fremde
  // userId mehr im Body übermitteln.
  app.post("/api/auth/setup-2fa", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const userId = identity.userId;

      const { data: user } = await identity.client
        .from("app_benutzer")
        .select("benutzername")
        .eq("id", userId)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();

      if (!user) return res.status(404).json({ message: "Benutzer nicht gefunden" });

      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "AuftragsPro",
        label: user.benutzername,
        secret,
        digits: 6,
        period: 30,
      });

      const uri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(uri);
      const backupCodes = generateBackupCodes();

      // Store secret temporarily (not yet active)
      await identity.client
        .from("app_benutzer")
        .update({ totp_secret: secret.base32, backup_codes: backupCodes })
        .eq("id", userId)
        .eq("tenant_id", identity.tenantId);

      return res.json({ ok: true, qrDataUrl, backupCodes, secret: secret.base32 });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // Confirm 2FA setup with a valid code
  app.post("/api/auth/confirm-2fa", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const userId = identity.userId;
      const { code } = req.body;
      if (typeof code !== "string" || code.trim().length === 0) {
        return res.status(400).json({ message: "Code fehlt." });
      }

      const { data: user } = await identity.client
        .from("app_benutzer")
        .select("totp_secret")
        .eq("id", userId)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();

      if (!user?.totp_secret) return res.status(400).json({ message: "Kein Secret gefunden" });

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
      if (delta === null) return res.status(401).json({ ok: false, message: "Falscher Code" });

      await identity.client
        .from("app_benutzer")
        .update({ totp_aktiv: true })
        .eq("id", userId)
        .eq("tenant_id", identity.tenantId);

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // Change own password
  // userId kommt aus der Session, nie aus dem Body. Passwort-Policy: mind. 12 Zeichen.
  app.post("/api/auth/passwort-aendern", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const userId = identity.userId;
      const { altesPasswort, neuesPasswort } = req.body;
      if (!altesPasswort || !neuesPasswort)
        return res.status(400).json({ message: "Fehlende Felder" });
      if (typeof neuesPasswort !== "string" || neuesPasswort.length < 12)
        return res.status(400).json({ message: "Passwort muss mindestens 12 Zeichen haben." });

      const { data: user } = await identity.client
        .from("app_benutzer")
        .select("passwort_hash")
        .eq("id", userId)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();

      if (!user) return res.status(404).json({ message: "Benutzer nicht gefunden" });
      const ok = await bcrypt.compare(altesPasswort, user.passwort_hash);
      if (!ok) return res.status(401).json({ message: "Altes Passwort falsch" });

      const hash = await bcrypt.hash(neuesPasswort, 12);
      await identity.client
        .from("app_benutzer")
        .update({ passwort_hash: hash, aktualisiert: new Date().toISOString() })
        .eq("id", userId)
        .eq("tenant_id", identity.tenantId);

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ============= BENUTZER VERWALTUNG (Admin only) =============

  app.get("/api/benutzer", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { data } = await identity.client
        .from("app_benutzer")
        .select("id, benutzername, rolle, totp_aktiv, aktiv, erstellt, berechtigungen, gesperrt, gesperrt_am")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt");
      return res.json(data || []);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/benutzer", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { benutzername, passwort, rolle } = req.body;
      if (!benutzername || !passwort)
        return res.status(400).json({ message: "Benutzername und Passwort erforderlich" });
      if (typeof passwort !== "string" || passwort.length < 12)
        return res.status(400).json({ message: "Passwort muss mindestens 12 Zeichen haben." });
      const rolleNormalisiert = rolle === "admin" ? "admin" : "mitarbeiter";

      const hash = await bcrypt.hash(passwort, 12);
      // Wie bei PATCH: app_benutzer hat nur eine SELECT-RLS-Policy, daher
      // Service-Role-Client für den Schreibzugriff im Supabase-Modus verwenden.
      const writeClient = getAuthMode() === "supabase" ? getServiceRoleClient() : identity.client;
      const { data, error } = await writeClient
        .from("app_benutzer")
        .insert({
          benutzername: String(benutzername).toLowerCase().trim(),
          passwort_hash: hash,
          rolle: rolleNormalisiert,
          tenant_id: identity.tenantId,
        })
        .select("id, benutzername, rolle, totp_aktiv, aktiv, erstellt")
        .single();

      if (error) return res.status(400).json({ message: asError(error) });
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.patch("/api/benutzer/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { id } = req.params;
      const { benutzername, rolle, aktiv, passwort, berechtigungen, gesperrt } = req.body;
      const updates: Record<string, unknown> = { aktualisiert: new Date().toISOString() };
      if (benutzername) updates.benutzername = String(benutzername).toLowerCase().trim();
      if (rolle !== undefined) {
        if (rolle !== "admin" && rolle !== "mitarbeiter") {
          return res.status(400).json({ message: "Ungültige Rolle." });
        }
        updates.rolle = rolle;
      }
      if (aktiv !== undefined) updates.aktiv = aktiv;
      if (berechtigungen !== undefined) updates.berechtigungen = berechtigungen ? JSON.stringify(berechtigungen) : null;
      // Admin kann ein Konto manuell entsperren (gesperrt: false) oder
      // vorsorglich sperren (gesperrt: true). Ein Passwort-Reset durch den
      // Admin entsperrt das Konto zusätzlich immer automatisch mit (siehe unten).
      if (gesperrt !== undefined) {
        updates.gesperrt = !!gesperrt;
        updates.gesperrt_am = gesperrt ? new Date().toISOString() : null;
      }
      if (passwort) {
        if (typeof passwort !== "string" || passwort.length < 12) return res.status(400).json({ message: "Passwort muss mindestens 12 Zeichen haben." });
        // In Supabase-Auth-Modus besitzt GoTrue das eigentliche Passwort;
        // ein reines Update von app_benutzer.passwort_hash hätte keine Wirkung
        // auf den echten Login. Daher zusätzlich (bzw. stattdessen) das
        // Passwort direkt über die Supabase Admin-API setzen.
        if (getAuthMode() === "supabase") {
          try {
            const { error: authUpdateError } = await getServiceRoleClient().auth.admin.updateUserById(id, { password: passwort });
            if (authUpdateError) return res.status(400).json({ message: `Passwort konnte nicht gesetzt werden: ${authUpdateError.message}` });
          } catch (e) {
            return res.status(500).json({ message: `Passwort-Reset fehlgeschlagen: ${asError(e)}` });
          }
        }
        updates.passwort_hash = await bcrypt.hash(passwort, 12);
        // Admin-Passwort-Reset ist der beschriebene Entsperr-Weg: ein gesperrtes
        // Konto wird dabei automatisch wieder freigegeben, sofern nicht explizit
        // im selben Request erneut gesperrt werden soll.
        if (gesperrt === undefined) {
          updates.gesperrt = false;
          updates.gesperrt_am = null;
        }
      }
      // Schreibzugriffe auf app_benutzer nutzen bewusst den Service-Role-Client:
      // für diese Tabelle existiert nur eine SELECT-RLS-Policy, keine für UPDATE.
      // Der RLS-gebundene Client (identity.client bei req.auth) würde daher 0
      // Zeilen treffen und PGRST116 werfen. Die Admin-Berechtigung ist bereits
      // serverseitig durch isAdminIdentity() geprüft — RLS ist hier nicht die
      // zuständige Schutzschicht.
      const writeClient = getAuthMode() === "supabase" ? getServiceRoleClient() : identity.client;
      const { data, error } = await writeClient
        .from("app_benutzer")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .select("id, benutzername, rolle, totp_aktiv, aktiv, erstellt, berechtigungen, gesperrt, gesperrt_am")
        .single();
      if (error) return res.status(400).json({ message: asError(error) });

      // tenant_memberships ist die Berechtigungsquelle, die req.auth im
      // Supabase-Auth-Modus tatsächlich liest (siehe auth-middleware.ts).
      // Ohne diesen Sync bleiben Rollen-/Rechteänderungen aus der
      // Benutzerverwaltung für jeden Nicht-Admin-Mitarbeiter wirkungslos,
      // sobald der Zugriff über einen Supabase-JWT (statt Legacy-Cookie)
      // erfolgt — Admins sind unbetroffen, weil isRoutePolicyAllowed()
      // rolle === "admin" immer durchlässt.
      if (rolle !== undefined || berechtigungen !== undefined) {
        const membershipUpdates: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() };
        if (rolle !== undefined) membershipUpdates.rolle = rolle;
        if (berechtigungen !== undefined) membershipUpdates.berechtigungen = berechtigungen || {};
        const { error: membershipError } = await getServiceRoleClient()
          .from("tenant_memberships")
          .update(membershipUpdates)
          .eq("user_id", id)
          .eq("tenant_id", identity.tenantId);
        if (membershipError) {
          console.error(`[BENUTZER_PATCH] tenant_memberships-Sync fehlgeschlagen für ${id}: ${asError(membershipError)}`);
        }
      }

      return res.json(data);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/benutzer/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { id } = req.params;
      if (id === identity.userId) {
        return res.status(400).json({ message: "Der eigene Account kann nicht gelöscht werden." });
      }
      // Wie bei PATCH: app_benutzer hat nur eine SELECT-RLS-Policy, daher
      // Service-Role-Client für den Schreibzugriff im Supabase-Modus verwenden.
      const writeClient = getAuthMode() === "supabase" ? getServiceRoleClient() : identity.client;
      const { error, count } = await writeClient
        .from("app_benutzer")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("tenant_id", identity.tenantId);
      if (error) return res.status(400).json({ message: asError(error) });
      if (!count) return res.status(404).json({ message: "Benutzer nicht gefunden." });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // Reset 2FA for a user (Admin)
  app.post("/api/benutzer/:id/reset-2fa", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { id } = req.params;
      // Wie bei PATCH: app_benutzer hat nur eine SELECT-RLS-Policy, daher
      // Service-Role-Client für den Schreibzugriff im Supabase-Modus verwenden.
      const writeClient = getAuthMode() === "supabase" ? getServiceRoleClient() : identity.client;
      const { error, count } = await writeClient
        .from("app_benutzer")
        .update({ totp_aktiv: false, totp_secret: null, backup_codes: null }, { count: "exact" })
        .eq("id", id)
        .eq("tenant_id", identity.tenantId);
      if (error) return res.status(400).json({ message: asError(error) });
      if (!count) return res.status(404).json({ message: "Benutzer nicht gefunden." });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ============= STATS =============
  app.get("/api/stats", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("auftraege")
        .select("status")
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      const rows = data || [];
      // Gesamt folgt derselben Definition wie das Dashboard-Dropdown.
      const gesamt = rows.filter(
        (r: any) => !STATUS_GESAMT_EXCLUDED.includes(r.status)
      ).length;
      const abgeschlossen = rows.filter(
        (r: any) => r.status === "abgeschlossen"
      ).length;
      const offen = rows.filter(
        (r: any) =>
          r.status === "anfrage" ||
          r.status === "angebot" ||
          r.status === "bestaetigt"
      ).length;
      const in_bearbeitung = rows.filter(
        (r: any) => STATUS_IN_BEARBEITUNG.includes(r.status)
      ).length;
      res.json({ gesamt, offen, in_bearbeitung, abgeschlossen });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= DASHBOARD REINGEWINN =============
  // GET /api/dashboard/reingewinn
  // Aggregat der Finanzen-Übersicht — dieselben Zeilen und dieselbe Summierung wie
  // GET /api/finanzen/uebersicht, damit die Kachel und die Seite nie abweichen.
  app.get("/api/dashboard/reingewinn", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { anzahl, umsatz, kosten, reingewinn } = finanzenSummen(
        await ladeFinanzenUebersichtZeilen(identity.client, identity.tenantId),
      );
      res.json({ reingewinn, umsatz, kosten, anzahl });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ============= AUFTRAEGE =============

  // Aktuellen MWST-Satz aus den Einstellungen lesen (Default 8.1%, falls nicht gesetzt).
  // Zentrale Stelle, damit der Satz nirgends mehr hardcodiert ist.
  const ladeMwstSatz = async (identity: DashboardPreferenceIdentity): Promise<number> => {
    const { data: settingsArr, error } = await identity.client
      .from("einstellungen")
      .select("wert")
      .eq("tenant_id", identity.tenantId)
      .eq("schluessel", "mwst_satz")
      .maybeSingle();
    if (error) throw error;
    return parseFloat(settingsArr?.wert || "8.1");
  };

  // Rechnungsbetrag und Zahlungsstatus je Auftrag direkt aus der Tabelle "rechnungen"
  // ableiten. Jede Ansicht, die einen Auftrag ausliefert, muss das hierüber tun — sonst
  // zeigt sie das gespiegelte auftraege.rechnungs_betrag, das veraltet sein kann.
  const rechnungsStatusJeAuftrag = async (identity: DashboardPreferenceIdentity, auftragIds?: string[]) => {
    let query = identity.client
      .from("rechnungen")
      .select("auftrag_id, betrag, bezahlt_am")
      .eq("tenant_id", identity.tenantId);
    if (auftragIds) query = query.in("auftrag_id", auftragIds);
    const { data, error } = await query;
    if (error) throw error;
    const map = new Map<string, { anzahl: number; bezahlt: number; netto: number; letztes: string | null }>();
    for (const r of data || []) {
      const e = map.get(r.auftrag_id) || { anzahl: 0, bezahlt: 0, netto: 0, letztes: null };
      e.anzahl += 1;
      e.netto += Number(r.betrag) || 0;
      if (r.bezahlt_am) {
        e.bezahlt += 1;
        const d = String(r.bezahlt_am);
        if (!e.letztes || d > e.letztes) e.letztes = d;
      }
      map.set(r.auftrag_id, e);
    }
    return map;
  };

  // Die abgeleiteten Werte an einen Auftragsdatensatz anhängen. Ohne Rechnung bleibt der
  // gespeicherte Betrag stehen: er ist bei Altdaten der einzige Hinweis auf eine
  // Fakturierung; anzahl_rechnungen = 0 macht das in der UI kenntlich.
  const mitRechnungsStatus = (auftrag: any, map: Map<string, any>, mwstSatz: number) => {
    const e = map.get(auftrag.id);
    return {
      ...auftrag,
      rechnungs_betrag: e ? Math.round(e.netto * (1 + mwstSatz / 100) * 100) / 100 : auftrag.rechnungs_betrag,
      anzahl_rechnungen: e?.anzahl || 0,
      rechnung_bezahlt: !!e && e.bezahlt === e.anzahl,
      rechnung_bezahlt_am: e?.letztes || null,
    };
  };

  app.get("/api/auftraege", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const [{ data, error }, rechnungsStatus, mwstSatz] = await Promise.all([
        identity.client.from("auftraege").select("*").eq("tenant_id", identity.tenantId).order("erstellt", { ascending: false }),
        rechnungsStatusJeAuftrag(identity),
        ladeMwstSatz(identity),
      ]);
      if (error) throw error;
      res.json((data || []).map((a: any) => mitRechnungsStatus(a, rechnungsStatus, mwstSatz)));
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const body = req.body || {};
      if (!body.titel || !String(body.titel).trim()) {
        return res.status(400).json({ message: "Titel ist erforderlich" });
      }
      if (!body.kunde || !String(body.kunde).trim()) {
        return res.status(400).json({ message: "Kunde ist erforderlich" });
      }
      // gen nr
      const { data: allRows } = await identity.client
        .from("auftraege")
        .select("nr")
        .eq("tenant_id", identity.tenantId);
      const nr = nextNr("A", allRows || []);
      const id = uid();
      const now = new Date().toISOString();
      const row = {
        id,
        nr,
        titel: body.titel,
        kunde: body.kunde,
        kunde_adresse: body.kunde_adresse || null,
        kunde_email: body.kunde_email || null,
        kunde_telefon: body.kunde_telefon || null,
        beschreibung: body.beschreibung || null,
        status: body.status || "anfrage",
        prioritaet: body.prioritaet || "normal",
        kategorie: body.kategorie || null,
        start_datum: body.start_datum || null,
        end_datum: body.end_datum || null,
        // "pauschal" oder "detailliert" — explizite Wahl aus dem Auftragsformular
        // (Pauschalbetrag-Feature). Ohne Angabe bleibt es beim bisherigen Standard.
        angebots_typ: body.angebots_typ === "pauschal" ? "pauschal" : "detailliert",
        angebots_betrag:
          body.angebots_betrag !== undefined && body.angebots_betrag !== ""
            ? Number(body.angebots_betrag)
            : null,
        // Immer null: ein neuer Auftrag hat per Definition noch keine Rechnung.
        // Gefuellt wird ausschliesslich durch syncRechnungsBetrag().
        rechnungs_betrag: null,
        waehrung: body.waehrung || "CHF",
        verantwortlicher: body.verantwortlicher || null,
        erstellt: now,
        aktualisiert: now,
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client
        .from("auftraege")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      // initial verlauf
      await identity.client.from("verlauf").insert({
        id: uid(),
        auftrag_id: id,
        status: row.status,
        kommentar: "Auftrag erstellt",
        von: body.verantwortlicher || null,
        datum: now,
        tenant_id: identity.tenantId,
      });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.get("/api/auftraege/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { data: auftrag, error } = await identity.client
        .from("auftraege")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (error) throw error;
      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden." });
      const { data: verlauf } = await identity.client
        .from("verlauf")
        .select("*")
        .eq("auftrag_id", id)
        .eq("tenant_id", identity.tenantId)
        .order("datum", { ascending: false });
      const { data: notizen } = await identity.client
        .from("notizen")
        .select("*")
        .eq("auftrag_id", id)
        .eq("tenant_id", identity.tenantId)
        .order("datum", { ascending: false });
      const { data: dokumente } = await identity.client
        .from("dokumente")
        .select("id, auftrag_id, name, mime, size_bytes, kat, beschreibung, storage_path, datum")
        .eq("auftrag_id", id)
        .eq("tenant_id", identity.tenantId)
        .order("datum", { ascending: false });
      res.json({
        ...mitRechnungsStatus(auftrag, await rechnungsStatusJeAuftrag(identity, [id]), await ladeMwstSatz(identity)),
        verlauf: verlauf || [],
        notizen: notizen || [],
        dokumente: dokumente || [],
      });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.patch("/api/auftraege/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const body = req.body || {};
      const allowed: Record<string, any> = {};
      const fields = [
        "titel",
        "kunde",
        "kunde_adresse",
        "kunde_email",
        "kunde_telefon",
        "beschreibung",
        "status",
        "prioritaet",
        "kategorie",
        "start_datum",
        "end_datum",
        "angebots_typ",
        "angebots_betrag",
        "waehrung",
        "verantwortlicher",
        "wiederkehrend_interval",
        "naechste_faelligkeit",
        "public_token",
      ];
      // rechnungs_betrag fehlt hier bewusst: es wird ausschliesslich aus der Tabelle
      // "rechnungen" via syncRechnungsBetrag() abgeleitet. Manuelles Setzen hat früher
      // Betraege ohne zugehörige Rechnung erzeugt, die als Umsatz gezaehlt wurden.
      for (const f of fields) {
        if (f in body) {
          let v = body[f];
          if (f === "angebots_betrag" && v !== null && v !== "") {
            v = Number(v);
          }
          if (v === "") v = null;
          allowed[f] = v;
        }
      }
      // Sobald eine Offerte existiert, ist sie die Quelle für angebots_betrag. Die
      // Vorkalkulation schreibt hier ebenfalls einen Schätzpreis hinein — ohne diese
      // Sperre würden Spalte "Angebot" und tatsächliche Offerte auseinanderlaufen.
      let offerteHatVorrang = false;
      if ("angebots_betrag" in allowed) {
        const { data: offerten } = await identity.client
          .from("offerten").select("id").eq("auftrag_id", id).eq("tenant_id", identity.tenantId).limit(1);
        if (offerten && offerten.length > 0) {
          delete allowed.angebots_betrag;
          offerteHatVorrang = true;
        }
      }

      allowed.aktualisiert = new Date().toISOString();
      const { data, error } = await identity.client
        .from("auftraege")
        .update(allowed)
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Auftrag nicht gefunden." });
      if (offerteHatVorrang) {
        await syncAngebotsBetrag(id);
        const { data: frisch } = await identity.client
          .from("auftraege").select("*").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
        return res.json({ ...(frisch || data), angebots_betrag_aus_offerte: true });
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.patch("/api/auftraege/:id/status", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { status, kommentar, von } = req.body || {};
      if (!status) return res.status(400).json({ message: "status required" });
      const now = new Date().toISOString();
      const { data, error } = await identity.client
        .from("auftraege")
        .update({ status, aktualisiert: now })
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Auftrag nicht gefunden." });
      await identity.client.from("verlauf").insert({
        id: uid(),
        auftrag_id: id,
        status,
        kommentar: kommentar || `Status geändert zu ${status}`,
        von: von || null,
        datum: now,
        tenant_id: identity.tenantId,
      });
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/auftraege/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      if (!(await auftragGehoertZuTenant(identity, id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      // best-effort cascade
      await supabase.from("dokument_daten").delete().in(
        "dokument_id",
        ((await supabase.from("dokumente").select("id").eq("auftrag_id", id)).data || []).map(
          (r: any) => r.id
        )
      );
      await supabase.from("dokumente").delete().eq("auftrag_id", id);
      await supabase.from("notizen").delete().eq("auftrag_id", id);
      await supabase.from("verlauf").delete().eq("auftrag_id", id);
      await identity.client.from("rechnungen").delete().eq("auftrag_id", id).eq("tenant_id", identity.tenantId);

      // Schritt-Fotos: zuerst Storage-Dateien löschen, dann DB-Zeilen
      const { data: fotosZuLoeschen } = await supabase
        .from("auftrag_schritt_fotos")
        .select("url")
        .eq("auftrag_id", id);
      const storagePfade = (fotosZuLoeschen || [])
        .map((f: any) => f.url?.split("/schritt-fotos/")[1])
        .filter(Boolean);
      if (storagePfade.length > 0) {
        await supabase.storage.from("schritt-fotos").remove(storagePfade);
      }
      await supabase.from("auftrag_schritt_fotos").delete().eq("auftrag_id", id);
      await supabase.from("auftrag_schritte").delete().eq("auftrag_id", id);

      // Positionen, Zeiterfassung, Kommentare
      await supabase.from("auftrag_positionen").delete().eq("auftrag_id", id);
      await supabase.from("zeiteintraege").delete().eq("auftrag_id", id);
      await supabase.from("auftrag_kommentare").delete().eq("auftrag_id", id);
      await supabase.from("aufgaben").delete().eq("auftrag_id", id);

      // Vor-/Nachkalkulation
      await supabase.from("vorkalkulation_material").delete().eq("auftrag_id", id);
      await supabase.from("vorkalkulation_fremdleistungen").delete().eq("auftrag_id", id);
      await supabase.from("vorkalkulation_stunden").delete().eq("auftrag_id", id);
      await supabase.from("vorkalkulation_config").delete().eq("auftrag_id", id);
      await supabase.from("vorkalkulation_soek").delete().eq("auftrag_id", id);
      await supabase.from("vorkalkulation_hilfsmaterial").delete().eq("auftrag_id", id);
      await supabase.from("vorkalkulation_hauptmaterial_flaeche").delete().eq("auftrag_id", id);
      await supabase.from("nachkalkulation_material").delete().eq("auftrag_id", id);
      await supabase.from("nachkalkulation_fremdleistungen").delete().eq("auftrag_id", id);
      await supabase.from("nachkalkulation_stunden").delete().eq("auftrag_id", id);
      await supabase.from("nachkalkulation_soek").delete().eq("auftrag_id", id);

      // Sonstige Auftrags-verknüpfte Daten
      await supabase.from("kalkulationen").delete().eq("auftrag_id", id);
      await supabase.from("garantien").delete().eq("auftrag_id", id);
      await supabase.from("liefertermine").delete().eq("auftrag_id", id);
      // Termine bleiben erhalten (koennen z.B. Urlaub/Intern ohne Bezug sein),
      // werden aber vom geloeschten Auftrag entkoppelt statt als Karteileiche
      // mit toter auftrag_id zu verwaisen.
      await supabase.from("termine").update({ auftrag_id: null }).eq("auftrag_id", id);
      await supabase.from("foto_dokumentation").delete().eq("auftrag_id", id);
      await supabase.from("tagesrapporte").delete().eq("auftrag_id", id);
      await supabase.from("reklamationen").delete().eq("auftrag_id", id);

      const { error } = await identity.client
        .from("auftraege")
        .delete()
        .eq("id", id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= NOTIZEN =============
  app.get("/api/auftraege/:id/notizen", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("notizen")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("datum", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege/:id/notizen", async (req, res) => {
    try {
      const { id } = req.params;
      const { text, von } = req.body || {};
      if (!text) return res.status(400).json({ message: "text required" });
      const row = {
        id: uid(),
        auftrag_id: id,
        text,
        von: von || null,
        datum: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("notizen")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/auftraege/:id/notizen/:nid", async (req, res) => {
    try {
      const { nid } = req.params;
      const { error } = await supabase.from("notizen").delete().eq("id", nid);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= DOKUMENTE =============
  app.get("/api/auftraege/:id/dokumente", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("dokumente")
        .select("id, auftrag_id, name, mime, size_bytes, kat, beschreibung, storage_path, datum")
        .eq("auftrag_id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .order("datum", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post(
    "/api/auftraege/:id/dokumente",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const identity = dashboardPreferenceIdentity(req);
        if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id || !(await auftragGehoertZuTenant(identity, id))) {
          return res.status(404).json({ message: "Auftrag nicht gefunden." });
        }
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "file required" });
        const did = uid();
        const body = req.body || {};
        const row = {
          id: did,
          auftrag_id: id,
          name: file.originalname,
          mime: file.mimetype || "application/octet-stream",
          size_bytes: file.size,
          kat: typeof body.kat === "string" ? body.kat : null,
          beschreibung: typeof body.beschreibung === "string" ? body.beschreibung : null,
          storage_path: null,
          datum: new Date().toISOString(),
          tenant_id: identity.tenantId,
        };
        const { data, error } = await identity.client
          .from("dokumente")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        const b64 = file.buffer.toString("base64");
        const { error: e2 } = await identity.client
          .from("dokument_daten")
          .insert({ dokument_id: did, data: b64, tenant_id: identity.tenantId });
        if (e2) {
          await identity.client.from("dokumente").delete().eq("id", did).eq("tenant_id", identity.tenantId);
          throw e2;
        }
        res.json(data);
      } catch (e) {
        res.status(500).json({ message: asError(e) });
      }
    }
  );

  const handleDocumentDownload = async (
    res: Response,
    { auftragId, documentId, tenantId }: DocumentDownloadInput,
  ) => {
    try {
      const { data: doc, error } = await supabase
        .from("dokumente")
        .select("*")
        .eq("id", documentId)
        .eq("auftrag_id", auftragId)
        .eq("tenant_id", tenantId)
        .single();
      if (error || !doc) {
        return res.status(404).json({ message: "Dokument nicht gefunden" });
      }
      const { data: dd, error: e2 } = await supabase
        .from("dokument_daten")
        .select("data")
        .eq("dokument_id", documentId)
        .eq("tenant_id", tenantId)
        .single();
      if (e2 || !dd) {
        return res.status(404).json({ message: "Dokument-Daten nicht gefunden" });
      }
      const buf = Buffer.from(dd.data, "base64");
      const mime = doc.mime || "application/octet-stream";
      // PDFs und Bilder direkt im Browser/Tab anzeigen (inline), alles andere als Download anbieten.
      // "attachment" fuehrt v.a. auf Mobile (iOS Safari) dazu, dass beim Klick scheinbar nichts passiert,
      // da die Datei im Hintergrund heruntergeladen wird statt sich zu oeffnen.
      const isViewable = mime === "application/pdf" || mime.startsWith("image/");
      const disposition = isViewable ? "inline" : "attachment";
      res.setHeader("Content-Type", mime);
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(doc.name)}"`
      );
      res.send(buf);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  };
  app.get("/api/auftraege/:id/dokumente/:did/download", async (req, res) => {
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) {
      return res.status(401).json({ message: "Authentifizierung erforderlich." });
    }
    return handleDocumentDownload(res, {
      auftragId: req.params.id,
      documentId: req.params.did,
      tenantId: identity.tenantId,
    });
  });

  app.delete("/api/auftraege/:id/dokumente/:did", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id, did } = req.params;
      // Existenz + Tenant + Auftrag-Zugehörigkeit vor Delete pruefen
      const { data: doc } = await identity.client
        .from("dokumente")
        .select("id")
        .eq("id", did)
        .eq("auftrag_id", id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      await identity.client
        .from("dokument_daten")
        .delete()
        .eq("dokument_id", did)
        .eq("tenant_id", identity.tenantId);
      const { error } = await identity.client
        .from("dokumente")
        .delete()
        .eq("id", did)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // Konsolidierter Endpoint fuer die Dokumente-Uebersicht: liefert Dokumente
  // UND Fotos aller Auftraege des Mandanten in genau zwei Datenbank-Abfragen
  // statt der bisherigen 2*N Einzelabfragen (eine je Auftrag und Datei-Typ).
  app.get("/api/dokumente/alle", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const [dokResult, fotoResult] = await Promise.all([
        identity.client
          .from("dokumente")
          .select("id, auftrag_id, name, mime, size_bytes, kat, beschreibung, storage_path, datum")
          .eq("tenant_id", identity.tenantId)
          .order("datum", { ascending: false }),
        identity.client
          .from("foto_dokumentation")
          .select("*")
          .eq("tenant_id", identity.tenantId)
          .order("erstellt", { ascending: false }),
      ]);
      if (dokResult.error) throw dokResult.error;
      if (fotoResult.error) throw fotoResult.error;
      res.json({ dokumente: dokResult.data || [], fotos: fotoResult.data || [] });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= RECHNUNGEN =============

  // Summiert alle Rechnungen eines Auftrags (Netto-Positionensumme, inkl. 8.1% MWST
  // wie im Rechnungs-PDF) und schreibt das Ergebnis nach auftraege.rechnungs_betrag.
  //
  // auftraege.rechnungs_betrag ist ein reiner Spiegel der Tabelle "rechnungen" — diese
  // Funktion ist der EINZIGE Schreiber. Wer eine Rechnung anlegt, ändert oder löscht,
  // MUSS sie aufrufen, sonst zeigen Auftragsliste und Finanzen-Übersicht veraltete Werte.
  async function syncRechnungsBetrag(auftragId: string, identity?: DashboardPreferenceIdentity) {
    if (!auftragId) return;
    const client = identity?.client || supabase;
    let rechnungenQuery = client
      .from("rechnungen")
      .select("betrag")
      .eq("auftrag_id", auftragId);
    if (identity) rechnungenQuery = rechnungenQuery.eq("tenant_id", identity.tenantId);
    const { data: alleRechnungen, error: leseFehler } = await rechnungenQuery;
    if (leseFehler) throw leseFehler;
    const nettoSumme = (alleRechnungen || []).reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
    // Ohne Rechnung muss NULL stehen, nicht 0 — sonst ist "keine Rechnung" nicht mehr
    // von "Rechnung über 0.00" unterscheidbar und die Liste zeigt 0.00 statt "—".
    const bruttoSumme = (alleRechnungen || []).length === 0
      ? null
      : Math.round(nettoSumme * (1 + (identity ? await ladeMwstSatz(identity) / 100 : 0.081)) * 100) / 100;
    let auftragQuery = client
      .from("auftraege")
      .update({ rechnungs_betrag: bruttoSumme })
      .eq("id", auftragId);
    if (identity) auftragQuery = auftragQuery.eq("tenant_id", identity.tenantId);
    const { error: schreibFehler } = await auftragQuery;
    if (schreibFehler) throw schreibFehler;
    return bruttoSumme;
  }

  app.get("/api/auftraege/:id/rechnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("rechnungen")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege/:id/rechnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const body = req.body || {};

      // Auftrag-Existenz + tenant_id laden
      const { data: auftrag, error: aErr } = await identity.client
        .from("auftraege")
        .select("id, nr, tenant_id")
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden" });

      // Positionen validieren
      const positionen = Array.isArray(body.positionen) ? body.positionen : [];
      if (positionen.length === 0) {
        return res.status(400).json({ message: "Mindestens eine Position ist erforderlich" });
      }
      for (const p of positionen) {
        if (!p || typeof p !== "object") {
          return res.status(400).json({ message: "Ungültiges Positionsformat" });
        }
        const menge = Number(p.menge);
        const einzelpreis = Number(p.einzelpreis);
        if (!Number.isFinite(menge) || !Number.isFinite(einzelpreis)) {
          return res.status(400).json({ message: "Position: menge und einzelpreis müssen Zahlen sein" });
        }
      }
      const betrag = positionen.reduce(
        (s: number, p: any) =>
          s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0),
        0
      );
      // Fällig-Datum validieren (optional, aber wenn gesetzt → ISO-Format)
      if (body.faellig_datum && !/^\d{4}-\d{2}-\d{2}$/.test(body.faellig_datum)) {
        return res.status(400).json({ message: "faellig_datum muss ISO-Format (YYYY-MM-DD) haben" });
      }

      // Rechnungsnummer = R(AuftragNr), bei 2.+ Rechnung = R(AuftragNr)_2
      let nr = body.nr;
      if (!nr) {
        const auftragsNr = (auftrag.nr || "").replace(/^A/, "");
        const baseNr = "R" + auftragsNr;
        const { data: existingR } = await identity.client
          .from("rechnungen").select("nr").eq("auftrag_id", id).eq("tenant_id", identity.tenantId);
        const countR = (existingR || []).length;
        nr = countR === 0 ? baseNr : baseNr + "_" + (countR + 1);
      }
      const row: any = {
        id: uid(),
        auftrag_id: id,
        nr,
        betrag,
        waehrung: body.waehrung || "CHF",
        positionen,
        notiz: body.notiz || null,
        faellig_datum: body.faellig_datum || null,
        erstellt: new Date().toISOString(),
      };
      row.tenant_id = identity.tenantId;
      const { data, error } = await identity.client
        .from("rechnungen")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      await syncRechnungsBetrag(id, identity);
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Zentraler PDF-HTML-Generator (nutzt pdf_vorlagen aus DB) ─────────────
  // ═══════════════════════════════════════════════════════════════════════════

  async function buildPdfHtml(docTyp: string, data: {
    titel: string;          // "OFFERTE", "RECHNUNG", etc.
    nummer: string;
    datum: string;
    faelligDatum?: string;
    gueltigBis?: string;
    empfaenger: string;
    empfaengerStrasse?: string;
    empfaengerPlzOrt?: string;
    firma: string;
    firmaAdresse: string;
    firmaPlzOrt: string;
    firmaTel: string;
    firmaEmail: string;
    firmaUid?: string;
    firmenlogo?: string;
    farbePrimaer?: string;
    positionen: any[];
    subtotal: number;
    rabattPct?: number;
    rabattBetrag?: number;
    mwstPct: number;
    mwstBetrag: number;
    total: number;
    einleitung?: string;
    schluss?: string;
    showTotals?: boolean;
    extraHtml?: string;
    extraHtmlFullWidth?: string;
    mahngebuehr?: number;
    ansprechpersonIntern?: string;
    ansprechpersonInternEmail?: string;
    ansprechpersonInternTelefon?: string;
    ansprechpersonExtern?: string;
    ansprechpersonManuell?: string;
    kundenNr?: string;
    anrede?: string;
    skontoText?: string;
  }, vorlageOverride?: any): Promise<string> {
    // Vorlage aus DB laden (mit Retry + Logo-Fallback aus Offerte-Vorlage)
    // vorlageOverride: wird z.B. von der Live-Vorschau genutzt, damit dort
    // NIE in die Datenbank geschrieben werden muss — die echte gespeicherte
    // Vorlage von Offerte/Rechnung bleibt so garantiert unangetastet.
    let vd: any = null;
    if (vorlageOverride) {
      vd = vorlageOverride;
    } else {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: vdTry, error: vdErr } = await supabase.from("pdf_vorlagen").select("*").eq("doc_typ", docTyp).single();
        if (vdTry) { vd = vdTry; break; }
        if (vdErr) console.warn(`[PDF] Vorlage Laden Versuch ${attempt+1} (doc_typ=${docTyp}):`, vdErr.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 600));
      }
      if (!vd) console.error(`[PDF] Vorlage nach 3 Versuchen nicht gefunden (doc_typ=${docTyp})`);
    }
    const v = vd || {};
    // Logo-Fallback: wenn aktuelle Vorlage kein Logo hat, hole es aus der Offerte-Vorlage
    if (!v.logo_data_url && docTyp !== "offerte") {
      const { data: offVorlage } = await supabase.from("pdf_vorlagen").select("logo_data_url,logo_scale,logo_pos,logo_offset_x,logo_offset_y").eq("doc_typ", "offerte").single();
      if (offVorlage?.logo_data_url) {
        v.logo_data_url = offVorlage.logo_data_url;
        if (!v.logo_scale) v.logo_scale = offVorlage.logo_scale;
        if (!v.logo_pos)   v.logo_pos   = offVorlage.logo_pos;
        if (v.logo_offset_x == null) v.logo_offset_x = offVorlage.logo_offset_x;
        if (v.logo_offset_y == null) v.logo_offset_y = offVorlage.logo_offset_y;
        console.log(`[PDF] Logo-Fallback aus Offerte-Vorlage verwendet für doc_typ=${docTyp}`);
      }
    }
    const hc  = v.header_color   || data.farbePrimaer || "#44546a";
    const fc  = v.footer_color   || "#1a3a6b";
    const design     = v.design       || "A";
    const logoScale  = v.logo_scale   || 100;
    const logoUrl    = v.logo_data_url || data.firmenlogo || null;
    const slogan     = v.slogan       || "Ihr Partner für Metallbau & Schreinerei";
    const logoPos    = v.logo_pos     || "links";
    // Freie Logo-Positionierung im Header (0-100%, ersetzt Links/Rechts-Umschalter).
    // 0/0 = oben-links im Header-Bereich. Fallback: wenn (noch) nicht gesetzt, alte Position
    // Links/Rechts in einen sinnvollen X-Wert übersetzen (Rückwärtskompatibilität).
    const logoOffX   = v.logo_offset_x != null ? Number(v.logo_offset_x) : (logoPos === "rechts" ? 100 : 0);
    const logoOffY   = v.logo_offset_y != null ? Number(v.logo_offset_y) : 0;
    // Freie horizontale Slogan-Position (0-100%), unabhängig vom Logo verschiebbar,
    // damit der Slogan exakt unter dem Logo (oder woanders) platziert werden kann.
    // Fallback: folgt der Logo-X-Position, falls (noch) nicht explizit gesetzt.
    const sloganOffX = v.slogan_offset_x != null ? Number(v.slogan_offset_x) : logoOffX;
    const einl       = (v.einleitung !== undefined && v.einleitung !== null) ? v.einleitung : (data.einleitung || "");
    const schl       = (v.schluss !== undefined && v.schluss !== null) ? v.schluss : (data.schluss || "");
    // Bug-Fix: Skonto-/Zahlungstext im Fusstext ist in der DB-Vorlage statisch hinterlegt
    // (mit unausgefuellten Platzhaltern "CHF X"/"CHF XX") und wurde bisher unveraendert
    // auf jeder Rechnung angezeigt, unabhaengig davon, ob fuer den Auftrag ueberhaupt ein
    // Skonto konfiguriert ist. Wenn der Aufrufer (Rechnungs-PDF-Route) einen dynamisch
    // berechneten skontoText mitgibt, ersetzt dieser die erste Zeile/den ersten Absatz des
    // gespeicherten Fusstexts (die Zahlungsbedingungen), der Rest (Mahnung, Reklamationen
    // etc.) bleibt unveraendert erhalten.
    let fusstext   = v.fusstext || "";
    if (data.skontoText) {
      // Erster Absatz (bis zur ersten Leerzeile) = Zahlungsbedingungen-Satz, wird ersetzt.
      const teile = fusstext.split(/\n\s*\n/);
      if (teile.length > 0 && /zahlbar|skonto|abzug/i.test(teile[0])) {
        teile[0] = data.skontoText;
        fusstext = teile.join("\n\n");
      } else {
        fusstext = fusstext ? `${data.skontoText}\n\n${fusstext}` : data.skontoText;
      }
    }
    const showContact= v.show_contact !== false;
    const showPageNum= v.show_page_num !== false;
    const wmUrl      = v.watermark_data_url || null;
    const wmOpacity  = ((v.watermark_opacity || 15) / 100).toFixed(2);
    const wmSize     = v.watermark_size || 60;
    const wmPos      = v.watermark_pos || "bottom";
    const showTotals = data.showTotals !== false;
    // Empfänger-Position: bei ALLEN Dokumenten fest rechts oben nach Schweizer
    // Norm SN C5/6 (Fensterumschlag). Vorher steuerbar über Vorlagen-Felder
    // absender_pos_h/_top_mm/_left_mm — diese werden jetzt vom Renderer komplett
    // ignoriert. Die DB-Felder bleiben für Rückwärtskompatibilität erhalten.
    const absenderTopMm  = 55;
    const absenderLeftMm = 20;
    // Empfänger-Block endet bei: absenderTopMm + ~20mm (3 Zeilen + Abstand)
    // pdf-content muss DARUNTER starten — sonst Überlappung mit Tabelle
    // contentTopMm wird nach hdrH-Berechnung via Closure genutzt (Inline-Berechnung)
    const fmtCHF = (n: number) => `CHF ${n.toFixed(2)}`;

    // Hilfsfunktion: Schriftfarbe je nach Hintergrundfarbe (schwarz oder weiss)
    const contrastColor = (hex: string): string => {
      const h = hex.replace("#","");
      const r = parseInt(h.substring(0,2),16);
      const g = parseInt(h.substring(2,4),16);
      const b = parseInt(h.substring(4,6),16);
      // WCAG Luminanz
      const lum = 0.2126*(r/255)**2.2 + 0.7152*(g/255)**2.2 + 0.0722*(b/255)**2.2;
      return lum > 0.179 ? "#1a1a1a" : "#ffffff";
    };
    const hcText = contrastColor(hc.replace(/[^0-9a-fA-F]/g,"").padStart(6,"0").slice(-6).replace(/^/,"#"));
    const fcText = contrastColor(fc.replace(/[^0-9a-fA-F]/g,"").padStart(6,"0").slice(-6).replace(/^/,"#"));



    // Logo
    const lw = Math.round(70 * logoScale / 100);
    const lh = Math.round(45 * logoScale / 100);
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="max-width:${lw}px;max-height:${lh}px;object-fit:contain;display:block;" alt="Logo" />`
      : `<span style="font-size:14pt;font-weight:700;color:${hc};">${data.firma.substring(0,2).toUpperCase()}</span>`;

    // Wasserzeichen
    const wmPosMap: Record<string,string> = {
      "bottom":       "bottom:0;left:50%;transform:translateX(-50%)",
      "bottom-left":  "bottom:0;left:0",
      "bottom-right": "bottom:0;right:0",
      "center":       "top:50%;left:50%;transform:translate(-50%,-50%)",
      "top":          "top:0;left:50%;transform:translateX(-50%)",
      "full":         "top:0;left:0;width:100%;height:100%",
    };
    const wmStyle = wmPosMap[wmPos] || wmPosMap["bottom"];
    const wmHtml = wmUrl ? `<div style="position:absolute;${wmStyle};z-index:0;pointer-events:none;">
      <img src="${wmUrl}" style="opacity:${wmOpacity};${wmPos==="full"?`width:100%;height:100%;object-fit:cover`:`width:${wmSize}%;max-width:none;object-fit:contain`};display:block;" /></div>` : "";

    // Meta-Zeilen (VOR headerHtml, da Design A metaHtml im Header braucht)
    const datumLabel = data.titel === "RECHNUNG" ? "Rechnungsdatum:" : data.titel === "OFFERTE" ? "Offertendatum:" : data.titel === "MAHNUNG" ? "Mahndatum:" : "Datum:";
    const metaRows: string[] = [];
    if (data.kundenNr) metaRows.push(`<tr><td style="color:#999;font-weight:400;padding:1px 4px 1px 0;white-space:nowrap;font-size:8.5pt;">Kundennummer:</td><td style="font-size:8.5pt;white-space:nowrap;padding-left:2px;">${data.kundenNr}</td></tr>`);
    metaRows.push(`<tr><td style="color:#999;font-weight:400;padding:1px 4px 1px 0;white-space:nowrap;font-size:8.5pt;">${datumLabel}</td><td style="font-size:8.5pt;white-space:nowrap;padding-left:2px;">${data.datum}</td></tr>`);
    if (data.faelligDatum) metaRows.push(`<tr><td style="color:#999;font-weight:400;padding:1px 4px 1px 0;white-space:nowrap;font-size:8.5pt;">Zahlbar bis:</td><td style="font-size:8.5pt;white-space:nowrap;padding-left:2px;">${data.faelligDatum}</td></tr>`);
    if (data.gueltigBis)  metaRows.push(`<tr><td style="color:#999;font-weight:400;padding:1px 4px 1px 0;white-space:nowrap;font-size:8.5pt;">Gültig bis:</td><td style="font-size:8.5pt;white-space:nowrap;padding-left:2px;">${data.gueltigBis}</td></tr>`);
    // "Unsere Referenz" entfernt (per User-Anfrage)
    const metaHtml = `<table style="border-collapse:collapse;width:auto;">${metaRows.join("")}</table>`;

    // Header
    let headerHtml = "";
    if (design === "B") {
      headerHtml = `<div style="background:${hc};color:${hcText};padding:22px 40px 18px;display:flex;align-items:center;gap:16px;${logoPos==="rechts"?"flex-direction:row-reverse":""}">
        <div style="flex-shrink:0">${logoHtml}</div>
        <div style="flex:1;">
          <div style="font-size:15pt;font-weight:700;color:${hcText};">${data.firma}</div>
          ${slogan ? `<div style="font-size:9pt;opacity:0.85;color:${hcText};">${slogan}</div>` : ""}
        </div>
        <div style="text-align:right;font-size:8pt;opacity:0.85;color:${hcText};">${data.firmaAdresse}<br>${data.firmaPlzOrt}</div>
      </div>`;
    } else if (design === "C") {
      headerHtml = `<div style="padding:16px 40px 6px;">${logoHtml}</div>`;
    } else if (design === "E") {
      // Elegant: Gradient-Linie
      headerHtml = `<div style="padding:20px 40px 10px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div style="flex-shrink:0">${logoHtml}<div style="font-size:8.5pt;color:#aaa;letter-spacing:0.1em;margin-top:3px;">${slogan.toUpperCase()}</div></div>
        <div style="text-align:right">
          <div style="font-size:13pt;font-weight:700;color:${hc};">${data.firma}</div>
          <div style="font-size:8.5pt;color:#888;">${data.firmaAdresse}, ${data.firmaPlzOrt}</div>
        </div>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,${hc},${fc});margin:0 40px 0;border-radius:2px;"></div>`;
    } else {
      // Design A: Header = Firmendaten links + Logo rechts (Swiss-Norm Bild-2-Layout)
      headerHtml = `<div style="padding:2px 40px 2px;display:flex;align-items:flex-start;justify-content:space-between;">
        <div style="flex:1;font-size:8pt;color:#555;line-height:1.5;">
          <div style="font-weight:700;font-size:9pt;color:#222;">${data.firma}</div>
          <div>${data.firmaAdresse}</div>
          <div>${data.firmaPlzOrt}</div>
          <div>${data.firmaTel}</div>
        </div>
        <div style="flex-shrink:0;text-align:right;">
          ${logoHtml}
          ${slogan ? `<div style="font-size:7.5pt;color:#aaa;margin-top:2px;">${slogan}</div>` : ""}
        </div>
      </div>
      <div style="height:2px;background:${hc};margin:0 40px 0;"></div>`;
    }

    // Positionen Tabelle
    const posHtml = data.positionen.map((p: any, i: number) => {
      const menge   = parseFloat(p.menge || p.anzahl || 1);
      const ep      = parseFloat(p.einzelpreis || p.preis || 0);
      const bet     = Number(p.total ?? p.betrag ?? (menge * ep));
      const einheit = p.einheit || "Stk.";

      // Beschreibung mit Unterpunkten:
      // Offerte: p.titel = Haupttitel, p.beschreibung = Unterzeilen (newline-getrennt)
      // Rechnung: p.beschreibung = erste Zeile Haupttitel, weitere Zeilen = Unterpunkte
      let haupttitel = "";
      let unterzeilen: string[] = [];

      if (p.titel) {
        // Offerte-Position: hat expliziten titel
        haupttitel = p.titel;
        const descLines = (p.beschreibung || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
        unterzeilen = descLines;
      } else if (p.beschreibung) {
        // Rechnung-Position: beschreibung, erste Zeile = Titel
        const lines = p.beschreibung.split("\n").map((l: string) => l.trim()).filter(Boolean);
        haupttitel = lines[0] || "";
        unterzeilen = lines.slice(1);
      }

      // HTML für Beschreibungs-Zelle aufbauen
      const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      let descHtml = `<span style="font-weight:600;color:#1a1a1a;">${esc(haupttitel)}</span>`;
      if (unterzeilen.length > 0) {
        descHtml += unterzeilen.map((z: string) =>
          `<br/><span style="font-size:8.5pt;color:#555;padding-left:8px;">– ${esc(z)}</span>`
        ).join("");
      }

      return `<tr style="border-bottom:1px solid #f0ebde">
        <td style="padding:7px 4px;color:#999;width:28px;vertical-align:top;">${(p.nr ?? i+1)}</td>
        <td style="padding:7px 4px;line-height:1.5;">${descHtml}</td>
        <td style="padding:7px 4px;text-align:right;color:#555;width:55px;vertical-align:top;">${menge % 1 === 0 ? menge.toFixed(0) : menge.toFixed(2)} ${einheit}</td>
        <td style="padding:7px 4px;text-align:right;color:#555;width:90px;vertical-align:top;">${fmtCHF(ep)}</td>
        <td style="padding:7px 4px;text-align:right;font-weight:600;width:90px;vertical-align:top;">${fmtCHF(bet)}</td>
      </tr>`;
    }).join("");

    // Totals
    const totalsHtml = showTotals ? `
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <div style="width:44%;font-size:9pt;">
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal</span><span>${fmtCHF(data.subtotal)}</span></div>
          ${(data.rabattPct && data.rabattPct > 0 && data.rabattBetrag) ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Rabatt ${data.rabattPct}%</span><span>- ${fmtCHF(data.rabattBetrag)}</span></div>` : ""}
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span>MWST ${data.mwstPct.toFixed(1)}%</span><span>${fmtCHF(data.mwstBetrag)}</span></div>
          ${data.mahngebuehr ? `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Mahngebühr</span><span>${fmtCHF(data.mahngebuehr)}</span></div>` : ""}
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1.5px solid ${hc};margin-top:3px;font-weight:700;font-size:11pt;color:${hc}">
            <span>Total</span><span>${fmtCHF(data.total)}</span>
          </div>
        </div>
      </div>` : "";

    // Footer — farbiger Balken wie in der Vorschau
    // Seitennummer: statisch übergeben (CSS counter in Puppeteer unzuverlässig)
    // footerHtml wird mit Platzhalter ##PAGE## gebaut — beim Mergen ersetzen
    const footerHtml = design === "E"
      ? `<div>
          <div style="height:2px;background:linear-gradient(90deg,${fc},${hc});margin:0 40px;border-radius:2px;"></div>
          <div style="padding:8px 40px 14px;font-size:8pt;color:#999;font-style:italic;display:flex;justify-content:space-between;">
            ${showContact ? `<div>${data.firma} · ${data.firmaTel} · ${data.firmaEmail}${data.firmaUid ? " · " + data.firmaUid : ""}</div>` : "<div></div>"}
            ${showPageNum ? `<div style="font-size:8pt;"></div>` : ""}
          </div>
        </div>`
      : `<div>
          <div style="background:${fc};color:${fcText};padding:6px 40px;font-size:8pt;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            ${showContact ? `<div>${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt} · ${data.firmaTel}${data.firmaUid ? " · " + data.firmaUid : ""}</div>` : "<div></div>"}
            <div style="font-size:8pt;opacity:0.85;" class="page-num-holder"></div>
          </div>
        </div>`;

    // Logo-Höhe in mm (bei 96dpi: 1mm ≈ 3.78px) — wird für dynamische Header-Höhe benötigt,
    // damit ein bis auf 400% skaliertes Logo nicht mit dem Inhalt darunter kollidiert.
    const logoHmm = Math.round(34 * logoScale / 100) / 3.78;
    // Zusätzliche Höhe (mm) für einen mehrzeiligen Slogan unter dem Logo (Design A),
    // damit der Header mitwächst und nichts mit der Trennlinie/dem Inhalt kollidiert.
    const sloganLinesForHdr = slogan ? String(slogan).split("\n").filter((l: string) => l.length > 0) : [];
    const sloganExtraMm = sloganLinesForHdr.length > 1 ? (sloganLinesForHdr.length - 1) * 2.6 : 0;
    // Gemeinsame Höhen für @page-Margins (Header/Footer nicht überlappen)
    const hdrH = (design === "B") ? (logoUrl ? Math.max(26, logoHmm + 12) : 20)
               : (design === "C") ? (logoUrl ? Math.max(18, logoHmm + 8) : 10)
               : (design === "E") ? (logoUrl ? Math.max(22, logoHmm + 10) : 14)
               : (design === "G") ? (logoUrl ? Math.max(26, logoHmm + 12) : 18)
               : (logoUrl ? Math.max(22, logoHmm + 10) + sloganExtraMm : 22); // Design A — Firma links + Logo frei positioniert (wächst mit Logo-Grösse + Slogan-Zeilen)
    const ftrH = (design === "E") ? 16 : 12;
    const padMm = 10; // Seitenrand in mm

    // Swiss-Norm Empfänger-Position (wird später in aHtml genutzt)
    // Vorberechnung hier damit apBlock max-width nutzen kann
    const _empfTopBody  = Math.max(0, 52 - (hdrH + 4));
    const _empfLeftBody = 145 - padMm; // 120mm (Empfänger bei 130mm ab Blatt)
    // apBlock darf nur bis links vom Empfänger reichen (11mm Sicherheitsabstand)
    const apBlockMaxWidth = _empfLeftBody - 11; // ca. 109mm

    // Gemeinsames CSS für alle Designs: fixed header/footer wiederholt sich auf jeder Seite
    const sharedFixedCss = `
      @page { margin: ${hdrH + 4}mm ${padMm}mm ${ftrH + 4}mm ${padMm}mm; }
      body { font-family:Arial,sans-serif;font-size:10pt;color:#222;margin:0;padding:0;  position:relative;}
      table { width:100%;border-collapse:collapse; }
      .pdf-header {
        position: fixed; top: 0; left: 0; right: 0;
        height: ${hdrH + 4}mm; overflow: hidden;
        z-index: 100;
        -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
      }
      .pdf-footer {
        position: fixed; bottom: 0; left: 0; right: 0;
        height: ${ftrH + 4}mm; overflow: hidden;
        z-index: 100;
        -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
      }
      .pdf-content { position: relative; z-index: 1; }
      /* thead einmalig (kein Wiederholungs-Header auf Seite 2) um Overlap mit fixed Header zu vermeiden */
      thead { display: table-row-group; }
      tbody { display: table-row-group; }
      tr { page-break-inside: avoid; }
      * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    `;
    const pad = 40; // Seitenrand in px für Inline-Styles

    // Für Design A: Titel ist bereits im Header — nicht nochmals im Body zeigen
    // titelImHeader: false = Titel+Meta immer im Content (Design A: Bild-2-Layout)
    const titelImHeader = (design === "G"); // nur G hat Titel im Header

    // Ansprechperson — Reihenfolge/Quelle steuerbar über Vorlagen-Feld ansprechperson_quelle
    // ("intern" | "extern" | "manuell"). Vorher war die Reihenfolge fest hartkodiert und
    // diese Einstellung dadurch wirkungslos. Fallback-Kette bleibt wie zuvor erhalten,
    // falls die bevorzugte Quelle leer ist — damit nie eine leere Ansprechperson entsteht,
    // nur weil die gewählte Quelle im konkreten Dokument nichts liefert.
    const apAktiv = v.ansprechperson_aktiv !== false;
    const apLabel = v.ansprechperson_label || "Ansprechpartner";
    const apQuelle: string = v.ansprechperson_quelle || "intern";
    const ansprechperson = apQuelle === "extern"
      ? (data.ansprechpersonExtern || data.ansprechpersonIntern || data.ansprechpersonManuell || "")
      : apQuelle === "manuell"
      ? (data.ansprechpersonManuell || data.ansprechpersonIntern || data.ansprechpersonExtern || "")
      : (data.ansprechpersonIntern || data.ansprechpersonManuell || data.ansprechpersonExtern || "");

    // E-Mail + Telefon: IMMER aus Mitarbeiter-DB laden (Name als Schlüssel)
    // Achtung: Variable heisst maResult (nicht data) um Konflikt mit dem Parameter data zu vermeiden
    let apEmail = data.ansprechpersonInternEmail || "";
    let apTelefon = data.ansprechpersonInternTelefon || "";

    // Immer DB-Lookup wenn Name vorhanden — so funktioniert es ohne Dialog-Input
    if (ansprechperson) {
      const maResult = await supabase.from("mitarbeiter").select("vorname,nachname,email_geschaeftlich,telefon_direkt,email,telefon");
      const maRows = maResult.data;
      if (maRows && maRows.length > 0) {
        const nameLower = ansprechperson.trim().toLowerCase();
        const ma = maRows.find((m: any) => {
          const full = `${m.vorname || ""} ${m.nachname || ""}`.trim().toLowerCase();
          return full === nameLower || full.includes(nameLower) || nameLower.includes(full);
        });
        if (ma) {
          // DB hat immer Vorrang — aktuellste Daten aus Mitarbeiterakte
          apEmail = ma.email_geschaeftlich || ma.email || apEmail;
          apTelefon = ma.telefon_direkt || ma.telefon || apTelefon;
        }
      }
    }

    // Anrede für "Sehr geehrte/r" Block
    const anredeText = (() => {
      const anrede = data.anrede || "";
      const name = data.empfaenger || "";
      if (!name) return "";
      if (/^herr/i.test(anrede)) return `Sehr geehrter Herr ${name}`;
      if (/^frau/i.test(anrede)) return `Sehr geehrte Frau ${name}`;
      return `Sehr geehrte/r ${name}`;
    })();
    // Nummer des Dokuments für die Zeile oberhalb Sehr geehrte
    const docNrLine = data.nummer ? `${data.titel} Nr. ${data.nummer}` : "";

    // apBlockMaxWidth = 97mm (Design A: verhindert Überlappung mit Empfänger bei 108mm)
    const _apMaxW = (design === "A" || design === "B" || design === "C" || design === "E") ? `max-width:${apBlockMaxWidth}mm;` : "";

    const apBlock = apAktiv && ansprechperson
      ? `<div style="font-size:9pt;color:#444;margin-bottom:0;${_apMaxW}">
          <strong>${apLabel}:</strong> ${ansprechperson}${
            apEmail ? `<br><span style="font-weight:normal;">E-Mail: ${apEmail}</span>` : ""
          }${
            apTelefon ? `<br><span style="font-weight:normal;">Telefon Direkt: ${apTelefon}</span>` : ""
          }
          <div style="margin-top:4px;">${metaHtml}</div>
          ${anredeText ? `<div style="margin-top:18px;font-size:10pt;font-weight:600;color:#222;">${anredeText}</div>` : ""}
        </div>`
      : `<div style="font-size:9pt;color:#444;margin-bottom:0;${_apMaxW}">
          <div>${metaHtml}</div>
          ${anredeText ? `<div style="margin-top:18px;font-size:10pt;font-weight:600;color:#222;">${anredeText}</div>` : ""}
        </div>`;

    // Positionstexte (Spaltenbezeichnungen)
    const pt = (typeof v.positionstexte === "object" && v.positionstexte) ? v.positionstexte : {};
    const ptPos   = (pt as any).pos          || "Pos.";
    const ptBeschr= (pt as any).beschreibung || "Beschreibung";
    const ptMenge = (pt as any).menge        || "Menge";
    const ptPreis = (pt as any).preis        || "Preis";
    const ptTotal = (pt as any).total        || "Total";


    // ─── Design G: Swiss Classic ─────────────────────────────────────────────
    if (design === "G") {
      // Design G: Swiss Classic
      const gHeaderHtml = `<div style="padding:20px 40px 10px;border-top:2px solid ${hc};background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;${logoPos==="rechts"?"flex-direction:row-reverse;":""}">
              <div style="flex-shrink:0">
                ${logoHtml}
                ${slogan ? `<div style="font-size:8pt;color:#888;margin-top:3px;">${slogan}</div>` : ""}
              </div>
              <div style="text-align:right;font-size:8.5pt;color:#555;line-height:1.6;">
                <div style="font-weight:700;color:#222;">${data.firma}</div>
                <div>${data.firmaAdresse} · ${data.firmaPlzOrt} · ${data.firmaTel}</div>
              </div>
            </div>
            <div style="height:0.5px;background:#ccc;margin:10px 0 0;"></div>
          </div>`;
      const gHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="pptr-show-page-num" content="${showPageNum ? "1" : "0"}">
      <style>
        ${sharedFixedCss}
        th { background:#f5f5f5;color:#333;padding:8px 4px;text-align:left;font-size:8.5pt;border-bottom:1.5px solid #222; }
        td { font-size:9pt; }
        .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
      </style></head>
      <body style="position:relative;">
        ${wmHtml}
        <div class="pdf-header">${gHeaderHtml}</div>
        <div class="pdf-footer">${footerHtml}</div>
        <div style="margin-top:${Math.max(0, absenderTopMm - (hdrH + 4))}mm;min-height:25mm;overflow:hidden;">
          <div style="float:right;width:90mm;text-align:right;font-size:10pt;color:#333;line-height:1.55;">
            <div style="font-size:7.5pt;color:#999;margin-bottom:3px;white-space:nowrap;">${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
            <div style="font-weight:600;">${data.empfaenger}</div>
            ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
            ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
          </div>
        </div>
        <div class="pdf-content" style="padding:42mm ${pad}px ${ftrH+8}mm;">
          <div style="font-size:8pt;color:#aaa;margin-bottom:3px;">${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
            <div style="font-size:15pt;font-weight:700;color:#111;">${data.titel} Nr. ${data.nummer}</div>
            <div style="font-size:8.5pt;color:#555;text-align:right;line-height:1.6;">
              <div><b style="color:#999;font-weight:400">Datum: </b>${data.datum}</div>
              ${data.gueltigBis ? `<div><b style="color:#999;font-weight:400">Gültig bis: </b>${data.gueltigBis}</div>` : ""}
              ${data.faelligDatum ? `<div><b style="color:#999;font-weight:400">Zahlbar bis: </b>${data.faelligDatum}</div>` : ""}
            </div>
          </div>
          ${apBlock}
          ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
          <table>
            <thead><tr>
              <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
              <th style="width:65px;text-align:right">${ptMenge}</th>
              <th style="width:90px;text-align:right">${ptPreis}</th>
              <th style="width:90px;text-align:right">${ptTotal}</th>
            </tr></thead>
            <tbody>${posHtml}</tbody>
          </table>
          ${totalsHtml}
          ${schl ? `<div class="schluss" style="margin-top:14px;">${schl}</div>` : ""}
          ${data.extraHtml || ""}
        </div>
      </body></html>`;
      return gHtml;
    }


    // ── Design A (default) + Fallback für B/C/E ──
    // Swiss-Norm SN 010130 Empfänger-Position (Fenstercouvert C5/C6):
    // Adressfenster: top=52mm vom Blattrand, left=100mm vom Blattrand
    // @page margin: top=(hdrH+4)mm, left=padMm=10mm
    // position:absolute ist relativ zum body (der NACH dem @page-margin startet).
    // Empfänger-Position: bei ALLEN Dokumenten fest rechtsbündig am Content-Rand
    // (Swiss-Norm-Fensterumschlag, Content startet bei 66mm ab Blattoberkante).
    const empfBlockBreiteMm = 76;
    const empfTopAbs  = 52 - (hdrH + 4);
    const empfLeftAbs = (210 - padMm * 2) - empfBlockBreiteMm;
    const contentPadTopMm = 66 - (hdrH + 4);

    // ─── Puppeteer displayHeaderFooter Templates (Design A) ───────────────────
    // Diese Methode ist zuverlässiger als position:fixed (kein Overlap, korrekte Seitenzahlen)
    // WICHTIG: headerTemplate/footerTemplate müssen vollständig inline-styled sein
    // Logos als base64-DataURL funktionieren, externe URLs nicht
    // Logo: freie X/Y-Positionierung innerhalb der Header-Box (0-100%).
    // Header-Box ist ~22mm hoch ≈ 83px (bei 96dpi Puppeteer-Rendering).
    // Logo-Grösse skaliert bis 400% — bei sehr grossen Werten wird die Box
    // automatisch etwas höher, damit das Logo nicht abgeschnitten wird.
    const pptrLogoW = Math.round(60 * logoScale / 100);
    const pptrLogoH = Math.round(34 * logoScale / 100);
    // Reservierte Höhe für den Slogan unterhalb des Logos (verhindert Overlap mit der Trennlinie).
    // Wächst mit der Anzahl Zeilen (Slogan kann mehrzeilig sein, per Zeilenumbruch getrennt).
    const sloganLines = sloganLinesForHdr;
    const pptrSloganReserve = sloganLines.length > 0 ? (10 + sloganLines.length * 10) : 0;
    // Jede Zeile wird einzeln in ein eigenes div mit white-space:nowrap gerendert (statt
    // per <br/> in einem gemeinsamen Block), damit der Browser NIE innerhalb einer vom
    // Nutzer eingegebenen Zeile zusätzlich umbricht — nur die expliziten Enter-Umbrüche
    // aus der Textarea erzeugen neue Zeilen.
    const sloganHtml = sloganLines.map((l: string) => `<div style="white-space:nowrap;">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`).join("");
    // Header-Box-Höhe leitet sich direkt von hdrH (mm) ab — so bleibt die sichtbare Box
    // exakt so hoch wie der reservierte Seiten-Rand (kein Clipping, kein Overlap mit Inhalt).
    const pptrHeaderBoxH = Math.round(hdrH * 3.78);
    // logoOffX/Y (0-100%) → Position der linken-oberen Ecke des Logos innerhalb der Box,
    // mit Innenabstand (40px seitlich, 2px oben/unten). Der Y-Bereich endet vor der
    // Slogan-Reserve, damit Logo+Slogan nie mit der Trennlinie kollidieren.
    const pptrLogoLeft = `calc(40px + (100% - 80px - ${pptrLogoW}px) * ${(logoOffX/100).toFixed(3)})`;
    const pptrLogoTop  = `calc(2px + (${pptrHeaderBoxH}px - 4px - ${pptrSloganReserve}px - ${pptrLogoH}px) * ${(logoOffY/100).toFixed(3)})`;
    // Slogan-Breite: an der längsten Zeile orientiert (statt an der Logo-Breite), damit
    // der Slider bei 100% den Text wirklich bis an den rechten Rand schieben kann —
    // eine zu breite Box liess den linksbündigen Text bei 100% optisch "gebremst" wirken.
    const pptrSloganLongestLine = sloganLines.reduce((max: number, l: string) => Math.max(max, l.length), 0);
    // Grosszuegig bemessen (6px/Zeichen, kein Cap nach oben) - da jede Zeile jetzt per
    // white-space:nowrap gerendert wird, darf die Box ruhig breiter sein als der Text;
    // wichtig ist nur, dass sie NIE schmaler ist als die laengste eingegebene Zeile.
    const pptrSloganW = Math.max(50, pptrSloganLongestLine * 6);
    // Freie horizontale Slogan-Position (0-100%), unabhängig von der Logo-Position
    // verschiebbar — analog zur Logo-X-Positionierung, aber mit eigenem Offset.
    const pptrSloganLeft = `calc(40px + (100% - 80px - ${pptrSloganW}px) * ${(sloganOffX/100).toFixed(3)})`;
    const pptrSloganStyle = `left:${pptrSloganLeft};text-align:left;`;
    // Firmenblock (links oben) weicht dem Logo horizontal aus, falls das Logo in der linken
    // Hälfte platziert ist — sonst würden sich Firmentext und Logo überlappen.
    const pptrFirmaLeft = logoOffX < 50 ? `calc(${pptrLogoLeft} + ${pptrLogoW}px + 12px)` : "40px";
    const pptrHeaderHtml = `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:0;box-sizing:border-box;overflow:hidden;">
      <div style="position:relative;height:${pptrHeaderBoxH}px;padding:2px 0;">
        <div style="position:absolute;top:2px;left:${pptrFirmaLeft};right:40px;font-size:8pt;color:#555;line-height:1.4;">
          <div style="font-weight:700;font-size:9pt;color:#222;">${data.firma}</div>
          <div style="font-size:7.5pt;">${data.firmaAdresse}, ${data.firmaPlzOrt} · ${data.firmaTel}</div>
        </div>
        ${logoUrl ? `<img src="${logoUrl}" style="position:absolute;left:${pptrLogoLeft};top:${pptrLogoTop};max-width:${pptrLogoW}px;max-height:${pptrLogoH}px;object-fit:contain;display:block;">` : ""}
        ${sloganLines.length > 0 ? `<div style="position:absolute;top:calc(${pptrLogoTop} + ${pptrLogoH}px + 2px);${pptrSloganStyle}max-width:${pptrSloganW}px;font-size:7pt;color:#aaa;line-height:1.3;">${sloganHtml}</div>` : ""}
      </div>
      <div style="height:2px;background:${hc};margin:0 40px;"></div>
    </div>`;
    const pptrFooterHtml = `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;">
      <div style="background:${fc};color:${fcText};padding:5px 40px;font-size:8pt;display:flex;justify-content:space-between;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        ${showContact ? `<span>${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt} · ${data.firmaTel}${data.firmaUid ? " · " + data.firmaUid : ""}</span>` : "<span></span>"}
        <span style="font-size:8pt;opacity:0.9;"></span>
      </div>
    </div>`;
    // URL-encode für Meta content="..."
    const pptrHeaderEnc = encodeURIComponent(pptrHeaderHtml);
    const pptrFooterEnc = encodeURIComponent(pptrFooterHtml);
    // Margins: top = Höhe des Header-Templates (~22mm), bottom = Höhe Footer (~12mm)
    const pptrMarginTop = `${hdrH + 4}mm`; // = 26mm
    const pptrMarginBot = `${ftrH + 4}mm`; // = 16mm

    // Empfänger-Position: Im displayHeaderFooter-Modus startet body NACH dem margin-top
    // Swiss-Norm: 52mm ab Blatt = (hdrH+4)mm (margin) + empfTopAbs mm body
    // empfTopAbs = 52 - (hdrH+4) = gleich wie vorher

    const aHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <meta name="pptr-header" content="${pptrHeaderEnc}">
    <meta name="pptr-footer" content="${pptrFooterEnc}">
    <meta name="pptr-margin-top" content="${pptrMarginTop}">
    <meta name="pptr-margin-bottom" content="${pptrMarginBot}">
    <meta name="pptr-show-page-num" content="${showPageNum ? "1" : "0"}">
    <style>
      /* Kein @page margin nötig — Puppeteer margin wird über pptr-meta gesetzt */
      body { font-family:Arial,sans-serif;font-size:10pt;color:#222;margin:0;padding:0; }
      table { width:100%;border-collapse:collapse; }
      th { background:${hc};color:${hcText};padding:8px 4px;text-align:left;font-size:8.5pt; }
      td { font-size:9pt; }
      .intro,.schluss { font-size:9pt;color:#444;white-space:pre-line; }
      tr { page-break-inside: avoid; }
      * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    </style></head>
    <body>
      ${wmHtml}

      <!-- Empfänger Swiss-Norm SN 010130: nur auf Seite 1 -->
      <!-- Im displayHeaderFooter-Modus startet body bei margin-top = ${hdrH+4}mm vom Blatt -->
      <!-- 52mm ab Blatt - ${hdrH+4}mm margin = ${empfTopAbs}mm vom body-top -->
      <div style="position:relative;height:0;overflow:visible;">
      <div style="position:absolute;top:${empfTopAbs}mm;left:${empfLeftAbs}mm;width:76mm;font-size:9.5pt;color:#222;line-height:1.55;">
        <div style="font-size:7pt;color:#888;margin-bottom:2px;white-space:nowrap;border-bottom:0.5px solid #bbb;padding-bottom:2px;">${data.firma} · ${data.firmaAdresse} · ${data.firmaPlzOrt}</div>
        <div style="font-weight:700;margin-top:2px;">${data.empfaenger}</div>
        ${data.empfaengerStrasse ? `<div>${data.empfaengerStrasse}</div>` : ""}
        ${data.empfaengerPlzOrt  ? `<div>${data.empfaengerPlzOrt}</div>` : ""}
      </div>
      </div><!-- /empfaenger-wrapper -->

      <div style="padding:${contentPadTopMm}mm ${pad}px 8mm;">
        <!-- Titel gross (Rechnung / Offerte) -->
        <div style="margin-bottom:4px;">
          <div style="font-size:${data.titel.length > 12 ? '15' : '22'}pt;font-weight:700;color:#111;">${data.titel}</div>
        </div>
        <!-- Ansprechpartner + Meta + Anrede -->
        <div style="margin-top:14px;margin-bottom:14px;">
          ${apBlock}
        </div>
        ${einl ? `<div class="intro" style="margin-bottom:12px;">${einl}</div>` : ""}
        <!-- Positionen Tabelle -->
        <table style="page-break-inside:auto;">
          <thead><tr>
            <th style="width:28px">${ptPos}</th><th>${ptBeschr}</th>
            <th style="width:65px;text-align:right">${ptMenge}</th>
            <th style="width:90px;text-align:right">${ptPreis}</th>
            <th style="width:90px;text-align:right">${ptTotal}</th>
          </tr></thead>
          <tbody>${posHtml}</tbody>
        </table>
        ${totalsHtml}
        <!-- Grussformel nach Positionen (immer nach der letzten Zeile) -->
        ${schl ? `<div class="schluss" style="margin-top:20px;">${schl}</div>` : `<div style="margin-top:20px;font-size:9pt;color:#444;">Wir freuen uns auf Ihre Rückmeldung.<br><br>Mit freundlichen Grüssen<br><strong>${data.firma}</strong></div>`}
        ${data.extraHtml || ""}
      </div>
      ${data.extraHtmlFullWidth ? `<div style="font-family:Arial,Helvetica,sans-serif;">${data.extraHtmlFullWidth}</div>` : ""}
      ${fusstext ? `<div style="page-break-inside:avoid;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#444;white-space:pre-line;margin:6mm 40px 0;line-height:1.4;">${fusstext}</div>` : ""}
    </body></html>`;
    return aHtml;
  }


  // Helper: Adresse-String in Strasse + PLZ/Ort aufteilen
  // Kundennummer aus der kunden-Tabelle anhand des Namens suchen
  async function getKundenNr(name: string): Promise<string> {
    if (!name) return "";
    // Normalisieren: mehrfache Leerzeichen entfernen, lowercase
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const nameLower = norm(name);
    const knResult = await supabase.from("kunden").select("nr,vorname,nachname,firma");
    const knRows = knResult.data || [];
    const found = knRows.find((k: any) => {
      const fullName = norm([k.vorname, k.nachname].filter(Boolean).join(" "));
      const firma = norm(k.firma || "");
      return fullName === nameLower || firma === nameLower ||
             nameLower.includes(fullName) || fullName.includes(nameLower) ||
             // Auch Teilübereinstimmung bei Wörtern (z.B. "Quierin Klaus" ↔ "Quierin  Klaus")
             fullName.split(" ").filter(Boolean).every((w: string) => nameLower.includes(w));
    });
    return found?.nr || "";
  }

  async function getKundenAnrede(name: string): Promise<string> {
    if (!name) return "";
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const nameLower = norm(name);
    const { data: knRows } = await supabase.from("kunden").select("anrede,vorname,nachname,firma");
    const found = (knRows || []).find((k: any) => {
      const fullName = norm([k.vorname, k.nachname].filter(Boolean).join(" "));
      const firma = norm(k.firma || "");
      return fullName === nameLower || firma === nameLower ||
             nameLower.includes(fullName) || fullName.includes(nameLower) ||
             fullName.split(" ").filter(Boolean).every((w: string) => nameLower.includes(w));
    });
    return found?.anrede || "";
  }

  function splitAdresse(adresse: string): { strasse: string; plzOrt: string } {
    if (!adresse) return { strasse: "", plzOrt: "" };
    const lines = adresse.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      // Mehrzeilig: letzte Zeile ist PLZ/Ort oder letzte zwei zusammen
      const lastLine = lines[lines.length - 1];
      const secondLast = lines.length >= 3 ? lines[lines.length - 2] : null;
      // Wenn vorletzte Zeile nur PLZ (4-5 Stellen), merge mit letzter
      if (secondLast && /^\d{4,5}$/.test(secondLast)) {
        return {
          strasse: lines.slice(0, -2).join(", ") || lines[0],
          plzOrt: secondLast + " " + lastLine,
        };
      }
      return {
        strasse: lines.slice(0, -1).join(", "),
        plzOrt: lastLine,
      };
    }
    // Einzeilig: PLZ erkennen (4-5 Stellen)
    const plzMatch = adresse.match(/^(.+?)\s+(\d{4,5}\s+.+)$/);
    if (plzMatch) {
      return { strasse: plzMatch[1].trim(), plzOrt: plzMatch[2].trim() };
    }
    return { strasse: adresse, plzOrt: "" };
  }



  // ─── Browser-Singleton: eine Instanz für alle PDF-Requests ─────────────────
  // Vermeidet OOM auf Render Free Plan (jede neue Instanz = ~200MB RAM)
  let _browser: any = null;
  let _browserPid: number | null = null;
  const CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-first-run",
    "--safebrowsing-disable-auto-update",
    // --single-process wurde entfernt: bekannt instabil in Docker/Linux-
    // Containern (fuehrt zu stillen Abstuerzen "Failed to launch the browser
    // process: Code: null" ohne verwertbare Fehlermeldung). --no-zygote
    // allein reicht fuer die Prozess-Reduktion und ist stabil.
    //
    // --memory-pressure-off wurde entfernt: dieses Flag weist Chrome an,
    // Speicherdruck-Warnungen zu IGNORIEREN und eben NICHT automatisch
    // Speicher freizugeben. Auf einem RAM-begrenzten Plan (Render Starter,
    // 512MB) ist das kontraproduktiv und kann den OOM-Kill sogar begünstigen.
    "--js-flags=--max-old-space-size=192",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-ipc-flooding-protection",
    "--renderer-process-limit=1",
    "--window-size=1024,1400",
    // Minimaler Docker-Container hat urspruenglich keinen D-Bus/System-Bus
    // laufen gehabt — wird jetzt via docker-entrypoint.sh vor dem Start
    // hochgefahren. --no-zygote reduziert zusaetzlich Prozess-Spawning-
    // Probleme in eingeschraenkten Container-Umgebungen.
    "--disable-features=Translate,BackForwardCache,AudioServiceOutOfProcess",
    "--no-zygote",
  ];

  async function getBrowser(): Promise<any> {
    if (_browser) {
      try {
        // Prüfen ob noch alive
        await _browser.version();
        return _browser;
      } catch {
        _browser = null;
      }
    }
    const puppeteer = await import("puppeteer");
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    _browser = await puppeteer.default.launch({
      executablePath: execPath,
      args: CHROMIUM_ARGS,
      // dumpio: leitet Chromiums komplette stdout/stderr-Ausgabe in die
      // Server-Logs (Render "Application logs") weiter. Ohne dieses Flag
      // wird bei einem stillen Absturz (z.B. OOM-Kill auf einem RAM-
      // begrenzten Plan wie Render "Starter", 512MB) oft nur "Code: null"
      // ohne echten Grund angezeigt.
      dumpio: true,
    });
    _browser.on("disconnected", () => { _browser = null; });
    return _browser;
  }

  // Rendert eine HTML-Seite zu PDF — mit Retry bei Browser-Crash
  async function renderPageToPdf(html: string, waitUntil: "domcontentloaded" | "networkidle0" = "domcontentloaded", pdfOptions?: any): Promise<Buffer> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let page: any = null;
      try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setContent(html, { waitUntil });
        const opts = {
          format: "A4",
          printBackground: true,
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
          ...(pdfOptions || {})
        };
        const pdfBuf = await page.pdf(opts);
        return Buffer.from(pdfBuf);
      } catch (err: any) {
        // Browser abgestürzt → singleton zurücksetzen, nochmals versuchen
        _browser = null;
        if (attempt >= 2) throw err;
        await new Promise(r => setTimeout(r, 800));
      } finally {
        try { if (page) await page.close(); } catch {}
      }
    }
    throw new Error("PDF render failed after 3 attempts");
  }

  async function renderPdfFromHtml(html: string): Promise<Buffer> {
    return renderPageToPdf(html, "domcontentloaded");
  }

  // Rechnung PDF: Ein einziger Puppeteer-Render — QR-Bill ist inline via extraHtmlFullWidth eingebettet
  // htmlSeiten enthält meta-Tags für Header/Footer (pptr-header / pptr-footer)
  async function renderRechnungPdfFromHtml(htmlSeiten: string): Promise<Buffer> {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib") as any;

    // Puppeteer displayHeaderFooter: Header/Footer aus HTML extrahieren
    let pdfOptions: any = {};
    const headerMetaMatch = htmlSeiten.match(/<meta\s+name="pptr-header"\s+content="([^"]+)"/);
    const footerMetaMatch = htmlSeiten.match(/<meta\s+name="pptr-footer"\s+content="([^"]+)"/);
    const topMarginMatch  = htmlSeiten.match(/<meta\s+name="pptr-margin-top"\s+content="([^"]+)"/);
    const botMarginMatch  = htmlSeiten.match(/<meta\s+name="pptr-margin-bottom"\s+content="([^"]+)"/);
    // show_page_num aus PDF-Vorlage: steuert, ob die "Seite X / Y"-Fussnote gezeichnet wird.
    // Default true, falls kein Meta-Tag vorhanden ist (Abwärtskompatibilität).
    const showPageNumMatch = htmlSeiten.match(/<meta\s+name="pptr-show-page-num"\s+content="([^"]+)"/);
    const showPageNumFlag = showPageNumMatch ? showPageNumMatch[1] === "1" : true;
    if (headerMetaMatch && footerMetaMatch) {
      pdfOptions = {
        displayHeaderFooter: true,
        headerTemplate: decodeURIComponent(headerMetaMatch[1]),
        footerTemplate: decodeURIComponent(footerMetaMatch[1]),
        margin: {
          top: topMarginMatch ? topMarginMatch[1] : "25mm",
          bottom: botMarginMatch ? botMarginMatch[1] : "15mm",
          left: "10mm",
          right: "10mm"
        }
      };
    }

    // Einziger Render — alle Seiten inkl. QR-Bill in einem HTML-Dokument
    const pdfBuf = await renderPageToPdf(htmlSeiten, "domcontentloaded", Object.keys(pdfOptions).length ? pdfOptions : undefined);

    // Seitenzahlen via pdf-lib auf alle Seiten schreiben (weisser Text auf Footer-Balken)
    const doc = await PDFDocument.load(pdfBuf);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const totalPages = doc.getPageCount();
    const white = rgb(1, 1, 1);
    if (showPageNumFlag) {
      for (let i = 0; i < totalPages; i++) {
        const pg = doc.getPage(i);
        const { width } = pg.getSize();
        const pageNumText = `Seite ${i + 1} / ${totalPages}`;
        const textWidth = font.widthOfTextAtSize(pageNumText, 8);
        pg.drawText(pageNumText, {
          x: width - 40 - textWidth,
          y: 14,
          size: 8,
          font,
          color: white,
          opacity: 0.9,
        });
      }
    }
    return Buffer.from(await doc.save());
  }

  // Bug-Fix: Skonto-Text fuer Rechnungs-PDF dynamisch berechnen (statt statischer
  // Platzhaltertext in der PDF-Vorlage). Liest Skontosatz (%) aus der
  // vorkalkulation_config des zugehoerigen Auftrags und berechnet den Skontobetrag
  // sowie den bei fristgerechter Zahlung faelligen Betrag direkt aus dem tatsaechlichen
  // Rechnungsbruttobetrag (aus der rechnungen-Tabelle / den PDF-Positionen berechnet,
  // NICHT aus einem Spiegelfeld). Regeln:
  //   - Skontosatz > 0  -> NUR die Skonto-Zeile mit ausgefuellten Werten anzeigen.
  //   - Skontosatz = 0 / nicht konfiguriert -> NUR "ohne Abzug"-Zeile anzeigen.
  //   - Zahlungsfrist Default 30 Tage, Skontofrist Default 10 Tage (sofern nicht
  //     anderweitig konfiguriert; es existieren aktuell keine eigenen DB-Spalten dafuer).
  async function buildSkontoText(auftragId: string | null | undefined, bruttoBetrag: number): Promise<string> {
    const ZAHLUNGSFRIST_TAGE_DEFAULT = 30;
    const SKONTOFRIST_TAGE_DEFAULT = 10;
    let skontoProzent = 0;
    if (auftragId) {
      const { data: vk } = await supabase
        .from("vorkalkulation_config")
        .select("skonto_prozent")
        .eq("auftrag_id", auftragId)
        .maybeSingle();
      skontoProzent = Number(vk?.skonto_prozent) || 0;
    }
    if (skontoProzent > 0) {
      const skontoBetrag = Math.round(bruttoBetrag * (skontoProzent / 100) * 100) / 100;
      const zahlbarBetrag = Math.round((bruttoBetrag - skontoBetrag) * 100) / 100;
      const skontoProzentStr = Number.isInteger(skontoProzent) ? String(skontoProzent) : skontoProzent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
      return `Zahlbar innert ${ZAHLUNGSFRIST_TAGE_DEFAULT} Tagen netto. Bei Zahlung innert ${SKONTOFRIST_TAGE_DEFAULT} Tagen gewähren wir ${skontoProzentStr}% Skonto (CHF ${skontoBetrag.toFixed(2)}), zahlbar CHF ${zahlbarBetrag.toFixed(2)}.`;
    }
    return `Zahlbar innert ${ZAHLUNGSFRIST_TAGE_DEFAULT} Tagen ohne Abzug.`;
  }

  // Swiss QR-Bill Inline-Block — gemeinsam genutzt von echter Rechnungserzeugung UND Live-Vorschau,
  // damit beide exakt dasselbe Ergebnis produzieren.
  async function buildQrInlineBlock(params: {
    sMap: Record<string, string>;
    totalInkl: number;
    rechnungsNr: string;
    faelligStr?: string;
    empfaenger?: string;
    empStrasse?: string;
    empPlzOrt?: string;
  }): Promise<string> {
    const { sMap, totalInkl, rechnungsNr, faelligStr, empfaenger = "", empStrasse = "", empPlzOrt = "" } = params;
    const ibanRaw = sMap.bank_iban || "";
    const ibanMissing = !ibanRaw || ibanRaw.trim() === "";
    const iban = ibanRaw || "CH00 0000 0000 0000 0000 0";
    const ibanClean = iban.replace(/\s/g, "");
    const betragFormatted = totalInkl.toFixed(2);
    const firmaPlzOrtRaw = sMap.plz_ort || "8580 Sommeri";
    const firmaPlzMatch = firmaPlzOrtRaw.match(/^(\d{4})\s+(.+)$/);
    const firmaPlz  = firmaPlzMatch ? parseInt(firmaPlzMatch[1]) : 8580;
    const firmaOrt  = firmaPlzMatch ? firmaPlzMatch[2] : firmaPlzOrtRaw;

    const empPlzMatch = empPlzOrt.match(/^(\d{4,5})\s+(.+)$/);
    const empPlzNum = empPlzMatch ? parseInt(empPlzMatch[1]) : 0;
    const empOrtOnly = empPlzMatch ? empPlzMatch[2] : (empPlzOrt || "");

    let qrCodeSvg = "";
    let qrIbanError = "";
    const ibanValid = /^(CH|LI)[0-9]{19}$/.test(ibanClean);
    if (!ibanClean) {
      qrIbanError = "Keine IBAN hinterlegt — bitte in Einstellungen → Bank eintragen.";
    } else if (!ibanValid) {
      qrIbanError = `IBAN ungültig (${ibanClean}) — CH-IBAN hat 21 Zeichen, z.B. CH56 0483 5012 3456 7800 9. Bitte in Einstellungen korrigieren.`;
    }
    if (!qrIbanError) {
      try {
        const { SwissQRCode } = await import("swissqrbill/svg") as any;
        const iidNum = parseInt(ibanClean.substring(4, 9));
        const isQrIban = iidNum >= 30000 && iidNum <= 31999;

        const genQrRef = (nr: string): string => {
          const digits = nr.replace(/\D/g, "").padStart(26, "0").slice(0, 26);
          const table = [0,9,4,6,8,2,7,1,3,5];
          let carry = 0;
          for (const d of digits) carry = table[(carry + parseInt(d)) % 10];
          return digits + ((10 - carry) % 10);
        };

        const qrRef = isQrIban ? genQrRef(rechnungsNr) : undefined;

        const qrBillData: any = {
          currency: "CHF" as const,
          amount: totalInkl,
          creditor: {
            account: ibanClean,
            name: firmennameAusSettings(sMap),
            address: sMap.adresse || "Hefenhoferstrasse 7",
            zip: firmaPlz,
            city: firmaOrt,
            country: "CH"
          },
        };
        if (qrRef) {
          qrBillData.reference = qrRef;
        } else {
          qrBillData.message = "Rechnung " + rechnungsNr;
        }
        if (empfaenger && empPlzNum && empOrtOnly) {
          qrBillData.debtor = {
            name: empfaenger,
            address: empStrasse || "",
            zip: empPlzNum,
            city: empOrtOnly,
            country: "CH"
          };
        }
        const qrInstance = new SwissQRCode(qrBillData, 46);
        qrCodeSvg = qrInstance.toString();
      } catch (e: any) {
        qrIbanError = "QR-Code Fehler: " + (e?.message || String(e));
        console.error("SwissQRCode error:", e);
      }
    }

    const firmaName = firmennameAusSettings(sMap);
    const firmaAdr  = sMap.adresse    || "Hefenhoferstrasse 7";
    const ibanFormatted = ibanClean.replace(/(.{4})/g, "$1 ").trim();

    return `
<div style="page-break-before:always;page-break-inside:avoid;font-family:Arial,Helvetica,sans-serif;margin-top:8mm;">
  ${(ibanMissing || qrIbanError) ? `<div style="background:#fff3cd;border:1px solid #ffc107;padding:6px 10px;margin-bottom:5mm;font-size:8pt;color:#856404;">&#9888; ${qrIbanError || "Bitte IBAN in Einstellungen hinterlegen."}</div>` : ""}
  <div style="display:flex;align-items:center;margin-bottom:3mm;">
    <div style="flex:1;border-top:1px dashed #000;"></div>
    <div style="padding:0 2mm;font-size:11pt;line-height:1;">&#9986;</div>
  </div>
  <div style="display:flex;align-items:flex-start;width:100%;min-height:85mm;">
    <div style="width:62mm;flex-shrink:0;padding:0 4mm;border-right:1px solid #000;min-height:85mm;display:flex;flex-direction:column;">
      <div style="font-size:11pt;font-weight:700;margin-bottom:4mm;">Empfangsschein</div>
      <div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Konto / Zahlbar an</div>
      <div style="font-size:8pt;line-height:1.35;margin-bottom:3mm;">${ibanFormatted}<br>${firmaName}<br>${firmaAdr}<br>${firmaPlz} ${firmaOrt}</div>
      ${empfaenger ? `<div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">Zahlbar durch</div><div style="font-size:8pt;line-height:1.35;margin-bottom:3mm;">${empfaenger}${empStrasse ? "<br>" + empStrasse : ""}${empPlzOrt ? "<br>" + empPlzOrt : ""}</div>` : ""}
      <div style="margin-top:auto;">
        <div style="display:flex;gap:4mm;align-items:flex-end;">
          <div><div style="font-size:6pt;font-weight:700;text-transform:uppercase;">Währung</div><div style="font-size:9pt;font-weight:700;">CHF</div></div>
          <div><div style="font-size:6pt;font-weight:700;text-transform:uppercase;">Betrag</div><div style="font-size:9pt;font-weight:700;">${betragFormatted}</div></div>
        </div>
        <div style="font-size:6pt;font-weight:700;text-transform:uppercase;text-align:right;margin-top:6mm;">Annahmestelle</div>
      </div>
    </div>
    <div style="width:90mm;flex-shrink:0;padding:0 5mm;display:flex;flex-direction:column;align-items:flex-start;">
      <div style="font-size:11pt;font-weight:700;margin-bottom:4mm;">Zahlteil</div>
      ${qrCodeSvg ? `<div style="width:46mm;height:46mm;margin-bottom:4mm;flex-shrink:0;">${qrCodeSvg}</div>` : `<div style="width:46mm;height:46mm;border:1.5px dashed #bbb;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#999;text-align:center;margin-bottom:4mm;flex-shrink:0;">QR-Code<br>IBAN prüfen</div>`}
      <div style="display:flex;gap:8mm;align-items:flex-end;">
        <div><div style="font-size:6pt;font-weight:700;text-transform:uppercase;">Währung</div><div style="font-size:11pt;font-weight:700;">CHF</div></div>
        <div><div style="font-size:6pt;font-weight:700;text-transform:uppercase;">Betrag</div><div style="font-size:11pt;font-weight:700;">${betragFormatted}</div></div>
      </div>
    </div>
    <div style="flex:1;min-width:0;padding:0 4mm;display:flex;flex-direction:column;gap:4mm;">
      <div>
        <div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:1mm;">Konto / Zahlbar an</div>
        <div style="font-size:8.5pt;line-height:1.4;">${ibanFormatted}<br>${firmaName}<br>${firmaAdr}<br>${firmaPlz} ${firmaOrt}</div>
      </div>
      <div>
        <div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:1mm;">Zusätzliche Informationen</div>
        <div style="font-size:8.5pt;line-height:1.4;">Rechnung ${rechnungsNr}${faelligStr ? "<br>Zahlbar bis: " + faelligStr : ""}</div>
      </div>
      ${empfaenger ? `<div><div style="font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:1mm;">Zahlbar durch</div><div style="font-size:8.5pt;line-height:1.4;">${empfaenger}${empStrasse ? "<br>" + empStrasse : ""}${empPlzOrt ? "<br>" + empPlzOrt : ""}</div></div>` : ""}
    </div>
  </div>
  <div style="display:flex;align-items:center;margin-top:2mm;">
    <div style="padding:0 2mm;font-size:11pt;line-height:1;">&#9986;</div>
    <div style="flex:1;border-top:1px dashed #000;"></div>
  </div>
</div>`;
  }

  // ─── Rechnung PDF (Vorlage aus DB) ──────────────────────────────────────────
  app.post("/api/auftraege/:id/rechnungen/:rid/pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id, rid } = req.params;
      const { data: rechnung, error } = await identity.client
        .from("rechnungen").select("*").eq("id", rid).eq("auftrag_id", id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (error || !rechnung) return res.status(404).json({ message: "Rechnung nicht gefunden" });
      const { data: auftrag } = await identity.client
        .from("auftraege").select("*").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden" });

      // Quelldaten: Offerte falls verlinkt
      let quelleOfferte: any = null;
      const offIdMatch = (rechnung.notiz || "").match(/offerte_id:([^|]+)/);
      if (offIdMatch) {
        const { data: off } = await identity.client.from("offerten").select("*").eq("id", offIdMatch[1]).eq("tenant_id", identity.tenantId).maybeSingle();
        if (off) quelleOfferte = off;
      }

      // Firmendaten
      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      // Kundenadresse Priorität: 1) Offerte 2) Kundendatenbank 3) Auftrag
      const kundeName = quelleOfferte?.empfaenger_name || auftrag?.kunde || rechnung.kunde_name || "";
      let kundeStrasse = quelleOfferte?.empfaenger_strasse || "";
      let kundePlzOrt  = quelleOfferte?.empfaenger_plz_ort  || "";
      // Falls Offerte keine Adresse hat: Kundendatenbank abfragen
      if ((!kundeStrasse || !kundePlzOrt) && kundeName) {
        const { data: kunden } = await identity.client.from("kunden")
          .select("adresse,plz,ort,vorname,nachname,firma")
          .or(`firma.ilike.%${kundeName}%,nachname.ilike.%${kundeName}%`)
          .eq("tenant_id", identity.tenantId)
          .limit(1);
        const k = kunden?.[0];
        if (k) {
          if (!kundeStrasse && k.adresse) kundeStrasse = k.adresse;
          if (!kundePlzOrt  && k.plz && k.ort) kundePlzOrt = `${k.plz} ${k.ort}`;
        }
      }
      // Fallback: Auftrag Adresse
      if (!kundeStrasse || !kundePlzOrt) {
        const _splitAdr = splitAdresse(auftrag?.kunde_adresse || "");
        if (!kundeStrasse) kundeStrasse = _splitAdr.strasse;
        if (!kundePlzOrt)  kundePlzOrt  = _splitAdr.plzOrt;
      }
      const empfaenger = kundeName;
      const empStrasse = kundeStrasse;
      const empPlzOrt  = kundePlzOrt;
      const positionen: any[] = Array.isArray(rechnung.positionen) ? rechnung.positionen : [];
      const subtotal    = positionen.reduce((s: number, p: any) => s + Number(p.total ?? p.betrag ?? (Number(p.menge||p.anzahl||1)*Number(p.einzelpreis||p.preis||0))), 0);
      const mwstPct     = 8.1;
      const mwstBetrag  = subtotal * (mwstPct / 100);
      const totalInkl   = subtotal + mwstBetrag;

      const datumStr = rechnung.erstellt
        ? new Date(rechnung.erstellt).toLocaleDateString("de-CH", { day:"2-digit", month:"long", year:"numeric" })
        : new Date().toLocaleDateString("de-CH", { day:"2-digit", month:"long", year:"numeric" });
      const faelligStr = rechnung.faellig_datum
        ? new Date(rechnung.faellig_datum).toLocaleDateString("de-CH", { day:"2-digit", month:"long", year:"numeric" })
        : undefined;

      // Skonto-Text dynamisch berechnen (Bug-Fix): liest Skontosatz aus vorkalkulation_config
      // des Auftrags und berechnet Skontobetrag/Zahlbetrag aus dem tatsaechlichen Bruttobetrag.
      const skontoText = await buildSkontoText(id, totalInkl);

      // QR-Zahlschein (Schweizer Standard) — gemeinsame Hilfsfunktion (auch von Live-Vorschau genutzt)
      const rechnungsNrFuerQr = rechnung.nr || rid.substring(0, 8);
      const qrInlineBlock = await buildQrInlineBlock({
        sMap,
        totalInkl,
        rechnungsNr: rechnungsNrFuerQr,
        faelligStr,
        empfaenger,
        empStrasse,
        empPlzOrt,
      });

      const html = await buildPdfHtml("rechnung", {
        titel: "RECHNUNG",
        nummer: rechnung.nr || rid.substring(0,8).toUpperCase(),
        datum: datumStr,
        faelligDatum: faelligStr,
        empfaenger,
        empfaengerStrasse: empStrasse,
        empfaengerPlzOrt: empPlzOrt,
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal, mwstPct, mwstBetrag, total: totalInkl,
        showTotals: true,
        extraHtml: (rechnung.notiz && !rechnung.notiz.startsWith("offerte_id:")) ? `<div style="margin-top:12px;padding:8px 12px;background:#f9f6f0;border-left:3px solid #6b4c2a;font-size:8.5pt;color:#444;white-space:pre-line;">${rechnung.notiz}</div>` : "",
        ansprechpersonIntern: (req.body as any)?.ansprechpersonIntern || rechnung.ansprechperson_intern || auftrag?.verantwortlicher || "",
        ansprechpersonInternEmail: (req.body as any)?.ansprechpersonInternEmail || "",
        ansprechpersonInternTelefon: (req.body as any)?.ansprechpersonInternTelefon || "",
        ansprechpersonExtern: (req.body as any)?.ansprechpersonExtern || rechnung.ansprechperson_extern || auftrag?.ansprechperson || "",
        kundenNr: await getKundenNr(auftrag?.kunde || ""),
        anrede: await getKundenAnrede(auftrag?.kunde || ""),
        extraHtmlFullWidth: qrInlineBlock,
        skontoText,
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Rechnung-${rechnung.nr || rid}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });



  app.get("/api/rechnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("rechnungen")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // PATCH /api/rechnungen/:id — Zahlungsstatus setzen (bezahlt / offen)
  app.patch("/api/rechnungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { bezahlt_am } = req.body;
      // Existenz-Check
      const { data: existing, error: existErr } = await identity.client
        .from("rechnungen")
        .select("id")
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (existErr) throw existErr;
      if (!existing) return res.status(404).json({ message: "Rechnung nicht gefunden" });

      const updates: any = {};
      if (bezahlt_am !== undefined) {
        // Validierung: null oder ISO-Datum (YYYY-MM-DD)
        if (bezahlt_am !== null) {
          if (typeof bezahlt_am !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bezahlt_am)) {
            return res.status(400).json({ message: "bezahlt_am muss ein ISO-Datum (YYYY-MM-DD) oder null sein" });
          }
          const d = new Date(bezahlt_am);
          if (isNaN(d.getTime())) {
            return res.status(400).json({ message: "bezahlt_am ist kein gültiges Datum" });
          }
        }
        updates.bezahlt_am = bezahlt_am;
      }
      const { data, error } = await identity.client
        .from("rechnungen")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/rechnungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { data: existingR } = await identity.client
        .from("rechnungen")
        .select("auftrag_id")
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existingR) return res.status(404).json({ message: "Rechnung nicht gefunden." });
      const { error } = await identity.client
        .from("rechnungen")
        .delete()
        .eq("id", id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      if (existingR.auftrag_id) await syncRechnungsBetrag(existingR.auftrag_id, identity);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET /api/suche?q=... — globale Volltextsuche
  app.get("/api/suche", async (req, res) => {
    try {
      const q = String(req.query.q || "").toLowerCase().trim();
      if (!q || q.length < 2) return res.json({ auftraege: [], rechnungen: [], offerten: [], kunden: [] });

      const [
        { data: auftraege },
        { data: rechnungen },
        { data: offerten },
      ] = await Promise.all([
        supabase.from("auftraege").select("id,nr,titel,kunde,status,angebots_betrag,waehrung").order("erstellt", { ascending: false }).limit(200),
        supabase.from("rechnungen").select("id,nr,betrag,waehrung,auftrag_id,faellig_datum,bezahlt_am,erstellt").order("erstellt", { ascending: false }).limit(200),
        supabase.from("offerten").select("id,nr,titel,auftrag_id,status,gueltigkeit,erstellt").order("erstellt", { ascending: false }).limit(200),
      ]);

      const matchAuftraege = (auftraege || []).filter((a: any) =>
        (a.nr || "").toLowerCase().includes(q) ||
        (a.titel || "").toLowerCase().includes(q) ||
        (a.kunde || "").toLowerCase().includes(q)
      ).slice(0, 8);

      const matchRechnungen = (rechnungen || []).filter((r: any) =>
        (r.nr || "").toLowerCase().includes(q)
      ).slice(0, 5);

      const matchOfferten = (offerten || []).filter((o: any) =>
        (o.nr || "").toLowerCase().includes(q) ||
        (o.titel || "").toLowerCase().includes(q)
      ).slice(0, 5);

      // Kunden aus Aufträgen dedupliziert
      const kundenSet = new Map<string, any>();
      for (const a of (auftraege || [])) {
        const k = (a.kunde || "").toLowerCase();
        if (k && k.includes(q) && !kundenSet.has(a.kunde)) {
          kundenSet.set(a.kunde, { name: a.kunde, auftrag_id: a.id, auftrag_nr: a.nr });
        }
      }
      const matchKunden = Array.from(kundenSet.values()).slice(0, 5);

      res.json({
        auftraege: matchAuftraege,
        rechnungen: matchRechnungen,
        offerten: matchOfferten,
        kunden: matchKunden,
      });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ============= BANANA BUCHHALTUNG / Q3 EXPORT =============
  // Format: Banana Buchhaltung Schweiz (semicolon, Schweizer Dezimal mit Punkt)
  const handleQ3Export = async (
    res: Response,
    { query, tenantId }: ExportDownloadInput,
  ) => {
    try {
      const { von, bis, zeitraum } = query;

      const heute = new Date();
      let datumVon: string;
      let datumBis: string;

      if (von && bis) {
        datumVon = von;
        datumBis = bis;
      } else if (zeitraum === "quartal") {
        const q = Math.floor(heute.getMonth() / 3);
        datumVon = new Date(heute.getFullYear(), q * 3, 1).toISOString().split("T")[0];
        datumBis = new Date(heute.getFullYear(), q * 3 + 3, 0).toISOString().split("T")[0];
      } else if (zeitraum === "monat") {
        datumVon = new Date(heute.getFullYear(), heute.getMonth(), 1).toISOString().split("T")[0];
        datumBis = new Date(heute.getFullYear(), heute.getMonth() + 1, 0).toISOString().split("T")[0];
      } else {
        datumVon = `${heute.getFullYear()}-01-01`;
        datumBis = `${heute.getFullYear()}-12-31`;
      }

      // Rechnungen laden (mit Auftragsdaten)
      const rechnungenQuery = supabase
        .from("rechnungen")
        .select("*")
        .gte("erstellt", datumVon)
        .lte("erstellt", datumBis + "T23:59:59")
        .order("erstellt", { ascending: true });
      const { data: rechnungen, error } = await (tenantId
        ? rechnungenQuery.eq("tenant_id", tenantId)
        : rechnungenQuery
      );
      if (error) throw error;

      // Auftraege für Kundennamen laden
      const auftragIds = Array.from(new Set((rechnungen || []).map((r: any) => r.auftrag_id).filter(Boolean)));
      let auftraegeMap: Record<string, any> = {};
      if (auftragIds.length > 0) {
        const auftraegeQuery = supabase.from("auftraege").select("id,nr,titel,kunde").in("id", auftragIds);
        const { data: auftraege } = await (tenantId
          ? auftraegeQuery.eq("tenant_id", tenantId)
          : auftraegeQuery
        );
        for (const a of (auftraege || [])) auftraegeMap[a.id] = a;
      }

      const mwstSatz = MWST_SATZ_RECHNUNG;
      const exportSettingsRows = tenantId
        ? await supabase.from("einstellungen").select("schluessel,wert").eq("tenant_id", tenantId)
        : { data: [] as Array<{ schluessel: string; wert: string | null }> };
      const sMap = einstellungenMap(exportSettingsRows.data || []);

      // Banana Buchhaltung Format:
      // Datum (DD.MM.YYYY) ; BelegNr ; Beschreibung ; Konto ; Gegenkonto ; Betrag Netto CHF ; MwSt-Satz % ; MwSt-Betrag CHF ; Betrag Brutto CHF
      // Spaltenbezeichnungen auf Deutsch (Banana Standard). Netto, MWST und Brutto
      // werden als drei getrennte, klar beschriftete Spalten ausgewiesen (Schweizer
      // MWST-Abrechnung braucht Netto-Umsatz und MWST-Betrag separat ausgewiesen).
      const sep = ";";
      const csvLines: string[] = [];

      // Header-Info (Kommentarzeilen für Banana)
      csvLines.push(`Buchhaltungsexport ${firmennameAusSettings(sMap)}`);
      csvLines.push(`Zeitraum: ${datumVon} bis ${datumBis}`);
      csvLines.push(`Exportiert am: ${new Date().toLocaleDateString("de-CH")}`);
      csvLines.push(``);

      // Spaltenheader (Banana Buchhaltung Standard)
      csvLines.push([
        "Datum", "BelegNr", "Beschreibung", "Konto", "Gegenkonto",
        "Betrag Netto CHF", "MwSt-Satz %", "MwSt-Betrag CHF", "Betrag Brutto CHF", "Waehrung"
      ].join(sep));

      // === AUSGANGSRECHNUNGEN ===
      // rechnungen.betrag ist in der DB bereits NETTO (Positionssumme exkl. MWST) —
      // dieselbe Umrechnungslogik wie bei der Rechnungsliste/PDF-Erzeugung (netto × 1.081).
      csvLines.push(`=== Ausgangsrechnungen ===`);
      let totalNettoAusgang = 0;
      let totalMwstAusgang = 0;
      let totalBruttoAusgang = 0;
      for (const r of (rechnungen || [])) {
        const netto  = Number(r.betrag) || 0;
        const brutto = rechnungBruttoBetrag(netto);
        const mwst   = Math.round((brutto - netto) * 100) / 100;
        const auftrag = auftraegeMap[r.auftrag_id] || {};
        const datum  = r.erstellt
          ? new Date(r.erstellt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        const beschr = [auftrag.titel, auftrag.kunde].filter(Boolean).join(" / ").replace(/;/g, ",") || "Rechnung";
        totalNettoAusgang += netto;
        totalMwstAusgang += mwst;
        totalBruttoAusgang += brutto;

        csvLines.push([
          datum,
          r.nr || "",
          beschr,
          "1100",           // Debitoren (Schweizer KMU-Kontenplan)
          "3400",           // Dienstleistungserlös
          netto.toFixed(2),
          `${mwstSatz.toFixed(1)}%`,
          mwst.toFixed(2),
          brutto.toFixed(2),
          r.waehrung || "CHF"
        ].join(sep));
      }
      csvLines.push([`Total Ausgangsrechnungen`, "", "", "", "", totalNettoAusgang.toFixed(2), "", totalMwstAusgang.toFixed(2), totalBruttoAusgang.toFixed(2), "CHF"].join(sep));

      // === EINGANGSRECHNUNGEN ===
      const eingangQuery = supabase
        .from("eingangsrechnungen")
        .select("*")
        .gte("erstellt", datumVon)
        .lte("erstellt", datumBis + "T23:59:59")
        .order("erstellt", { ascending: true });
      const { data: eingang } = await (tenantId
        ? eingangQuery.eq("tenant_id", tenantId)
        : eingangQuery
      );

      if (eingang && eingang.length > 0) {
        csvLines.push(``);
        csvLines.push(`=== Eingangsrechnungen (Aufwand) ===`);
        // eingangsrechnungen.betrag ist der vom Lieferanten in Rechnung gestellte
        // Gesamtbetrag (BRUTTO, inkl. MWST) — hier ist die Ableitung Brutto→Netto/MWST
        // korrekt (im Gegensatz zu den Ausgangsrechnungen oben, die netto in der DB sind).
        let totalNettoEingang = 0;
        let totalMwstEingang = 0;
        let totalBruttoEingang = 0;
        for (const e of eingang) {
          const brutto = Number(e.betrag) || 0;
          const netto  = Math.round((brutto / (1 + mwstSatz / 100)) * 100) / 100;
          const mwst   = Math.round((brutto - netto) * 100) / 100;
          const datum  = e.erstellt
            ? new Date(e.erstellt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
            : "";
          const beschr = (e.beschreibung || e.lieferant || "Eingangsrechnung").replace(/;/g, ",");
          totalNettoEingang += netto;
          totalMwstEingang += mwst;
          totalBruttoEingang += brutto;

          csvLines.push([
            datum,
            e.id || "",
            beschr,
            "2000",           // Kreditoren
            "4000",           // Aufwand
            netto.toFixed(2),
            `${mwstSatz.toFixed(1)}%`,
            mwst.toFixed(2),
            brutto.toFixed(2),
            e.waehrung || "CHF"
          ].join(sep));
        }
        csvLines.push([`Total Eingangsrechnungen`, "", "", "", "", totalNettoEingang.toFixed(2), "", totalMwstEingang.toFixed(2), totalBruttoEingang.toFixed(2), "CHF"].join(sep));
      }

      const csvContent = csvLines.join("\r\n");
      const filename = `Banana-Export_${datumVon}_${datumBis}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `${tenantId ? "attachment" : "inline"}; filename="${filename}"`);
      res.send("\uFEFF" + csvContent); // BOM für Excel-Kompatibilität
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  };
  app.get("/api/export/q3", (req, res) => {
    return handleQ3Export(res, {
      query: exportQueryFromRequest(req),
    });
  });

  // ============= VORLAGEN =============
  app.get("/api/vorlagen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("rechnungsvorlagen")
        .select("id, name, mime, size_bytes, aktiv, erstellt")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post(
    "/api/vorlagen",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const identity = dashboardPreferenceIdentity(req);
        if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "file required" });
        // Nur Vorlagen des eigenen Mandanten deaktivieren.
        await identity.client
          .from("rechnungsvorlagen")
          .update({ aktiv: false })
          .eq("tenant_id", identity.tenantId);
        const row = {
          id: uid(),
          name: file.originalname,
          mime: file.mimetype || "application/octet-stream",
          size_bytes: file.size,
          data: file.buffer.toString("base64"),
          aktiv: true,
          erstellt: new Date().toISOString(),
          tenant_id: identity.tenantId,
        };
        const { data, error } = await identity.client
          .from("rechnungsvorlagen")
          .insert(row)
          .select("id, name, mime, size_bytes, aktiv, erstellt")
          .single();
        if (error) throw error;
        res.json(data);
      } catch (e) {
        res.status(500).json({ message: asError(e) });
      }
    }
  );

  app.get("/api/vorlagen/:vid/download", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { vid } = req.params;
      const { data, error } = await identity.client
        .from("rechnungsvorlagen")
        .select("*")
        .eq("id", vid)
        .eq("tenant_id", identity.tenantId)
        .single();
      if (error || !data) return res.status(404).json({ message: "Vorlage nicht gefunden" });
      const buf = Buffer.from(data.data, "base64");
      res.setHeader("Content-Type", data.mime || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(data.name)}"`
      );
      res.send(buf);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/vorlagen/:vid", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { vid } = req.params;
      const { data: existing } = await identity.client
        .from("rechnungsvorlagen")
        .select("id")
        .eq("id", vid)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ message: "Vorlage nicht gefunden" });
      const { error } = await identity.client
        .from("rechnungsvorlagen")
        .delete()
        .eq("id", vid)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Zeiterfassung ────────────────────────────────────────────────────────
  app.get("/api/auftraege/:id/zeit", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("zeiteintraege")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("datum", { ascending: false })
        .order("start_zeit", { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.post("/api/auftraege/:id/zeit", async (req, res) => {
    try {
      const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
      const { mitarbeiter, beschreibung, datum, start_zeit, end_zeit, ort, maschinenpark } = req.body;
      // Dauer berechnen
      let dauer_minuten = 0;
      if (start_zeit && end_zeit) {
        const [sh, sm] = start_zeit.split(":").map(Number);
        const [eh, em] = end_zeit.split(":").map(Number);
        dauer_minuten = (eh * 60 + em) - (sh * 60 + sm);
        if (dauer_minuten < 0) dauer_minuten = 0;
      }
      const eintrag = {
        id: uid(),
        auftrag_id: req.params.id,
        mitarbeiter: mitarbeiter || "",
        beschreibung: beschreibung || "",
        datum: datum || new Date().toISOString().slice(0, 10),
        start_zeit: start_zeit || "",
        end_zeit: end_zeit || "",
        dauer_minuten,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschinenpark) ? maschinenpark : null,
      };
      const { data, error } = await supabase
        .from("zeiteintraege")
        .insert(eintrag)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  app.delete("/api/auftraege/:id/zeit/:zid", async (req, res) => {
    try {
      const { error } = await supabase
        .from("zeiteintraege")
        .delete()
        .eq("id", req.params.zid);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Fotos / Bilddokumentation ────────────────────────────────────────────
  // Obergrenze fuer Base64-Payloads pro Foto: ~20 MB Rohdatei => ~27 MB Base64.
  const FOTO_MAX_BASE64_LEN = 27_000_000;

  app.get("/api/fotos/:auftragId", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.auftragId))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("foto_dokumentation")
        .select("*")
        .eq("auftrag_id", req.params.auftragId)
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/fotos/:auftragId", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.auftragId))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const body = req.body || {};
      const dateiData = typeof body.datei_data === "string" ? body.datei_data : "";
      if (dateiData.length > FOTO_MAX_BASE64_LEN) {
        return res.status(413).json({ message: "Foto übersteigt die maximale Grösse." });
      }
      const row = {
        id: uid(),
        auftrag_id: req.params.auftragId,
        kategorie: typeof body.kategorie === "string" ? body.kategorie : null,
        bezeichnung: typeof body.bezeichnung === "string" ? body.bezeichnung : null,
        datei_name: typeof body.datei_name === "string" ? body.datei_name : null,
        datei_data: dateiData || null,
        datei_mime: typeof body.datei_mime === "string" ? body.datei_mime : null,
        notiz: typeof body.notiz === "string" ? body.notiz : null,
        erstellt: new Date().toISOString(),
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client
        .from("foto_dokumentation")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/fotos/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing } = await identity.client
        .from("foto_dokumentation")
        .select("id")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ message: "Foto nicht gefunden" });
      const { error } = await identity.client
        .from("foto_dokumentation")
        .delete()
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Formulare ───────────────────────────────────────────────────────────────
  // Whitelist für Formulare: id/erstellt/tenant_id werden server-verwaltet.
  const pickFormularFelder = (body: any): Record<string, any> => {
    const out: Record<string, any> = {};
    if (body && typeof body === "object") {
      if (typeof body.auftrag_id === "string") out.auftrag_id = body.auftrag_id;
      if (typeof body.typ === "string") out.typ = body.typ;
      if (typeof body.titel === "string") out.titel = body.titel;
      if ("inhalt" in body) out.inhalt = body.inhalt;
      if (typeof body.unterschrift_auftraggeber === "string") out.unterschrift_auftraggeber = body.unterschrift_auftraggeber;
      if (typeof body.unterschrift_mitarbeiter === "string") out.unterschrift_mitarbeiter = body.unterschrift_mitarbeiter;
      if (typeof body.status === "string") out.status = body.status;
    }
    return out;
  };

  app.get("/api/formulare", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      // Listen-Endpoint schliesst Base64-Unterschriften bewusst aus (potentiell gross).
      const { data, error } = await identity.client
        .from("formulare")
        .select("id, auftrag_id, typ, titel, inhalt, status, erstellt")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/formulare", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const felder = pickFormularFelder(req.body);
      if (felder.auftrag_id) {
        if (!(await auftragGehoertZuTenant(identity, felder.auftrag_id))) {
          return res.status(404).json({ message: "Auftrag nicht gefunden." });
        }
      }
      const row = {
        id: uid(),
        ...felder,
        erstellt: new Date().toISOString(),
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client.from("formulare").insert(row).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/formulare/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing } = await identity.client
        .from("formulare")
        .select("id")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ message: "Formular nicht gefunden" });
      const update = pickFormularFelder(req.body);
      if (update.auftrag_id) {
        if (!(await auftragGehoertZuTenant(identity, update.auftrag_id))) {
          return res.status(404).json({ message: "Auftrag nicht gefunden." });
        }
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "Keine änderbaren Felder übermittelt" });
      }
      const { data, error } = await identity.client
        .from("formulare")
        .update(update)
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/formulare/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing } = await identity.client
        .from("formulare")
        .select("id")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ message: "Formular nicht gefunden" });
      const { error } = await identity.client
        .from("formulare")
        .delete()
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Chat ─────────────────────────────────────────────────────────────────────
  // ─── Chat: Ungelesene Nachrichten (Timestamp-basiert, letzte 24h) ────────────
  app.get("/api/chat/ungelesen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const seit = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await identity.client
        .from("chat_nachrichten")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", identity.tenantId)
        .gte("erstellt", seit);
      res.json({ count: count || 0 });
    } catch (e) { res.json({ count: 0 }); }
  });

  // ─── Chat: Als gelesen markieren (Timestamp-basiert, Frontend trackt) ─────────
  app.post("/api/chat/als-gelesen", async (req, res) => {
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    // Kein gelesen-Flag in DB – Frontend trackt letzteGelesenZeit im State
    res.json({ ok: true, zeitstempel: new Date().toISOString() });
  });

  app.get("/api/chat/:auftragId", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.auftragId))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("chat_nachrichten")
        .select("*")
        .eq("auftrag_id", req.params.auftragId)
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  const CHAT_ANHANG_MAX_BASE64_LEN = 15_000_000;

  app.post("/api/chat/:auftragId", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.auftragId))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const body = req.body || {};
      const nachricht = typeof body.nachricht === "string" ? body.nachricht.trim() : "";
      const anhangData = typeof body.anhang_data === "string" ? body.anhang_data : "";
      if (!nachricht && !anhangData) {
        return res.status(400).json({ message: "Nachricht oder Anhang erforderlich" });
      }
      if (anhangData.length > CHAT_ANHANG_MAX_BASE64_LEN) {
        return res.status(413).json({ message: "Anhang übersteigt die maximale Grösse." });
      }
      const row = {
        id: uid(),
        auftrag_id: req.params.auftragId,
        absender: typeof body.absender === "string" ? body.absender : null,
        nachricht: nachricht || null,
        typ: typeof body.typ === "string" ? body.typ : null,
        anhang_name: anhangData && typeof body.anhang_name === "string" ? body.anhang_name : null,
        anhang_mime: anhangData && typeof body.anhang_mime === "string" ? body.anhang_mime : null,
        anhang_data: anhangData || null,
        erstellt: new Date().toISOString(),
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client
        .from("chat_nachrichten")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Kunden ───────────────────────────────────────────────────────────────────
  app.get("/api/kunden/next-nr", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const yy = String(new Date().getFullYear()).slice(-2);
      const { data: allNr } = await identity.client
        .from("kunden")
        .select("nr")
        .eq("tenant_id", identity.tenantId);
      const maxNr = (allNr || []).reduce((mx: number, k: any) => {
        const nr = String(k.nr || "");
        // Neues Format K260001
        const m1 = nr.match(/^K(\d{2})(\d{4})$/);
        if (m1) return Math.max(mx, parseInt(m1[2], 10));
        // Altes Format K-2026-0001
        const m2 = nr.match(/K-\d{4}-(\d+)/);
        if (m2) return Math.max(mx, parseInt(m2[1], 10));
        return mx;
      }, 0);
      const nr = `K${yy}${String(maxNr + 1).padStart(4, "0")}`;
      res.json({ nr });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/kunden", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("kunden")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("nachname", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  const isValidKundenEmail = (email: unknown): boolean => {
    if (!email || typeof email !== "string" || !email.trim()) return true; // E-Mail ist optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  app.post("/api/kunden", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isValidKundenEmail(req.body?.email)) {
        return res.status(400).json({ message: "Ungültige E-Mail-Adresse" });
      }
      // Nächste Kundennummer generieren: KYYNNN (z.B. K260001)
      const yy = String(new Date().getFullYear()).slice(-2);
      const { data: allNr } = await identity.client
        .from("kunden")
        .select("nr")
        .eq("tenant_id", identity.tenantId);
      const maxNr = (allNr || []).reduce((mx: number, k: any) => {
        const nr = String(k.nr || "");
        const m1 = nr.match(/^K(\d{2})(\d{4})$/);
        if (m1) return Math.max(mx, parseInt(m1[2], 10));
        const m2 = nr.match(/K-\d{4}-(\d+)/);
        if (m2) return Math.max(mx, parseInt(m2[1], 10));
        return mx;
      }, 0);
      const nr = `K${yy}${String(maxNr + 1).padStart(4, "0")}`;
      const k = { id: uid(), nr, ...req.body, tenant_id: identity.tenantId };
      const { data, error } = await identity.client.from("kunden").insert(k).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/kunden/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isValidKundenEmail(req.body?.email)) {
        return res.status(400).json({ message: "Ungültige E-Mail-Adresse" });
      }
      const { data, error } = await identity.client
        .from("kunden")
        .update({ ...req.body, tenant_id: identity.tenantId })
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Kunde nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/kunden/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("kunden")
        .delete()
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ message: "Kunde nicht gefunden." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Mitarbeiter ─────────────────────────────────────────────────────────────
  // Whitelist der beschreibbaren Spalten (kein blindes ...req.body).
  // email_geschaeftlich und telefon_direkt sind Prod-Spalten aus dem Frontend.
  const MITARBEITER_FIELDS = [
    "vorname", "nachname", "email", "email_geschaeftlich",
    "telefon", "telefon_direkt", "position", "stundensatz",
    "eintrittsdatum", "status", "notiz",
  ] as const;

  const extractMitarbeiterFields = (body: unknown): Record<string, unknown> => {
    const src = (body ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of MITARBEITER_FIELDS) {
      if (src[key] !== undefined) out[key] = src[key];
    }
    return out;
  };

  app.get("/api/mitarbeiter", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("mitarbeiter")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("nachname", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/mitarbeiter", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const fields = extractMitarbeiterFields(req.body);
      const m: Record<string, unknown> = {
        id: uid(),
        tenant_id: identity.tenantId,
        vorname: fields.vorname ?? "",
        nachname: fields.nachname ?? "",
        status: fields.status ?? "aktiv",
      };
      for (const key of MITARBEITER_FIELDS) {
        if (fields[key] !== undefined && !(key in m)) m[key] = fields[key];
      }
      const { data, error } = await identity.client.from("mitarbeiter").insert(m).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/mitarbeiter/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const updates = extractMitarbeiterFields(req.body);
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Keine gültigen Felder zum Aktualisieren." });
      }
      const { data, error } = await identity.client
        .from("mitarbeiter")
        .update(updates)
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/mitarbeiter/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { error } = await identity.client
        .from("mitarbeiter")
        .delete()
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── Stempeluhr (globales Ein-/Ausstempeln) ──────────────────────────────────
  // GET aktiver Stempel eines Mitarbeiters (sucht per Name)
  app.get("/api/stempel/aktiv", async (req, res) => {
    try {
      const mitarbeiterName = req.query.mitarbeiter_name as string;
      if (!mitarbeiterName) return res.json(null);
      const { data } = await supabase
        .from("zeiteintraege")
        .select("*")
        .eq("mitarbeiter", mitarbeiterName)
        .is("end_zeit", null)
        .order("datum", { ascending: false })
        .limit(1)
        .maybeSingle();
      res.json(data || null);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST Einstempeln
  app.post("/api/stempel/ein", async (req, res) => {
    try {
      const { mitarbeiter_id, mitarbeiter_name, auftrag_id, beschreibung, ort, maschinenpark } = req.body;
      const now = new Date();
      // Datum und Uhrzeit in Europe/Zurich (Schweiz) — verhindert UTC-Offset-Fehler
      const datum = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }); // "2026-05-13"
      const start_zeit = now.toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); // "07:30:45"
      const eintrag = {
        id: uid(),
        auftrag_id: auftrag_id || null,
        mitarbeiter: mitarbeiter_name || "",
        beschreibung: beschreibung || "Tagesarbeitszeit",
        datum,
        start_zeit,
        end_zeit: null,
        dauer_minuten: 0,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschinenpark) ? maschinenpark : null,
      };
      const { data, error } = await supabase.from("zeiteintraege").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST Ausstempeln
  app.post("/api/stempel/aus", async (req, res) => {
    try {
      const { eintrag_id } = req.body;
      const now = new Date();
      const end_zeit = now.toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      const { data: existing } = await supabase
        .from("zeiteintraege").select("*").eq("id", eintrag_id).single();
      let dauer_minuten = 0;
      if (existing?.start_zeit) {
        // Sekunden-genaue Berechnung — Format kann HH:MM oder HH:MM:SS sein
        const parseSecs = (t: string) => { const p = t.split(":").map(Number); return (p[0]||0)*3600 + (p[1]||0)*60 + (p[2]||0); };
        const diffSecs = parseSecs(end_zeit) - parseSecs(existing.start_zeit as string);
        dauer_minuten = Math.max(0, Math.round(diffSecs / 60));
      }
      const { data, error } = await supabase
        .from("zeiteintraege")
        .update({ end_zeit, dauer_minuten })
        .eq("id", eintrag_id)
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET Monatsstunden je Mitarbeiter
  app.get("/api/zeiteintraege/monatsauswertung", async (req, res) => {
    try {
      const { jahr, monat, mitarbeiter_id } = req.query;
      let query = supabase.from("zeiteintraege").select("*");
      if (mitarbeiter_id) query = query.eq("mitarbeiter", mitarbeiter_id as string);
      if (jahr && monat) {
        const mo = String(monat).padStart(2, "0");
        query = query.gte("datum", `${jahr}-${mo}-01`).lte("datum", `${jahr}-${mo}-31`);
      }
      const { data, error } = await query.order("datum", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET alle Zeiteintraege (Übersicht alle Mitarbeiter)
  app.get("/api/zeiteintraege", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("zeiteintraege").select("*").order("datum", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST allgemeiner Zeiteintrag (ohne oder mit Auftrag) — für Freie Tätigkeit
  app.post("/api/zeiteintraege", async (req, res) => {
    try {
      const { mitarbeiter, beschreibung, datum, start_zeit, end_zeit, auftrag_id, ort, maschinenpark } = req.body;
      let dauer_minuten = 0;
      if (start_zeit && end_zeit) {
        const parseSecs = (t: string) => { const p = t.split(":").map(Number); return (p[0]||0)*3600 + (p[1]||0)*60 + (p[2]||0); };
        dauer_minuten = Math.max(0, Math.round((parseSecs(end_zeit) - parseSecs(start_zeit)) / 60));
      }
      const eintrag = {
        id: uid(),
        auftrag_id: auftrag_id || null,
        mitarbeiter: mitarbeiter || "",
        beschreibung: beschreibung || "",
        datum: datum || new Date().toISOString().slice(0, 10),
        start_zeit: start_zeit || "",
        end_zeit: end_zeit || "",
        dauer_minuten,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschinenpark) ? maschinenpark : null,
      };
      const { data, error } = await supabase.from("zeiteintraege").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── E-Mail Test ──────────────────────────────────────────────────────────────
  // Admin-only: probe eines SMTP-Setups. Passwort im Request bleibt nur im Prozess.
  app.post("/api/email/test", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ ok: false, message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ ok: false, message: "Nur Administratoren." });
      const { smtp_host, smtp_port, smtp_user, smtp_passwort, smtp_von, smtp_ssl } = req.body ?? {};
      if (!smtp_host || !smtp_user || !smtp_passwort) {
        return res.json({ ok: false, message: "SMTP Host, Benutzer und Passwort sind erforderlich." });
      }
      const nodemailer = await import("nodemailer");
      const secure = smtp_ssl === "ssl";
      const transporter = nodemailer.createTransport({
        host: String(smtp_host),
        port: Number(smtp_port) || (secure ? 465 : 587),
        secure,
        auth: { user: String(smtp_user), pass: String(smtp_passwort) },
      });
      await transporter.sendMail({
        from: smtp_von || smtp_user,
        to: smtp_user,
        subject: "AuftragsPro — SMTP Test",
        text: "SMTP-Verbindung erfolgreich konfiguriert.",
      });
      res.json({ ok: true, message: "Test-E-Mail wurde gesendet an " + smtp_user });
    } catch (e) { res.json({ ok: false, message: String(e) }); }
  });

  // ─── Public Login-Hintergrund ─────────────────────────────────────────────────
  // MUSS unauthenticated funktionieren, damit die Login-Seite den Background
  // laden kann. Whitelist nur den login_hintergrund-Key, alles andere braucht Auth.
  app.get("/api/public/login-bg", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const tenantId = getDefaultTenantId();
      const { data } = await supabase
        .from("einstellungen")
        .select("wert")
        .eq("tenant_id", tenantId)
        .eq("schluessel", "login_hintergrund")
        .maybeSingle();
      res.json({ wert: data?.wert ?? null });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Einstellungen (Key/Value Store) ─────────────────────────────────────────
  // Auth erforderlich, sensible Keys werden aus der Liste entfernt und durch
  // eine boolean-Flagge smtp_konfiguriert ersetzt, damit das Frontend nur weiss
  // OB SMTP eingerichtet ist – nicht MIT welchem Passwort.
  app.get("/api/einstellungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const { data, error } = await identity.client
        .from("einstellungen")
        .select("schluessel,wert")
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      const rows = (data || []) as Array<{ schluessel: string; wert: string | null }>;
      const isAdmin = isAdminIdentity(identity);
      const smtpPasswortRow = rows.find((row) => row.schluessel === "smtp_passwort" || row.schluessel === "smtp_pass");
      const filtered = rows
        .filter((row) => !SENSITIVE_SETTING_KEYS.has(row.schluessel))
        .filter((row) => isAdmin || !ADMIN_ONLY_SETTING_KEYS.has(row.schluessel));
      filtered.push({
        schluessel: "smtp_konfiguriert",
        wert: smtpPasswortRow?.wert ? "true" : "false",
      });
      res.json(filtered);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Status-Pipeline CRUD (VOR :key Route!) ────────────────────────────────────────
  app.get("/api/einstellungen/status-pipeline", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("auftrag_status_pipeline")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("reihenfolge");
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/einstellungen/status-pipeline/reorder", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { order } = req.body as { order: { id: string; reihenfolge: number }[] };
      if (!Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ message: "Reihenfolge-Liste erforderlich." });
      }
      // Atomarer Reorder: 2-Phasen-Update in einer RPC-freien Emulation. Wir
      // schieben zuerst alle Rows temporär in einen negativen Offset um Kollisionen
      // mit UNIQUE-Constraints zu vermeiden, danach die finalen Werte setzen.
      const ids = order.map((o) => String(o.id));
      const offset = -1000000;
      await Promise.all(order.map((_, index) =>
        identity.client.from("auftrag_status_pipeline")
          .update({ reihenfolge: offset - index })
          .eq("id", ids[index])
          .eq("tenant_id", identity.tenantId)
      ));
      await Promise.all(order.map((entry) =>
        identity.client.from("auftrag_status_pipeline")
          .update({ reihenfolge: Number(entry.reihenfolge) || 0 })
          .eq("id", String(entry.id))
          .eq("tenant_id", identity.tenantId)
      ));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/einstellungen/status-pipeline", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { label, reihenfolge, farbe } = req.body;
      if (!label || typeof label !== "string") {
        return res.status(400).json({ message: "Label erforderlich." });
      }
      const { data, error } = await identity.client
        .from("auftrag_status_pipeline")
        .insert({
          label,
          reihenfolge: Number(reihenfolge) || 0,
          farbe: farbe || "gray",
          tenant_id: identity.tenantId,
        })
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/einstellungen/status-pipeline/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { label, reihenfolge, farbe } = req.body;
      const update: Record<string, unknown> = {};
      if (label !== undefined) update.label = label;
      if (reihenfolge !== undefined) update.reihenfolge = Number(reihenfolge);
      if (farbe !== undefined) update.farbe = farbe;
      const { data, error } = await identity.client
        .from("auftrag_status_pipeline")
        .update(update)
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Status nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/einstellungen/status-pipeline/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      // Vor dem Löschen prüfen, ob dieser Status noch von Aufträgen benutzt wird.
      const { data: status } = await identity.client
        .from("auftrag_status_pipeline")
        .select("label")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!status) return res.status(404).json({ message: "Status nicht gefunden." });
      const { count } = await identity.client
        .from("auftraege")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", identity.tenantId)
        .eq("status", status.label);
      if ((count ?? 0) > 0) {
        return res.status(409).json({
          message: `Status wird von ${count} Auftrag/Aufträgen genutzt und kann nicht gelöscht werden.`,
          count,
        });
      }
      const { error } = await identity.client
        .from("auftrag_status_pipeline")
        .delete()
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ────────────────────────────────────────────────────────────────────────────────
  // Einzelwert-Endpoints: Auth erforderlich. Sensible/Admin-Keys nur für Admins.
  // Sensible Keys sind für alle unlesbar; Frontend nutzt smtp_konfiguriert.
  app.get("/api/einstellungen/:key", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const key = req.params.key;
      if (SENSITIVE_SETTING_KEYS.has(key)) {
        return res.status(403).json({ message: "Dieser Wert kann nicht abgerufen werden." });
      }
      if (ADMIN_ONLY_SETTING_KEYS.has(key) && !isAdminIdentity(identity)) {
        return res.status(403).json({ message: "Nur Administratoren." });
      }
      const { data } = await identity.client
        .from("einstellungen")
        .select("wert")
        .eq("tenant_id", identity.tenantId)
        .eq("schluessel", key)
        .maybeSingle();
      res.json({ wert: data?.wert ?? null });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/einstellungen/:key", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const key = req.params.key;
      if ((ADMIN_ONLY_SETTING_KEYS.has(key) || BRANDING_SETTING_KEYS.has(key)) && !isAdminIdentity(identity)) {
        return res.status(403).json({ message: "Nur Administratoren." });
      }
      const { wert } = req.body ?? {};
      // Upsert via ON CONFLICT (tenant_id, schluessel) — die Migration hat einen
      // Composite-PK gesetzt, damit brauchen wir kein separates SELECT.
      const { error } = await identity.client
        .from("einstellungen")
        .upsert(
          { tenant_id: identity.tenantId, schluessel: key, wert: wert ?? null },
          { onConflict: "tenant_id,schluessel" }
        );
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Stundensätze CRUD ────────────────────────────────────────────────────────
  app.get("/api/stundensaetze", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("stundensaetze")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("ort").order("maschinenpark");
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/stundensaetze/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const { satz, bezeichnung, grundsatz } = req.body;
      const updateData: Record<string, unknown> = {
        satz: Number(satz),
        bezeichnung: bezeichnung || "",
        aktualisiert: new Date().toISOString(),
      };
      if (grundsatz !== undefined && grundsatz !== null) {
        updateData.grundsatz = Number(grundsatz);
      }
      const { data, error } = await identity.client
        .from("stundensaetze")
        .update(updateData)
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Stundensatz nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

    // ─── Kunden Auto-Sync: beim Auftrag speichern ────────────────────────────────
  app.post("/api/kunden/sync-from-auftrag", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { kunde, kunde_adresse, kunde_email, kunde_telefon } = req.body;
      if (!kunde?.trim()) return res.json({ synced: false });

      // Vollständigen Namen aufteilen für die Suche
      const nameParts = kunde.trim().split(" ");
      const searchNachname = nameParts[nameParts.length - 1] || "";
      const searchVorname = nameParts.slice(0, -1).join(" ");

      // 1. Suche nach E-Mail (eindeutigster Match)
      let existing: any = null;
      if (kunde_email?.trim()) {
        const { data: byEmail } = await identity.client
          .from("kunden")
          .select("id")
          .ilike("email", kunde_email.trim())
          .eq("tenant_id", identity.tenantId)
          .limit(1)
          .maybeSingle();
        if (byEmail) existing = byEmail;
      }

      // 2. Suche nach Vor- + Nachname kombiniert
      if (!existing && searchNachname) {
        const { data: allK } = await identity.client
          .from("kunden")
          .select("id,vorname,nachname,firma")
          .eq("tenant_id", identity.tenantId);
        const normalizedSearch = kunde.trim().toLowerCase();
        const found = (allK || []).find((k: any) => {
          const fullName = `${k.vorname || ""} ${k.nachname || ""}`.trim().toLowerCase();
          const firmaName = (k.firma || "").trim().toLowerCase();
          return fullName === normalizedSearch || firmaName === normalizedSearch ||
            fullName.includes(normalizedSearch) || normalizedSearch.includes(fullName);
        });
        if (found) existing = found;
      }

      if (existing) {
        const updates: any = {};
        if (kunde_adresse) updates.adresse = kunde_adresse.split("\n")[0];
        if (kunde_email) updates.email = kunde_email;
        if (kunde_telefon) updates.telefon = kunde_telefon;
        if (Object.keys(updates).length)
          await identity.client
            .from("kunden")
            .update(updates)
            .eq("id", existing.id)
            .eq("tenant_id", identity.tenantId);
        return res.json({ synced: true, action: "updated", id: existing.id });
      }
      const newNameParts = kunde.trim().split(" ");
      const nachname = newNameParts.pop() || kunde.trim();
      const vorname = newNameParts.join(" ");
      const yy2 = String(new Date().getFullYear()).slice(-2);
      const { data: allNr2 } = await identity.client
        .from("kunden")
        .select("nr")
        .eq("tenant_id", identity.tenantId);
      const maxNr2 = (allNr2 || []).reduce((mx: number, k: any) => {
        const nr2 = String(k.nr || "");
        const m1 = nr2.match(/^K(\d{2})(\d{4})$/);
        if (m1) return Math.max(mx, parseInt(m1[2], 10));
        const m2 = nr2.match(/K-\d{4}-(\d+)/);
        if (m2) return Math.max(mx, parseInt(m2[1], 10));
        return mx;
      }, 0);
      const autoNr = `K${yy2}${String(maxNr2 + 1).padStart(4, "0")}`;
      const newKunde = {
        id: uid(),
        nr: autoNr,
        firma: "",
        vorname,
        nachname,
        email: kunde_email || "",
        telefon: kunde_telefon || "",
        adresse: kunde_adresse?.split("\n")[0] || "",
        plz: "",
        ort: "",
        notiz: "Automatisch aus Auftrag erstellt",
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client.from("kunden").insert(newKunde).select().single();
      if (error) throw error;
      res.json({ synced: true, action: "created", id: data.id });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Termine ─────────────────────────────────────────────────────────────────
  const TERMIN_TYPEN = ["termin", "auftrag", "intern", "urlaub", "krank"];

  function validateTerminBody(body: any, opts: { partial: boolean }) {
    const b = body || {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
    if ((!opts.partial || has("titel")) && (!b.titel || !String(b.titel).trim())) {
      return "Titel ist erforderlich";
    }
    if ((!opts.partial || has("datum_von")) && (!b.datum_von || !String(b.datum_von).trim())) {
      return "Startzeit ist erforderlich";
    }
    if ((!opts.partial || has("datum_bis")) && (!b.datum_bis || !String(b.datum_bis).trim())) {
      return "Endzeit ist erforderlich";
    }
    if ((!opts.partial || has("typ")) && (!b.typ || !TERMIN_TYPEN.includes(b.typ))) {
      return `Ungültiger Termin-Typ (erlaubt: ${TERMIN_TYPEN.join(", ")})`;
    }
    if (has("datum_von") && has("datum_bis") && b.datum_von && b.datum_bis) {
      const von = new Date(b.datum_von).getTime();
      const bis = new Date(b.datum_bis).getTime();
      if (!Number.isNaN(von) && !Number.isNaN(bis) && bis < von) {
        return "Endzeit darf nicht vor der Startzeit liegen";
      }
    }
    return null;
  }

  app.get("/api/termine", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("termine").select("*").order("datum_von", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/termine", async (req, res) => {
    try {
      const validationError = validateTerminBody(req.body, { partial: false });
      if (validationError) return res.status(400).json({ message: validationError });
      const t = { id: uid(), ...req.body };
      const { data, error } = await supabase.from("termine").insert(t).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/termine/:id", async (req, res) => {
    try {
      const validationError = validateTerminBody(req.body, { partial: true });
      if (validationError) return res.status(400).json({ message: validationError });
      const { data, error } = await supabase.from("termine").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/termine/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("termine").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Aufgaben ───────────────────────────────────────────────────────────────
  // Diese Liste ist absichtlich unabhängig von der Plantafel: Sie verwaltet
  // einfache Alltags-To-Dos und kann einen Auftrag nur optional referenzieren.
  app.get("/api/aufgaben", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const status = req.query.status;
      if (status !== undefined && status !== "offen" && status !== "abgeschlossen") {
        return res.status(400).json({ message: "Ungültiger Aufgabenstatus" });
      }

      let query = identity.client
        .from("aufgaben")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("faellig_datum", { ascending: true, nullsFirst: false })
        .order("erstellt", { ascending: false });
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/aufgaben", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const body = req.body || {};
      const titel = typeof body.titel === "string" ? body.titel.trim() : "";
      if (!titel) return res.status(400).json({ message: "Titel erforderlich" });

      const auftragId = typeof body.auftrag_id === "string" && body.auftrag_id.length > 0
        ? body.auftrag_id
        : null;
      const mitarbeiterId = typeof body.mitarbeiter_id === "string" && body.mitarbeiter_id.length > 0
        ? body.mitarbeiter_id
        : null;
      if (auftragId && !(await auftragGehoertZuTenant(identity, auftragId))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      if (mitarbeiterId && !(await mitarbeiterGehoertZuTenant(identity, mitarbeiterId))) {
        return res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
      }

      const now = new Date().toISOString();
      const aufgabe = {
        id: uid(),
        titel,
        beschreibung: typeof body.beschreibung === "string" && body.beschreibung.trim()
          ? body.beschreibung.trim()
          : null,
        auftrag_id: auftragId,
        mitarbeiter_id: mitarbeiterId,
        faellig_datum: typeof body.faellig_datum === "string" && body.faellig_datum.length > 0
          ? body.faellig_datum
          : null,
        status: "offen",
        erstellt: now,
        erledigt_am: null,
        aktualisiert: now,
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client.from("aufgaben").insert(aufgabe).select().single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/aufgaben/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing } = await identity.client
        .from("aufgaben")
        .select("id")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ message: "Aufgabe nicht gefunden" });

      const body = req.body || {};
      const update: Record<string, any> = {};

      if ("titel" in body) {
        const titel = typeof body.titel === "string" ? body.titel.trim() : "";
        if (!titel) return res.status(400).json({ message: "Titel erforderlich" });
        update.titel = titel;
      }
      if ("beschreibung" in body) {
        update.beschreibung = typeof body.beschreibung === "string" && body.beschreibung.trim()
          ? body.beschreibung.trim()
          : null;
      }
      if ("auftrag_id" in body) {
        const auftragId = typeof body.auftrag_id === "string" && body.auftrag_id.length > 0
          ? body.auftrag_id
          : null;
        if (auftragId && !(await auftragGehoertZuTenant(identity, auftragId))) {
          return res.status(404).json({ message: "Auftrag nicht gefunden." });
        }
        update.auftrag_id = auftragId;
      }
      if ("mitarbeiter_id" in body) {
        const mitarbeiterId = typeof body.mitarbeiter_id === "string" && body.mitarbeiter_id.length > 0
          ? body.mitarbeiter_id
          : null;
        if (mitarbeiterId && !(await mitarbeiterGehoertZuTenant(identity, mitarbeiterId))) {
          return res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
        }
        update.mitarbeiter_id = mitarbeiterId;
      }
      if ("faellig_datum" in body) {
        update.faellig_datum = typeof body.faellig_datum === "string" && body.faellig_datum.length > 0
          ? body.faellig_datum
          : null;
      }
      if ("status" in body) {
        if (body.status !== "offen" && body.status !== "abgeschlossen") {
          return res.status(400).json({ message: "Ungültiger Aufgabenstatus" });
        }
        update.status = body.status;
        // Das Erledigt-Datum ist ein Systemwert und wird beim Wiederöffnen gelöscht.
        update.erledigt_am = body.status === "abgeschlossen" ? new Date().toISOString() : null;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "Keine änderbaren Felder übermittelt" });
      }
      update.aktualisiert = new Date().toISOString();

      const { data, error } = await identity.client
        .from("aufgaben")
        .update(update)
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/aufgaben/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing } = await identity.client
        .from("aufgaben")
        .select("id")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ message: "Aufgabe nicht gefunden" });
      const { error } = await identity.client
        .from("aufgaben")
        .delete()
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Aufgaben-Erinnerung (Cron) ─────────────────────────────────────────────
  // Wird von einem externen Scheduler periodisch aufgerufen (z.B. 1x täglich).
  // Prüft überfällige, offene Aufgaben pro Tenant und verschickt eine E-Mail an
  // den zuständigen Mitarbeiter (oder die SMTP-Absenderadresse als Fallback),
  // sofern SMTP konfiguriert ist. Schützt vor Mehrfachversand über
  // erinnerung_gesendet_am. Zugriff nur mit gültigem Secret-Header.
  app.post("/api/cron/aufgaben-erinnerung", async (req, res) => {
    try {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.header("x-cron-secret") !== secret) {
        return res.status(401).json({ message: "Nicht autorisiert." });
      }

      const heute = new Date().toISOString().slice(0, 10);
      const { data: ueberfaellig, error: aufgabenErr } = await supabase
        .from("aufgaben")
        .select("id, titel, beschreibung, faellig_datum, mitarbeiter_id, tenant_id")
        .eq("status", "offen")
        .is("erinnerung_gesendet_am", null)
        .lte("faellig_datum", heute)
        .not("faellig_datum", "is", null);
      if (aufgabenErr) throw aufgabenErr;
      if (!ueberfaellig || ueberfaellig.length === 0) {
        return res.json({ ok: true, geprueft: 0, versendet: 0 });
      }

      const tenantIds = Array.from(new Set(ueberfaellig.map((a) => a.tenant_id).filter(Boolean)));
      const { data: einstellungenArr } = await supabase
        .from("einstellungen")
        .select("tenant_id, schluessel, wert")
        .in("tenant_id", tenantIds);
      const smtpByTenant = new Map<string, Record<string, string>>();
      for (const row of einstellungenArr || []) {
        if (!smtpByTenant.has(row.tenant_id)) smtpByTenant.set(row.tenant_id, {});
        smtpByTenant.get(row.tenant_id)![row.schluessel] = row.wert || "";
      }

      const mitarbeiterIds = Array.from(new Set(ueberfaellig.map((a) => a.mitarbeiter_id).filter(Boolean)));
      const { data: mitarbeiterArr } = mitarbeiterIds.length
        ? await supabase.from("mitarbeiter").select("id, vorname, nachname, email_geschaeftlich, email").in("id", mitarbeiterIds)
        : { data: [] as any[] };
      const mitarbeiterById = new Map((mitarbeiterArr || []).map((m: any) => [m.id, m]));

      const nodemailer = await import("nodemailer");
      let versendet = 0;
      const versendeteIds: string[] = [];

      for (const aufgabe of ueberfaellig) {
        const sm = smtpByTenant.get(aufgabe.tenant_id) || {};
        const smtpHost = sm.smtp_host || "";
        const smtpPort = Number(sm.smtp_port) || 587;
        const smtpUser = sm.smtp_user || "";
        const smtpPass = sm.smtp_passwort || sm.smtp_pass || "";
        const smtpFrom = sm.smtp_von || sm.smtp_from || smtpUser;
        const smtpSsl = sm.smtp_ssl || "starttls";
        if (!smtpHost || !smtpUser || !smtpPass) continue; // SMTP nicht konfiguriert für diesen Tenant

        const mitarbeiter = aufgabe.mitarbeiter_id ? mitarbeiterById.get(aufgabe.mitarbeiter_id) : null;
        const empfaenger = mitarbeiter?.email_geschaeftlich || mitarbeiter?.email || smtpFrom || smtpUser;
        if (!empfaenger) continue;

        try {
          const secure = smtpSsl === "ssl" || smtpPort === 465;
          const transporter = nodemailer.default.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure,
            auth: { user: smtpUser, pass: smtpPass },
            tls: secure ? undefined : { ciphers: "SSLv3" },
          });
          await transporter.sendMail({
            from: `"${sm.firmenname || "AuftragsPro"}" <${smtpFrom || smtpUser}>`,
            to: empfaenger,
            subject: `Erinnerung: Aufgabe "${aufgabe.titel}" ist überfällig`,
            text: `Die Aufgabe "${aufgabe.titel}" war fällig am ${aufgabe.faellig_datum} und ist noch nicht abgeschlossen.\n\n${aufgabe.beschreibung || ""}`,
            html: `<div style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;"><p>Die Aufgabe <strong>${aufgabe.titel}</strong> war fällig am <strong>${aufgabe.faellig_datum}</strong> und ist noch nicht abgeschlossen.</p>${aufgabe.beschreibung ? `<p>${String(aufgabe.beschreibung).replace(/\n/g, "<br/>")}</p>` : ""}</div>`,
          });
          versendet++;
          versendeteIds.push(aufgabe.id);
        } catch (mailErr) {
          console.error(`[Aufgaben-Erinnerung] SMTP-Fehler für Aufgabe ${aufgabe.id}:`, mailErr);
        }
      }

      if (versendeteIds.length > 0) {
        await supabase
          .from("aufgaben")
          .update({ erinnerung_gesendet_am: new Date().toISOString() })
          .in("id", versendeteIds);
      }

      res.json({ ok: true, geprueft: ueberfaellig.length, versendet });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Plantafel ───────────────────────────────────────────────────────────────
  app.get("/api/plantafel", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("plantafel").select("*").order("datum_von", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/plantafel", async (req, res) => {
    try {
      const p = { id: uid(), ...req.body };
      const { data, error } = await supabase.from("plantafel").insert(p).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/plantafel/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("plantafel").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Mahnwesen ───────────────────────────────────────────────────────────────
  app.get("/api/mahnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("mahnungen")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      // Map new DB fields (stufe/faellig_bis) to legacy frontend fields (mahnstufe/faellig_datum)
      const mapped = (data || []).map((m: any) => ({
        ...m,
        mahnstufe: m.mahnstufe ?? m.stufe ?? 1,
        faellig_datum: m.faellig_datum ?? m.faellig_bis ?? null,
      }));
      res.json(mapped);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/mahnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { auftrag_id, mahnstufe, betrag, faellig_datum, notiz } = req.body;
      if (!(await auftragGehoertZuTenant(identity, auftrag_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      // Mahnungsnummer: M + YY + 4-stellig, z.B. M260001
      const { data: allMahnNr } = await identity.client
        .from("mahnungen").select("nr").eq("tenant_id", identity.tenantId);
      const mahnNrYY = String(new Date().getFullYear()).slice(2);
      const mahnPrefix = "M" + mahnNrYY;
      const mahnMax = (allMahnNr || []).reduce((max: number, m: any) => {
        const nr = String(m.nr || "");
        const match = nr.match(/^M\d{2}(\d{4})$/);
        const seq = match ? parseInt(match[1], 10) : 0;
        return seq > max ? seq : max;
      }, 0);
      const mahnNr = mahnPrefix + String(mahnMax + 1).padStart(4, "0");
      const eintrag = {
        id: uid(),
        nr: mahnNr,
        auftrag_id,
        mahnstufe: mahnstufe || 1,
        betrag: betrag || 0,
        faellig_datum: faellig_datum || null,
        notiz: notiz || "",
        status: "offen",
        erstellt: new Date().toISOString(),
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client.from("mahnungen").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/mahnungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const updates: any = {};
      if (req.body.status) updates.status = req.body.status;
      if (req.body.status === "bezahlt") updates.bezahlt_datum = new Date().toISOString().slice(0, 10);
      if (req.body.status === "gesendet") updates.gesendet_datum = new Date().toISOString().slice(0, 10);
      const { data, error } = await identity.client
        .from("mahnungen").update(updates).eq("id", req.params.id).eq("tenant_id", identity.tenantId).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Mahnung nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/mahnungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("mahnungen").delete().eq("id", req.params.id).eq("tenant_id", identity.tenantId).select("id");
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ message: "Mahnung nicht gefunden." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Mahnung PDF (Vorlage aus DB) ────────────────────────────────────────────
  app.post("/api/mahnungen/:id/pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { data: mahnung, error: mErr } = await identity.client
        .from("mahnungen").select("*").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (mErr || !mahnung) throw new Error("Mahnung nicht gefunden");

      // Verknüpfte Rechnung laden
      let rechnung: any = null;
      let auftrag: any = null;
      if (mahnung.rechnung_id) {
        const { data: r } = await identity.client.from("rechnungen").select("*").eq("id", mahnung.rechnung_id).eq("tenant_id", identity.tenantId).maybeSingle();
        if (r) rechnung = r;
        if (r?.auftrag_id) {
          const { data: a } = await identity.client.from("auftraege").select("*").eq("id", r.auftrag_id).eq("tenant_id", identity.tenantId).maybeSingle();
          if (a) auftrag = a;
        }
      }

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      const positionen: any[] = rechnung?.positionen && Array.isArray(rechnung.positionen) ? rechnung.positionen : [];
      const subtotal   = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const mwstPct    = 8.1;
      const mwstBetrag = subtotal * (mwstPct / 100);
      const mahngebuehr = Number(mahnung.mahngebuehr || 0);
      const totalInkl  = subtotal + mwstBetrag + mahngebuehr;

      const datumStr = mahnung.erstellt
        ? new Date(mahnung.erstellt).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

      const empfaenger = mahnung.empfaenger_name || rechnung?.kunde_name || auftrag?.kunde_name || auftrag?.kunde || "";
      const stufe = mahnung.mahnstufe ? ` (${mahnung.mahnstufe}. Mahnung)` : "";

      const html = await buildPdfHtml("mahnung", {
        titel: "MAHNUNG" + stufe,
        nummer: mahnung.nr || rechnung?.nr || id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        empfaenger,
        ...(() => {
          const rawStrasse = mahnung.empfaenger_strasse || rechnung?.empfaenger_strasse || "";
          const rawPlzOrt  = mahnung.empfaenger_plz_ort  || rechnung?.empfaenger_plz_ort  || "";
          if (rawPlzOrt) return { empfaengerStrasse: rawStrasse, empfaengerPlzOrt: rawPlzOrt };
          const sp = splitAdresse(rawStrasse);
          return { empfaengerStrasse: sp.strasse, empfaengerPlzOrt: sp.plzOrt };
        })(),
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal, mwstPct, mwstBetrag,
        mahngebuehr: mahngebuehr > 0 ? mahngebuehr : undefined,
        total: totalInkl,
        showTotals: true,
        extraHtml: mahnung.notiz ? `<div style="margin-top:12px;padding:8px 12px;background:#fff3cd;border-left:3px solid #f0ad4e;font-size:8.5pt;color:#444;white-space:pre-line;">${mahnung.notiz}</div>` : "",
        ansprechpersonIntern: (req.body as any)?.ansprechpersonIntern || rechnung?.ansprechperson_intern || auftrag?.verantwortlicher || "",
        kundenNr: await getKundenNr(empfaenger),
        anrede: await getKundenAnrede(empfaenger),
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Mahnung-${mahnung.nr || id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Vorkalkulation ───────────────────────────────────────────────────────────
  app.get("/api/kalkulation/:auftragId", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("kalkulationen")
        .select("*")
        .eq("auftrag_id", req.params.auftragId)
        .order("erstellt", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/kalkulation/:auftragId", async (req, res) => {
    try {
      const { bezeichnung, typ, menge, einheit, einzelpreis, zuschlag_pct, betrag, notiz } = req.body;
      const pos = {
        id: uid(),
        auftrag_id: req.params.auftragId,
        bezeichnung: bezeichnung || "",
        typ: typ || "material",
        menge: menge || 1,
        einheit: einheit || "Stk",
        einzelpreis: einzelpreis || 0,
        zuschlag_pct: zuschlag_pct || 0,
        betrag: betrag || 0,
        notiz: notiz || "",
      };
      const { data, error } = await supabase.from("kalkulationen").insert(pos).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/kalkulation/position/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("kalkulationen").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Eingangsrechnungen ───────────────────────────────────────────────────────
  app.get("/api/eingangsrechnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("eingangsrechnungen")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/eingangsrechnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { lieferant, betrag, datum, faellig_datum, beschreibung, auftrag_id } = req.body;
      const eintrag = {
        id: uid(),
        lieferant: lieferant || "",
        betrag: betrag || 0,
        waehrung: "CHF",
        datum,
        faellig_datum: faellig_datum || null,
        beschreibung: beschreibung || "",
        auftrag_id: auftrag_id || null,
        status: "offen",
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client.from("eingangsrechnungen").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/eingangsrechnungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("eingangsrechnungen")
        .update({ status: req.body.status })
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Eingangsrechnung nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/eingangsrechnungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client.from("eingangsrechnungen").delete().eq("id", req.params.id).eq("tenant_id", identity.tenantId).select("id");
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ message: "Eingangsrechnung nicht gefunden." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // ─── OFFERTEN ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  /** Bruttobetrag einer Offerte — identisch zur Rechenweise im Offerte-PDF. */
  function offerteBrutto(offerte: any): number {
    const positionen: any[] = Array.isArray(offerte.positionen) ? offerte.positionen : [];
    const subtotal = positionen.reduce((s: number, p: any) =>
      s + Number(p.total ?? (Number(p.menge || 0) * Number(p.einzelpreis || 0))), 0);
    const netto = subtotal - subtotal * ((Number(offerte.rabatt_prozent) || 0) / 100);
    return Math.round(netto * (1 + (Number(offerte.mwst_prozent) || 8.1) / 100) * 100) / 100;
  }

  // Schreibt den Bruttobetrag der massgeblichen Offerte nach auftraege.angebots_betrag.
  //
  // Sobald eine Offerte existiert, ist SIE die Quelle für die Spalte "Angebot" — sonst
  // laufen der aus der Vorkalkulation geschätzte Preis und der tatsächlich offerierte
  // Betrag auseinander. Ohne Offerte bleibt der Wert unangetastet (Vorkalkulation bzw.
  // manuelle Eingabe). Wer eine Offerte anlegt, ändert oder löscht, MUSS das hier aufrufen.
  async function syncAngebotsBetrag(auftragId: string, identity?: DashboardPreferenceIdentity) {
    if (!auftragId) return;
    const client = identity?.client || supabase;
    let offertenQuery = client.from("offerten").select("*").eq("auftrag_id", auftragId);
    if (identity) offertenQuery = offertenQuery.eq("tenant_id", identity.tenantId);
    const { data: offerten, error } = await offertenQuery;
    if (error) throw error;
    if (!offerten || offerten.length === 0) return;

    const neueste = (liste: any[]) =>
      [...liste].sort((a, b) => String(b.erstellt || "").localeCompare(String(a.erstellt || "")))[0];
    const angenommen = offerten.filter((o: any) => o.status === "angenommen");
    const offen = offerten.filter((o: any) => o.status !== "abgelehnt" && o.status !== "abgelaufen");
    // Eine angenommene Offerte schlägt eine offene; mehrere Offerten sind Varianten
    // desselben Angebots, deshalb wird die neueste genommen und nicht summiert.
    const massgeblich = neueste(angenommen) || neueste(offen) || neueste(offerten);

    const brutto = offerteBrutto(massgeblich);
    let auftragQuery = client.from("auftraege").update({ angebots_betrag: brutto }).eq("id", auftragId);
    if (identity) auftragQuery = auftragQuery.eq("tenant_id", identity.tenantId);
    const { error: schreibFehler } = await auftragQuery;
    if (schreibFehler) throw schreibFehler;
    return brutto;
  }

  app.get("/api/auftraege/:auftr_id/offerten", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.auftr_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("offerten")
        .select("*")
        .eq("auftrag_id", req.params.auftr_id)
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/offerten", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      await markiereAbgelaufeneOfferten(identity.tenantId);
      const { data, error } = await identity.client
        .from("offerten")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:auftr_id/offerten", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.auftr_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const _pos = Array.isArray(req.body?.positionen) ? req.body.positionen : [];
      const _hatGueltigePos = _pos.some((p: any) => String(p?.titel || "").trim() !== "" && Number(p?.einzelpreis) > 0);
      if (!String(req.body?.empfaenger_name || "").trim()) {
        return res.status(400).json({ message: "Empfänger-Name ist erforderlich." });
      }
      if (!_hatGueltigePos) {
        return res.status(400).json({ message: "Mindestens eine Position mit Titel und Preis > 0 ist erforderlich." });
      }
      const { data: allRows } = await identity.client.from("offerten").select("nr").eq("tenant_id", identity.tenantId);
      // Format: O + YY + 4-stellig laufend, z.B. O260001
      const yy = String(new Date().getFullYear()).slice(2);
      const prefix = "O" + yy;
      const maxSeq = (allRows || []).reduce((max: number, r: any) => {
        const nr = String(r.nr || "");
        // Support both old format (26001) and new (O260001)
        const matchNew = nr.match(/^O\d{2}(\d{4})$/);
        const matchOld = nr.match(/^\d{2}(\d{3,4})$/);
        const seq = matchNew ? parseInt(matchNew[1], 10) : matchOld ? parseInt(matchOld[1], 10) : 0;
        if (!isNaN(seq) && seq > max) return seq;
        return max;
      }, 0);
      const nextNr = prefix + String(maxSeq + 1).padStart(4, "0"); // z.B. O260001
      const body = req.body;
      const eintrag = {
        id: uid(),
        auftrag_id: req.params.auftr_id,
        nr: nextNr,
        ansprechpartner: body.ansprechpartner || null,
        telefon: body.telefon || null,
        email: body.email || null,
        anrede: body.anrede || null,
        empfaenger_name: body.empfaenger_name || null,
        empfaenger_strasse: body.empfaenger_strasse || null,
        empfaenger_plz_ort: body.empfaenger_plz_ort || null,
        projekt_beschreibung: body.projekt_beschreibung || null,
        intro_text: body.intro_text || "Wir danken fuer Ihre Anfrage und erlauben uns, Ihnen fuer die beschriebenen Arbeiten folgende Offerte zu unterbreiten.",
        positionen: body.positionen || [],
        rabatt_prozent: body.rabatt_prozent ?? 0,
        mwst_prozent: body.mwst_prozent ?? 8.1,
        liefertermin: body.liefertermin || "nach Absprache",
        zahlungsbedingungen: body.zahlungsbedingungen || "30 Tage netto",
        gueltigkeit: body.gueltigkeit || "30 Tage",
        schluss_text: body.schluss_text || null,
        datum: body.datum || new Date().toISOString().slice(0, 10),
        status: "offen",
        tenant_id: identity.tenantId,
      };
      const { data, error } = await identity.client.from("offerten").insert(eintrag).select().single();
      if (error) throw error;
      await syncAngebotsBetrag(req.params.auftr_id, identity);
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/offerten/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const allowed = ["ansprechpartner","telefon","email","anrede","empfaenger_name",
        "empfaenger_strasse","empfaenger_plz_ort","projekt_beschreibung","intro_text",
        "positionen","rabatt_prozent","mwst_prozent","liefertermin","zahlungsbedingungen",
        "gueltigkeit","schluss_text","datum","status"];
      const upd: any = {};
      for (const f of allowed) if (f in req.body) upd[f] = req.body[f];
      const { data, error } = await identity.client
        .from("offerten").update(upd).eq("id", req.params.id).eq("tenant_id", identity.tenantId).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Offerte nicht gefunden." });
      await syncAngebotsBetrag(data.auftrag_id, identity);
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/offerten/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: offerte } = await identity.client
        .from("offerten").select("auftrag_id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (!offerte) return res.status(404).json({ message: "Offerte nicht gefunden." });
      const { error } = await identity.client
        .from("offerten").delete().eq("id", req.params.id).eq("tenant_id", identity.tenantId);
      if (error) throw error;
      if (offerte.auftrag_id) await syncAngebotsBetrag(offerte.auftrag_id, identity);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Offerte → Rechnung umwandeln ───────────────────────────────────────────
  app.post("/api/offerten/:id/zu-rechnung", async (req, res) => {
    try {
      const { data: offerte, error } = await supabase
        .from("offerten").select("*").eq("id", req.params.id).single();
      if (error || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });

      // Rechnungs-Nummer = R(AuftragNr), bei 2.+ Rechnung = R(AuftragNr)_2
      const _auftrId = offerte.auftrag_id;
      let nr: string;
      {
        const { data: _aNr } = await supabase.from("auftraege").select("nr").eq("id", _auftrId).single();
        const _baseNr = "R" + ((_aNr?.nr || "").replace(/^A/, ""));
        const { data: _existR } = await supabase.from("rechnungen").select("nr").eq("auftrag_id", _auftrId);
        const _cnt = (_existR || []).length;
        nr = _cnt === 0 ? _baseNr : _baseNr + "_" + (_cnt + 1);
      }

      // Positionen von Offerte übernehmen (jede Position mit total-Feld normalisieren)
      const positionen: any[] = (Array.isArray(offerte.positionen) ? offerte.positionen : []).map((p: any) => ({
        ...p,
        betrag: Number(p.total ?? p.betrag ?? (Number(p.menge||0)*Number(p.einzelpreis||0))),
      }));

      // Rabatt der Offerte als eigene Positionszeile übernehmen. "rechnungen" hat keine
      // Rabatt-Spalte; als Zeile bleibt die Invariante Summe(positionen) === betrag erhalten,
      // auf die sich Rechnungs-PDF, Mahnungs-PDF und die Auswertungen alle verlassen.
      const rabattPct = Number(offerte.rabatt_prozent) || 0;
      const zwischentotal = positionen.reduce((s: number, p: any) => s + Number(p.betrag || 0), 0);
      if (rabattPct > 0 && zwischentotal > 0) {
        const rabattBetrag = -(Math.round(zwischentotal * (rabattPct / 100) * 100) / 100);
        positionen.push({
          nr: positionen.length + 1,
          titel: `Rabatt ${rabattPct}%`,
          beschreibung: `auf Offerte ${offerte.nr}`,
          menge: 1,
          einheit: "Psch.",
          einzelpreis: rabattBetrag,
          total: rabattBetrag,
          betrag: rabattBetrag,
        });
      }

      // Betrag = Nettosumme (exkl. MWST, nach Rabatt) — gleich wie direkte Rechnung
      const betrag = positionen.reduce((s: number, p: any) => s + Number(p.betrag || 0), 0);

      // Fälligkeitsdatum: heute + 30 Tage (Standard)
      const faelligDate = new Date();
      faelligDate.setDate(faelligDate.getDate() + 30);
      const faellig_datum = faelligDate.toISOString().slice(0, 10);

      // Rechnung erstellen mit allen relevanten Feldern aus Offerte
      // Offerte-ID in notiz speichern damit PDF die Offerte-Daten (Empfänger etc.) nachladen kann
      const row: any = {
        id: uid(),
        auftrag_id: offerte.auftrag_id,
        nr,
        betrag: Math.round(betrag * 100) / 100,
        waehrung: offerte.waehrung || "CHF",
        positionen,
        notiz: `offerte_id:${req.params.id}|Aus Offerte ${offerte.nr} erstellt`,
        faellig_datum,
        ansprechperson_intern: offerte.ansprechpartner || null,
        ansprechperson_extern: offerte.empfaenger_name || null,
        erstellt: new Date().toISOString(),
      };
      // tenant_id von Offerte übernehmen (Multi-Tenant-Sicherheit)
      if ((offerte as any).tenant_id) row.tenant_id = (offerte as any).tenant_id;
      const { data: rechnung, error: e2 } = await supabase
        .from("rechnungen").insert(row).select().single();
      if (e2) throw e2;
      await syncRechnungsBetrag(offerte.auftrag_id);

      // Offerte als "angenommen" markieren
      await supabase.from("offerten").update({ status: "angenommen" }).eq("id", req.params.id);
      // Der Statuswechsel kann eine andere Offerte massgeblich machen.
      await syncAngebotsBetrag(offerte.auftrag_id);

      res.json({ ok: true, rechnung });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── Keep-Alive Ping (verhindert Render Free Tier Sleep) ────────────────────
  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString(), service: "AuftragsPro" });
  });

  // ─── Offerte PDF (Vorlage aus DB) ─────────────────────────────────────────────
  app.post("/api/offerten/:id/pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: offerte, error } = await identity.client.from("offerten").select("*").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (error || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });
      const { data: auftrag } = offerte.auftrag_id
        ? await identity.client.from("auftraege").select("*").eq("id", offerte.auftrag_id).eq("tenant_id", identity.tenantId).maybeSingle()
        : { data: null };
      const { ansprechpersonIntern: bodyIntern, ansprechpersonExtern: bodyExtern } = req.body || {};

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      const positionen: any[] = Array.isArray(offerte.positionen) ? offerte.positionen : [];
      const subtotal     = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const rabattPct    = Number(offerte.rabatt_prozent) || 0;
      const rabattBetrag = subtotal * (rabattPct / 100);
      const totalExkl    = subtotal - rabattBetrag;
      const mwstPct      = Number(offerte.mwst_prozent) || 8.1;
      const mwstBetrag   = totalExkl * (mwstPct / 100);
      const totalInkl    = totalExkl + mwstBetrag;

      const datumStr = offerte.datum
        ? new Date(offerte.datum).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      // gueltigkeit kann ein Datum (ISO) oder ein Text wie "60 Tage" sein
      const _gueltigRaw = offerte.gueltigkeit || "";
      let gueltigBisStr: string | undefined = undefined;
      if (_gueltigRaw) {
        const _gDate = new Date(_gueltigRaw);
        if (!isNaN(_gDate.getTime())) {
          gueltigBisStr = _gDate.toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
        } else {
          gueltigBisStr = _gueltigRaw; // Text direkt übernehmen z.B. "60 Tage"
        }
      }

      const html = await buildPdfHtml("offerte", {
        titel: "OFFERTE",
        nummer: offerte.nr || req.params.id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        gueltigBis: gueltigBisStr,
        empfaenger: (offerte.empfaenger_name || offerte.anrede || "").replace(/  +/g, " ").trim(),
        empfaengerStrasse: (() => { const s = splitAdresse(offerte.empfaenger_strasse || ""); return offerte.empfaenger_plz_ort ? (offerte.empfaenger_strasse || "") : s.strasse; })(),
        empfaengerPlzOrt: offerte.empfaenger_plz_ort || splitAdresse(offerte.empfaenger_strasse || "").plzOrt,
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal, rabattPct, rabattBetrag, mwstPct, mwstBetrag, total: totalInkl,
        einleitung: offerte.intro_text || "",
        schluss: offerte.schluss_text || "",
        showTotals: true,
        ansprechpersonIntern: bodyIntern || offerte.ansprechperson_intern || auftrag?.verantwortlicher || "",
        ansprechpersonInternEmail: (req.body as any)?.ansprechpersonInternEmail || "",
        ansprechpersonInternTelefon: (req.body as any)?.ansprechpersonInternTelefon || "",
        ansprechpersonExtern: bodyExtern || offerte.ansprechperson_extern || auftrag?.ansprechperson || "",
        kundenNr: await getKundenNr(offerte.empfaenger_name || offerte.anrede || auftrag?.kunde || ""),
        anrede: await getKundenAnrede(offerte.empfaenger_name || offerte.anrede || auftrag?.kunde || ""),
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Offerte-${offerte.nr || req.params.id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PDF-Export für Offerte (GET) — nutzt buildPdfHtml() mit gespeicherter Vorlage
  app.get("/api/offerten/:id/pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: offerte, error } = await identity.client.from("offerten").select("*").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (error || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });
      const { data: auftrag } = offerte.auftrag_id
        ? await supabase.from("auftraege").select("*").eq("id", offerte.auftrag_id).single()
        : { data: null };

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      const positionen: any[] = Array.isArray(offerte.positionen) ? offerte.positionen : (typeof offerte.positionen === "string" ? JSON.parse(offerte.positionen) : []);
      const subtotal     = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const rabattPct    = Number(offerte.rabatt_prozent) || 0;
      const rabattBetrag = subtotal * (rabattPct / 100);
      const totalExkl    = subtotal - rabattBetrag;
      const mwstPct      = Number(offerte.mwst_prozent) || 8.1;
      const mwstBetrag   = totalExkl * (mwstPct / 100);
      const totalInkl    = totalExkl + mwstBetrag;

      const datumStr = offerte.datum
        ? new Date(offerte.datum).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      // gueltigkeit kann ein Datum (ISO) oder ein Text wie "60 Tage" sein
      const _gueltigRaw = offerte.gueltigkeit || "";
      let gueltigBisStr: string | undefined = undefined;
      if (_gueltigRaw) {
        const _gDate = new Date(_gueltigRaw);
        if (!isNaN(_gDate.getTime())) {
          gueltigBisStr = _gDate.toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
        } else {
          gueltigBisStr = _gueltigRaw; // Text direkt übernehmen z.B. "60 Tage"
        }
      }

      const html = await buildPdfHtml("offerte", {
        titel: "OFFERTE",
        nummer: offerte.offerten_nr || offerte.nr || req.params.id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        gueltigBis: gueltigBisStr,
        empfaenger: (offerte.empfaenger_name || offerte.anrede || offerte.kunde || "").replace(/  +/g, " ").trim(),
        empfaengerStrasse: (() => { const s = splitAdresse(offerte.empfaenger_strasse || ""); return offerte.empfaenger_plz_ort ? (offerte.empfaenger_strasse || "") : s.strasse; })(),
        empfaengerPlzOrt: offerte.empfaenger_plz_ort || splitAdresse(offerte.empfaenger_strasse || "").plzOrt,
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal, rabattPct, rabattBetrag, mwstPct, mwstBetrag, total: totalInkl,
        einleitung: offerte.intro_text || "",
        schluss: offerte.schluss_text || "",
        showTotals: true,
        ansprechpersonIntern: offerte.ansprechperson_intern || auftrag?.verantwortlicher || "",
        ansprechpersonExtern: offerte.ansprechperson_extern || auftrag?.ansprechperson || "",
        kundenNr: await getKundenNr(offerte.empfaenger_name || offerte.anrede || auftrag?.kunde || ""),
        anrede: await getKundenAnrede(offerte.empfaenger_name || offerte.anrede || auftrag?.kunde || ""),
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Offerte-${offerte.offerten_nr || offerte.nr || req.params.id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });



  // ═══════════════════════════════════════════════════════════════════════════
  // ─── LOHNABRECHNUNG PDF ────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/api/lohnabrechnung/pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { mitarbeiter_name, monat, jahr, stundenansatz, inkl_dreizehnter, dreizehnter_ml, abzuege_total, nettolohn } = req.body;
      if (!mitarbeiter_name || !monat || !jahr)
        return res.status(400).json({ message: "Mitarbeiter, Monat und Jahr erforderlich" });

      const monPad  = String(monat).padStart(2, "0");
      const startDt = `${jahr}-${monPad}-01`;
      const endDt   = new Date(Number(jahr), Number(monat), 0).toISOString().slice(0,10);

      const { data: eintraege, error } = await supabase
        .from("zeiteintraege").select("*")
        .eq("tenant_id", identity.tenantId)
        .eq("mitarbeiter", mitarbeiter_name)
        .gte("datum", startDt).lte("datum", endDt)
        .order("datum", { ascending: true });
      if (error) throw error;

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      const rows: any[] = eintraege || [];
      const totalMin   = rows.reduce((s: number, r: any) => s + (r.dauer_minuten || 0), 0);
      const totalStd   = totalMin / 60;
      const ansatz     = Number(stundenansatz) || 0;
      const bruttoLohn = totalStd * ansatz;
      const dreizehnterML = Number(dreizehnter_ml) || 0;
      const inklDreizehnter = !!inkl_dreizehnter;
      const bruttoTotal = bruttoLohn + (inklDreizehnter ? dreizehnterML : 0);
      const nettoLohn   = Number(nettolohn) || 0;

      const mNamen = ["Januar","Februar","Maerz","April","Mai","Juni",
                      "Juli","August","September","Oktober","November","Dezember"];
      const mName  = mNamen[Number(monat)-1] || String(monat);
      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

      // Zeiteintraege als Positionsliste aufbereiten
      const positionen = rows.map((r: any) => ({
        beschreibung: `${r.datum ? new Date(r.datum+"T00:00:00").toLocaleDateString("de-CH") : "-"}  ${(r.beschreibung||"").slice(0,40)}  ${r.start_zeit?.slice(0,5)||""}-${r.end_zeit?.slice(0,5)||""}`,
        menge: ((r.dauer_minuten||0)/60),
        einheit: "Std.",
        einzelpreis: ansatz,
        total: ((r.dauer_minuten||0)/60) * ansatz
      }));

      // Zusammenfassung als Extra-HTML
      const abzuege = [
        { label: "AHV (5.3%)", betrag: bruttoTotal * 0.053 },
        { label: "IV (1.4%)",  betrag: bruttoTotal * 0.014 },
        { label: "EO (0.5%)",  betrag: bruttoTotal * 0.005 },
        { label: "ALV (1.1%)", betrag: bruttoTotal * 0.011 },
      ];
      const abzuegeHTML = abzuege.map(a =>
        `<tr><td style="padding:2px 8px;color:#666;">- ${a.label}</td><td style="text-align:right;padding:2px 8px;color:#666;">CHF -${a.betrag.toFixed(2)}</td></tr>`
      ).join("");

      const extraHtml = `
        <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">
          <table style="width:100%;font-size:9pt;border-collapse:collapse;margin-left:auto;max-width:280px;">
            <tr><td style="padding:2px 8px;font-weight:600;">Total Stunden:</td><td style="text-align:right;padding:2px 8px;font-weight:600;">${totalStd.toFixed(2)} Std.</td></tr>
            ${ansatz > 0 ? `<tr><td style="padding:2px 8px;">Stundenansatz:</td><td style="text-align:right;padding:2px 8px;">CHF ${ansatz.toFixed(2)}/Std.</td></tr>
            <tr><td style="padding:2px 8px;">Bruttolohn:</td><td style="text-align:right;padding:2px 8px;">CHF ${bruttoLohn.toFixed(2)}</td></tr>
            ${inklDreizehnter ? `<tr><td style="padding:2px 8px;">+ 13. ML (1/12):</td><td style="text-align:right;padding:2px 8px;">CHF ${dreizehnterML.toFixed(2)}</td></tr>
            <tr><td style="padding:2px 8px;">= Brutto Total:</td><td style="text-align:right;padding:2px 8px;">CHF ${bruttoTotal.toFixed(2)}</td></tr>` : ""}
            ${abzuegeHTML}
            <tr style="border-top:1px solid #999;"><td style="padding:4px 8px;font-weight:700;font-size:10pt;">= Nettolohn:</td><td style="text-align:right;padding:4px 8px;font-weight:700;font-size:10pt;">CHF ${nettoLohn.toFixed(2)}</td></tr>` : ""}
          </table>
        </div>`;

      const html = await buildPdfHtml("lohnabrechnung", {
        titel: "LOHNABRECHNUNG",
        nummer: `${mName} ${jahr}`,
        datum: datumStr,
        empfaenger: mitarbeiter_name,
        empfaengerStrasse: "",
        empfaengerPlzOrt: "",
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal: bruttoLohn,
        mwstPct: 0,
        mwstBetrag: 0,
        total: nettoLohn,
        showTotals: false,
        extraHtml,
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Lohnabrechnung-${mitarbeiter_name}-${mName}-${jahr}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Stundenabrechnung PDF (Vorlage aus DB) ─────────────────────────────────
  app.post("/api/stundenabrechnung/pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { mitarbeiter_name, monat, jahr, von_datum, bis_datum } = req.body;

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      // Datum-Range bestimmen
      let startDt: string, endDt: string;
      if (von_datum && bis_datum) {
        startDt = von_datum; endDt = bis_datum;
      } else if (monat && jahr) {
        const monPad = String(monat).padStart(2, "0");
        startDt = `${jahr}-${monPad}-01`;
        endDt   = new Date(Number(jahr), Number(monat), 0).toISOString().slice(0,10);
      } else {
        // Aktueller Monat
        const now = new Date();
        startDt = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
        endDt   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);
      }

      let query = identity.client.from("zeiteintraege").select("*").eq("tenant_id", identity.tenantId).gte("datum", startDt).lte("datum", endDt).order("datum", { ascending: true });
      if (mitarbeiter_name) query = query.eq("mitarbeiter", mitarbeiter_name);

      const { data: eintraege, error } = await query;
      if (error) throw error;

      const rows: any[] = eintraege || [];
      const totalMin = rows.reduce((s: number, r: any) => s + (r.dauer_minuten || 0), 0);
      const totalStd = totalMin / 60;

      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      const periodeStr = `${new Date(startDt).toLocaleDateString("de-CH")} - ${new Date(endDt).toLocaleDateString("de-CH")}`;

      const positionen = rows.map((r: any) => ({
        beschreibung: `${r.datum ? new Date(r.datum+"T00:00:00").toLocaleDateString("de-CH") : "-"}  ${r.mitarbeiter||""}  ${(r.beschreibung||"").slice(0,35)}`,
        menge: ((r.dauer_minuten||0)/60),
        einheit: "Std.",
        einzelpreis: 0,
        total: 0
      }));

      const extraHtml = `
        <div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;text-align:right;">
          <span style="font-weight:700;font-size:10pt;">Total: ${totalStd.toFixed(2)} Stunden (${totalMin} Min.)</span>
        </div>`;

      const html = await buildPdfHtml("stundenabrechnung", {
        titel: "STUNDENABRECHNUNG",
        nummer: periodeStr,
        datum: datumStr,
        empfaenger: mitarbeiter_name || "Alle Mitarbeiter",
        empfaengerStrasse: "",
        empfaengerPlzOrt: "",
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal: 0, mwstPct: 0, mwstBetrag: 0, total: 0,
        showTotals: false,
        extraHtml,
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Stundenabrechnung-${startDt}-${endDt}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ============= VORKALKULATION =============

  // GET stunden (Soll-Stunden pro Ort/Maschine)
  app.get("/api/vorkalkulation/:id/stunden", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_stunden")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PUT stunden — full replace (delete all + insert new)
  app.put("/api/vorkalkulation/:id/stunden", async (req, res) => {
    try {
      const { id } = req.params;
      const rows: any[] = Array.isArray(req.body) ? req.body : [];

      // Delete all existing rows for this auftrag
      const { error: delErr } = await supabase
        .from("vorkalkulation_stunden")
        .delete()
        .eq("auftrag_id", id);
      if (delErr) return res.status(500).json({ message: asError(delErr) });

      if (rows.length === 0) return res.json([]);

      // Insert fresh rows, strip _maschinenpark hack, use maschinenpark directly
      const toInsert = rows.map((r: any) => ({
        id: r.id || uid(),
        auftrag_id: id,
        ort: r.ort,
        maschinenpark: r.maschinenpark ?? r._maschinenpark ?? null,
        soll_stunden: Number(r.soll_stunden) || 0,
        stundensatz: Number(r.stundensatz) || 0,
      }));

      const { data, error } = await supabase
        .from("vorkalkulation_stunden")
        .insert(toInsert)
        .select();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST stunden — einzelne Zeile hinzufügen
  app.post("/api/vorkalkulation/:id/stunden", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        ort: String(b.ort || "Avor"),
        maschinenpark: b.maschinenpark ?? null,
        bereich: b.bereich ?? null,
        unterkategorie: b.unterkategorie ?? null,
        bezeichnung: b.bezeichnung ?? null,
        soll_stunden: Number(b.soll_stunden) || 0,
        stundensatz: Number(b.stundensatz) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_stunden")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE stunden/:sid — einzelne Zeile löschen
  app.delete("/api/vorkalkulation/stunden/:sid", async (req, res) => {
    try {
      const { sid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_stunden")
        .delete()
        .eq("id", sid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET material (Stückliste)
  app.get("/api/vorkalkulation/:id/material", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_material")
        .select("*")
        .eq("auftrag_id", id)
        .order("pos", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST material
  app.post("/api/vorkalkulation/:id/material", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        pos: Number(b.pos) || 1,
        profil: String(b.profil || ""),
        bemerkung: String(b.bemerkung || ""),
        stueck: Number(b.stueck) || 1,
        laenge_mm: b.laenge_mm != null ? Number(b.laenge_mm) : null,
        kg_pro_m: b.kg_pro_m != null ? Number(b.kg_pro_m) : null,
        total_kg: b.total_kg != null ? Number(b.total_kg) : null,
        preis_pro_einheit: Number(b.preis_pro_einheit) || 0,
        total_chf: Number(b.total_chf) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_material")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PATCH material/:mid
  app.patch("/api/vorkalkulation/:id/material/:mid", async (req, res) => {
    try {
      const { mid } = req.params;
      const b = req.body;
      const updates: any = {};
      if (b.pos !== undefined) updates.pos = Number(b.pos);
      if (b.profil !== undefined) updates.profil = String(b.profil);
      if (b.bemerkung !== undefined) updates.bemerkung = String(b.bemerkung);
      if (b.stueck !== undefined) updates.stueck = Number(b.stueck);
      if (b.laenge_mm !== undefined) updates.laenge_mm = b.laenge_mm != null ? Number(b.laenge_mm) : null;
      if (b.kg_pro_m !== undefined) updates.kg_pro_m = b.kg_pro_m != null ? Number(b.kg_pro_m) : null;
      if (b.total_kg !== undefined) updates.total_kg = b.total_kg != null ? Number(b.total_kg) : null;
      if (b.preis_pro_einheit !== undefined) updates.preis_pro_einheit = Number(b.preis_pro_einheit);
      if (b.total_chf !== undefined) updates.total_chf = Number(b.total_chf);
      const { data, error } = await supabase
        .from("vorkalkulation_material")
        .update(updates)
        .eq("id", mid)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE material/:mid
  app.delete("/api/vorkalkulation/:id/material/:mid", async (req, res) => {
    try {
      const { mid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_material")
        .delete()
        .eq("id", mid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET fremdleistungen
  app.get("/api/vorkalkulation/:id/fremdleistungen", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_fremdleistungen")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST fremdleistungen
  app.post("/api/vorkalkulation/:id/fremdleistungen", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        bezeichnung: String(b.bezeichnung || ""),
        anzahl: Number(b.anzahl) || 1,
        einheit: String(b.einheit || "Stk."),
        preis_pro_einheit: Number(b.preis_pro_einheit) || 0,
        total_chf: Number(b.total_chf) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_fremdleistungen")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PATCH fremdleistungen/:fid
  app.patch("/api/vorkalkulation/:id/fremdleistungen/:fid", async (req, res) => {
    try {
      const { fid } = req.params; const b = req.body;
      const updates: any = {};
      if (b.anzahl !== undefined) updates.anzahl = Number(b.anzahl);
      if (b.einheit !== undefined) updates.einheit = String(b.einheit);
      if (b.bezeichnung !== undefined) updates.bezeichnung = String(b.bezeichnung);
      if (b.preis_pro_einheit !== undefined) updates.preis_pro_einheit = Number(b.preis_pro_einheit);
      if (b.total_chf !== undefined) updates.total_chf = Number(b.total_chf);
      const { data, error } = await supabase.from("vorkalkulation_fremdleistungen").update(updates).eq("id", fid).select().single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE fremdleistungen/:fid
  app.delete("/api/vorkalkulation/:id/fremdleistungen/:fid", async (req, res) => {
    try {
      const { fid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_fremdleistungen")
        .delete()
        .eq("id", fid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET soek
  app.get("/api/vorkalkulation/:id/soek", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_soek")
        .select("*")
        .eq("auftrag_id", id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST soek
  app.post("/api/vorkalkulation/:id/soek", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      const row = {
        id: uid(),
        auftrag_id: id,
        bezeichnung: String(b.bezeichnung || ""),
        anzahl: Number(b.anzahl) || 1,
        einheit: String(b.einheit || "Stk."),
        preis_pro_einheit: Number(b.preis_pro_einheit) || 0,
        total_chf: Number(b.total_chf) || 0,
      };
      const { data, error } = await supabase
        .from("vorkalkulation_soek")
        .insert(row)
        .select()
        .single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PATCH soek/:sid
  app.patch("/api/vorkalkulation/:id/soek/:sid", async (req, res) => {
    try {
      const { sid } = req.params; const b = req.body;
      const updates: any = {};
      if (b.bezeichnung !== undefined) updates.bezeichnung = String(b.bezeichnung);
      if (b.anzahl !== undefined) updates.anzahl = Number(b.anzahl);
      if (b.einheit !== undefined) updates.einheit = String(b.einheit);
      if (b.preis_pro_einheit !== undefined) updates.preis_pro_einheit = Number(b.preis_pro_einheit);
      if (b.total_chf !== undefined) updates.total_chf = Number(b.total_chf);
      const { data, error } = await supabase.from("vorkalkulation_soek").update(updates).eq("id", sid).select().single();
      if (error) return res.status(500).json({ message: asError(error) });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE soek/:sid
  app.delete("/api/vorkalkulation/:id/soek/:sid", async (req, res) => {
    try {
      const { sid } = req.params;
      const { error } = await supabase
        .from("vorkalkulation_soek")
        .delete()
        .eq("id", sid);
      if (error) return res.status(500).json({ message: asError(error) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // GET config
  app.get("/api/vorkalkulation/:id/config", async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error } = await supabase
        .from("vorkalkulation_config")
        .select("*")
        .eq("auftrag_id", id)
        .maybeSingle();
      if (error) return res.status(500).json({ message: asError(error) });
      // Return defaults if no config yet
      res.json(data || {
        auftrag_id: id,
        risiko_gewinn_prozent: 10,
        rabatt_prozent: 0,
        skonto_prozent: 0,
        mwst_prozent: 8.1,
        notiz: "",
      });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PUT config (upsert)
  app.put("/api/vorkalkulation/:id/config", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;

      // Check if config exists
      const { data: existing } = await supabase
        .from("vorkalkulation_config")
        .select("id")
        .eq("auftrag_id", id)
        .maybeSingle();

      const payload = {
        auftrag_id: id,
        risiko_gewinn_prozent: Number(b.risiko_gewinn_prozent) ?? 10,
        rabatt_prozent: Number(b.rabatt_prozent) ?? 0,
        skonto_prozent: Number(b.skonto_prozent) ?? 0,
        mwst_prozent: Number(b.mwst_prozent) ?? 8.1,
        notiz: String(b.notiz || ""),
      };

      let result;
      if (existing) {
        result = await supabase
          .from("vorkalkulation_config")
          .update(payload)
          .eq("auftrag_id", id)
          .select()
          .single();
      } else {
        result = await supabase
          .from("vorkalkulation_config")
          .insert({ id: uid(), ...payload })
          .select()
          .single();
      }
      if (result.error) return res.status(500).json({ message: asError(result.error) });
      res.json(result.data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ============= NACHKALKULATION =============
  // Der alte Namespace `/api/nachkalkulation/:id/{material,fremdleistungen,soek}`
  // wurde entfernt (Bug 1, Bereich 7): dieselben Tabellen werden ausschliesslich
  // über `/api/kalkulation/:auftragsId/nk-*` bedient (mit Tenant-Isolation).
  // Nur `PATCH /api/nachkalkulation/:id/status` bleibt bestehen (siehe unten).

  // ============= KALKULATION PDF =============

  app.post("/api/auftraege/:id/kalkulation-pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const typ = (req.query.typ as string) || "vorkalkulation";
      const isVK = typ === "vorkalkulation";

      // Load auftrag
      const { data: auftrag } = await identity.client
        .from("auftraege")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();

      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden" });

      // Load Firmendaten
      const offSMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      // Load PDF-Vorlage (aus Einstellungen)
      const docTyp = typ === "vorkalkulation" ? "vorkalkulation" : "nachkalkulation";
      const { data: pdfVorlageRaw } = await identity.client.from("pdf_vorlagen").select("*").eq("tenant_id", identity.tenantId).eq("doc_typ", docTyp).maybeSingle();
      const pdfVorlage = pdfVorlageRaw || {};

      // Load stundensaetze
      const { data: saetze = [] } = await identity.client
        .from("stundensaetze")
        .select("*")
        .eq("tenant_id", identity.tenantId);

      const getOrtSatz = (ort: string, maschine: string | null): number => {
        const match = (saetze as any[]).find((s: any) => {
          if (ort === "Werkstatt") return s.ort === "Werkstatt" && s.maschinenpark === maschine;
          return s.ort === ort && !s.maschinenpark;
        });
        return match ? Number(match.satz) : 0;
      };

      // Tenant logo (data URL) for the native calculation PDF.
      const logoBytes = logoBytesFromDataUrl(offSMap.firmenlogo);

      // PDF Setup
      const pdfDoc = await PDFDocument.create();
      const font  = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      let logoImg: any = null;
      if (logoBytes) { try { logoImg = await pdfDoc.embedJpg(logoBytes); } catch {} }

      const W = 595; const H = 842;
      const mL = 50; const mR = 50; const mT = 30;
      const pageW = W - mL - mR;
      const black = rgb(0, 0, 0);
      const grey  = rgb(0.45, 0.45, 0.45);
      // Use colors from pdf_vorlagen if set
      const cssColorToRgb = (value: string, fallback = rgb(0.27, 0.33, 0.42)) => {
        const color = value.trim();
        const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
        if (hex) {
          const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
          return rgb(
            parseInt(normalized.slice(0, 2), 16) / 255,
            parseInt(normalized.slice(2, 4), 16) / 255,
            parseInt(normalized.slice(4, 6), 16) / 255,
          );
        }

        const hsl = color.match(/^hsl\(\s*([+-]?\d*\.?\d+)(?:deg)?[\s,]+([+-]?\d*\.?\d+)%[\s,]+([+-]?\d*\.?\d+)%(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
        if (!hsl) return fallback;
        const hue = ((Number(hsl[1]) % 360) + 360) % 360 / 360;
        const saturation = Math.max(0, Math.min(100, Number(hsl[2]))) / 100;
        const lightness = Math.max(0, Math.min(100, Number(hsl[3]))) / 100;
        const hueToRgb = (p: number, q: number, t: number) => {
          let channel = t;
          if (channel < 0) channel += 1;
          if (channel > 1) channel -= 1;
          if (channel < 1 / 6) return p + (q - p) * 6 * channel;
          if (channel < 1 / 2) return q;
          if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
          return p;
        };
        if (saturation === 0) return rgb(lightness, lightness, lightness);
        const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
        const p = 2 * lightness - q;
        return rgb(hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3));
      };
      const brown = pdfVorlage.header_color
        ? cssColorToRgb(pdfVorlage.header_color)
        : cssColorToRgb(offSMap.farbe_primaer || "", rgb(0.27, 0.33, 0.42));
      const lgrey = rgb(0.92, 0.92, 0.92);
      const orange = pdfVorlage.footer_color ? cssColorToRgb(pdfVorlage.footer_color, rgb(0.91, 0.38, 0.04)) : rgb(0.91, 0.38, 0.04);

      // currentPage state — mutable so checkPageBreak can swap it
      let currentPageCtx: any = null;

      const addPage = () => {
        const pg = pdfDoc.addPage([W, H]);
        const d = (t: string, x: number, y: number, sz: number, bold: boolean, col: any = black) =>
          pg.drawText(String(t), { x, y, size: sz, font: bold ? fontB : font, color: col });
        const ln = (x1: number, y1: number, x2: number, y2: number, t = 0.5, c = grey) =>
          pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c });
        const rect = (x: number, y: number, w: number, h: number, col: any) =>
          pg.drawRectangle({ x, y, width: w, height: h, color: col });

        // Farbiger Header-Balken
        rect(0, H - 42, W, 42, brown);

        // Logo oben links im Header
        if (logoImg) {
          const ld = logoImg.scaleToFit(32, 32);
          pg.drawImage(logoImg, { x: mL, y: H - 38, width: ld.width, height: ld.height });
        }

        // Titel + Datum im Header (weiss)
        const white = rgb(1, 1, 1);
        d(isVK ? "VORKALKULATION" : "NACHKALKULATION / SOLL-IST-VERGLEICH", logoImg ? mL + 40 : mL, H - 20, 12, true, white);
        const datumNow = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
        const datumStr = `Datum: ${datumNow}`;
        const datumW = font.widthOfTextAtSize(datumStr, 8);
        d(datumStr, W - mR - datumW, H - 20, 8, false, white);
        d(`Nr. ${auftrag.nr || ""}  ·  ${auftrag.titel || ""}`, logoImg ? mL + 40 : mL, H - 32, 8.5, false, rgb(0.95, 0.87, 0.75));

        // Auftragsdaten unterhalb Header
        let curY = H - 55;
        d(`${auftrag.kunde || "-"}`.trim().replace(/  +/g, " "), mL, curY, 8.5, true, grey);
        curY -= 10;
        d((firmennameAusSettings(offSMap))+" | "+(offSMap.adresse||"Hefenhoferstrasse 7")+" | "+(offSMap.plz_ort||"8580 Sommeri"), mL, curY, 7.5, false, rgb(0.6, 0.6, 0.6));
        curY -= 4;
        ln(mL, curY, W - mR, curY, 0.5, grey);
        curY -= 10;

        const ctx = { pg, d, ln, rect, curY: () => curY, setY: (ny: number) => { curY = ny; }, decY: (n: number) => { curY -= n; } };
        currentPageCtx = ctx;
        return ctx;
      };

      // checkPageBreak: if y < threshold, flush footer on current page and start new page
      // returns new y (top of new page content area)
      const checkPageBreak = (y: number, threshold = 80): number => {
        if (y > threshold) return y;
        // Footer on current page
        const curPages = pdfDoc.getPages();
        const lastPg = curPages[curPages.length - 1];
        lastPg.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: brown });
        const wh = rgb(1,1,1);
        const firmaFull = (firmennameAusSettings(offSMap))+" · "+(offSMap.adresse||"Hefenhoferstrasse 7")+" · "+(offSMap.plz_ort||"8580 Sommeri");
        lastPg.drawText(firmaFull, { x: mL, y: 7, size: 6.5, font, color: wh });
        const pn = curPages.length;
        const pnStr = `Seite ${pn}`;
        const pnW = font.widthOfTextAtSize(pnStr, 6.5);
        lastPg.drawText(pnStr, { x: W - mR - pnW, y: 7, size: 6.5, font, color: wh });
        // Start new page
        const np = addPage();
        return np.curY();
      };

      if (isVK) {
        // ─── VORKALKULATION PDF ────────────────────────────────────────────────
        const { data: stunden = [] } = await supabase.from("vorkalkulation_stunden").select("*").eq("auftrag_id", id);
        const { data: material = [] } = await supabase.from("vorkalkulation_material").select("*").eq("auftrag_id", id).order("pos");
        const { data: hilfsmaterial = [] } = await supabase.from("vorkalkulation_hilfsmaterial").select("*").eq("auftrag_id", id).order("pos");
        const { data: fremd = [] } = await supabase.from("vorkalkulation_fremdleistungen").select("*").eq("auftrag_id", id);
        const { data: soek = [] } = await supabase.from("vorkalkulation_soek").select("*").eq("auftrag_id", id);
        const { data: cfgRaw } = await supabase.from("vorkalkulation_config").select("*").eq("auftrag_id", id).maybeSingle();
        const cfg = cfgRaw || { risiko_gewinn_prozent: 10, rabatt_prozent: 0, skonto_prozent: 0, mwst_prozent: 8.1 };

        // Totals
        const totalStunden = (stunden as any[]).reduce((s, r) => s + Number(r.soll_stunden) * Number(r.stundensatz), 0);
        const totalMaterial = (material as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const totalHilfsmat = (hilfsmaterial as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const totalFremd = (fremd as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const totalSoek = (soek as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const subtotal = totalStunden + totalMaterial + totalHilfsmat + totalFremd + totalSoek;
        // Einzige Berechnungsfunktion fuer die Vorkalkulations-Summe (Bug 2, final
        // konsolidiert) — siehe shared/schema.ts. Vorher wurde hier der Rabatt
        // faelschlicherweise ABGEZOGEN statt aufgeschlagen, und Skonto fehlte
        // komplett — identischer Bug wie in den bereits entfernten Frontend-Stellen.
        const vk = berechneVorkalkulationsAngebotspreis({
          selbstkosten: subtotal,
          risiko_gewinn_prozent: Number(cfg.risiko_gewinn_prozent),
          rabatt_prozent: Number(cfg.rabatt_prozent),
          skonto_prozent: Number((cfg as any).skonto_prozent) || 0,
          mwst_prozent: Number(cfg.mwst_prozent),
        });
        const risikoAmt = vk.risikoGewinnBetrag;
        const rabattAmt = vk.rabattBetrag;
        const skontoAmt = vk.skontoBetrag;
        const netto = vk.nettoAngebotspreis;
        const mwstAmt = vk.mwstBetrag;
        const brutto = vk.bruttoAngebotspreis;

        const fmt = (n: number) => `CHF ${n.toFixed(2)}`;

        const p1 = addPage();
        let y = p1.curY();

        // Section: Stunden
        p1.rect(mL, y - 2, pageW, 14, lgrey);
        p1.d("A – Stunden (Soll)", mL + 4, y, 9, true, brown);
        y -= 14;
        const cOrt = mL + 4; const cMasch = mL + 130; const cStd = mL + 280; const cSatz = mL + 340; const cTotal = W - mR;
        p1.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        p1.d("Ort", cOrt, y, 7.5, true, grey);
        p1.d("Maschinenpark", cMasch, y, 7.5, true, grey);
        p1.d("Std.", cStd, y, 7.5, true, grey);
        p1.d("Satz", cSatz, y, 7.5, true, grey);
        p1.d("Total CHF", cTotal - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; p1.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;
        p1.setY(y);

        for (const r of (stunden as any[])) {
          y = checkPageBreak(y);
          const total = Number(r.soll_stunden) * Number(r.stundensatz);
          const totalStr = fmt(total);
          const sw = font.widthOfTextAtSize(totalStr, 8.5);
          currentPageCtx!.d(r.ort, cOrt, y, 8.5, false);
          currentPageCtx!.d(r.maschinenpark || "-", cMasch, y, 8.5, false);
          currentPageCtx!.d(String(r.soll_stunden), cStd, y, 8.5, false);
          currentPageCtx!.d(fmt(Number(r.stundensatz)), cSatz, y, 8.5, false);
          currentPageCtx!.d(totalStr, cTotal - sw, y, 8.5, false);
          y -= 13;
        }
        const stdStr = fmt(totalStunden);
        const stdSW = fontB.widthOfTextAtSize(stdStr, 9);
        currentPageCtx!.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        currentPageCtx!.d("Total Stunden:", W - mR - 120, y, 8.5, false, grey);
        currentPageCtx!.d(stdStr, cTotal - stdSW, y, 9, true);
        y -= 20;

        // Section: Material
        y = checkPageBreak(y, 120);
        currentPageCtx!.rect(mL, y - 2, pageW, 14, lgrey);
        currentPageCtx!.d("B – Material / Stückliste", mL + 4, y, 9, true, brown);
        y -= 14;
        const cPos = mL + 4; const cProfil = mL + 35; const cBem = mL + 140; const cStk = mL + 275; const cPreis = mL + 320; const cMtotal = W - mR;
        currentPageCtx!.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        currentPageCtx!.d("Pos", cPos, y, 7.5, true, grey);
        currentPageCtx!.d("Profil", cProfil, y, 7.5, true, grey);
        currentPageCtx!.d("Bemerkung", cBem, y, 7.5, true, grey);
        currentPageCtx!.d("Stk.", cStk, y, 7.5, true, grey);
        currentPageCtx!.d("Preis", cPreis, y, 7.5, true, grey);
        currentPageCtx!.d("Total CHF", cMtotal - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; currentPageCtx!.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;

        for (const r of (material as any[])) {
          y = checkPageBreak(y);
          const tStr = fmt(Number(r.total_chf));
          const tsw = font.widthOfTextAtSize(tStr, 8.5);
          currentPageCtx!.d(String(r.pos), cPos, y, 8.5, false);
          currentPageCtx!.d((r.profil || "").slice(0, 18), cProfil, y, 8.5, false);
          currentPageCtx!.d((r.bemerkung || "").slice(0, 22), cBem, y, 8.5, false);
          currentPageCtx!.d(String(r.stueck || 1), cStk, y, 8.5, false);
          currentPageCtx!.d(fmt(Number(r.preis_pro_einheit)), cPreis, y, 8.5, false);
          currentPageCtx!.d(tStr, cMtotal - tsw, y, 8.5, false);
          y -= 13;
        }
        const matStr = fmt(totalMaterial);
        const matSW = fontB.widthOfTextAtSize(matStr, 9);
        currentPageCtx!.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        currentPageCtx!.d("Total Material:", W - mR - 120, y, 8.5, false, grey);
        currentPageCtx!.d(matStr, cMtotal - matSW, y, 9, true);
        y -= 20;

        // Section: Hilfsmaterial
        if ((hilfsmaterial as any[]).length > 0) {
          y = checkPageBreak(y, 120);
          currentPageCtx!.rect(mL, y - 2, pageW, 14, lgrey);
          currentPageCtx!.d("B2 – Hilfsmaterial", mL + 4, y, 9, true, brown);
          y -= 14;
          const cHKat = mL + 4; const cHBez = mL + 100; const cHLief = mL + 250; const cHMng = mL + 360; const cHPre = mL + 400; const cHTot = W - mR;
          currentPageCtx!.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
          currentPageCtx!.d("Kategorie", cHKat, y, 7.5, true, grey);
          currentPageCtx!.d("Bezeichnung", cHBez, y, 7.5, true, grey);
          currentPageCtx!.d("Lieferant", cHLief, y, 7.5, true, grey);
          currentPageCtx!.d("Menge", cHMng, y, 7.5, true, grey);
          currentPageCtx!.d("Fr./Einh.", cHPre, y, 7.5, true, grey);
          currentPageCtx!.d("Total CHF", cHTot - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
          y -= 4; currentPageCtx!.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;
          for (const r of (hilfsmaterial as any[])) {
            y = checkPageBreak(y);
            const tStr = fmt(Number(r.total_chf));
            const tsw = font.widthOfTextAtSize(tStr, 8.5);
            currentPageCtx!.d((r.kategorie || "").slice(0, 15), cHKat, y, 8.5, false);
            currentPageCtx!.d((r.bezeichnung || "").slice(0, 22), cHBez, y, 8.5, false);
            currentPageCtx!.d((r.lieferant || "").slice(0, 18), cHLief, y, 8.5, false);
            currentPageCtx!.d(`${r.stueck || 1} ${r.einheit || "Stk"}`, cHMng, y, 8.5, false);
            currentPageCtx!.d(fmt(Number(r.preis_pro_einheit)), cHPre, y, 8.5, false);
            currentPageCtx!.d(tStr, cHTot - tsw, y, 8.5, false);
            y -= 13;
          }
          const hilfsStr = fmt(totalHilfsmat);
          const hilfsSW = fontB.widthOfTextAtSize(hilfsStr, 9);
          currentPageCtx!.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
          currentPageCtx!.d("Total Hilfsmaterial:", W - mR - 130, y, 8.5, false, grey);
          currentPageCtx!.d(hilfsStr, cHTot - hilfsSW, y, 9, true);
          y -= 20;
        }

        // Section: Fremdleistungen
        y = checkPageBreak(y, 120);
        currentPageCtx!.rect(mL, y - 2, pageW, 14, lgrey);
        currentPageCtx!.d("C – Fremdleistungen", mL + 4, y, 9, true, brown);
        y -= 14;
        const cFBez = mL + 4; const cFAnz = mL + 230; const cFEin = mL + 275; const cFPre = mL + 340; const cFTot = W - mR;
        currentPageCtx!.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        currentPageCtx!.d("Bezeichnung", cFBez, y, 7.5, true, grey);
        currentPageCtx!.d("Anz.", cFAnz, y, 7.5, true, grey);
        currentPageCtx!.d("Einheit", cFEin, y, 7.5, true, grey);
        currentPageCtx!.d("Preis", cFPre, y, 7.5, true, grey);
        currentPageCtx!.d("Total CHF", cFTot - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; currentPageCtx!.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;

        for (const r of (fremd as any[])) {
          y = checkPageBreak(y);
          const tStr = fmt(Number(r.total_chf));
          const tsw = font.widthOfTextAtSize(tStr, 8.5);
          currentPageCtx!.d((r.bezeichnung || "").slice(0, 35), cFBez, y, 8.5, false);
          currentPageCtx!.d(String(r.anzahl), cFAnz, y, 8.5, false);
          currentPageCtx!.d(r.einheit || "", cFEin, y, 8.5, false);
          currentPageCtx!.d(fmt(Number(r.preis_pro_einheit)), cFPre, y, 8.5, false);
          currentPageCtx!.d(tStr, cFTot - tsw, y, 8.5, false);
          y -= 13;
        }
        const fremdStr = fmt(totalFremd);
        const fremdSW = fontB.widthOfTextAtSize(fremdStr, 9);
        currentPageCtx!.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        currentPageCtx!.d("Total Fremdleistungen:", W - mR - 140, y, 8.5, false, grey);
        currentPageCtx!.d(fremdStr, cFTot - fremdSW, y, 9, true);
        y -= 20;

        // Section: SOEK
        y = checkPageBreak(y, 120);
        currentPageCtx!.rect(mL, y - 2, pageW, 14, lgrey);
        currentPageCtx!.d("D – Sondereinzelkosten / Spesen (SOEK)", mL + 4, y, 9, true, brown);
        y -= 14;
        const cSBez = mL + 4; const cSAnz = mL + 230; const cSEin = mL + 275; const cSPre = mL + 340; const cSTot = W - mR;
        currentPageCtx!.rect(mL, y - 2, pageW, 12, rgb(0.97, 0.97, 0.97));
        currentPageCtx!.d("Bezeichnung", cSBez, y, 7.5, true, grey);
        currentPageCtx!.d("Anz.", cSAnz, y, 7.5, true, grey);
        currentPageCtx!.d("Einheit", cSEin, y, 7.5, true, grey);
        currentPageCtx!.d("Preis", cSPre, y, 7.5, true, grey);
        currentPageCtx!.d("Total CHF", cSTot - font.widthOfTextAtSize("Total CHF", 7.5), y, 7.5, true, grey);
        y -= 4; currentPageCtx!.ln(mL, y, W - mR, y, 0.4, grey); y -= 6;

        for (const r of (soek as any[])) {
          y = checkPageBreak(y);
          const tStr = fmt(Number(r.total_chf));
          const tsw = font.widthOfTextAtSize(tStr, 8.5);
          currentPageCtx!.d((r.bezeichnung || "").slice(0, 35), cSBez, y, 8.5, false);
          currentPageCtx!.d(String(r.anzahl), cSAnz, y, 8.5, false);
          currentPageCtx!.d(r.einheit || "", cSEin, y, 8.5, false);
          currentPageCtx!.d(fmt(Number(r.preis_pro_einheit)), cSPre, y, 8.5, false);
          currentPageCtx!.d(tStr, cSTot - tsw, y, 8.5, false);
          y -= 13;
        }
        const soekStr = fmt(totalSoek);
        const soekSW = fontB.widthOfTextAtSize(soekStr, 9);
        currentPageCtx!.ln(W - mR - 120, y + 8, W - mR, y + 8, 0.5, grey);
        currentPageCtx!.d("Total SOEK:", W - mR - 120, y, 8.5, false, grey);
        currentPageCtx!.d(soekStr, cSTot - soekSW, y, 9, true);
        y -= 25;

        // Zusammenfassung — auf neuer Seite wenn kein Platz
        y = checkPageBreak(y, 200);
        currentPageCtx!.ln(mL, y, W - mR, y, 1.0, brown); y -= 14;
        currentPageCtx!.d("Zusammenfassung Vorkalkulation", mL, y, 10, true, brown); y -= 18;

        const summaryRow = (lbl: string, val: string, bold: boolean) => {
          currentPageCtx!.d(lbl, W - mR - 230, y, 9, false, grey);
          const vw = (bold ? fontB : font).widthOfTextAtSize(val, 9);
          currentPageCtx!.d(val, W - mR - vw, y, 9, bold);
          y -= 13;
        };

        summaryRow("Stunden:", fmt(totalStunden), false);
        summaryRow("Material:", fmt(totalMaterial), false);
        if (totalHilfsmat > 0) summaryRow("Hilfsmaterial:", fmt(totalHilfsmat), false);
        summaryRow("Fremdleistungen:", fmt(totalFremd), false);
        summaryRow("SOEK:", fmt(totalSoek), false);
        currentPageCtx!.ln(W - mR - 230, y + 8, W - mR, y + 8, 0.5, grey); y -= 5;
        summaryRow("Subtotal:", fmt(subtotal), true);
        summaryRow(`Risiko / Gewinn (${cfg.risiko_gewinn_prozent}%):`, `+${fmt(risikoAmt)}`, false);
        if (Number(cfg.rabatt_prozent) > 0) {
          summaryRow(`Rabatt (${cfg.rabatt_prozent}%):`, `+${fmt(rabattAmt)}`, false);
        }
        if (Number((cfg as any).skonto_prozent) > 0) {
          summaryRow(`Skonto (${(cfg as any).skonto_prozent}%):`, `+${fmt(skontoAmt)}`, false);
        }
        currentPageCtx!.ln(W - mR - 230, y + 8, W - mR, y + 8, 0.5, grey); y -= 5;
        summaryRow("Netto:", fmt(netto), false);
        summaryRow(`MWST (${cfg.mwst_prozent}%):`, fmt(mwstAmt), false);
        currentPageCtx!.ln(W - mR - 230, y + 8, W - mR, y + 8, 1.0, brown); y -= 5;

        // Brutto highlight
        currentPageCtx!.rect(W - mR - 230, y - 6, 230, 20, rgb(0.95, 0.90, 0.85));
        const bruttoStr = fmt(brutto);
        const bruttoSW = fontB.widthOfTextAtSize(bruttoStr, 11);
        currentPageCtx!.d("Offertpreis (brutto):", W - mR - 228, y, 9.5, true, brown);
        currentPageCtx!.d(bruttoStr, W - mR - bruttoSW, y, 11, true, orange);
        y -= 25;

        if (cfg.notiz) {
          currentPageCtx!.d("Notiz:", mL, y, 8.5, true, grey); y -= 12;
          currentPageCtx!.d(cfg.notiz.slice(0, 120), mL, y, 8.5, false, grey);
        }

        // Footer — farbiger Balken auf allen Seiten
        const white2 = rgb(1, 1, 1);
        for (const pg2 of pdfDoc.getPages()) {
          pg2.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: brown });
          const firmaFull = (firmennameAusSettings(offSMap))+" · "+(offSMap.adresse||"Hefenhoferstrasse 7")+" · "+(offSMap.plz_ort||"8580 Sommeri")+" · "+(offSMap.telefon||"071 411 16 87");
          pg2.drawText(firmaFull, { x: mL, y: 7, size: 6.5, font, color: white2 });
          const totalPages = pdfDoc.getPageCount();
          const pgIdx = pdfDoc.getPages().indexOf(pg2) + 1;
          const erstelltStr = `Seite ${pgIdx}/${totalPages} | Erstellt: ${new Date().toLocaleDateString("de-CH")}`;
          const erstelltW = font.widthOfTextAtSize(erstelltStr, 6.5);
          pg2.drawText(erstelltStr, { x: W - mR - erstelltW, y: 7, size: 6.5, font, color: white2 });
        }

      } else {
        // ─── NACHKALKULATION PDF (Soll-Ist-Vergleich) ─────────────────────────

        // Load VK data (Soll)
        const { data: vkStunden = [] } = await supabase.from("vorkalkulation_stunden").select("*").eq("auftrag_id", id);
        const { data: vkMaterial = [] } = await supabase.from("vorkalkulation_material").select("*").eq("auftrag_id", id);
        const { data: vkFremd = [] } = await supabase.from("vorkalkulation_fremdleistungen").select("*").eq("auftrag_id", id);
        const { data: vkSoek = [] } = await supabase.from("vorkalkulation_soek").select("*").eq("auftrag_id", id);
        const { data: cfgRaw2 } = await supabase.from("vorkalkulation_config").select("*").eq("auftrag_id", id).maybeSingle();
        const cfg2 = cfgRaw2 || { risiko_gewinn_prozent: 10, rabatt_prozent: 0, skonto_prozent: 0, mwst_prozent: 8.1 };

        // Load NAKA data (Ist)
        const { data: zeiteintraege = [] } = await supabase.from("zeiteintraege").select("*").eq("auftrag_id", id);
        const { data: nakaMaterial = [] } = await supabase.from("nachkalkulation_material").select("*").eq("auftrag_id", id);
        const { data: nakaFremd = [] } = await supabase.from("nachkalkulation_fremdleistungen").select("*").eq("auftrag_id", id);
        const { data: nakaSoek = [] } = await supabase.from("nachkalkulation_soek").select("*").eq("auftrag_id", id);

        const fmt = (n: number) => `CHF ${n.toFixed(2)}`;
        const fmtH = (min: number) => `${(min / 60).toFixed(2)} h`;

        // VK Totals
        const vkStundenCHF = (vkStunden as any[]).reduce((s, r) => s + Number(r.soll_stunden) * Number(r.stundensatz), 0);
        const vkMaterialCHF = (vkMaterial as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const vkFremdCHF = (vkFremd as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const vkSoekCHF = (vkSoek as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const vkSubtotal = vkStundenCHF + vkMaterialCHF + vkFremdCHF + vkSoekCHF;
        // Einzige Berechnungsfunktion fuer die Vorkalkulations-Summe (Bug 2, final
        // konsolidiert) — siehe shared/schema.ts. Vorher wurde hier der Rabatt
        // faelschlicherweise ABGEZOGEN statt aufgeschlagen, und Skonto fehlte
        // komplett.
        const vkCalc = berechneVorkalkulationsAngebotspreis({
          selbstkosten: vkSubtotal,
          risiko_gewinn_prozent: Number(cfg2.risiko_gewinn_prozent),
          rabatt_prozent: Number(cfg2.rabatt_prozent),
          skonto_prozent: Number((cfg2 as any).skonto_prozent) || 0,
          mwst_prozent: Number(cfg2.mwst_prozent),
        });
        const vkRisiko = vkCalc.risikoGewinnBetrag;
        const vkNorR = vkCalc.nettoOhneRabatt;
        const vkRabatt = vkCalc.rabattBetrag;
        const vkNetto = vkCalc.nettoAngebotspreis;
        const vkMwst = vkCalc.mwstBetrag;
        const vkBrutto = vkCalc.bruttoAngebotspreis;

        // IST Totals
        // Group zeiteintraege by ort/maschinenpark
        const ortMap: Record<string, { minuten: number; satz: number }> = {};
        for (const z of (zeiteintraege as any[])) {
          const ort = z.ort || "Unbekannt";
          const masch = z.maschinenpark || null;
          const key = masch ? `${ort}::${masch}` : ort;
          const satz = getOrtSatz(ort, masch);
          if (!ortMap[key]) ortMap[key] = { minuten: 0, satz };
          ortMap[key].minuten += Number(z.dauer_minuten) || 0;
        }
        const istStundenCHF = Object.values(ortMap).reduce((s, v) => s + (v.minuten / 60) * v.satz, 0);
        const istTotalMinuten = (zeiteintraege as any[]).reduce((s, z) => s + (Number(z.dauer_minuten) || 0), 0);
        const istMaterialCHF = (nakaMaterial as any[]).reduce((s, r) => s + Number(r.betrag_chf), 0);
        const istFremdCHF = (nakaFremd as any[]).reduce((s, r) => s + Number(r.betrag_chf), 0);
        const istSoekCHF = (nakaSoek as any[]).reduce((s, r) => s + Number(r.total_chf), 0);
        const istSubtotal = istStundenCHF + istMaterialCHF + istFremdCHF + istSoekCHF;

        const p1 = addPage();
        let y = p1.curY();

        // Soll-Ist Vergleich — Spalten neu verteilt (keine Überlappung)
        // cLbl=54, cSoll=220, cSollR=330, cIst=360, cIstR=470, cAbw=495
        const cLbl = mL + 4;    // 54  — Positionsspalte (Label)
        const cSoll = mL + 170; // 220 — Soll-Spalte Start
        const cSollR = mL + 280; // 330 — Soll rechtsbundig-Anker
        const cIst = mL + 300;  // 350 — Ist-Spalte Start
        const cIstR = mL + 410; // 460 — Ist rechtsbundig-Anker
        const cAbwR = W - mR;   // 545 — Abweichung rechtsbundig-Anker

        currentPageCtx!.rect(mL, y - 2, pageW, 16, lgrey);
        currentPageCtx!.d("Position", cLbl, y, 8, true, grey);
        currentPageCtx!.d("Soll (VK)", cSoll, y, 8, true, grey);
        currentPageCtx!.d("Ist (NAKA)", cIst, y, 8, true, grey);
        const abwHdrW = fontB.widthOfTextAtSize("Abweichung", 8);
        currentPageCtx!.d("Abweichung", cAbwR - abwHdrW, y, 8, true, grey);
        y -= 18; currentPageCtx!.ln(mL, y, W - mR, y, 0.4, grey); y -= 4;

        const siRow = (lbl: string, soll: number, ist: number, isCHF: boolean, bold: boolean) => {
          y = checkPageBreak(y);
          const abw = ist - soll;
          const sollStr = isCHF ? fmt(soll) : fmtH(soll * 60);
          const istStr = isCHF ? fmt(ist) : fmtH(ist * 60);
          const abwStr = (abw >= 0 ? "+" : "") + (isCHF ? fmt(abw) : fmtH(abw * 60));
          const col = abw > 0 ? rgb(0.75, 0.10, 0.10) : abw < 0 ? rgb(0.10, 0.55, 0.10) : black;
          const f = bold ? fontB : font;
          currentPageCtx!.d(lbl, cLbl, y, 9, bold);
          const sw1 = f.widthOfTextAtSize(sollStr, 9);
          const sw2 = f.widthOfTextAtSize(istStr, 9);
          const sw3 = font.widthOfTextAtSize(abwStr, 9);
          currentPageCtx!.d(sollStr, cSollR - sw1, y, 9, bold);
          currentPageCtx!.d(istStr, cIstR - sw2, y, 9, bold);
          currentPageCtx!.d(abwStr, cAbwR - sw3, y, 9, false, col);
          y -= 14;
        };

        // VK Soll-Stunden as hours
        const vkSollStunden = (vkStunden as any[]).reduce((s, r) => s + Number(r.soll_stunden), 0);
        const istStunden = istTotalMinuten / 60;
        siRow("Stunden (CHF)", vkStundenCHF, istStundenCHF, true, false);
        siRow("Stunden (h)", vkSollStunden, istStunden, false, false);
        y -= 4; currentPageCtx!.ln(mL, y + 8, W - mR, y + 8, 0.3, lgrey); y -= 4;
        siRow("Material (CHF)", vkMaterialCHF, istMaterialCHF, true, false);
        siRow("Fremdleistungen (CHF)", vkFremdCHF, istFremdCHF, true, false);
        siRow("SOEK (CHF)", vkSoekCHF, istSoekCHF, true, false);
        y -= 4; currentPageCtx!.ln(mL, y + 8, W - mR, y + 8, 0.6, grey); y -= 4;
        siRow("Subtotal", vkSubtotal, istSubtotal, true, true);
        y -= 6;

        // Stundendetail nach Ort
        y = checkPageBreak(y, 100);
        currentPageCtx!.ln(mL, y + 8, W - mR, y + 8, 0.3, lgrey); y -= 4;
        currentPageCtx!.d("Stundendetail nach Ort", mL + 4, y, 8.5, true, brown); y -= 14;
        for (const [key, val] of Object.entries(ortMap)) {
          y = checkPageBreak(y);
          const ortLabel = key.replace("::", " · ");
          const std = val.minuten / 60;
          currentPageCtx!.d(`Ist – ${ortLabel}:`, cLbl, y, 8.5, false, grey);
          const ortDetail = `${std.toFixed(2)} h × CHF ${val.satz.toFixed(2)} = ${fmt(std * val.satz)}`;
          currentPageCtx!.d(ortDetail, cSoll, y, 8.5, false);
          y -= 12;
        }
        y -= 10;

        // VK-Offertpreis Referenz
        y = checkPageBreak(y, 80);
        currentPageCtx!.d("VK-Offertpreis Referenz:", mL + 4, y, 8.5, true, brown); y -= 14;
        currentPageCtx!.d("Offertpreis (brutto):", W - mR - 230, y, 8.5, false, grey);
        const bruttoStr = fmt(vkBrutto);
        const bsw = fontB.widthOfTextAtSize(bruttoStr, 9);
        currentPageCtx!.d(bruttoStr, W - mR - bsw, y, 9, true, orange);
        y -= 14;

        const diffStr = (istSubtotal - vkSubtotal >= 0 ? "+" : "") + fmt(istSubtotal - vkSubtotal);
        const diffCol = istSubtotal > vkSubtotal ? rgb(0.75, 0.10, 0.10) : rgb(0.10, 0.55, 0.10);
        currentPageCtx!.d("Kosten-Abweichung (Ist–Soll):", W - mR - 230, y, 8.5, false, grey);
        const dsw = fontB.widthOfTextAtSize(diffStr, 9);
        currentPageCtx!.d(diffStr, W - mR - dsw, y, 9, true, diffCol);
        y -= 20;

        if ((nakaMaterial as any[]).length > 0) {
          y = checkPageBreak(y, 100);
          currentPageCtx!.ln(mL, y + 4, W - mR, y + 4, 0.3, lgrey); y -= 8;
          currentPageCtx!.d("Ist-Material (erfasst)", mL + 4, y, 8.5, true, brown); y -= 14;
          for (const r of (nakaMaterial as any[])) {
            y = checkPageBreak(y);
            currentPageCtx!.d(`${(r.bezeichnung || "").slice(0, 35)} – ${r.lieferant || "-"}`, cLbl, y, 8.5, false);
            const ms = font.widthOfTextAtSize(fmt(Number(r.betrag_chf)), 8.5);
            currentPageCtx!.d(fmt(Number(r.betrag_chf)), W - mR - ms, y, 8.5, false);
            y -= 12;
          }
        }

        if ((nakaFremd as any[]).length > 0) {
          y = checkPageBreak(y, 100);
          currentPageCtx!.ln(mL, y + 4, W - mR, y + 4, 0.3, lgrey); y -= 8;
          currentPageCtx!.d("Ist-Fremdleistungen (erfasst)", mL + 4, y, 8.5, true, brown); y -= 14;
          for (const r of (nakaFremd as any[])) {
            y = checkPageBreak(y);
            currentPageCtx!.d(`${(r.bezeichnung || "").slice(0, 35)} – ${r.lieferant || "-"}`, cLbl, y, 8.5, false);
            const fs2 = font.widthOfTextAtSize(fmt(Number(r.betrag_chf)), 8.5);
            currentPageCtx!.d(fmt(Number(r.betrag_chf)), W - mR - fs2, y, 8.5, false);
            y -= 12;
          }
        }

        // Footer auf allen Seiten
        const allPages = pdfDoc.getPages();
        const totalPages = allPages.length;
        for (let pi = 0; pi < allPages.length; pi++) {
          const pg2 = allPages[pi];
          pg2.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: brown });
          const wh2 = rgb(1, 1, 1);
          const firmaFull2 = (firmennameAusSettings(offSMap))+" · "+(offSMap.adresse||"Hefenhoferstrasse 7")+" · "+(offSMap.plz_ort||"8580 Sommeri");
          pg2.drawText(firmaFull2, { x: mL, y: 7, size: 6.5, font, color: wh2 });
          const pgStr = `Seite ${pi + 1}/${totalPages} | Erstellt: ${new Date().toLocaleDateString("de-CH")}`;
          const pgW = font.widthOfTextAtSize(pgStr, 6.5);
          pg2.drawText(pgStr, { x: W - mR - pgW, y: 7, size: 6.5, font, color: wh2 });
        }
      }

      const bytes = await pdfDoc.save();
      const filename = isVK
        ? `Vorkalkulation-${auftrag.nr}.pdf`
        : `Nachkalkulation-${auftrag.nr}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.end(Buffer.from(bytes));
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── Ferien ───────────────────────────────────────────────────────────────────
  app.get("/api/ferien", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("ferien")
        .select("*")
        .order("von", { ascending: false });
      if (error) throw error;
      // Mitarbeiter-Namen separat laden
      const { data: mitarbeiter } = await supabase.from("mitarbeiter").select("id, vorname, nachname");
      const result = (data || []).map((f: any) => {
        const ma = (mitarbeiter || []).find((m: any) => m.id === f.mitarbeiter_id);
        return { ...f, mitarbeiter_name: ma ? `${ma.vorname} ${ma.nachname}`.trim() : f.mitarbeiter_id };
      });
      res.json(result);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/ferien", async (req, res) => {
    try {
      const { mitarbeiter_id, von, bis, typ, notiz } = req.body;
      const eintrag = {
        id: uid(),
        mitarbeiter_id,
        von,
        bis,
        typ: typ || "ferien",
        notiz: notiz || "",
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("ferien").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/ferien/:id", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("ferien").update(req.body).eq("id", req.params.id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/ferien/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("ferien").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Lieferanten ─────────────────────────────────────────────────────────
  // Whitelist: welche Felder darf der Client fuer einen Lieferanten setzen?
  // Alles andere (id, tenant_id, erstellt) wird serverseitig gesetzt bzw. verworfen.
  function pickLieferantFelder(input: any): Record<string, any> {
    return {
      firma: typeof input?.firma === "string" ? input.firma : null,
      kontaktperson: typeof input?.kontaktperson === "string" ? input.kontaktperson : null,
      email: typeof input?.email === "string" ? input.email : null,
      telefon: typeof input?.telefon === "string" ? input.telefon : null,
      adresse: typeof input?.adresse === "string" ? input.adresse : null,
      plz: typeof input?.plz === "string" ? input.plz : null,
      ort: typeof input?.ort === "string" ? input.ort : null,
      konditionen: typeof input?.konditionen === "string" ? input.konditionen : null,
      notiz: typeof input?.notiz === "string" ? input.notiz : null,
    };
  }

  app.get("/api/lieferanten", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("lieferanten").select("*")
        .eq("tenant_id", identity.tenantId)
        .order("firma", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/lieferanten", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const eintrag = {
        id: uid(),
        ...pickLieferantFelder(req.body),
        tenant_id: identity.tenantId,
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await identity.client.from("lieferanten").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/lieferanten/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      // Existenz- + Tenant-Check
      const { data: existing, error: exErr } = await identity.client
        .from("lieferanten").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ message: "Lieferant nicht gefunden." });
      const { data, error } = await identity.client
        .from("lieferanten").update(pickLieferantFelder(req.body))
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId)
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/lieferanten/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("lieferanten").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ message: "Lieferant nicht gefunden." });
      const { error } = await identity.client
        .from("lieferanten").delete().eq("id", req.params.id).eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Materialbestellungen ──────────────────────────────────────────────────
  function pickMaterialbestellungFelder(input: any): Record<string, any> {
    return {
      lieferant_id: typeof input?.lieferant_id === "string" ? input.lieferant_id : null,
      auftrag_id: typeof input?.auftrag_id === "string" ? input.auftrag_id : null,
      artikel: typeof input?.artikel === "string" ? input.artikel : null,
      menge: pickFiniteNumber(input?.menge),
      einheit: typeof input?.einheit === "string" ? input.einheit : null,
      preis: pickFiniteNumber(input?.preis),
      status: typeof input?.status === "string" ? input.status : "offen",
      bestellt_am: typeof input?.bestellt_am === "string" ? input.bestellt_am : null,
      geliefert_am: typeof input?.geliefert_am === "string" ? input.geliefert_am : null,
      notiz: typeof input?.notiz === "string" ? input.notiz : null,
    };
  }

  // Prueft, dass eine (optionale) auftrag_id zum eingeloggten Mandanten gehoert.
  async function auftragGehoertZuTenant(identity: DashboardPreferenceIdentity, auftragId: string | null | undefined): Promise<boolean> {
    if (!auftragId) return true; // erlaubt: Bestellung/Termin ohne Auftragszuordnung
    const { data, error } = await identity.client
      .from("auftraege").select("id").eq("id", auftragId).eq("tenant_id", identity.tenantId).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  // Prueft, dass eine (optionale) lieferant_id zum eingeloggten Mandanten gehoert.
  async function lieferantGehoertZuTenant(identity: DashboardPreferenceIdentity, lieferantId: string | null | undefined): Promise<boolean> {
    if (!lieferantId) return true;
    const { data, error } = await identity.client
      .from("lieferanten").select("id").eq("id", lieferantId).eq("tenant_id", identity.tenantId).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  // Prueft, dass eine (optionale) mitarbeiter_id zum eingeloggten Mandanten gehoert.
  async function mitarbeiterGehoertZuTenant(identity: DashboardPreferenceIdentity, mitarbeiterId: string | null | undefined): Promise<boolean> {
    if (!mitarbeiterId) return true;
    const { data, error } = await identity.client
      .from("mitarbeiter").select("id").eq("id", mitarbeiterId).eq("tenant_id", identity.tenantId).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  app.get("/api/materialbestellungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      let query = identity.client
        .from("materialbestellungen").select("*")
        .eq("tenant_id", identity.tenantId)
        .order("erstellt", { ascending: false });
      if (req.query.auftrag_id) query = query.eq("auftrag_id", String(req.query.auftrag_id));
      const { data, error } = await query;
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/materialbestellungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const felder = pickMaterialbestellungFelder(req.body);
      if (!(await auftragGehoertZuTenant(identity, felder.auftrag_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      if (!(await lieferantGehoertZuTenant(identity, felder.lieferant_id))) {
        return res.status(404).json({ message: "Lieferant nicht gefunden." });
      }
      const eintrag = {
        id: uid(),
        ...felder,
        tenant_id: identity.tenantId,
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await identity.client.from("materialbestellungen").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/materialbestellungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("materialbestellungen").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ message: "Bestellung nicht gefunden." });
      const felder = pickMaterialbestellungFelder(req.body);
      if (!(await auftragGehoertZuTenant(identity, felder.auftrag_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      if (!(await lieferantGehoertZuTenant(identity, felder.lieferant_id))) {
        return res.status(404).json({ message: "Lieferant nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("materialbestellungen").update(felder)
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId)
        .select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/materialbestellungen/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("materialbestellungen").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ message: "Bestellung nicht gefunden." });
      const { error } = await identity.client
        .from("materialbestellungen").delete().eq("id", req.params.id).eq("tenant_id", identity.tenantId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Auftrag-Kommentare ───────────────────────────────────────────────────────
  app.get("/api/auftraege/:id/kommentare", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("auftrag_kommentare")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("erstellt", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:id/kommentare", async (req, res) => {
    try {
      const { autor, text } = req.body || {};
      if (!text || !String(text).trim()) return res.status(400).json({ message: "text required" });
      const eintrag = {
        id: uid(),
        auftrag_id: req.params.id,
        autor: autor || "Unbekannt",
        text,
        erstellt: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("auftrag_kommentare").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/kommentare/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("auftrag_kommentare").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ═══ KALKULATION V6 ════════════════════════════════════════════════════════

  // VK Hilfsmaterial
  app.get("/api/kalkulation/:auftragsId/hilfsmaterial", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hilfsmaterial").select("*").eq("auftrag_id", auftragsId).order("pos");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/hilfsmaterial", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hilfsmaterial").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/hilfsmaterial/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hilfsmaterial").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/hilfsmaterial/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("vorkalkulation_hilfsmaterial").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // VK Hauptmaterial Flächenbezogen
  app.get("/api/kalkulation/:auftragsId/hauptmaterial-flaeche", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").select("*").eq("auftrag_id", auftragsId).order("pos");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/hauptmaterial-flaeche", async (req, res) => {
    const { auftragsId } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").insert({ ...req.body, auftrag_id: auftragsId }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/hauptmaterial-flaeche/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").update(req.body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.delete("/api/kalkulation/hauptmaterial-flaeche/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from("vorkalkulation_hauptmaterial_flaeche").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK Stunden (IST) + Sync aus Zeiterfassung
  app.get("/api/kalkulation/:auftragsId/nk-stunden", async (req, res) => {
    const { auftragsId } = req.params;
    try {
      // Lade Stundensätze
      const { data: saetze = [] } = await supabase.from("stundensaetze").select("*");

      // 1. Live Zeiterfassung-Einträge aus zeiteintraege
      const { data: zeitData = [], error: zeitError } = await supabase
        .from("zeiteintraege").select("*").eq("auftrag_id", auftragsId).order("datum");
      if (zeitError) return res.status(500).json({ error: zeitError.message });

      const bereichMap: Record<string, string> = { "Avor": "Planung/AVOR", "Werkstatt": "Werkstatt", "Montage": "Montage" };
      const zeitRows = (zeitData as any[]).map((ze: any) => {
        const ortZe = ze.ort || "Montage";
        const satz = stundensatzFuer(saetze as any[], ze.ort, ze.maschinenpark);
        const stunden = (ze.dauer_minuten || 0) / 60;
        const bereich = ze.bereich || bereichMap[ortZe] || ortZe;
        return {
          id: ze.id,
          auftrag_id: ze.auftrag_id,
          bereich,
          unterkategorie: ze.beschreibung || "",
          mitarbeiter_name: ze.mitarbeiter || "",
          datum: ze.datum,
          ist_stunden: stunden,
          stundensatz: satz,
          total_chf: stunden * satz,
          quelle: "zeiterfassung",
          zeiterfassung_id: ze.id,
          bemerkung: ze.beschreibung || "",
          ort: ze.ort,
          maschinenpark: ze.maschinenpark,
        };
      });

      // 2. Manuelle NK-Stunden
      const { data: manuelleData = [], error: manError } = await supabase
        .from("nachkalkulation_stunden").select("*").eq("auftrag_id", auftragsId).eq("quelle", "manuell").order("datum");
      if (manError) return res.status(500).json({ error: manError.message });

      // Zusammenführen: zuerst Zeiterfassung, dann manuelle
      const combined = [...zeitRows, ...(manuelleData as any[])];
      combined.sort((a: any, b: any) => (a.datum || "").localeCompare(b.datum || ""));
      res.json(combined);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });
  // Helper: Tenant-Auftrag-Guard — stellt sicher, dass :auftragsId dem eingeloggten Mandanten gehört.
  async function requireNkAuftrag(req: Request, res: Response, auftragsId: string) {
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) { res.status(401).json({ message: "Authentifizierung erforderlich." }); return null; }
    const { data: auftrag, error: aErr } = await identity.client
      .from("auftraege").select("id").eq("id", auftragsId).eq("tenant_id", identity.tenantId).maybeSingle();
    if (aErr) { res.status(500).json({ error: aErr.message }); return null; }
    if (!auftrag) { res.status(404).json({ message: "Auftrag nicht gefunden." }); return null; }
    return identity;
  }

  // Helper: numerische Felder validieren.
  function pickFiniteNumber(v: any): number | null {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  app.post("/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const { data: zeitDataRaw, error: zeitError } = await identity.client.from("zeiteintraege").select("*")
      .eq("auftrag_id", auftragsId).eq("tenant_id", identity.tenantId);
    if (zeitError) return res.status(500).json({ error: zeitError.message });
    const zeitData = zeitDataRaw ?? [];
    const { data: saetze = [] } = await identity.client.from("stundensaetze").select("*").eq("tenant_id", identity.tenantId);
    let synced = 0;
    for (const ze of zeitData) {
      const { data: existing } = await identity.client.from("nachkalkulation_stunden").select("id")
        .eq("zeiterfassung_id", ze.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (existing) continue;
      const ortZe = ze.ort || "Montage";
      const satz = stundensatzFuer(saetze as any[], ze.ort, ze.maschinenpark);
      const stunden = (ze.dauer_minuten || 0) / 60;
      const bereichMap: Record<string, string> = { "Avor": "Planung/AVOR", "Werkstatt": "Werkstatt", "Montage": "Montage" };
      const bereich = ze.bereich || bereichMap[ortZe] || ortZe;
      await identity.client.from("nachkalkulation_stunden").insert({
        auftrag_id: auftragsId, tenant_id: identity.tenantId, bereich,
        mitarbeiter_name: ze.mitarbeiter || "", datum: ze.datum,
        ist_stunden: stunden, stundensatz: satz, total_chf: stunden * satz,
        quelle: "zeiterfassung", zeiterfassung_id: ze.id, bemerkung: ze.beschreibung || "",
      });
      synced++;
    }
    res.json({ synced });
  });

  app.post("/api/kalkulation/:auftragsId/nk-stunden", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const stunden = pickFiniteNumber(req.body?.ist_stunden) ?? 0;
    const satz = pickFiniteNumber(req.body?.stundensatz) ?? 0;
    if (stunden < 0 || satz < 0) return res.status(400).json({ message: "ist_stunden und stundensatz dürfen nicht negativ sein." });
    const row: any = {
      auftrag_id: auftragsId,
      tenant_id: identity.tenantId,
      quelle: "manuell",
      bereich: typeof req.body?.bereich === "string" ? req.body.bereich : "Montage",
      unterkategorie: typeof req.body?.unterkategorie === "string" ? req.body.unterkategorie : null,
      mitarbeiter_name: typeof req.body?.mitarbeiter_name === "string" ? req.body.mitarbeiter_name : "",
      datum: typeof req.body?.datum === "string" ? req.body.datum : new Date().toISOString().split("T")[0],
      ist_stunden: stunden,
      stundensatz: satz,
      total_chf: stunden * satz,
      bemerkung: typeof req.body?.bemerkung === "string" ? req.body.bemerkung : "",
    };
    const { data, error } = await identity.client.from("nachkalkulation_stunden").insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.put("/api/kalkulation/nk-stunden/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const { data: existing, error: eErr } = await identity.client
      .from("nachkalkulation_stunden").select("id, quelle").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
    if (eErr) return res.status(500).json({ error: eErr.message });
    if (!existing) return res.status(404).json({ message: "Zeile nicht gefunden." });
    if (existing.quelle === "zeiterfassung") return res.status(400).json({ message: "Zeiterfassungs-Zeilen sind hier nicht editierbar." });
    const stunden = pickFiniteNumber(req.body?.ist_stunden) ?? 0;
    const satz = pickFiniteNumber(req.body?.stundensatz) ?? 0;
    if (stunden < 0 || satz < 0) return res.status(400).json({ message: "ist_stunden und stundensatz dürfen nicht negativ sein." });
    const patch: any = {
      bereich: typeof req.body?.bereich === "string" ? req.body.bereich : undefined,
      unterkategorie: typeof req.body?.unterkategorie === "string" ? req.body.unterkategorie : undefined,
      mitarbeiter_name: typeof req.body?.mitarbeiter_name === "string" ? req.body.mitarbeiter_name : undefined,
      datum: typeof req.body?.datum === "string" ? req.body.datum : undefined,
      ist_stunden: stunden,
      stundensatz: satz,
      total_chf: stunden * satz,
      bemerkung: typeof req.body?.bemerkung === "string" ? req.body.bemerkung : undefined,
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    const { data, error } = await identity.client.from("nachkalkulation_stunden").update(patch)
      .eq("id", id).eq("tenant_id", identity.tenantId).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/kalkulation/nk-stunden/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const { data: row, error: rowErr } = await identity.client.from("nachkalkulation_stunden")
      .select("quelle,zeiterfassung_id").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
    if (rowErr) return res.status(500).json({ error: rowErr.message });
    if (!row) return res.status(404).json({ message: "Zeile nicht gefunden." });
    if (row.quelle === "zeiterfassung" && row.zeiterfassung_id) {
      const { error } = await identity.client.from("zeiteintraege").delete()
        .eq("id", row.zeiterfassung_id).eq("tenant_id", identity.tenantId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, deleted_from: "zeiteintraege" });
    }
    const { error } = await identity.client.from("nachkalkulation_stunden").delete()
      .eq("id", id).eq("tenant_id", identity.tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // DELETE Zeiterfassung-Eintrag direkt (für NK IST-Stunden Live-View)
  app.delete("/api/kalkulation/nk-zeiterfassung/:zeitId", async (req, res) => {
    const { zeitId } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const { data: row, error: rowErr } = await identity.client.from("zeiteintraege")
      .select("id").eq("id", zeitId).eq("tenant_id", identity.tenantId).maybeSingle();
    if (rowErr) return res.status(500).json({ error: rowErr.message });
    if (!row) return res.status(404).json({ message: "Zeiteintrag nicht gefunden." });
    const { error } = await identity.client.from("zeiteintraege").delete().eq("id", zeitId).eq("tenant_id", identity.tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK Material (IST)
  app.get("/api/kalkulation/:auftragsId/nk-material", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const { data, error } = await identity.client.from("nachkalkulation_material").select("*")
      .eq("auftrag_id", auftragsId).eq("tenant_id", identity.tenantId).order("datum");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/nk-material", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const betrag = pickFiniteNumber(req.body?.betrag_chf);
    if (betrag === null) return res.status(400).json({ message: "betrag_chf muss eine Zahl sein." });
    const row: any = {
      auftrag_id: auftragsId,
      tenant_id: identity.tenantId,
      bezeichnung: typeof req.body?.bezeichnung === "string" ? req.body.bezeichnung : "",
      kategorie: typeof req.body?.kategorie === "string" ? req.body.kategorie : null,
      lieferant: typeof req.body?.lieferant === "string" ? req.body.lieferant : "",
      betrag_chf: betrag,
      datum: typeof req.body?.datum === "string" ? req.body.datum : new Date().toISOString().split("T")[0],
      rechnung_nr: typeof req.body?.rechnung_nr === "string" ? req.body.rechnung_nr : "",
      bemerkung: typeof req.body?.bemerkung === "string" ? req.body.bemerkung : "",
    };
    const { data, error } = await identity.client.from("nachkalkulation_material").insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-material/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const patch: any = {};
    if (typeof req.body?.bezeichnung === "string") patch.bezeichnung = req.body.bezeichnung;
    if (typeof req.body?.kategorie === "string") patch.kategorie = req.body.kategorie;
    if (typeof req.body?.lieferant === "string") patch.lieferant = req.body.lieferant;
    if (req.body?.betrag_chf !== undefined) {
      const b = pickFiniteNumber(req.body.betrag_chf);
      if (b === null) return res.status(400).json({ message: "betrag_chf muss eine Zahl sein." });
      patch.betrag_chf = b;
    }
    if (typeof req.body?.datum === "string") patch.datum = req.body.datum;
    if (typeof req.body?.rechnung_nr === "string") patch.rechnung_nr = req.body.rechnung_nr;
    if (typeof req.body?.bemerkung === "string") patch.bemerkung = req.body.bemerkung;
    const { data, error } = await identity.client.from("nachkalkulation_material").update(patch)
      .eq("id", id).eq("tenant_id", identity.tenantId).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ message: "Zeile nicht gefunden." });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-material/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const { error } = await identity.client.from("nachkalkulation_material").delete()
      .eq("id", id).eq("tenant_id", identity.tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK Fremdleistungen (IST)
  app.get("/api/kalkulation/:auftragsId/nk-fremd", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const { data, error } = await identity.client.from("nachkalkulation_fremdleistungen").select("*")
      .eq("auftrag_id", auftragsId).eq("tenant_id", identity.tenantId).order("datum");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/nk-fremd", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const betrag = pickFiniteNumber(req.body?.betrag_chf);
    if (betrag === null) return res.status(400).json({ message: "betrag_chf muss eine Zahl sein." });
    const row: any = {
      auftrag_id: auftragsId,
      tenant_id: identity.tenantId,
      bezeichnung: typeof req.body?.bezeichnung === "string" ? req.body.bezeichnung : "",
      lieferant: typeof req.body?.lieferant === "string" ? req.body.lieferant : "",
      betrag_chf: betrag,
      datum: typeof req.body?.datum === "string" ? req.body.datum : new Date().toISOString().split("T")[0],
      rechnung_nr: typeof req.body?.rechnung_nr === "string" ? req.body.rechnung_nr : "",
      bemerkung: typeof req.body?.bemerkung === "string" ? req.body.bemerkung : "",
    };
    const { data, error } = await identity.client.from("nachkalkulation_fremdleistungen").insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-fremd/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const patch: any = {};
    if (typeof req.body?.bezeichnung === "string") patch.bezeichnung = req.body.bezeichnung;
    if (typeof req.body?.lieferant === "string") patch.lieferant = req.body.lieferant;
    if (req.body?.betrag_chf !== undefined) {
      const b = pickFiniteNumber(req.body.betrag_chf);
      if (b === null) return res.status(400).json({ message: "betrag_chf muss eine Zahl sein." });
      patch.betrag_chf = b;
    }
    if (typeof req.body?.datum === "string") patch.datum = req.body.datum;
    if (typeof req.body?.rechnung_nr === "string") patch.rechnung_nr = req.body.rechnung_nr;
    if (typeof req.body?.bemerkung === "string") patch.bemerkung = req.body.bemerkung;
    const { data, error } = await identity.client.from("nachkalkulation_fremdleistungen").update(patch)
      .eq("id", id).eq("tenant_id", identity.tenantId).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ message: "Zeile nicht gefunden." });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-fremd/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const { error } = await identity.client.from("nachkalkulation_fremdleistungen").delete()
      .eq("id", id).eq("tenant_id", identity.tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // NK SOEK (IST)
  app.get("/api/kalkulation/:auftragsId/nk-soek", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const { data, error } = await identity.client.from("nachkalkulation_soek").select("*")
      .eq("auftrag_id", auftragsId).eq("tenant_id", identity.tenantId).order("datum");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.post("/api/kalkulation/:auftragsId/nk-soek", async (req, res) => {
    const { auftragsId } = req.params;
    const identity = await requireNkAuftrag(req, res, auftragsId);
    if (!identity) return;
    const anzahl = pickFiniteNumber(req.body?.anzahl) ?? 0;
    const preis = pickFiniteNumber(req.body?.preis_pro_einheit) ?? 0;
    const totalReq = pickFiniteNumber(req.body?.total_chf);
    const total = totalReq !== null ? totalReq : anzahl * preis;
    if (anzahl < 0 || preis < 0) return res.status(400).json({ message: "anzahl und preis_pro_einheit dürfen nicht negativ sein." });
    const row: any = {
      auftrag_id: auftragsId,
      tenant_id: identity.tenantId,
      bezeichnung: typeof req.body?.bezeichnung === "string" ? req.body.bezeichnung : "",
      anzahl,
      einheit: typeof req.body?.einheit === "string" ? req.body.einheit : "Stk",
      preis_pro_einheit: preis,
      total_chf: total,
      datum: typeof req.body?.datum === "string" ? req.body.datum : new Date().toISOString().split("T")[0],
      bemerkung: typeof req.body?.bemerkung === "string" ? req.body.bemerkung : "",
    };
    const { data, error } = await identity.client.from("nachkalkulation_soek").insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
  app.put("/api/kalkulation/nk-soek/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const patch: any = {};
    if (typeof req.body?.bezeichnung === "string") patch.bezeichnung = req.body.bezeichnung;
    if (typeof req.body?.einheit === "string") patch.einheit = req.body.einheit;
    if (req.body?.anzahl !== undefined) {
      const a = pickFiniteNumber(req.body.anzahl);
      if (a === null || a < 0) return res.status(400).json({ message: "anzahl muss eine nichtnegative Zahl sein." });
      patch.anzahl = a;
    }
    if (req.body?.preis_pro_einheit !== undefined) {
      const p = pickFiniteNumber(req.body.preis_pro_einheit);
      if (p === null || p < 0) return res.status(400).json({ message: "preis_pro_einheit muss eine nichtnegative Zahl sein." });
      patch.preis_pro_einheit = p;
    }
    if (req.body?.total_chf !== undefined) {
      const t = pickFiniteNumber(req.body.total_chf);
      if (t === null) return res.status(400).json({ message: "total_chf muss eine Zahl sein." });
      patch.total_chf = t;
    } else if (patch.anzahl !== undefined && patch.preis_pro_einheit !== undefined) {
      patch.total_chf = patch.anzahl * patch.preis_pro_einheit;
    }
    if (typeof req.body?.datum === "string") patch.datum = req.body.datum;
    if (typeof req.body?.bemerkung === "string") patch.bemerkung = req.body.bemerkung;
    const { data, error } = await identity.client.from("nachkalkulation_soek").update(patch)
      .eq("id", id).eq("tenant_id", identity.tenantId).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ message: "Zeile nicht gefunden." });
    res.json(data);
  });
  app.delete("/api/kalkulation/nk-soek/:id", async (req, res) => {
    const { id } = req.params;
    const identity = dashboardPreferenceIdentity(req);
    if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
    const { error } = await identity.client.from("nachkalkulation_soek").delete()
      .eq("id", id).eq("tenant_id", identity.tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ═══ END KALKULATION V6 ═══════════════════════════════════════════

  app.get("/api/finanzen/uebersicht", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      res.json(await ladeFinanzenUebersichtZeilen(identity.client, identity.tenantId));
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Reparatur: auftraege.rechnungs_betrag aus "rechnungen" neu aufbauen ──────
  // Heilt Auftraege, deren Spiegelfeld von der Rechnungstabelle abweicht — etwa weil
  // eine Rechnung frueher ohne Sync angelegt oder ein Betrag manuell gesetzt wurde.
  //   ?dry=1              meldet die Abweichungen nur, ohne zu schreiben
  //   ?entfernePhantome=1 setzt zusaetzlich Betraege auf null, hinter denen gar keine
  //                       Rechnung steht. Standardmaessig bleiben diese unangetastet:
  //                       der Betrag ist der einzige Hinweis darauf, dass fakturiert
  //                       wurde, und darf nicht ungefragt geloescht werden.
  app.post("/api/wartung/rechnungsbetraege-neu-berechnen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const nurAnzeigen = req.query.dry === "1";
      const entfernePhantome = req.query.entfernePhantome === "1";
      const [{ data: auftraege, error: aFehler }, { data: rechnungen, error: rFehler }] = await Promise.all([
        identity.client.from("auftraege").select("id, nr, rechnungs_betrag").eq("tenant_id", identity.tenantId),
        identity.client.from("rechnungen").select("auftrag_id, betrag").eq("tenant_id", identity.tenantId),
      ]);
      if (aFehler) throw aFehler;
      if (rFehler) throw rFehler;

      const nettoJeAuftrag = new Map<string, number>();
      const anzahlJeAuftrag = new Map<string, number>();
      for (const r of rechnungen || []) {
        nettoJeAuftrag.set(r.auftrag_id, (nettoJeAuftrag.get(r.auftrag_id) || 0) + (Number(r.betrag) || 0));
        anzahlJeAuftrag.set(r.auftrag_id, (anzahlJeAuftrag.get(r.auftrag_id) || 0) + 1);
      }
      const mwstFaktor = 1 + (await ladeMwstSatz(identity)) / 100;

      const korrigiert: any[] = [];
      const uebersprungen: any[] = [];
      for (const a of auftraege || []) {
        const anzahl = anzahlJeAuftrag.get(a.id) || 0;
        const soll = anzahl === 0 ? null : Math.round((nettoJeAuftrag.get(a.id) || 0) * mwstFaktor * 100) / 100;
        const ist = a.rechnungs_betrag == null ? null : Math.round(Number(a.rechnungs_betrag) * 100) / 100;
        if (soll === ist) continue;

        const eintrag = { id: a.id, nr: a.nr, vorher: ist, nachher: soll, anzahl_rechnungen: anzahl };
        // Phantom = Betrag im Auftrag, aber keine einzige Rechnung dahinter.
        if (anzahl === 0 && !entfernePhantome) {
          uebersprungen.push({ ...eintrag, grund: "Betrag ohne zugehoerige Rechnung — bitte Rechnung im UI nacherfassen" });
          continue;
        }
        korrigiert.push(eintrag);
        if (!nurAnzeigen) {
          const { error } = await identity.client.from("auftraege").update({ rechnungs_betrag: soll }).eq("id", a.id).eq("tenant_id", identity.tenantId);
          if (error) throw error;
        }
      }

      res.json({
        modus: nurAnzeigen ? "dry-run" : "angewendet",
        geprueft: (auftraege || []).length,
        korrigiert: nurAnzeigen ? 0 : korrigiert.length,
        aenderungen: korrigiert,
        uebersprungen,
      });
    } catch (e) {
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Garantien ────────────────────────────────────────────────────────────────
  app.get("/api/garantien", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      let query = identity.client.from("garantien").select("*").eq("tenant_id", identity.tenantId).order("ablauf_datum", { ascending: true });
      if (req.query.auftrag_id) query = (query as any).eq("auftrag_id", String(req.query.auftrag_id));
      const { data, error } = await query;
      if (error) throw error;
      // Aufträge separat laden für Namen
      const { data: auftraege } = await identity.client.from("auftraege").select("id, nr, titel").eq("tenant_id", identity.tenantId);
      const result = (data || []).map((g: any) => {
        const a = (auftraege || []).find((x: any) => x.id === g.auftrag_id);
        return { ...g, auftrag_nr: a?.nr || '', auftrag_titel: a?.titel || '' };
      });
      res.json(result);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.get("/api/garantien/warnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client.from("garantien").select("id,ablaufdatum").eq("tenant_id", identity.tenantId).not("ablaufdatum", "is", null);
      if (error) throw error;
      const heute = new Date();
      const kritisch = (data || []).filter((g: any) => {
        const diff = Math.ceil((new Date(g.ablaufdatum).getTime() - heute.getTime()) / 86400000);
        return diff < 0 || diff <= 30;
      });
      res.json({ count: kritisch.length });
    } catch(e) { res.status(500).json({ count: 0 }); }
  });

  app.post("/api/garantien", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const eintrag = { id: uid(), ...req.body, erstellt: new Date().toISOString(), tenant_id: identity.tenantId };
      const { data, error } = await identity.client.from("garantien").insert(eintrag).select().single();
      if (error) throw error;
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/garantien/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("garantien").update({ ...req.body, tenant_id: identity.tenantId }).eq("id", req.params.id).eq("tenant_id", identity.tenantId).select().maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Garantie nicht gefunden." });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/garantien/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client.from("garantien").delete().eq("id", req.params.id).eq("tenant_id", identity.tenantId).select("id");
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ message: "Garantie nicht gefunden." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Lieferschein PDF (Vorlage aus DB) ─────────────────────────────────────────
  app.post("/api/auftraege/:id/lieferschein-pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { data: auftrag, error: aErr } = await identity.client.from("auftraege").select("*").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (aErr || !auftrag) throw new Error("Auftrag nicht gefunden");

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      // Positionen laden — zuerst Offerte, dann Rechnung als Fallback (JSONB-Spalten)
      let positionen: any[] = [];
      // Zuerst Offerte des Auftrags laden (hat vollständige Positionen mit Titel)
      const { data: offerten } = await identity.client.from("offerten").select("positionen").eq("auftrag_id", id).eq("tenant_id", identity.tenantId).order("erstellt", { ascending: false }).limit(1);
      if (offerten && offerten.length > 0 && Array.isArray(offerten[0].positionen) && offerten[0].positionen.length > 0) {
        positionen = offerten[0].positionen.map((p: any) => ({
          titel: p.titel || p.beschreibung || "",
          beschreibung: p.beschreibung || "",
          menge: p.menge || 1,
          einheit: p.einheit || "Stk.",
          einzelpreis: 0,
          total: 0,
        }));
      } else {
        // Fallback: Rechnungs-Positionen (JSONB)
        const { data: rechnungen } = await identity.client.from("rechnungen").select("positionen").eq("auftrag_id", id).eq("tenant_id", identity.tenantId).order("erstellt", { ascending: false }).limit(1);
        if (rechnungen && rechnungen.length > 0 && Array.isArray(rechnungen[0].positionen) && rechnungen[0].positionen.length > 0) {
          positionen = rechnungen[0].positionen.map((p: any) => ({
            titel: p.beschreibung || "",
            beschreibung: "",
            menge: p.menge || 1,
            einheit: p.einheit || "Stk.",
            einzelpreis: 0,
            total: 0,
          }));
        }
      }

      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });

      // Lieferschein: Sonderbereich mit Empfangsbestätigung
      const extraHtml = `
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #ddd;">
          <div style="display:flex;justify-content:space-between;gap:40px;margin-top:24px;">
            <div style="flex:1;">
              <div style="font-size:8pt;color:#999;margin-bottom:6px;">Empfangen am</div>
              <div style="border-bottom:1px solid #333;height:28px;"></div>
            </div>
            <div style="flex:1;">
              <div style="font-size:8pt;color:#999;margin-bottom:6px;">Unterschrift</div>
              <div style="border-bottom:1px solid #333;height:28px;"></div>
            </div>
          </div>
        </div>`;

      const ansprechpersonInternLS: string = req.body?.ansprechpersonIntern || auftrag.verantwortlicher || "";
      const html = await buildPdfHtml("lieferschein", {
        titel: "LIEFERSCHEIN",
        nummer: auftrag.nr || id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        empfaenger: auftrag.kunde_name || auftrag.kunde || "",
        ...(() => { const s = splitAdresse(auftrag.kunde_adresse || ""); return { empfaengerStrasse: s.strasse, empfaengerPlzOrt: s.plzOrt }; })(),
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal: 0, mwstPct: 0, mwstBetrag: 0, total: 0,
        showTotals: false,
        extraHtml,
        ansprechpersonIntern: ansprechpersonInternLS,
        kundenNr: await getKundenNr(auftrag.kunde_name || auftrag.kunde || ""),
        anrede: await getKundenAnrede(auftrag.kunde_name || auftrag.kunde || ""),
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Lieferschein-${auftrag.nr || id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Auftragsbestätigung PDF (Vorlage aus DB) ──────────────────────────────────
  app.post("/api/auftraege/:id/auftragsbestaetigung-pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { data: auftrag, error: aErr } = await identity.client.from("auftraege").select("*").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (aErr || !auftrag) throw new Error("Auftrag nicht gefunden");

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      // Positionen aus verknüpfter Offerte oder Auftragspositionen
      let positionen: any[] = [];
      if (auftrag.offerte_id) {
        const { data: off } = await identity.client.from("offerten").select("*").eq("id", auftrag.offerte_id).eq("tenant_id", identity.tenantId).maybeSingle();
        if (off?.positionen && Array.isArray(off.positionen)) positionen = off.positionen;
      }
      if (positionen.length === 0) {
        const { data: rechnungen } = await identity.client.from("rechnungen").select("*").eq("auftrag_id", id).eq("tenant_id", identity.tenantId).limit(1);
        if (rechnungen && rechnungen.length > 0 && Array.isArray(rechnungen[0].positionen)) {
          positionen = rechnungen[0].positionen;
        }
      }

      const subtotal   = positionen.reduce((s: number, p: any) => s + Number(p.total ?? (Number(p.menge||0)*Number(p.einzelpreis||0))), 0);
      const mwstPct    = 8.1;
      const mwstBetrag = subtotal * (mwstPct / 100);
      const totalInkl  = subtotal + mwstBetrag;

      const datumStr = new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      const lieferDatum = auftrag.geplant_ende
        ? new Date(auftrag.geplant_ende).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })
        : undefined;

      const ansprechpersonInternAB: string = req.body?.ansprechpersonIntern || auftrag.verantwortlicher || "";
      const html = await buildPdfHtml("auftragsbestaetigung", {
        titel: "AUFTRAGSBESTÄTIGUNG",
        nummer: auftrag.nr || id.substring(0, 8).toUpperCase(),
        datum: datumStr,
        faelligDatum: lieferDatum,
        empfaenger: auftrag.kunde_name || auftrag.kunde || "",
        ...(() => { const s = splitAdresse(auftrag.kunde_adresse || ""); return { empfaengerStrasse: s.strasse, empfaengerPlzOrt: s.plzOrt }; })(),
        firma:        firmennameAusSettings(sMap),
        firmenlogo:   sMap.firmenlogo || "",
        farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: sMap.adresse    || "Hefenhoferstrasse 7",
        firmaPlzOrt:  sMap.plz_ort   || "8580 Sommeri",
        firmaTel:     sMap.telefon   || "071 411 16 87",
        firmaEmail:   sMap.email     || "info@schneggenburger.ch",
        firmaUid:     sMap.uid_nummer || "",
        positionen,
        subtotal, mwstPct, mwstBetrag, total: totalInkl,
        showTotals: positionen.length > 0,
        einleitung: `Wir best\u00e4tigen Ihnen hiermit den Auftrag ${auftrag.nr || ""} mit folgendem Inhalt:`,
        schluss: `Wir danken Ihnen fuer Ihren Auftrag und stehen fuer Rueckfragen gerne zur Verfuegung.\n\nFreundliche Gruesse\n${firmennameAusSettings(sMap)}`,
        ansprechpersonIntern: ansprechpersonInternAB,
        kundenNr: await getKundenNr(auftrag.kunde_name || auftrag.kunde || ""),
        anrede: await getKundenAnrede(auftrag.kunde_name || auftrag.kunde || ""),
      });

      const pdfBuf = await renderRechnungPdfFromHtml(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Auftragsbestaetigung-${auftrag.nr || id}.pdf"`);
      res.send(pdfBuf);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Abnahmeprotokoll PDF ─────────────────────────────────────────────────────
  app.post("/api/auftraege/:id/abnahme-pdf", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { id } = req.params;
      const { data: auftrag, error: aErr } = await identity.client.from("auftraege").select("*").eq("id", id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (aErr || !auftrag) throw new Error("Auftrag nicht gefunden");

      const { data: garantien } = await identity.client.from("garantien").select("*").eq("auftrag_id", id).eq("tenant_id", identity.tenantId);
      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width: W, height: H } = page.getSize();

      const brown = rgb(0.42, 0.30, 0.17);
      const orange = rgb(0.91, 0.38, 0.04);
      const darkblue = rgb(0.10, 0.23, 0.42);
      const grey = rgb(0.5, 0.5, 0.5);
      const black = rgb(0, 0, 0);
      const lgrey = rgb(0.92, 0.92, 0.92);
      const mL = 40; const mR = 40;

      let logoImage: any = null;
      try {
        const logoBytes = logoBytesFromDataUrl(sMap.firmenlogo);
        if (logoBytes) {
          logoImage = /^data:image\/png/i.test(sMap.firmenlogo || "")
            ? await pdfDoc.embedPng(logoBytes)
            : await pdfDoc.embedJpg(logoBytes);
        }
      } catch (_) {}

      if (logoImage) {
        const lDims = logoImage.scaleToFit(120, 40);
        page.drawImage(logoImage, { x: W - mR - lDims.width, y: H - 60, width: lDims.width, height: lDims.height });
      }

      page.drawText("ABNAHMEPROTOKOLL", { x: mL, y: H - 55, size: 20, font: fontB, color: darkblue });
      page.drawLine({ start: { x: mL, y: H - 65 }, end: { x: W - mR, y: H - 65 }, thickness: 1.5, color: orange });

      let y = H - 90;
      const infoItems = [
        ["Auftragsnummer", auftrag.nr || id],
        ["Kunde", auftrag.kunde || "—"],
        ["Datum", new Date().toLocaleDateString("de-CH")],
      ];
      for (const [label, val] of infoItems) {
        page.drawText(label + ":", { x: mL, y, size: 9, font, color: grey });
        page.drawText(String(val), { x: mL + 110, y, size: 9, font: fontB, color: black });
        y -= 16;
      }

      // Sections
      const sections = [
        { title: "Ausgeführte Arbeiten", lines: 5 },
        { title: "Mängel / Bemerkungen", lines: 5 },
        { title: "Garantieleistungen", lines: 4, extraContent: garantien },
      ];

      y -= 15;
      for (const sec of sections) {
        page.drawRectangle({ x: mL, y: y - 4, width: W - mL - mR, height: 16, color: darkblue });
        page.drawText(sec.title, { x: mL + 6, y, size: 10, font: fontB, color: rgb(1,1,1) });
        y -= 24;

        if (sec.extraContent && (sec.extraContent as any[]).length > 0) {
          for (const g of (sec.extraContent as any[])) {
            if (y < 120) break;
            page.drawText(`• ${(g.beschreibung || "").slice(0, 70)} (bis ${g.ablauf_datum || "??"})`, { x: mL + 4, y, size: 8.5, font, color: black });
            y -= 14;
          }
        }

        for (let i = 0; i < sec.lines; i++) {
          page.drawLine({ start: { x: mL, y }, end: { x: W - mR, y }, thickness: 0.3, color: lgrey });
          y -= 18;
        }
        y -= 8;
      }

      // Signatures
      y = 130;
      page.drawLine({ start: { x: mL, y }, end: { x: W - mR, y }, thickness: 0.5, color: grey });
      y -= 25;
      page.drawText("Auftragnehmer:", { x: mL, y, size: 9, font, color: grey });
      page.drawText("Auftraggeber:", { x: W/2 + 20, y, size: 9, font, color: grey });
      y -= 40;
      page.drawLine({ start: { x: mL, y }, end: { x: mL + 180, y }, thickness: 0.5, color: grey });
      page.drawLine({ start: { x: W/2 + 20, y }, end: { x: W/2 + 200, y }, thickness: 0.5, color: grey });
      y -= 10;
      page.drawText("Datum / Unterschrift", { x: mL, y, size: 7.5, font, color: grey });
      page.drawText("Datum / Unterschrift", { x: W/2 + 20, y, size: 7.5, font, color: grey });

      page.drawText(`Abnahmeprotokoll ${auftrag.nr || ""} – ${firmennameAusSettings(sMap)}`, { x: mL, y: 25, size: 7.5, font, color: grey });
      page.drawText(`Erstellt: ${new Date().toLocaleDateString("de-CH")}`, { x: W - mR - 80, y: 25, size: 7.5, font, color: grey });

      const bytes = await pdfDoc.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Abnahmeprotokoll-${auftrag.nr || id}.pdf"`);
      res.end(Buffer.from(bytes));
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── PDF Vorlagen ─────────────────────────────────────────────────────────────

  // GET alle Vorlagen (oder initialisiere defaults)
  app.get("/api/pdf-vorlagen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("pdf_vorlagen")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .order("doc_typ");
      if (error) return res.status(500).json({ message: error.message });
      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));
      
      // Falls noch keine Vorlagen existieren, defaults zurückgeben
      const docTypes = ["offerte", "rechnung", "mahnung", "lieferschein", "auftragsbestaetigung", "lohnabrechnung", "stundenabrechnung", "vorkalkulation", "nachkalkulation"];
      const defaultTexts: Record<string, { einleitung: string; schluss: string }> = {
        offerte: {
          einleitung: "Sehr geehrte Damen und Herren\n\nGerne unterbreiten wir Ihnen für die besprochenen Arbeiten folgende Offerte:",
          schluss: `Diese Offerte ist 30 Tage gültig. Wir freuen uns auf Ihren Auftrag.\n\nFreundliche Grüsse\n${firmennameAusSettings(sMap)}`
        },
        rechnung: {
          einleitung: "Sehr geehrte Damen und Herren\n\nFür die ausgeführten Arbeiten erlauben wir uns, Ihnen folgenden Betrag in Rechnung zu stellen:",
          schluss: `Wir danken Ihnen für Ihren Auftrag und die termingerechte Zahlung.\n\nFreundliche Grüsse\n${firmennameAusSettings(sMap)}`
        },
        mahnung: {
          einleitung: "Sehr geehrte Damen und Herren\n\nTrotz unserer Rechnung konnten wir bisher keinen Zahlungseingang feststellen. Wir bitten Sie höflich, den offenen Betrag innert 10 Tagen zu begleichen.",
          schluss: `Sollte sich Ihre Zahlung mit dieser Mahnung gekreuzt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nFreundliche Grüsse\n${firmennameAusSettings(sMap)}`
        },
        lieferschein: {
          einleitung: "Sehr geehrte Damen und Herren\n\nWir liefern Ihnen folgende Positionen gemäss Auftrag:",
          schluss: `Bitte prüfen Sie die Lieferung und bestätigen Sie den Erhalt mit Ihrer Unterschrift.\n\nFreundliche Grüsse\n${firmennameAusSettings(sMap)}`
        },
        auftragsbestaetigung: {
          einleitung: "Sehr geehrte Damen und Herren\n\nWir bestätigen Ihnen hiermit den erteilten Auftrag mit folgenden Positionen:",
          schluss: `Wir freuen uns auf die Zusammenarbeit und werden den Auftrag termingerecht ausführen.\n\nFreundliche Grüsse\n${firmennameAusSettings(sMap)}`
        }
      };
      
      if (!data || data.length === 0) {
        // Defaults zurückgeben ohne in DB zu schreiben (Tabelle existiert vielleicht noch nicht)
        const defaults = docTypes.map(dt => ({
          id: dt,
          doc_typ: dt,
          design: "A",
          slogan: "Ihr Partner für Metallbau & Schreinerei",
          header_color: sMap.farbe_primaer || "#44546a",
          footer_color: "#1a3a6b",
          logo_pos: "links",
          zahlungsfrist: dt === "mahnung" ? "10" : "30",
          mahngebuehr: "30.00",
          einleitung: defaultTexts[dt]?.einleitung || "",
          schluss: defaultTexts[dt]?.schluss || "",
          show_contact: true,
          show_page_num: true,
          logo_data_url: sMap.firmenlogo || null,
          logo_scale: 100,
          logo_offset_x: 100,
          logo_offset_y: 0,
          slogan_offset_x: 0,
          watermark_data_url: null,
          watermark_opacity: 15,
          watermark_size: 60,
          watermark_pos: "bottom",
          absender_pos_h: "links",
          absender_top_mm: 55,
          absender_left_mm: 0,
          block_positions: {},
          ansprechperson_aktiv: true,
          ansprechperson_label: "Ansprechperson",
          ansprechperson_quelle: "manuell",
          positionstexte: { pos: "Pos.", beschreibung: "Beschreibung", menge: "Menge", einheit: "Einheit", preis: "Preis", total: "Total" },
        }));
        return res.json(defaults);
      }
      
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // Whitelist der Dokumenttypen. Nur bekannte Typen sind speicherbar.
  const PDF_VORLAGEN_DOC_TYPES = new Set([
    "offerte", "rechnung", "mahnung", "lieferschein",
    "auftragsbestaetigung", "lohnabrechnung", "stundenabrechnung",
    "vorkalkulation", "nachkalkulation",
  ]);

  // Nicht über Client setzbare Spalten (z.B. PK/Tenant/Timestamps steuern wir hier).
  const PDF_VORLAGEN_FORBIDDEN_FIELDS = new Set(["id", "tenant_id", "doc_typ", "created_at", "updated_at", "erstellt", "aktualisiert"]);

  // GET einzelne Vorlage by doc_typ
  app.get("/api/pdf-vorlagen/:docTyp", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("pdf_vorlagen")
        .select("*")
        .eq("tenant_id", identity.tenantId)
        .eq("doc_typ", req.params.docTyp)
        .maybeSingle();
      if (error || !data) return res.status(404).json({ message: "Nicht gefunden" });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PUT (upsert) Vorlage für einen doc_typ
  app.put("/api/pdf-vorlagen/:docTyp", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const docTyp = req.params.docTyp;
      if (!PDF_VORLAGEN_DOC_TYPES.has(docTyp)) return res.status(400).json({ message: `Ungültiger Dokumenttyp: ${docTyp}` });

      // Payload bereinigen: nur erlaubte Client-Felder, kein undefined.
      const payload: Record<string, unknown> = {
        doc_typ: docTyp,
        tenant_id: identity.tenantId,
        updated_at: new Date().toISOString(),
      };
      for (const [k, v] of Object.entries(req.body ?? {})) {
        if (v === undefined) continue;
        if (PDF_VORLAGEN_FORBIDDEN_FIELDS.has(k)) continue;
        payload[k] = v;
      }

      // Upsert via UNIQUE(tenant_id, doc_typ) — die Migration hat diesen
      // Constraint gesetzt, damit brauchen wir kein separates SELECT.
      const { data, error } = await identity.client
        .from("pdf_vorlagen")
        .upsert(payload, { onConflict: "tenant_id,doc_typ" })
        .select().single();
      if (error) {
        console.error("[pdf-vorlagen PUT] upsert error:", error);
        return res.status(500).json({ message: error.message });
      }
      res.json(data);
    } catch (e) {
      console.error("[pdf-vorlagen PUT] exception:", e);
      res.status(500).json({ message: asError(e) });
    }
  });


  // ─── PDF Live-Vorschau (echtes Puppeteer-Rendering, direktes PDF) ────────
  // POST /api/pdf-vorlagen/vorschau  — body: { vorlage: {...}, doc_typ: string }
  // Gibt das PDF direkt als application/pdf-Binary zurück — 1:1 identisch mit echtem PDF,
  // inkl. QR-Rechnung Seite 2 bei doc_typ === "rechnung". Das Frontend zeigt es in einem
  // <iframe> per Object-URL an (kein JPEG-Zwischenschritt mehr).
  app.post("/api/pdf-vorlagen/vorschau", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { vorlage, doc_typ = "rechnung" } = req.body as { vorlage: any; doc_typ?: string };
      if (!vorlage) return res.status(400).json({ message: "vorlage fehlt" });

      // Firmen-Einstellungen für Musterdaten — SELBE Keys wie bei echter Rechnungs-/Offerten-Erzeugung
      // (firmenname / adresse / plz_ort / telefon / email — NICHT firma_name/firma_adresse/...)
      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));

      // Musterpositionen
      const musterpositionen = [
        { bezeichnung: "Trennwand Pfosten", beschreibung: "Stahlanker, gebohrt", menge: 6, einheit: "St.", einzelpreis: 120, total: 720 },
        { bezeichnung: "Material Mat & Kleinteile", beschreibung: "", menge: 1, einheit: "Pos.", einzelpreis: 243, total: 243 },
        { bezeichnung: "Lieferung & Montage", beschreibung: "", menge: 1, einheit: "Pos.", einzelpreis: 40, total: 40 },
      ];
      const subtotal = 1003;
      const mwstPct  = 8.1;
      const mwstBetrag = Math.round(subtotal * mwstPct) / 100;
      // Bei Mahnung addiert die echte Route die Mahngebühr zum Total (siehe ~Zeile 4635).
      // Muss nach musterMahngebuehr berechnet werden, siehe Neuzuweisung unten.
      let total = subtotal + mwstBetrag;

      // Firma-Daten aus Einstellungen — identische Keys wie in den echten PDF-Routen
      const firma       = firmennameAusSettings(sMap);
      const firmaAdr    = sMap.adresse    || "Hefenhoferstrasse 7";
      const firmaPlzOrt = sMap.plz_ort    || "8580 Sommeri";
      const firmaTel    = sMap.telefon    || "071 411 16 87";
      const firmaEmail  = sMap.email      || "info@schneggenburger.ch";
      const firmaUid    = sMap.uid_nummer || "";

      // WICHTIG: Die echte gespeicherte Vorlage (Offerte/Rechnung) darf durch
      // die Live-Vorschau NIE verändert werden — auch nicht kurzzeitig. Statt
      // die Vorlage in der Datenbank zu überschreiben und danach wieder
      // zurückzusetzen (riskant bei Absturz oder Parallelzugriff), laden wir
      // die Original-Vorlage nur lesend, mergen die Vorschau-Overrides rein
      // Arbeitsspeicher und übergeben das Ergebnis direkt an buildPdfHtml.
      // Die Datenbank wird dabei zu keinem Zeitpunkt beschrieben.
      const { data: originalVorlage } = await identity.client
        .from("pdf_vorlagen").select("*").eq("tenant_id", identity.tenantId).eq("doc_typ", doc_typ).maybeSingle();

      const previewVorlage = { ...(originalVorlage || {}), ...vorlage, doc_typ };

      // ─── doc_typ-spezifische Muster-Konfiguration ────────────────────────
      // WICHTIG: Diese Werte MÜSSEN exakt widerspiegeln, was die jeweilige echte
      // PDF-Route (siehe z.B. Zeilen ~2738 Rechnung, ~4613 Mahnung, ~5015 Offerte,
      // ~5193 Lohnabrechnung, ~5272 Stundenabrechnung, ~7172 Lieferschein, ~7235
      // Auftragsbestätigung) tatsächlich übergibt — sonst zeigt die Vorschau etwas
      // anderes als das echte Dokument.
      const docTitle = doc_typ === "offerte" ? "OFFERTE"
        : doc_typ === "mahnung" ? "MAHNUNG (1. Mahnung)" // echte Route hängt " (N. Mahnung)" an, wenn mahnstufe gesetzt ist
        : doc_typ === "lieferschein" ? "LIEFERSCHEIN"
        : doc_typ === "auftragsbestaetigung" ? "AUFTRAGSBESTÄTIGUNG"
        : doc_typ === "lohnabrechnung" ? "LOHNABRECHNUNG"
        : doc_typ === "stundenabrechnung" ? "STUNDENABRECHNUNG"
        : "RECHNUNG";

      // showTotals: 1:1 wie in der jeweiligen echten Route.
      // rechnung/offerte/mahnung -> true; lieferschein/lohnabrechnung/stundenabrechnung -> false;
      // auftragsbestaetigung -> abhängig von vorhandenen Positionen (hier: Musterpositionen sind immer vorhanden -> true).
      const showTotalsForDocTyp =
        doc_typ === "lieferschein" || doc_typ === "lohnabrechnung" || doc_typ === "stundenabrechnung"
          ? false
          : true;

      // Mahngebühr: echte Mahnung-Route addiert eine optionale Mahngebühr zum Total
      // und übergibt sie separat an buildPdfHtml, damit sie als eigene Zeile erscheint.
      // WICHTIG: mahnung.mahngebuehr (pro einzelner Mahnung) ist NICHT dasselbe wie
      // pdf_vorlagen.mahngebuehr (der Vorbelegungswert im Vorlagen-Formular) — die
      // echte PDF-Route liest den individuellen Mahnungswert, nicht den Vorlagen-Default.
      // Damit das Vorlagen-Feld in der Vorschau trotzdem sichtbar etwas bewirkt (es ist
      // sonst ein wirkungsloses Feld, siehe unten), nutzen wir hier den Vorlagen-Wert
      // als realistischen Beispielwert.
      const musterMahngebuehr = doc_typ === "mahnung"
        ? Number(previewVorlage.mahngebuehr || 30) || 30
        : undefined;
      if (musterMahngebuehr !== undefined) total += musterMahngebuehr;

      const musterEmpfaenger = "Musterfirma AG";
      const musterEmpStrasse = "Musterstrasse 42";
      const musterEmpPlzOrt  = "8001 Zürich";
      const musterNummer = doc_typ === "offerte" ? "O260001" : "R260001";

      // Lieferschein: echte Route hängt einen Empfangsbestätigungs-Block
      // (Empfangen am / Unterschrift) unten an — das muss die Vorschau auch zeigen,
      // sonst wirkt die Vorlage im Vergleich zum echten PDF unvollständig.
      const musterExtraHtml = doc_typ === "lieferschein"
        ? `
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #ddd;">
          <div style="display:flex;justify-content:space-between;gap:40px;margin-top:24px;">
            <div style="flex:1;">
              <div style="font-size:8pt;color:#999;margin-bottom:6px;">Empfangen am</div>
              <div style="border-bottom:1px solid #333;height:28px;"></div>
            </div>
            <div style="flex:1;">
              <div style="font-size:8pt;color:#999;margin-bottom:6px;">Unterschrift</div>
              <div style="border-bottom:1px solid #333;height:28px;"></div>
            </div>
          </div>
        </div>`
        : doc_typ === "mahnung"
        ? `<div style="margin-top:12px;padding:8px 12px;background:#fff3cd;border-left:3px solid #f0ad4e;font-size:8.5pt;color:#444;white-space:pre-line;">Bitte begleichen Sie den offenen Betrag innert 10 Tagen.</div>`
        : "";

      // Bug-Fix: gueltigBis/faelligDatum waren fest verdrahtet ("30 Tage" bzw. eine
      // feste Musterzeichenkette) und ignorierten previewVorlage.zahlungsfrist komplett —
      // Aenderungen an diesem Vorlagenfeld hatten dadurch in der Live-Vorschau nie
      // eine sichtbare Wirkung. Jetzt wird der tatsaechliche Vorlagenwert genutzt:
      // Offerte zeigt ihn direkt als "X Tage", Rechnung/Mahnung leiten daraus ein
      // realistisches Faelligkeitsdatum (Musterdatum + X Tage) ab — inkl. QR-Block,
      // damit Seite 1 (Faelligkeitstext) und Seite 2 (QR-Zahlschein) konsistent bleiben.
      const musterZahlungsfristTage = parseInt(String(previewVorlage.zahlungsfrist || "30"), 10) || 30;
      const musterFaelligDatumBerechnet = (() => {
        const basis = new Date("2026-07-01");
        basis.setDate(basis.getDate() + musterZahlungsfristTage);
        return basis.toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
      })();

      // Bei Rechnung: echten QR-Zahlschein-Block bauen (identisch zur echten Rechnungserzeugung),
      // damit die Vorschau die tatsächliche Seite 2 mit Swiss-QR-Code zeigt.
      const qrInlineBlock = doc_typ === "rechnung"
        ? await buildQrInlineBlock({
            sMap,
            totalInkl: total,
            rechnungsNr: musterNummer,
            faelligStr: musterFaelligDatumBerechnet,
            empfaenger: musterEmpfaenger,
            empStrasse: musterEmpStrasse,
            empPlzOrt: musterEmpPlzOrt,
          })
        : undefined;

      const html = await buildPdfHtml(doc_typ, {
        titel: docTitle,
        nummer: musterNummer,
        datum: "01. Juli 2026",
        ...(doc_typ === "offerte" ? { gueltigBis: `${musterZahlungsfristTage} Tage` } : { faelligDatum: musterFaelligDatumBerechnet }),
        empfaenger: musterEmpfaenger,
        empfaengerStrasse: musterEmpStrasse,
        empfaengerPlzOrt: musterEmpPlzOrt,
        firma, firmenlogo: sMap.firmenlogo || "", farbePrimaer: sMap.farbe_primaer || "#44546a",
        firmaAdresse: firmaAdr, firmaPlzOrt, firmaTel, firmaEmail, firmaUid,
        positionen: musterpositionen,
        subtotal,
        mwstPct,
        mwstBetrag,
        ...(musterMahngebuehr !== undefined ? { mahngebuehr: musterMahngebuehr } : {}),
        total,
        einleitung: vorlage.einleitung || "Vielen Dank für Ihr Vertrauen.",
        schluss: vorlage.schluss || "Mit freundlichen Grüssen\n" + firma,
        showTotals: showTotalsForDocTyp,
        ...(musterExtraHtml ? { extraHtml: musterExtraHtml } : {}),
        kundenNr: "K260001",
        anrede: "Herr",
        ansprechpersonIntern: "Max Muster",
        ansprechpersonExtern: "Max Muster",
        ...(qrInlineBlock ? { extraHtmlFullWidth: qrInlineBlock } : {}),
      }, previewVorlage);

      // PDF rendern — Datenbank wurde zu keinem Zeitpunkt verändert.
      // WICHTIG: renderRechnungPdfFromHtml() ist die einzige Render-Funktion, die den
      // Puppeteer-Header/Footer (pptr-header/pptr-footer Meta-Tags — Firma, Logo, Slogan)
      // tatsächlich einbaut. Sie wird auch von ALLEN echten PDF-Routen (Offerte, Rechnung,
      // Mahnung, etc.) verwendet — die Vorschau MUSS denselben Pfad nutzen, sonst fehlt der
      // komplette Header in der Live-Vorschau (renderPdfFromHtml liest diese Meta-Tags nicht).
      const pdfBuf = await renderRechnungPdfFromHtml(html);

      // Direkte PDF-Antwort statt JPEG-Konvertierung: das Frontend zeigt das PDF nun
      // unverändert in einem <iframe> an (Browser-natives PDF-Rendering). Das entfernt
      // die bisherige verlustbehaftete pdftoppm-Zwischenkonvertierung als potenzielle
      // eigene Fehlerquelle (Layoutverschiebungen, Auflösungsverlust) komplett —
      // die Vorschau zeigt jetzt exakt dasselbe Byte-für-Byte PDF wie der echte Download.
      res.set("Content-Type", "application/pdf");
      res.set("Cache-Control", "no-cache");
      return res.send(pdfBuf);
    } catch (e) {
      console.error("[PDF Vorschau] Error:", e);
      res.status(500).json({ message: asError(e) });
    }
  });

  // ─── E-Mail Versand ───────────────────────────────────────────────────────────
  app.post("/api/email/send", async (req, res) => {
    try {
      const { to, subject, body, type, refId } = req.body;
      // SMTP-Config aus Key-Value-Tabelle laden (schluessel/wert)
      const { data: einstellungenArr } = await supabase.from("einstellungen").select("schluessel,wert");
      const sm: Record<string, string> = {};
      for (const e of (einstellungenArr || [])) sm[e.schluessel] = e.wert;

      const smtpHost = sm.smtp_host || "";
      const smtpPort = Number(sm.smtp_port) || 587;
      const smtpUser = sm.smtp_user || "";
      const smtpPass = sm.smtp_passwort || sm.smtp_pass || "";
      const smtpFrom = sm.smtp_von || sm.smtp_from || smtpUser || sm.email || "info@schneggenburger.ch";
      const smtpSsl  = sm.smtp_ssl || "starttls";

      if (!smtpHost || !smtpUser || !smtpPass) {
        return res.json({ ok: false, message: "SMTP nicht konfiguriert. Bitte in Einstellungen > E-Mail ausfüllen (Host, Benutzer, Passwort)." });
      }

      try {
        const nodemailer = await import("nodemailer");
        const secure = smtpSsl === "ssl" || smtpPort === 465;
        const transporter = nodemailer.default.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure,
          auth: { user: smtpUser, pass: smtpPass },
          tls: secure ? undefined : { ciphers: "SSLv3" },
        });
        await transporter.sendMail({
          from: `"${sm.firmenname || "AuftragsPro"}" <${smtpFrom}>`,
          to,
          subject,
          text: body,
          html: body ? `<div style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;">${body.replace(/\n/g,"<br/>")}</div>` : undefined,
        });
        res.json({ ok: true, message: "E-Mail gesendet an " + to });
      } catch (nmErr: any) {
        console.error("SMTP Fehler:", nmErr.message);
        res.json({ ok: false, message: "SMTP-Fehler: " + (nmErr.message || "Verbindung fehlgeschlagen") });
      }
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });



  // ─── OFFERTE → AUFTRAG WORKFLOW ───────────────────────────────────────────────
  app.post("/api/offerten/:id/zu-auftrag", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: offerte, error: oErr } = await identity.client
        .from("offerten")
        .select("*")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (oErr || !offerte) return res.status(404).json({ message: "Offerte nicht gefunden" });

      // Bestehenden Auftrag laden für Nummernvergabe
      const { data: auftraege } = await identity.client
        .from("auftraege").select("nr").eq("tenant_id", identity.tenantId);
      const nr = nextNr("A", auftraege || []);

      const { data: neuerAuftrag, error: aErr } = await identity.client.from("auftraege").insert({
        id: uid(),
        nr,
        titel: offerte.projekt_beschreibung || `Auftrag aus Offerte ${offerte.nr}`,
        kunde: offerte.empfaenger_name || "",
        status: "bestaetigt",
        prioritaet: "mittel",
        beschreibung: `Automatisch erstellt aus Offerte ${offerte.nr}`,
        adresse: [offerte.empfaenger_strasse, offerte.empfaenger_plz].filter(Boolean).join(", "),
        created_at: new Date().toISOString(),
        tenant_id: identity.tenantId,
      }).select().single();

      if (aErr) return res.status(500).json({ message: aErr.message });

      // Offerte mit Auftrag verknüpfen
      await identity.client
        .from("offerten")
        .update({ auftrag_id: neuerAuftrag.id, status: "angenommen" })
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      await syncAngebotsBetrag(neuerAuftrag.id, identity);
      // Der frühere Auftrag verliert diese Offerte und braucht deshalb einen neuen Wert.
      if (offerte.auftrag_id && offerte.auftrag_id !== neuerAuftrag.id) {
        await syncAngebotsBetrag(offerte.auftrag_id, identity);
      }

      res.json(neuerAuftrag);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── LAGERVERWALTUNG ──────────────────────────────────────────────────────────
  function pickLagerArtikelFelder(input: any): Record<string, any> {
    return {
      artikelnummer: typeof input?.artikelnummer === "string" ? input.artikelnummer : null,
      bezeichnung: typeof input?.bezeichnung === "string" ? input.bezeichnung : null,
      kategorie: typeof input?.kategorie === "string" ? input.kategorie : null,
      einheit: typeof input?.einheit === "string" ? input.einheit : null,
      bestand: pickFiniteNumber(input?.bestand) ?? 0,
      mindestbestand: pickFiniteNumber(input?.mindestbestand) ?? 0,
      lagerort: typeof input?.lagerort === "string" ? input.lagerort : null,
      lieferant: typeof input?.lieferant === "string" ? input.lieferant : null,
      preis_pro_einheit: pickFiniteNumber(input?.preis_pro_einheit),
      notiz: typeof input?.notiz === "string" ? input.notiz : null,
    };
  }

  app.get("/api/lager", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("lager_artikel").select("*")
        .eq("tenant_id", identity.tenantId)
        .order("bezeichnung");
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/lager", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const eintrag = {
        id: uid(),
        ...pickLagerArtikelFelder(req.body),
        tenant_id: identity.tenantId,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await identity.client.from("lager_artikel").insert(eintrag).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/lager/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("lager_artikel").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) return res.status(500).json({ message: exErr.message });
      if (!existing) return res.status(404).json({ message: "Artikel nicht gefunden." });
      const { data, error } = await identity.client
        .from("lager_artikel").update(pickLagerArtikelFelder(req.body))
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId)
        .select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/lager/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("lager_artikel").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) return res.status(500).json({ message: exErr.message });
      if (!existing) return res.status(404).json({ message: "Artikel nicht gefunden." });
      const { error } = await identity.client
        .from("lager_artikel").delete()
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/lager/:id/buchung", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });

      // Typ validieren (nur eingang/ausgang zulassen)
      const typ = req.body?.typ === "eingang" ? "eingang" : req.body?.typ === "ausgang" ? "ausgang" : null;
      if (!typ) return res.status(400).json({ message: "Ungueltiger Buchungstyp." });

      // Menge validieren: positiver, endlicher Wert
      const menge = pickFiniteNumber(req.body?.menge);
      if (menge === null || menge <= 0) {
        return res.status(400).json({ message: "Menge muss eine positive Zahl sein." });
      }

      const notiz = typeof req.body?.notiz === "string" ? req.body.notiz : null;

      // Artikel mit Tenant-Check laden
      const { data: art, error: artErr } = await identity.client
        .from("lager_artikel").select("bestand")
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (artErr) return res.status(500).json({ message: artErr.message });
      if (!art) return res.status(404).json({ message: "Artikel nicht gefunden." });

      const alterBestand = Number(art.bestand) || 0;
      const neuerBestand = typ === "eingang"
        ? alterBestand + menge
        : Math.max(0, alterBestand - menge);

      // Bestand aktualisieren (mit Tenant-Guard in WHERE)
      const { data, error } = await identity.client
        .from("lager_artikel").update({ bestand: neuerBestand })
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId)
        .select().single();
      if (error) return res.status(500).json({ message: error.message });

      // Buchung mit tenant_id protokollieren
      await identity.client.from("lager_buchungen").insert({
        id: uid(),
        artikel_id: req.params.id,
        typ,
        menge,
        notiz,
        bestand_nach: neuerBestand,
        tenant_id: identity.tenantId,
        created_at: new Date().toISOString(),
      });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── LIEFERTERMINE ────────────────────────────────────────────────────────────
  function pickLiefertermineFelder(input: any): Record<string, any> {
    return {
      auftrag_id: typeof input?.auftrag_id === "string" ? input.auftrag_id : null,
      bezeichnung: typeof input?.bezeichnung === "string" ? input.bezeichnung : null,
      lieferant: typeof input?.lieferant === "string" ? input.lieferant : null,
      erwartet_am: typeof input?.erwartet_am === "string" ? input.erwartet_am : null,
      geliefert_am: typeof input?.geliefert_am === "string" ? input.geliefert_am : null,
      status: typeof input?.status === "string" ? input.status : "offen",
      notiz: typeof input?.notiz === "string" ? input.notiz : null,
    };
  }

  app.get("/api/liefertermine", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const auftrag_id = req.query.auftrag_id as string | undefined;
      let q = identity.client
        .from("liefertermine").select("*")
        .eq("tenant_id", identity.tenantId)
        .order("erwartet_am");
      if (auftrag_id) q = q.eq("auftrag_id", auftrag_id);
      const { data, error } = await q;
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/liefertermine", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const felder = pickLiefertermineFelder(req.body);
      if (!(await auftragGehoertZuTenant(identity, felder.auftrag_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const eintrag = {
        id: uid(),
        ...felder,
        tenant_id: identity.tenantId,
        created_at: new Date().toISOString(),
      };
      const { data, error } = await identity.client.from("liefertermine").insert(eintrag).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.put("/api/liefertermine/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("liefertermine").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) return res.status(500).json({ message: exErr.message });
      if (!existing) return res.status(404).json({ message: "Liefertermin nicht gefunden." });
      const felder = pickLiefertermineFelder(req.body);
      if (!(await auftragGehoertZuTenant(identity, felder.auftrag_id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("liefertermine").update(felder)
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId)
        .select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/liefertermine/:id", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: existing, error: exErr } = await identity.client
        .from("liefertermine").select("id").eq("id", req.params.id).eq("tenant_id", identity.tenantId).maybeSingle();
      if (exErr) return res.status(500).json({ message: exErr.message });
      if (!existing) return res.status(404).json({ message: "Liefertermin nicht gefunden." });
      const { error } = await identity.client
        .from("liefertermine").delete()
        .eq("id", req.params.id).eq("tenant_id", identity.tenantId);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });


  // ─── MWST-AUSWERTUNG ─────────────────────────────────────────────────────────
  app.get("/api/mwst/auswertung", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { jahr, quartal } = req.query as Record<string, string>;
      const y = parseInt(jahr) || new Date().getFullYear();
      const q = parseInt(quartal) || Math.floor(new Date().getMonth() / 3) + 1;

      const vonDate = new Date(y, (q - 1) * 3, 1);
      const bisDate = new Date(y, q * 3, 0);
      const von = vonDate.toISOString().slice(0, 10);
      const bis = bisDate.toISOString().slice(0, 10);

      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));
      const mwstSatz = parseFloat(sMap.mwst_satz || "8.1");

      // Ausgangsrechnungen — nur bezahlte (vereinnahmte Entgelte)
      const { data: ausgang } = await identity.client
        .from("rechnungen")
        .select("nr,betrag,bezahlt_am,auftrag_id")
        .eq("tenant_id", identity.tenantId)
        .not("bezahlt_am", "is", null)
        .gte("bezahlt_am", von)
        .lte("bezahlt_am", bis)
        .order("bezahlt_am");

      const auftragIds = Array.from(new Set((ausgang || []).map((r: any) => r.auftrag_id).filter(Boolean)));
      let auftraegeMap: Record<string, any> = {};
      if (auftragIds.length > 0) {
        const { data: auftraege } = await identity.client.from("auftraege").select("id,nr,kunde").eq("tenant_id", identity.tenantId).in("id", auftragIds);
        for (const a of (auftraege || [])) auftraegeMap[a.id] = a;
      }

      // Eingangsrechnungen — alle im Quartal (Vorsteuer nach Belegdatum)
      const { data: eingang } = await identity.client
        .from("eingangsrechnungen")
        .select("nr,betrag,datum,lieferant,mwst_betrag,mwst_prozent,status")
        .eq("tenant_id", identity.tenantId)
        .gte("datum", von)
        .lte("datum", bis)
        .order("datum");

      const ausgangDetails = (ausgang || []).map((r: any) => {
        const brutto = Number(r.betrag) || 0;
        const netto  = Math.round(brutto / (1 + mwstSatz / 100) * 100) / 100;
        const mwst   = Math.round((brutto - netto) * 100) / 100;
        return { nr: r.nr, datum: r.bezahlt_am, kunde: (auftraegeMap[r.auftrag_id]?.kunde || ""), brutto, netto, mwst };
      });

      const eingangDetails = (eingang || []).map((e: any) => {
        const brutto = Number(e.betrag) || 0;
        const vorsteuer = e.mwst_betrag
          ? Number(e.mwst_betrag)
          : Math.round(brutto / (1 + mwstSatz / 100) * (mwstSatz / 100) * 100) / 100;
        const netto = Math.round((brutto - vorsteuer) * 100) / 100;
        return { nr: e.nr, datum: e.datum, lieferant: e.lieferant || "", brutto, netto, vorsteuer, status: e.status || "offen" };
      });

      const ausgangBrutto   = ausgangDetails.reduce((s: number, r: any) => s + r.brutto, 0);
      const ausgangNetto    = ausgangDetails.reduce((s: number, r: any) => s + r.netto, 0);
      const ausgangMwst     = ausgangDetails.reduce((s: number, r: any) => s + r.mwst, 0);
      const eingangBrutto   = eingangDetails.reduce((s: number, e: any) => s + e.brutto, 0);
      const eingangNetto    = eingangDetails.reduce((s: number, e: any) => s + e.netto, 0);
      const eingangVorsteuer = eingangDetails.reduce((s: number, e: any) => s + e.vorsteuer, 0);
      const zahllast = Math.round((ausgangMwst - eingangVorsteuer) * 100) / 100;

      res.json({
        jahr: y, quartal: q, von, bis, mwstSatz,
        ausgang: {
          details: ausgangDetails,
          totalBrutto: Math.round(ausgangBrutto * 100) / 100,
          totalNetto:  Math.round(ausgangNetto * 100) / 100,
          totalMwst:   Math.round(ausgangMwst * 100) / 100,
        },
        eingang: {
          details: eingangDetails,
          totalBrutto:    Math.round(eingangBrutto * 100) / 100,
          totalNetto:     Math.round(eingangNetto * 100) / 100,
          totalVorsteuer: Math.round(eingangVorsteuer * 100) / 100,
        },
        zahllast,
      });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── FIBU-EXPORT ──────────────────────────────────────────────────────────────
  const handleFibuExport = async (
    res: Response,
    { query, tenantId }: ExportDownloadInput,
  ) => {
    try {
      const { von, bis, typ } = query;
      let lines: string[] = [];

      if (!typ || typ === "ausgangsrechnungen") {
        // Rechnungen mit Auftrag JOIN um Kundenname zu holen
        // Spalte heisst "erstellt" (nicht "datum")
        let q = supabase
          .from("rechnungen")
          .select("*, auftraege(kunde)")
          .order("erstellt");
        if (von) q = q.gte("erstellt", von);
        if (bis) q = q.lte("erstellt", bis);
        if (tenantId) q = q.eq("tenant_id", tenantId);
        const { data: rechnungen, error: rErr } = await q;
        if (rErr) {
          console.error("[FIBU] Ausgangsrechnungen Fehler:", rErr.message);
          return res.status(500).json({ message: "FIBU-Export der Ausgangsrechnungen fehlgeschlagen." });
        }
        // rechnungen.betrag ist in der DB NETTO (Positionssumme exkl. MWST) —
        // dieselbe Umrechnung wie bei Rechnungsliste/PDF (netto × 1.081 = brutto).
        lines.push("Typ;Nummer;Datum;Faellig;Empfaenger;Betrag_Netto_CHF;MWST_Satz_Prozent;MWST_Betrag_CHF;Betrag_Brutto_CHF;Bezahlt_am;Status");
        for (const r of (rechnungen || [])) {
          const netto = Number(r.betrag) || 0;
          const brutto = rechnungBruttoBetrag(netto);
          const mwst = Math.round((brutto - netto) * 100) / 100;
          // Datum: erstellt als ISO-Datum (nur Datumsteil)
          const datumStr = r.erstellt ? String(r.erstellt).slice(0, 10) : "";
          // Empfaenger: aus Auftrag.kunde (JOIN)
          const empfaenger = ((r as any).auftraege?.kunde || "").replace(/;/g, " ");
          lines.push(`Ausgangsrechnung;${r.nr || ""};${datumStr};${r.faellig_datum || ""};${empfaenger};${netto.toFixed(2)};${MWST_SATZ_RECHNUNG.toFixed(1)};${mwst.toFixed(2)};${brutto.toFixed(2)};${r.bezahlt_am || ""};${r.bezahlt_am ? "Bezahlt" : "Offen"}`);
        }
      }

      if (!typ || typ === "eingangsrechnungen") {
        // Eingangsrechnungen — Spalte ebenfalls "erstellt" pruefen
        const eingangsrechnungenQuery = supabase.from("eingangsrechnungen").select("*").order("erstellt");
        const eirResult = await (tenantId
          ? eingangsrechnungenQuery.eq("tenant_id", tenantId)
          : eingangsrechnungenQuery
        );
        const { data: eingang, error: eErr } = eirResult;
        if (eErr) {
          console.error("[FIBU] Eingangsrechnungen Fehler:", eErr.message);
          return res.status(500).json({ message: "FIBU-Export der Eingangsrechnungen fehlgeschlagen." });
        }
        if (!typ) lines.push(""); // Leerzeile Trennung
        // eingangsrechnungen.betrag ist der vom Lieferanten fakturierte Gesamtbetrag
        // (BRUTTO, inkl. MWST) — hier ist Brutto→Netto/MWST-Ableitung korrekt.
        lines.push("Typ;Nummer;Datum;Faellig;Lieferant;Betrag_Netto_CHF;MWST_Satz_Prozent;MWST_Betrag_CHF;Betrag_Brutto_CHF;Status");
        for (const e of (eingang || [])) {
          const brutto = Number(e.betrag) || 0;
          const netto = Math.round((brutto / (1 + MWST_SATZ_RECHNUNG / 100)) * 100) / 100;
          const mwst = Math.round((brutto - netto) * 100) / 100;
          const datumStr = (e.datum || e.erstellt || "");
          const datumFmt = datumStr ? String(datumStr).slice(0, 10) : "";
          lines.push(`Eingangsrechnung;${e.id || ""};${datumFmt};${e.faellig_datum || ""};${(e.lieferant || "").replace(/;/g, " ")};${netto.toFixed(2)};${MWST_SATZ_RECHNUNG.toFixed(1)};${mwst.toFixed(2)};${brutto.toFixed(2)};${e.status || "offen"}`);
        }
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"fibu-export.csv\"");
      res.send("\uFEFF" + lines.join("\r\n")); // BOM for Excel
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  };
  app.get("/api/export/fibu", (req, res) => {
    return handleFibuExport(res, {
      query: exportQueryFromRequest(req),
    });
  });

  // A Bearer-authenticated request mints a one-time URL. The subsequent native
  // browser GET intentionally has no Bearer header; its HMAC token is its auth.
  app.post("/api/downloads/sign", async (req: Request, res: Response) => {
    const parsedPath = allowedDownloadPath(req.body?.path);
    if (!parsedPath) {
      return res.status(400).json({ message: "Der angeforderte Download-Pfad ist nicht erlaubt." });
    }
    if (!req.auth?.userId || !req.auth.tenantId) {
      return res.status(401).json({ message: "Authentifizierung erforderlich." });
    }
    const targetPolicy = matchRoutePolicy("GET", parsedPath.pathname);
    if (!targetPolicy || targetPolicy.access === "public" || !isRoutePolicyAllowed(
      targetPolicy,
      req.auth.rolle,
      req.auth.berechtigungen,
    )) {
      return res.status(403).json({ message: "Keine Berechtigung für diesen Download." });
    }

    const signedPath = `${parsedPath.pathname}${parsedPath.search}`;
    const token = createDownloadToken({
      userId: req.auth.userId,
      tenantId: req.auth.tenantId,
      path: signedPath,
    });
    return res.json({ downloadUrl: `/api/downloads/fetch?token=${encodeURIComponent(token)}` });
  });

  app.get("/api/downloads/fetch", async (req: Request, res: Response) => {
    const validation = validateAndConsumeDownloadToken(req.query.token);
    if (!validation.ok) {
      return res.status(403).json({ message: validation.message });
    }

    const parsedPath = allowedDownloadPath(validation.claims.path);
    if (!parsedPath) {
      return res.status(403).json({ message: "Download-Token enthält keinen erlaubten Download-Pfad." });
    }

    const exportQuery = exportQueryFromSearchParams(parsedPath.searchParams);

    try {
      return await runWithSupabaseClient(getServiceRoleClient(), async () => {
        if (parsedPath.pathname === "/api/export/fibu") {
          return handleFibuExport(res, {
            query: exportQuery,
            tenantId: validation.claims.tenant,
          });
        }
        if (parsedPath.pathname === "/api/export/q3") {
          return handleQ3Export(res, {
            query: exportQuery,
            tenantId: validation.claims.tenant,
          });
        }

        const matches = parsedPath.pathname.match(/^\/api\/auftraege\/([^/?#]+)\/dokumente\/([^/?#]+)\/download$/);
        if (!matches) {
          return res.status(403).json({ message: "Download-Token enthält keinen erlaubten Download-Pfad." });
        }
        return handleDocumentDownload(res, {
          auftragId: decodeURIComponent(matches[1]),
          documentId: decodeURIComponent(matches[2]),
          tenantId: validation.claims.tenant,
        });
      });
    } catch (e) {
      return res.status(503).json({ message: `Download ist derzeit nicht verfügbar: ${asError(e)}` });
    }
  });


  // ─── WIEDERKEHRENDE AUFTRÄGE ─────────────────────────────────────────────────
  app.post("/api/auftraege/:id/wiederholen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data: orig, error } = await identity.client
        .from("auftraege")
        .select("*")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (error || !orig) return res.status(404).json({ message: "Nicht gefunden" });
      
      // Interval → nächstes Datum berechnen
      const interval = orig.wiederkehrend_interval;
      if (!interval) return res.status(400).json({ message: "Kein Interval definiert" });
      
      const now = new Date();
      let nextDate = new Date(now);
      if (interval === "monatlich") nextDate.setMonth(now.getMonth() + 1);
      else if (interval === "quartalsweise") nextDate.setMonth(now.getMonth() + 3);
      else if (interval === "halbjaehrlich") nextDate.setMonth(now.getMonth() + 6);
      else if (interval === "jaehrlich") nextDate.setFullYear(now.getFullYear() + 1);
      
      // Neue Auftragsnummer generieren
      const { data: allNrW } = await identity.client
        .from("auftraege")
        .select("nr")
        .eq("tenant_id", identity.tenantId);
      const yyW = String(new Date().getFullYear()).slice(-2);
      const maxW = (allNrW || []).reduce((mx: number, a: any) => {
        const nr = String(a.nr || "");
        const m1 = nr.match(/^A(\d{2})(\d{4})$/);
        if (m1) return Math.max(mx, parseInt(m1[2], 10));
        const m2 = nr.match(/A-\d{4}-(\d+)/);
        if (m2) return Math.max(mx, parseInt(m2[1], 10));
        return mx;
      }, 0);
      const newNr = `A${yyW}${String(maxW + 1).padStart(4, "0")}`;
      
      // Neuen Auftrag erstellen (gleiche Daten, neue Nr + aktuelles Datum)
      const { data: newAuftrag, error: err2 } = await identity.client.from("auftraege").insert({
        nr: newNr,
        titel: orig.titel,
        kunde: orig.kunde,
        kunde_adresse: orig.kunde_adresse,
        kunde_email: orig.kunde_email,
        kunde_telefon: orig.kunde_telefon,
        beschreibung: orig.beschreibung,
        status: "bestaetigt",
        prioritaet: orig.prioritaet,
        kategorie: orig.kategorie,
        start_datum: new Date().toISOString().slice(0, 10),
        angebots_betrag: orig.angebots_betrag,
        waehrung: orig.waehrung || "CHF",
        verantwortlicher: orig.verantwortlicher,
        wiederkehrend_interval: orig.wiederkehrend_interval,
        naechste_faelligkeit: nextDate.toISOString().slice(0, 10),
        tenant_id: identity.tenantId,
      }).select().single();
      
      if (err2) return res.status(500).json({ message: err2.message });
      
      // Original: naechste_faelligkeit aktualisieren
      await identity.client
        .from("auftraege")
        .update({ naechste_faelligkeit: nextDate.toISOString().slice(0, 10) })
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId);
      
      res.json(newAuftrag);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── BACKUP ───────────────────────────────────────────────────────────────────────────
  // Nur Admins dürfen Backups ziehen. Sensible Spalten von app_benutzer und
  // sensible einstellungen-Rows (Passwort-Hashes, TOTP-Secrets, Backup-Codes,
  // Trust-Tokens, SMTP/App-Passwort) werden aus dem Export entfernt.
  app.get("/api/backup", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!isAdminIdentity(identity)) return res.status(403).json({ message: "Nur Administratoren." });
      const tabellen = [
        "auftraege", "kunden", "rechnungen", "eingangsrechnungen",
        "zeiteintraege", "mitarbeiter", "kalkulationen", "kalkulation_positionen",
        "mahnungen", "verlauf", "notizen", "dokumente", "dokument_daten",
        "rechnungsvorlagen", "lieferanten", "ferien", "einstellungen",
        "auftrag_schritte", "auftrag_schritt_fotos", "app_benutzer",
      ];
      const SENSITIVE_COLUMNS: Record<string, Set<string>> = {
        app_benutzer: new Set([
          "passwort_hash", "totp_secret", "backup_codes",
          "vertrauens_tokens", "vertrauens_token",
        ]),
      };
      const SENSITIVE_SETTING_ROW_KEYS = new Set([
        "smtp_passwort", "smtp_pass", "app_passwort",
      ]);

      const backup: Record<string, any[]> = {};
      for (const tabelle of tabellen) {
        try {
          const { data } = await identity.client
            .from(tabelle)
            .select("*")
            .eq("tenant_id", identity.tenantId);
          let rows = (data || []) as Array<Record<string, unknown>>;
          if (tabelle === "einstellungen") {
            rows = rows.filter((row) => !SENSITIVE_SETTING_ROW_KEYS.has(String(row.schluessel ?? "")));
          }
          const sensitive = SENSITIVE_COLUMNS[tabelle];
          if (sensitive && sensitive.size > 0) {
            rows = rows.map((row) => {
              const copy: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(row)) {
                if (!sensitive.has(k)) copy[k] = v;
              }
              return copy;
            });
          }
          backup[tabelle] = rows;
        } catch {
          backup[tabelle] = [];
        }
      }
      const sMap = einstellungenMap(await ladeTenantEinstellungen(identity));
      const now = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="auftragspro-backup-${now}.json"`);
      res.json({
        erstellt_am: new Date().toISOString(),
        version: "1.1",
        tenant_id: identity.tenantId,
        firma: firmennameAusSettings(sMap),
        daten: backup,
      });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── PROJEKTSTATUS (public) ───────────────────────────────────────────────────────────────
  app.get("/api/public/auftrag/:token", async (req, res) => {
    try {
      const { data, error } = await supabase.from("auftraege")
        .select("id,nr,titel,status,beschreibung,start_datum,end_datum,public_token,kunden_nachricht,tenant_id")
        .eq("public_token", req.params.token)
        .single();
      if (error || !data) return res.status(404).json({ message: "Nicht gefunden" });
      // Ablaufdatum prüfen: Link ungültig nach Auftrag-Enddatum (+ 7 Tage Kulanz)
      if (data.end_datum) {
        const ablauf = new Date(data.end_datum);
        ablauf.setDate(ablauf.getDate() + 7); // 7 Tage Kulanzzeit
        if (new Date() > ablauf) {
          return res.status(410).json({ message: "abgelaufen", end_datum: data.end_datum });
        }
      }
      // Arbeitsschritte inkl. Fotos laden
      const { data: schritte } = await supabase.from("auftrag_schritte")
        .select("id,titel,status,reihenfolge,erledigt_am").eq("auftrag_id", data.id).eq("tenant_id", data.tenant_id)
        .order("reihenfolge", { ascending: true });
      // Fotos für alle Schritte laden
      const schrittIds = (schritte || []).map((s: any) => s.id);
      let fotosMap: Record<string, any[]> = {};
      if (schrittIds.length > 0) {
        const { data: fotos } = await supabase.from("auftrag_schritt_fotos")
          .select("id,schritt_id,url,dateiname,erstellt_am")
          .in("schritt_id", schrittIds)
          .eq("tenant_id", data.tenant_id)
          .order("erstellt_am", { ascending: true });
        for (const f of (fotos || [])) {
          if (!fotosMap[f.schritt_id]) fotosMap[f.schritt_id] = [];
          fotosMap[f.schritt_id].push(f);
        }
      }
      const schritteMitFotos = (schritte || []).map((s: any) => ({ ...s, fotos: fotosMap[s.id] || [] }));
      const { data: brandingRows } = await supabase
        .from("einstellungen")
        .select("schluessel,wert")
        .eq("tenant_id", data.tenant_id)
        .in("schluessel", ["firmenname", "firmenlogo", "farbe_primaer", "produktname", "adresse", "plz_ort", "telefon"]);
      const brandingSettings = einstellungenMap((brandingRows || []) as Array<{ schluessel: string; wert: string | null }>);
      const { tenant_id: _tenantId, ...publicAuftrag } = data;
      res.json({
        ...publicAuftrag,
        schritte: schritteMitFotos,
        branding: {
          firmenname: firmennameAusSettings(brandingSettings),
          firmenlogo: brandingSettings.firmenlogo || "",
          farbe_primaer: brandingSettings.farbe_primaer || "#44546a",
          produktname: brandingSettings.produktname || "AuftragsPro",
          adresse: brandingSettings.adresse || "",
          plz_ort: brandingSettings.plz_ort || "",
          telefon: brandingSettings.telefon || "",
        },
      });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:id/generate-token", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      // Lesbarer Slug: Auftragsnummer + Titel, z.B. "a-2026-0001-liege"
      const { data: auftrag } = await identity.client
        .from("auftraege")
        .select("nr,titel")
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden." });
      // Slug: Auftragsnr (uppercase) + Titel-slug, z.B. A260001-liege
      const nrRaw = (auftrag?.nr || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
      const titelSlug = (auftrag?.titel || "").toLowerCase()
        .replace(/\u00e4/g, "ae").replace(/\u00f6/g, "oe").replace(/\u00fc/g, "ue")
        .replace(/\u00df/g, "ss")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
      const slug = (nrRaw && titelSlug) ? nrRaw + "-" + titelSlug
                 : nrRaw || titelSlug || uid();
      // Eindeutigkeit sicherstellen: pruefen ob slug schon vergeben
      const { data: existing } = await identity.client
        .from("auftraege")
        .select("id")
        .eq("public_token", slug)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      const finalToken = existing && existing.id !== req.params.id ? `${slug}-${uid().slice(0, 4)}` : slug;
      const { data, error } = await identity.client
        .from("auftraege")
        .update({ public_token: finalToken })
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select("public_token")
        .maybeSingle();
      if (error) return res.status(500).json({ message: error.message });
      if (!data) return res.status(404).json({ message: "Auftrag nicht gefunden." });
      res.json({ token: data.public_token });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/auftraege/:id/generate-token", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      const { data, error } = await identity.client
        .from("auftraege")
        .update({ public_token: null })
        .eq("id", req.params.id)
        .eq("tenant_id", identity.tenantId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ message: "Auftrag nicht gefunden." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Arbeitsschritte (Kundenportal) ────────────────────────────────────────
  app.get("/api/auftraege/:id/schritte", async (req, res) => {
    try {
      const { data, error } = await supabase.from("auftrag_schritte")
        .select("*").eq("auftrag_id", req.params.id).order("reihenfolge", { ascending: true });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.post("/api/auftraege/:id/schritte", async (req, res) => {
    try {
      const { titel, status, reihenfolge } = req.body;
      const { data, error } = await supabase.from("auftrag_schritte").insert({
        id: uid(), auftrag_id: req.params.id,
        titel: titel || "", status: status || "offen", reihenfolge: reihenfolge ?? 0
      }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.patch("/api/auftraege/:id/schritte/:sid", async (req, res) => {
    try {
      const { titel, status, reihenfolge } = req.body;
      const updates: any = {};
      if (titel !== undefined) updates.titel = titel;
      if (status !== undefined) {
        updates.status = status;
        // erledigt_am automatisch setzen/löschen
        if (status === "erledigt") {
          updates.erledigt_am = new Date().toISOString();
        } else {
          updates.erledigt_am = null;
        }
      }
      if (reihenfolge !== undefined) updates.reihenfolge = reihenfolge;
      const { data, error } = await supabase.from("auftrag_schritte")
        .update(updates).eq("id", req.params.sid).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  app.delete("/api/auftraege/:id/schritte/:sid", async (req, res) => {
    try {
      const { data: fotosZuLoeschen } = await supabase
        .from("auftrag_schritt_fotos")
        .select("url")
        .eq("schritt_id", req.params.sid);
      const storagePfade = (fotosZuLoeschen || [])
        .map((f: any) => f.url?.split("/schritt-fotos/")[1])
        .filter(Boolean);
      if (storagePfade.length > 0) {
        await supabase.storage.from("schritt-fotos").remove(storagePfade);
      }
      await supabase.from("auftrag_schritt_fotos").delete().eq("schritt_id", req.params.sid);
      await supabase.from("auftrag_schritte").delete().eq("id", req.params.sid);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Schritt-Fotos ───────────────────────────────────────────────────────────
  // Grenzt Base64-Payloads auf ~20 MB Rohdaten (≈27 MB Base64) ein.
  const SCHRITT_FOTO_MAX_BASE64_LEN = 27_000_000;

  // Foto hochladen (base64 → Supabase Storage)
  app.post("/api/auftraege/:id/schritte/:sid/fotos", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const body = req.body || {};
      const base64 = typeof body.base64 === "string" ? body.base64 : "";
      if (!base64) return res.status(400).json({ message: "Kein Bild" });
      if (base64.length > SCHRITT_FOTO_MAX_BASE64_LEN) {
        return res.status(413).json({ message: "Foto übersteigt die maximale Grösse." });
      }
      const dateinameRaw = typeof body.dateiname === "string" ? body.dateiname : "";
      const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
      const ext = (dateinameRaw || "foto.jpg").split(".").pop() || "jpg";
      const fname = `${identity.tenantId}/${req.params.sid}/${uid()}.${ext}`;
      const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      const { error: upErr } = await supabase.storage.from("schritt-fotos").upload(fname, buf, {
        contentType: mimeType, upsert: false
      });
      if (upErr) return res.status(500).json({ message: upErr.message });
      const { data: { publicUrl } } = supabase.storage.from("schritt-fotos").getPublicUrl(fname);
      const { data, error } = await identity.client.from("auftrag_schritt_fotos").insert({
        id: uid(),
        schritt_id: req.params.sid,
        auftrag_id: req.params.id,
        url: publicUrl,
        dateiname: dateinameRaw || fname,
        tenant_id: identity.tenantId,
      }).select().single();
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // Fotos eines Schritts abrufen
  app.get("/api/auftraege/:id/schritte/:sid/fotos", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data, error } = await identity.client
        .from("auftrag_schritt_fotos")
        .select("*")
        .eq("schritt_id", req.params.sid)
        .eq("tenant_id", identity.tenantId)
        .order("erstellt_am", { ascending: true });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data || []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // Foto löschen
  app.delete("/api/auftraege/:id/schritte/:sid/fotos/:fid", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) return res.status(401).json({ message: "Authentifizierung erforderlich." });
      if (!(await auftragGehoertZuTenant(identity, req.params.id))) {
        return res.status(404).json({ message: "Auftrag nicht gefunden." });
      }
      const { data: foto } = await identity.client
        .from("auftrag_schritt_fotos")
        .select("id, url, schritt_id")
        .eq("id", req.params.fid)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (!foto) return res.status(404).json({ message: "Foto nicht gefunden" });
      if (foto.schritt_id !== req.params.sid) {
        return res.status(404).json({ message: "Foto nicht gefunden" });
      }
      if (foto.url) {
        // Storage-Pfad aus URL extrahieren; nur akzeptieren wenn der Pfad
        // mit dem eingeloggten Tenant beginnt (schuetzt vor manipulierten URLs).
        const parts = foto.url.split("/schritt-fotos/");
        const path = parts.length > 1 ? parts[1] : "";
        if (path && path.startsWith(`${identity.tenantId}/`) && !path.includes("..")) {
          await supabase.storage.from("schritt-fotos").remove([path]);
        }
      }
      const { error } = await identity.client
        .from("auftrag_schritt_fotos")
        .delete()
        .eq("id", req.params.fid)
        .eq("tenant_id", identity.tenantId);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // Public: Schritte inkl. Fotos (bereits in /api/public/auftrag/:token enthalten – hier separat)
  // Die /api/public/auftrag/:token Route holt schritte bereits – wir ergänzen dort die Fotos:

  // ─── Positionsliste ────────────────────────────────────────────────────────

  // Zielbereich einer Lohn-Position in der Vorkalkulation. Der Wert wird beim Erfassen
  // der Position explizit gewählt (Dropdown "Bereich"); die Schlüssel müssen mit
  // LOHN_BEREICHE in client/src/components/PositionenTab.tsx übereinstimmen.
  const LOHN_BEREICH_MAP: Record<string, { ort: string; maschinenpark: string | null; bereich: string }> = {
    "Avor::": { ort: "Avor", maschinenpark: null, bereich: "Planung/AVOR" },
    "Werkstatt::Kleine Maschinen": { ort: "Werkstatt", maschinenpark: "Kleine Maschinen", bereich: "Werkstatt" },
    "Werkstatt::Mittlere Maschinen": { ort: "Werkstatt", maschinenpark: "Mittlere Maschinen", bereich: "Werkstatt" },
    "Werkstatt::Grosse Maschinen": { ort: "Werkstatt", maschinenpark: "Grosse Maschinen", bereich: "Werkstatt" },
    "Montage::": { ort: "Montage", maschinenpark: null, bereich: "Montage" },
  };

  // Die Spalte auftrag_positionen.lohn_bereich kommt per Migration nach
  // (supabase/migrations/20260731_auftrag_positionen_lohn_bereich.sql). Solange sie in der
  // Datenbank fehlt, darf das Erfassen von Positionen nicht komplett scheitern.
  const lohnBereichSpalteFehlt = (error: any): boolean =>
    (error?.code === "42703" || error?.code === "PGRST204") &&
    String(error?.message ?? "").includes("lohn_bereich");

  const SPALTE_FEHLT_HINWEIS =
    'Die Datenbank kennt das Feld "Bereich" noch nicht. Bitte die Migration ' +
    "20260731_auftrag_positionen_lohn_bereich.sql in Supabase ausführen.";

  // GET alle Positionen eines Auftrags
  app.get("/api/auftraege/:id/positionen", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("auftrag_positionen")
        .select("*")
        .eq("auftrag_id", req.params.id)
        .order("position", { ascending: true });
      if (error) return res.status(500).json({ message: error.message });
      res.json(data ?? []);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST neue Position
  app.post("/api/auftraege/:id/positionen", async (req, res) => {
    try {
      const { bezeichnung, beschreibung, kategorie, menge, einheit, einzelpreis, lohn_bereich } = req.body;
      if (!bezeichnung) return res.status(400).json({ message: "Bezeichnung fehlt" });

      // Nächste Positionsnummer ermitteln
      const { data: existing } = await supabase
        .from("auftrag_positionen")
        .select("position")
        .eq("auftrag_id", req.params.id)
        .order("position", { ascending: false })
        .limit(1);
      const naechstePos = existing && existing.length > 0 ? existing[0].position + 1 : 1;

      const basis = {
        auftrag_id: req.params.id,
        position: naechstePos,
        bezeichnung: bezeichnung.trim(),
        beschreibung: beschreibung?.trim() ?? null,
        kategorie: kategorie ?? "material",
        menge: parseFloat(menge) || 0,
        einheit: einheit ?? "Stk",
        einzelpreis: parseFloat(einzelpreis) || 0,
      };
      const zielBereich = kategorie === "lohn" && LOHN_BEREICH_MAP[lohn_bereich] ? lohn_bereich : null;

      let { data, error } = await supabase
        .from("auftrag_positionen")
        .insert({ ...basis, lohn_bereich: zielBereich })
        .select()
        .single();
      if (error && lohnBereichSpalteFehlt(error)) {
        ({ data, error } = await supabase.from("auftrag_positionen").insert(basis).select().single());
      }
      if (error) return res.status(500).json({ message: error.message });
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // PATCH Position bearbeiten
  app.patch("/api/auftraege/:id/positionen/:pid", async (req, res) => {
    try {
      const felder: any = {};
      const erlaubt = ["bezeichnung","beschreibung","kategorie","menge","einheit","einzelpreis","position","lohn_bereich"];
      for (const k of erlaubt) {
        if (req.body[k] !== undefined) {
          felder[k] = ["menge","einzelpreis","position"].includes(k)
            ? parseFloat(req.body[k])
            : req.body[k];
        }
      }
      felder.aktualisiert_am = new Date().toISOString();
      const { data, error } = await supabase
        .from("auftrag_positionen")
        .update(felder)
        .eq("id", req.params.pid)
        .eq("auftrag_id", req.params.id)
        .select()
        .single();
      if (error) {
        if (lohnBereichSpalteFehlt(error)) return res.status(400).json({ message: SPALTE_FEHLT_HINWEIS });
        return res.status(500).json({ message: error.message });
      }
      res.json(data);
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // DELETE Position löschen
  app.delete("/api/auftraege/:id/positionen/:pid", async (req, res) => {
    try {
      const { error } = await supabase
        .from("auftrag_positionen")
        .delete()
        .eq("id", req.params.pid)
        .eq("auftrag_id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // POST /api/auftraege/:id/positionen/import-vorkalkulation
  // Importiert auftrag_positionen → vorkalkulation_stunden / _material / _fremdleistungen
  // Überschreibt bestehende Einträge (löscht zuerst, dann neu einfügen)
  app.post("/api/auftraege/:id/positionen/import-vorkalkulation", async (req, res) => {
    try {
      const { id } = req.params;
      const { modus } = req.body; // "merge" | "replace" (default: replace)

      // 1. Positionen laden
      const { data: positionen, error: posErr } = await supabase
        .from("auftrag_positionen")
        .select("*")
        .eq("auftrag_id", id)
        .order("position", { ascending: true });
      if (posErr) return res.status(500).json({ message: posErr.message });
      if (!positionen || positionen.length === 0)
        return res.status(400).json({ message: "Keine Positionen vorhanden" });

      const materialPos = positionen.filter((p: any) => p.kategorie === "material");
      const fremdPos    = positionen.filter((p: any) => p.kategorie === "fremdleistung");
      const lohnPos     = positionen.filter((p: any) => p.kategorie === "lohn");

      // Der Bereich wird nie aus der Bezeichnung geraten: fehlt er, bricht der Import ab
      // und die Oberfläche fragt ihn für die betroffenen Positionen nach.
      const ohneBereich = lohnPos.filter((p: any) => !LOHN_BEREICH_MAP[p.lohn_bereich]);
      if (ohneBereich.length > 0) {
        return res.status(400).json({
          message:
            "Bei diesen Lohn-Positionen fehlt der Bereich: " +
            ohneBereich.map((p: any) => `${p.position}. ${p.bezeichnung}`).join(", "),
        });
      }

      // 2. Bei "replace" (Standard): bestehende VK-Einträge löschen
      if (modus !== "merge") {
        await supabase.from("vorkalkulation_material").delete().eq("auftrag_id", id);
        await supabase.from("vorkalkulation_fremdleistungen").delete().eq("auftrag_id", id);
        if (lohnPos.length > 0) await supabase.from("vorkalkulation_stunden").delete().eq("auftrag_id", id);
      }

      // 3. Material-Positionen → vorkalkulation_material
      let matCount = 0;
      for (const p of materialPos) {
        const row = {
          id: uid(),
          auftrag_id: id,
          pos: p.position,
          profil: p.bezeichnung,
          bemerkung: p.beschreibung || "",
          stueck: p.menge,
          laenge_mm: null,
          kg_pro_m: null,
          total_kg: null,
          preis_pro_einheit: p.einzelpreis,
          total_chf: Math.round(p.menge * p.einzelpreis * 100) / 100,
        };
        const { error } = await supabase.from("vorkalkulation_material").insert(row);
        if (!error) matCount++;
      }

      // 4. Fremdleistungs-Positionen → vorkalkulation_fremdleistungen
      let fremdCount = 0;
      for (const p of fremdPos) {
        const row = {
          id: uid(),
          auftrag_id: id,
          bezeichnung: p.bezeichnung,
          anzahl: p.menge,
          einheit: p.einheit,
          preis_pro_einheit: p.einzelpreis,
          total_chf: Math.round(p.menge * p.einzelpreis * 100) / 100,
        };
        const { error } = await supabase.from("vorkalkulation_fremdleistungen").insert(row);
        if (!error) fremdCount++;
      }

      // 5. Lohn-Positionen → vorkalkulation_stunden.
      // Pro Ort/Maschinenpark wird EINE Zeile geschrieben: die Stunden-Ansicht unter
      // /auftraege/:id/kalkulation zeigt genau die fünf festen Bereiche an und speichert
      // sie als Vollersatz zurück — mehrere Zeilen im selben Bereich gingen dort verloren.
      const { data: saetze } = await supabase.from("stundensaetze").select("*");
      const eingestellterSatz = (ort: string, maschine: string | null): number => {
        const m = (saetze || []).find((s: any) =>
          ort === "Werkstatt" ? s.ort === "Werkstatt" && s.maschinenpark === maschine : s.ort === ort && !s.maschinenpark);
        if (!m) return 0;
        if (ort === "Werkstatt" && m.grundsatz) return Number(m.grundsatz) + Number(m.satz);
        return Number(m.satz);
      };

      const lohnBuckets: { ort: string; maschinenpark: string | null; bereich: string; stunden: number; namen: string[] }[] = [];
      for (const p of lohnPos) {
        const b = LOHN_BEREICH_MAP[p.lohn_bereich];
        let eintrag = lohnBuckets.find((x) => x.ort === b.ort && x.maschinenpark === b.maschinenpark);
        if (!eintrag) {
          eintrag = { ...b, stunden: 0, namen: [] };
          lohnBuckets.push(eintrag);
        }
        eintrag.stunden += Number(p.menge) || 0;
        if (p.bezeichnung) eintrag.namen.push(p.bezeichnung);
      }

      let lohnCount = 0;
      for (const b of lohnBuckets) {
        // Stundensatz aus Einstellungen → Vorkalkulation rechnet mit internen Kostensätzen,
        // nicht mit dem Verkaufspreis aus der Positionsliste.
        const satz = eingestellterSatz(b.ort, b.maschinenpark);
        const { error } = await supabase.from("vorkalkulation_stunden").insert({
          id: uid(),
          auftrag_id: id,
          ort: b.ort,
          maschinenpark: b.maschinenpark,
          bereich: b.bereich,
          bezeichnung: b.namen.join(", ").slice(0, 200) || null,
          soll_stunden: Math.round(b.stunden * 100) / 100,
          stundensatz: satz,
        });
        if (!error) lohnCount++;
      }

      res.json({
        ok: true,
        importiert: { material: matCount, fremdleistungen: fremdCount, lohn: lohnCount },
        lohn_stunden: Math.round(lohnBuckets.reduce((s, b) => s + b.stunden, 0) * 100) / 100,
      });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─────────────────────────────────────────────────────────────────────────────

  // Kunden-Nachricht speichern
  app.patch("/api/auftraege/:id/kunden-nachricht", async (req, res) => {
    try {
      const { kunden_nachricht } = req.body;
      const { error } = await supabase.from("auftraege")
        .update({ kunden_nachricht: kunden_nachricht ?? "" }).eq("id", req.params.id);
      if (error) return res.status(500).json({ message: error.message });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ message: asError(e) }); }
  });

  // ─── Dashboard-Präferenzen (pro User und Tenant) ────────────────────────────
  type DashboardPreferenceIdentity = {
    userId: string;
    tenantId: string;
    rolle: string;
    client: typeof supabase;
  };

  function dashboardPreferenceIdentity(req: Request): DashboardPreferenceIdentity | null {
    if (req.auth?.userId && req.auth.tenantId) {
      return {
        userId: req.auth.userId,
        tenantId: req.auth.tenantId,
        rolle: typeof req.auth.rolle === "string" ? req.auth.rolle : "",
        client: supabase,
      };
    }

    // Der Legacy-Login enthält die verifizierte app_benutzer-ID, aber noch
    // keinen JWT für die neue RLS-Tabelle. Der Zugriff bleibt daher explizit
    // auf diese User-ID und den zentralen Default-Tenant begrenzt.
    if (req.legacyAuth?.userId) {
      return {
        userId: req.legacyAuth.userId,
        tenantId: getDefaultTenantId(),
        rolle: typeof req.legacyAuth.rolle === "string" ? req.legacyAuth.rolle : "",
        client: getServiceRoleClient(),
      };
    }

    return null;
  }

  function isAdminIdentity(identity: DashboardPreferenceIdentity | null): boolean {
    return identity !== null && identity.rolle === "admin";
  }

  // ─── Nachkalkulations-Abschluss ─────────────────────────────────────────────
  // Die Statusspalte liegt bewusst beim Auftrag: Die aktive Nachkalkulation
  // besteht aus mehreren Detailtabellen und hat keine eigene Kopfzeile. Ein
  // Abschluss ist nur nach mindestens einer positiven IST-Position möglich.
  app.patch("/api/nachkalkulation/:id/status", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }
      if (req.body?.status !== "abgeschlossen") {
        return res.status(400).json({ message: "Nur der Status 'abgeschlossen' kann hier gesetzt werden." });
      }

      const auftragId = req.params.id;
      const { data: auftrag, error: auftragError } = await identity.client
        .from("auftraege")
        .select("id")
        .eq("id", auftragId)
        .eq("tenant_id", identity.tenantId)
        .maybeSingle();
      if (auftragError) throw auftragError;
      if (!auftrag) return res.status(404).json({ message: "Auftrag nicht gefunden." });

      const minDataChecks = await Promise.all([
        identity.client.from("zeiteintraege").select("id").eq("tenant_id", identity.tenantId).eq("auftrag_id", auftragId).gt("dauer_minuten", 0).limit(1),
        identity.client.from("nachkalkulation_stunden").select("id").eq("tenant_id", identity.tenantId).eq("auftrag_id", auftragId).eq("quelle", "manuell").or("ist_stunden.gt.0,total_chf.gt.0").limit(1),
        identity.client.from("nachkalkulation_material").select("id").eq("tenant_id", identity.tenantId).eq("auftrag_id", auftragId).gt("betrag_chf", 0).limit(1),
        identity.client.from("nachkalkulation_fremdleistungen").select("id").eq("tenant_id", identity.tenantId).eq("auftrag_id", auftragId).gt("betrag_chf", 0).limit(1),
        identity.client.from("nachkalkulation_soek").select("id").eq("tenant_id", identity.tenantId).eq("auftrag_id", auftragId).gt("total_chf", 0).limit(1),
      ]);
      for (const check of minDataChecks) {
        if (check.error) throw check.error;
      }
      if (!minDataChecks.some((check) => (check.data || []).length > 0)) {
        return res.status(422).json({
          message: "Für den Abschluss muss mindestens eine positive IST-Stunden-, Material-, Fremdleistungs- oder SOEK-Position erfasst sein.",
        });
      }

      const now = new Date().toISOString();
      const { data, error } = await identity.client
        .from("auftraege")
        .update({
          nachkalkulation_status: "abgeschlossen",
          nachkalkulation_abgeschlossen_am: now,
          aktualisiert: now,
        })
        .eq("id", auftragId)
        .eq("tenant_id", identity.tenantId)
        .select("id, nachkalkulation_status, nachkalkulation_abgeschlossen_am")
        .single();
      if (error) throw error;
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  const parseDashboardPreferences = (body: unknown):
    | { preferences: DashboardPreferences }
    | { message: string } => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { message: "Ungültiger Preferences-Body." };
    }

    const input = body as Record<string, unknown>;
    const visibleWidgets = input.visible_widgets;
    const widgetOrder = input.widget_order;
    const reminderSettings = input.reminder_settings;

    if (!Array.isArray(visibleWidgets)
      || visibleWidgets.some((id) => !isDashboardWidgetId(id))
      || new Set(visibleWidgets).size !== visibleWidgets.length) {
      return { message: "visible_widgets darf nur eindeutige bekannte Widget-IDs enthalten." };
    }

    if (!Array.isArray(widgetOrder)
      || widgetOrder.some((id) => !isDashboardWidgetId(id))
      || new Set(widgetOrder).size !== widgetOrder.length) {
      return { message: "widget_order darf nur eindeutige bekannte Widget-IDs enthalten." };
    }

    const normalized = normalizeDashboardPreferences({
      visible_widgets: visibleWidgets as DashboardWidgetId[],
      widget_order: widgetOrder as DashboardWidgetId[],
    });

    // Eine Reihenfolge ist nur eindeutig, wenn jede aktuell bekannte Kachel
    // exakt einmal enthalten ist. Neue Widgets werden so nicht versehentlich
    // aus der gespeicherten Konfiguration ausgeschlossen.
    if (widgetOrder.length !== normalized.widget_order.length) {
      return { message: "widget_order muss jede bekannte Widget-ID exakt einmal enthalten." };
    }

    if (!reminderSettings || typeof reminderSettings !== "object" || Array.isArray(reminderSettings)) {
      return { message: "reminder_settings muss ein Objekt sein." };
    }
    const reminderInput = reminderSettings as Record<string, unknown>;
    const reminderKeys = Object.keys(reminderInput);
    if (reminderKeys.some((key) => !isDashboardReminderSettingId(key))
      || reminderKeys.length !== Object.keys(normalized.reminder_settings).length
      || reminderKeys.some((key) => typeof reminderInput[key] !== "boolean")) {
      return { message: "reminder_settings darf nur alle bekannten Reminder-Schlüssel mit Boolean-Werten enthalten." };
    }

    return {
      preferences: {
        visible_widgets: [...visibleWidgets] as DashboardWidgetId[],
        widget_order: [...widgetOrder] as DashboardWidgetId[],
        reminder_settings: reminderInput as DashboardReminderSettings,
      },
    };
  };

  app.get("/api/dashboard/preferences", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const { data, error } = await identity.client
        .from("dashboard_user_preferences")
        .select("visible_widgets, widget_order, reminder_settings")
        .eq("tenant_id", identity.tenantId)
        .eq("user_id", identity.userId)
        .maybeSingle();
      if (error) throw error;

      // Keine Zeile anzulegen ist absichtlich: Erst ein ausdrückliches
      // Speichern des Users persistiert seine persönlichen Präferenzen.
      return res.json({
        ...normalizeDashboardPreferences(data as Partial<DashboardPreferences> | null),
        is_default: !data,
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  app.put("/api/dashboard/preferences", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const parsed = parseDashboardPreferences(req.body);
      if ("message" in parsed) {
        return res.status(400).json({ message: parsed.message });
      }

      const { data, error } = await identity.client
        .from("dashboard_user_preferences")
        .upsert({
          tenant_id: identity.tenantId,
          user_id: identity.userId,
          ...parsed.preferences,
          updated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id,user_id" })
        .select("visible_widgets, widget_order, reminder_settings")
        .single();
      if (error) throw error;

      return res.json({
        ...normalizeDashboardPreferences(data as Partial<DashboardPreferences>),
        is_default: false,
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Smarte Erinnerungen (Dashboard) ───────────────────────────────────────
  // Die aktuelle Vorkalkulationsoberfläche speichert ihre Kopfdaten in
  // vorkalkulation_config. Diese Zeile ist damit der belastbare Marker dafür,
  // dass für einen Auftrag eine Vorkalkulation angelegt wurde. Die gleichnamige
  // Tabelle ohne Suffix wird von der aktiven Oberfläche nicht verwendet.
  app.get("/api/dashboard/reminders", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const { data: storedPreferences, error: preferencesError } = await identity.client
        .from("dashboard_user_preferences")
        .select("reminder_settings")
        .eq("tenant_id", identity.tenantId)
        .eq("user_id", identity.userId)
        .maybeSingle();
      if (preferencesError) throw preferencesError;

      const reminderSettings = normalizeDashboardPreferences(
        storedPreferences as Partial<DashboardPreferences> | null,
      ).reminder_settings;
      const needsOrderReminders = reminderSettings.vorkalkulation_fehlt || reminderSettings.auftrag_ohne_termin;
      // Die einfache, bewusst feste D2.6-Definition misst ab dem technisch
      // verlässlichen Erstellzeitpunkt der Offerte. Ein Versand-/Antwort-Tracking
      // gibt es im aktuellen Datenmodell nicht.
      const angebotsAntwortFristTage = 14;
      const angebotsAntwortCutoff = new Date(
        Date.now() - angebotsAntwortFristTage * 24 * 60 * 60 * 1000,
      ).toISOString();
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Zurich",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
        if (part.type !== "literal") parts[part.type] = part.value;
        return parts;
      }, {});
      const todayIso = `${today.year}-${today.month}-${today.day}`;

      const activeOrdersRequest = needsOrderReminders
        ? identity.client
          .from("auftraege")
          .select("id, nr, kunde, angebots_betrag, rechnungs_betrag, erstellt, status")
          .eq("tenant_id", identity.tenantId)
          .neq("status", "abgeschlossen")
          .neq("status", "storniert")
          .order("erstellt", { ascending: false })
        : Promise.resolve({ data: [], error: null });
      const overdueInvoicesRequest = reminderSettings.rechnung_ueberfaellig
        ? identity.client
          .from("rechnungen")
          .select("id, nr, auftrag_id, betrag, faellig_datum")
          .eq("tenant_id", identity.tenantId)
          .is("bezahlt_am", null)
          .not("faellig_datum", "is", null)
          .lt("faellig_datum", todayIso)
          .order("faellig_datum", { ascending: true })
        : Promise.resolve({ data: [], error: null });
      const offersWithoutResponseRequest = reminderSettings.angebot_ohne_antwort
        ? identity.client
          .from("offerten")
          .select("id, nr, auftrag_id, empfaenger_name, erstellt, positionen, rabatt_prozent, mwst_prozent")
          .eq("tenant_id", identity.tenantId)
          .eq("status", "offen")
          .not("erstellt", "is", null)
          .lte("erstellt", angebotsAntwortCutoff)
          .order("erstellt", { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const [activeOrdersResult, overdueInvoicesResult, offersWithoutResponseResult] = await Promise.all([
        activeOrdersRequest,
        overdueInvoicesRequest,
        offersWithoutResponseRequest,
      ]);
      if (activeOrdersResult.error) throw activeOrdersResult.error;
      if (overdueInvoicesResult.error) throw overdueInvoicesResult.error;
      if (offersWithoutResponseResult.error) throw offersWithoutResponseResult.error;

      const activeOrders = (activeOrdersResult.data || []).filter((auftrag: any) =>
        auftrag.status !== "abgeschlossen" && auftrag.status !== "storniert",
      );
      const activeOrderIds = activeOrders
        .map((auftrag: any) => auftrag.id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      const reminders: any[] = [];
      const orderItem = (auftrag: any) => ({
        id: auftrag.id,
        auftragsnummer: auftrag.nr || null,
        kunde: auftrag.kunde || null,
        auftragswert: Math.round((Number(auftrag.angebots_betrag ?? auftrag.rechnungs_betrag) || 0) * 100) / 100,
      });

      if (activeOrderIds.length > 0 && reminderSettings.vorkalkulation_fehlt) {
        const { data: configs, error } = await identity.client
          .from("vorkalkulation_config")
          .select("auftrag_id")
          .eq("tenant_id", identity.tenantId)
          .in("auftrag_id", activeOrderIds);
        if (error) throw error;

        const ordersWithVorkalkulation = new Set(
          (configs || [])
            .map((config: any) => config.auftrag_id)
            .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
        );
        const missingVorkalkulation = activeOrders.filter((auftrag: any) => !ordersWithVorkalkulation.has(auftrag.id));
        if (missingVorkalkulation.length > 0) {
          reminders.push({
            type: "vorkalkulation_fehlt",
            count: missingVorkalkulation.length,
            items: missingVorkalkulation.slice(0, 5).map(orderItem),
          });
        }
      }

      if (activeOrderIds.length > 0 && reminderSettings.auftrag_ohne_termin) {
        const { data: termine, error } = await identity.client
          .from("termine")
          .select("auftrag_id, datum_von")
          .eq("tenant_id", identity.tenantId)
          .in("auftrag_id", activeOrderIds);
        if (error) throw error;

        const ordersWithTermin = new Set(
          (termine || [])
            .filter((termin: any) => typeof termin.datum_von === "string" && termin.datum_von.trim().length > 0)
            .map((termin: any) => termin.auftrag_id)
            .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
        );
        const missingTermin = activeOrders.filter((auftrag: any) => !ordersWithTermin.has(auftrag.id));
        if (missingTermin.length > 0) {
          reminders.push({
            type: "auftrag_ohne_termin",
            count: missingTermin.length,
            items: missingTermin.slice(0, 5).map(orderItem),
          });
        }
      }

      if (reminderSettings.rechnung_ueberfaellig) {
        // Identische fachliche Definition wie die D2.3-Kachel: unbezahlte,
        // ISO-parsebare Rechnung vor dem heutigen Zürcher Kalendertag.
        const overdueInvoices = (overdueInvoicesResult.data || []).filter((rechnung: any) => {
          const dueDate = typeof rechnung.faellig_datum === "string" ? rechnung.faellig_datum.slice(0, 10) : "";
          return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < todayIso;
        });
        if (overdueInvoices.length > 0) {
          const auftragIds = Array.from(new Set(
            overdueInvoices
              .map((rechnung: any) => rechnung.auftrag_id)
              .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
          ));
          const kundenByAuftragId = new Map<string, string | null>();

          if (auftragIds.length > 0) {
            const { data: auftraege, error } = await identity.client
              .from("auftraege")
              .select("id, kunde")
              .eq("tenant_id", identity.tenantId)
              .in("id", auftragIds);
            if (error) throw error;
            for (const auftrag of auftraege || []) {
              kundenByAuftragId.set(auftrag.id, auftrag.kunde || null);
            }
          }

          const totalOffenBrutto = overdueInvoices.reduce(
            (sum: number, rechnung: any) => sum + rechnungBruttoBetrag(rechnung.betrag),
            0,
          );
          reminders.push({
            type: "rechnung_ueberfaellig",
            count: overdueInvoices.length,
            total_offen_brutto: Math.round(totalOffenBrutto * 100) / 100,
            items: overdueInvoices.slice(0, 5).map((rechnung: any) => ({
              id: rechnung.id,
              rechnungsnummer: rechnung.nr || null,
              auftrag_id: rechnung.auftrag_id || null,
              faellig_am: rechnung.faellig_datum.slice(0, 10),
              kunde: rechnung.auftrag_id ? kundenByAuftragId.get(rechnung.auftrag_id) || null : null,
              betrag_brutto: rechnungBruttoBetrag(rechnung.betrag),
            })),
          });
        }
      }

      if (reminderSettings.angebot_ohne_antwort) {
        const now = Date.now();
        const offersWithoutResponse = (offersWithoutResponseResult.data || [])
          .map((offerte: any) => {
            const erstelltAm = new Date(offerte.erstellt).getTime();
            const tageOffen = Number.isNaN(erstelltAm)
              ? -1
              : Math.floor((now - erstelltAm) / (24 * 60 * 60 * 1000));
            return { offerte, tageOffen };
          })
          .filter(({ tageOffen }: { tageOffen: number }) => tageOffen >= angebotsAntwortFristTage)
          .sort((left: any, right: any) => right.tageOffen - left.tageOffen);

        if (offersWithoutResponse.length > 0) {
          reminders.push({
            type: "angebot_ohne_antwort",
            count: offersWithoutResponse.length,
            items: offersWithoutResponse.slice(0, 5).map(({ offerte, tageOffen }: any) => ({
              id: offerte.id,
              angebotsnummer: offerte.nr || null,
              auftrag_id: offerte.auftrag_id || null,
              kunde: offerte.empfaenger_name || null,
              tage_offen: tageOffen,
              wert: offerteBrutto(offerte),
            })),
          });
        }
      }

      return res.json({ reminders });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Dashboard-Aufgaben (Team-Ansicht) ─────────────────────────────────────
  // Liefert bewusst eine kleine Projektion statt der vollständigen Aufgabenliste.
  // Die explizite tenant_id-Bedingung sichert auch den weiterhin unterstützten
  // Legacy-Pfad mit Service-Role-Client ab; im Supabase-Auth-Pfad greift sie
  // zusätzlich zur RLS-Policy der Tabelle.
  app.get("/api/dashboard/aufgaben", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const { data: offeneAufgaben, error, count } = await identity.client
        .from("aufgaben")
        .select("id, titel, faellig_datum, auftrag_id, erstellt", { count: "exact" })
        .eq("tenant_id", identity.tenantId)
        .eq("status", "offen")
        // Aufsteigend sortierte Fälligkeiten bringen überfällige Aufgaben
        // automatisch vor heute und künftige Fälligkeiten; NULL bleibt zuletzt.
        .order("faellig_datum", { ascending: true, nullsFirst: false })
        .order("erstellt", { ascending: false })
        .limit(10);
      if (error) throw error;

      const auftragIds = Array.from(new Set(
        (offeneAufgaben || [])
          .map((aufgabe: any) => aufgabe.auftrag_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
      ));
      const auftraegeById = new Map<string, { id: string; nr: string | null; titel: string | null; kunde: string | null }>();

      if (auftragIds.length > 0) {
        const { data: auftraege, error: auftraegeError } = await identity.client
          .from("auftraege")
          .select("id, nr, titel, kunde")
          .eq("tenant_id", identity.tenantId)
          .in("id", auftragIds);
        if (auftraegeError) throw auftraegeError;

        for (const auftrag of auftraege || []) {
          auftraegeById.set(auftrag.id, auftrag);
        }
      }

      return res.json({
        total: count || 0,
        aufgaben: (offeneAufgaben || []).map((aufgabe: any) => ({
          id: aufgabe.id,
          titel: aufgabe.titel,
          faellig_datum: aufgabe.faellig_datum || null,
          auftrag: aufgabe.auftrag_id ? auftraegeById.get(aufgabe.auftrag_id) || null : null,
        })),
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Überfällige Rechnungen (Dashboard) ───────────────────────────────────
  // rechnungen.faellig_datum ist im aktuellen Schema ein ISO-Datum als Text.
  // Die Datenbank besitzt derzeit weder status noch storniert_am; sobald ein
  // expliziter Storno-Zustand existiert, muss er hier und in der Rechnungsliste
  // gemeinsam als zusätzlicher Ausschluss ergänzt werden.
  app.get("/api/dashboard/ueberfaellige-rechnungen", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Zurich",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
        if (part.type !== "literal") parts[part.type] = part.value;
        return parts;
      }, {});
      const todayIso = `${today.year}-${today.month}-${today.day}`;

      // The < filter lets Postgres use the tenant/date index once it exists.
      // A second ISO validation below protects the response against legacy text
      // values that could compare lexicographically but are not valid dates.
      const { data: candidates, error } = await identity.client
        .from("rechnungen")
        .select("id, nr, auftrag_id, betrag, faellig_datum")
        .eq("tenant_id", identity.tenantId)
        .is("bezahlt_am", null)
        .not("faellig_datum", "is", null)
        .lt("faellig_datum", todayIso)
        .order("faellig_datum", { ascending: true });
      if (error) throw error;

      const overdueInvoices = (candidates || []).filter((rechnung: any) => {
        const dueDate = typeof rechnung.faellig_datum === "string" ? rechnung.faellig_datum.slice(0, 10) : "";
        return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < todayIso;
      });

      const auftragIds = Array.from(new Set(
        overdueInvoices
          .map((rechnung: any) => rechnung.auftrag_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
      ));
      const kundenByAuftragId = new Map<string, string | null>();

      if (auftragIds.length > 0) {
        const { data: auftraege, error: auftraegeError } = await identity.client
          .from("auftraege")
          .select("id, kunde")
          .eq("tenant_id", identity.tenantId)
          .in("id", auftragIds);
        if (auftraegeError) throw auftraegeError;

        for (const auftrag of auftraege || []) {
          kundenByAuftragId.set(auftrag.id, auftrag.kunde || null);
        }
      }

      const overdueDays = (dueDate: string) => {
        const dueMs = Date.UTC(
          Number(dueDate.slice(0, 4)),
          Number(dueDate.slice(5, 7)) - 1,
          Number(dueDate.slice(8, 10)),
        );
        const todayMs = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day));
        return Math.max(1, Math.floor((todayMs - dueMs) / 86_400_000));
      };

      const items = overdueInvoices.slice(0, 10).map((rechnung: any) => ({
        id: rechnung.id,
        rechnungsnummer: rechnung.nr || null,
        auftrag_id: rechnung.auftrag_id || null,
        faellig_am: rechnung.faellig_datum.slice(0, 10),
        kunde: rechnung.auftrag_id ? kundenByAuftragId.get(rechnung.auftrag_id) || null : null,
        betrag_brutto: rechnungBruttoBetrag(rechnung.betrag),
        tage_ueberfaellig: overdueDays(rechnung.faellig_datum.slice(0, 10)),
      }));
      const totalOffenBrutto = overdueInvoices.reduce(
        (sum: number, rechnung: any) => sum + rechnungBruttoBetrag(rechnung.betrag),
        0,
      );

      return res.json({
        count: overdueInvoices.length,
        total_offen_brutto: Math.round(totalOffenBrutto * 100) / 100,
        items,
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Top-Kunden (Dashboard) ────────────────────────────────────────────────
  // Rechnungen besitzen im aktuellen Schema keinen stabilen Kunden-FK. Die
  // fachlich massgebliche Beziehung ist daher Rechnung -> Auftrag -> kunde
  // (Text-Snapshot). Namen bleiben bewusst case-sensitive und unverändert:
  // nur NULL/Leerwerte werden ausgeschlossen. Ein kunde_id-Refactoring bleibt
  // ein späterer, separater Datenqualitätsausbau.
  //
  // rechnungen hat derzeit weder status noch storniert_am. Sobald ein expliziter
  // Storno-Zustand existiert, muss hier ein gemeinsamer Ausschluss ergänzt werden.
  app.get("/api/dashboard/top-kunden", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const { year, yearStart, nextYearStart } = zurichKalenderjahr();

      const { data: invoices, error } = await identity.client
        .from("rechnungen")
        .select("id, auftrag_id, betrag")
        .eq("tenant_id", identity.tenantId)
        .gte("erstellt", yearStart)
        .lt("erstellt", nextYearStart);
      if (error) throw error;

      const auftragIds = Array.from(new Set(
        (invoices || [])
          .map((rechnung: any) => rechnung.auftrag_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
      ));
      const kundenByAuftragId = new Map<string, string>();

      if (auftragIds.length > 0) {
        const { data: auftraege, error: auftraegeError } = await identity.client
          .from("auftraege")
          .select("id, kunde")
          .eq("tenant_id", identity.tenantId)
          .in("id", auftragIds);
        if (auftraegeError) throw auftraegeError;

        for (const auftrag of auftraege || []) {
          if (typeof auftrag.kunde === "string" && auftrag.kunde.trim().length > 0) {
            kundenByAuftragId.set(auftrag.id, auftrag.kunde);
          }
        }
      }

      const rankings = new Map<string, { umsatz_netto: number; anzahl_rechnungen: number }>();
      for (const rechnung of invoices || []) {
        const kunde = kundenByAuftragId.get(rechnung.auftrag_id);
        if (!kunde) continue;

        const current = rankings.get(kunde) || { umsatz_netto: 0, anzahl_rechnungen: 0 };
        current.umsatz_netto += Number(rechnung.betrag) || 0;
        current.anzahl_rechnungen += 1;
        rankings.set(kunde, current);
      }

      const kunden = Array.from(rankings.entries())
        .map(([kunde, ranking]) => ({
          kunde,
          umsatz_netto: Math.round(ranking.umsatz_netto * 100) / 100,
          anzahl_rechnungen: ranking.anzahl_rechnungen,
        }))
        .sort((left, right) =>
          right.umsatz_netto - left.umsatz_netto || left.kunde.localeCompare(right.kunde, "de-CH"),
        )
        .slice(0, 5);

      return res.json({ year, kunden });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Deckungsbeitrag 1 (Dashboard) ─────────────────────────────────────────
  // Rechnungserlöse werden im Zürcher Kalenderjahr nach Rechnungsdatum
  // periodisiert. Die Kosten stammen aus derselben Ist-Kosten-Funktion wie die
  // Finanzübersicht: Zeiterfassung, manuelle NK-Stunden, Material,
  // Fremdleistungen und SOEK. Aufträge ohne jeden erfassten Kostenposten werden
  // nicht in DB1 aufgenommen, weil ihre rechnerische 100%-Quote ohne
  // Vollständigkeitsstatus fachlich irreführend wäre.
  app.get("/api/dashboard/deckungsbeitrag", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const { year, yearStart, nextYearStart } = zurichKalenderjahr();
      const { data: rechnungen, error: rechnungenError } = await identity.client
        .from("rechnungen")
        .select("auftrag_id, betrag")
        .eq("tenant_id", identity.tenantId)
        .gte("erstellt", yearStart)
        .lt("erstellt", nextYearStart);
      if (rechnungenError) throw rechnungenError;

      const rechnungenJeAuftrag = new Map<string, number>();
      for (const rechnung of rechnungen || []) {
        if (typeof rechnung.auftrag_id !== "string" || !rechnung.auftrag_id) continue;
        rechnungenJeAuftrag.set(
          rechnung.auftrag_id,
          (rechnungenJeAuftrag.get(rechnung.auftrag_id) || 0) + (Number(rechnung.betrag) || 0),
        );
      }
      const auftragIds = Array.from(rechnungenJeAuftrag.keys());
      if (auftragIds.length === 0) {
        return res.json({
          year,
          anzahl_auftraege: 0,
          anzahl_fakturierte_auftraege: 0,
          ausgeschlossen_ohne_kosten: 0,
          umsatz_netto: 0,
          ist_kosten: 0,
          db1: 0,
          db1_quote: null,
          beitraege: [],
        });
      }

      const [{ data: auftraege, error: auftraegeError }, kostenJeAuftrag] = await Promise.all([
        identity.client
          .from("auftraege")
          .select("id, nr, titel")
          .eq("tenant_id", identity.tenantId)
          .in("id", auftragIds),
        berechneAuftragIstKosten(identity.client, auftragIds, identity.tenantId),
      ]);
      if (auftraegeError) throw auftraegeError;
      const auftragNachId = new Map((auftraege || []).map((auftrag: any) => [auftrag.id, auftrag]));

      const fakturierteAuftraege = auftragIds
        .map((id) => {
          const auftrag = auftragNachId.get(id);
          const umsatz_netto = Math.round((rechnungenJeAuftrag.get(id) || 0) * 100) / 100;
          const ist_kosten = kostenJeAuftrag.get(id)?.total || 0;
          return {
            id,
            nr: auftrag?.nr || "—",
            titel: auftrag?.titel || "Unbekannter Auftrag",
            umsatz_netto,
            ist_kosten,
            db1: Math.round((umsatz_netto - ist_kosten) * 100) / 100,
            db1_quote: umsatz_netto > 0
              ? Math.round(((umsatz_netto - ist_kosten) / umsatz_netto) * 1000) / 10
              : null,
          };
        });
      const beruecksichtigt = fakturierteAuftraege.filter((auftrag) => auftrag.ist_kosten > 0);
      const umsatz_netto = Math.round(beruecksichtigt.reduce((summe, auftrag) => summe + auftrag.umsatz_netto, 0) * 100) / 100;
      const ist_kosten = Math.round(beruecksichtigt.reduce((summe, auftrag) => summe + auftrag.ist_kosten, 0) * 100) / 100;
      const db1 = Math.round((umsatz_netto - ist_kosten) * 100) / 100;
      const sortiert = [...beruecksichtigt].sort((links, rechts) => rechts.db1 - links.db1 || links.nr.localeCompare(rechts.nr));
      const staerkste = sortiert.slice(0, 3).map((auftrag) => ({ ...auftrag, richtung: "staerkster" as const }));
      const staerksteIds = new Set(staerkste.map((auftrag) => auftrag.id));
      const schwaechste = [...sortiert]
        .reverse()
        .filter((auftrag) => !staerksteIds.has(auftrag.id))
        .slice(0, 2)
        .map((auftrag) => ({ ...auftrag, richtung: "schwaechster" as const }));

      return res.json({
        year,
        anzahl_auftraege: beruecksichtigt.length,
        anzahl_fakturierte_auftraege: fakturierteAuftraege.length,
        ausgeschlossen_ohne_kosten: fakturierteAuftraege.length - beruecksichtigt.length,
        umsatz_netto,
        ist_kosten,
        db1,
        db1_quote: umsatz_netto > 0 ? Math.round((db1 / umsatz_netto) * 1000) / 10 : null,
        beitraege: [...staerkste, ...schwaechste],
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Verlustrisiko (Dashboard) ──────────────────────────────────────────────
  // Die harte Warnung ist absichtlich keine Fortschrittsprognose: Sie erscheint
  // nur, wenn die bereits erfassten IST-Kosten die detaillierten VK-Selbstkosten
  // überschreiten UND die DB1-Quote unter 10 % liegt. Aktive Aufträge verwenden
  // den berechneten Netto-Offertpreis als Umsatzbasis; abgeschlossene Aufträge
  // den Rechnungsumsatz, sofern Rechnungen vorhanden sind.
  app.get("/api/dashboard/verlustrisiko", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const { data: auftraege, error: auftraegeError } = await identity.client
        .from("auftraege")
        .select("id, nr, kunde, status")
        .eq("tenant_id", identity.tenantId)
        .neq("status", "storniert");
      if (auftraegeError) throw auftraegeError;

      const auftragIds = (auftraege || [])
        .map((auftrag: any) => auftrag.id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      if (auftragIds.length === 0) {
        return res.json({ aktive_warnungen: [], abgeschlossene_verluste: [] });
      }

      const [vorkalkulationJeAuftrag, istKostenJeAuftrag, rechnungenResult] = await Promise.all([
        berechneAuftragVorkalkulation(identity.client, auftragIds, identity.tenantId),
        berechneAuftragIstKosten(identity.client, auftragIds, identity.tenantId),
        identity.client
          .from("rechnungen")
          .select("auftrag_id, betrag")
          .eq("tenant_id", identity.tenantId)
          .in("auftrag_id", auftragIds),
      ]);
      if (rechnungenResult.error) throw rechnungenResult.error;

      const rechnungsumsatzJeAuftrag = new Map<string, number>();
      for (const rechnung of rechnungenResult.data || []) {
        if (typeof rechnung.auftrag_id !== "string" || !rechnung.auftrag_id) continue;
        rechnungsumsatzJeAuftrag.set(
          rechnung.auftrag_id,
          (rechnungsumsatzJeAuftrag.get(rechnung.auftrag_id) || 0) + (Number(rechnung.betrag) || 0),
        );
      }
      const rundeGeld = (betrag: number) => Math.round(betrag * 100) / 100;
      const rundeProzent = (wert: number) => Math.round(wert * 10) / 10;
      const risiken = (auftraege || []).flatMap((auftrag: any) => {
        const vorkalkulation = vorkalkulationJeAuftrag.get(auftrag.id);
        const istKosten = istKostenJeAuftrag.get(auftrag.id)?.total || 0;
        if (!vorkalkulation || istKosten <= 0 || vorkalkulation.selbstkosten <= 0) return [];

        const rechnungsumsatz = rechnungsumsatzJeAuftrag.get(auftrag.id) || 0;
        const abgeschlossen = auftrag.status === "abgeschlossen";
        const umsatz_netto = abgeschlossen && rechnungsumsatz > 0
          ? rechnungsumsatz
          : vorkalkulation.netto_angebotspreis;
        if (umsatz_netto <= 0) return [];

        const db1 = umsatz_netto - istKosten;
        const db1_quote = (db1 / umsatz_netto) * 100;
        if (istKosten <= vorkalkulation.selbstkosten || db1_quote >= 10) return [];

        const ueberschreitung_chf = istKosten - vorkalkulation.selbstkosten;
        return [{
          id: auftrag.id,
          nr: auftrag.nr || "—",
          kunde: auftrag.kunde || null,
          status: auftrag.status,
          vorkalkulation_selbstkosten: rundeGeld(vorkalkulation.selbstkosten),
          vorkalkulation_netto: rundeGeld(vorkalkulation.netto_angebotspreis),
          ist_kosten: rundeGeld(istKosten),
          ueberschreitung_chf: rundeGeld(ueberschreitung_chf),
          ueberschreitung_prozent: rundeProzent((ueberschreitung_chf / vorkalkulation.selbstkosten) * 100),
          umsatz_netto: rundeGeld(umsatz_netto),
          umsatz_basis: abgeschlossen && rechnungsumsatz > 0 ? "rechnungen" : "vorkalkulation",
          db1: rundeGeld(db1),
          db1_quote: rundeProzent(db1_quote),
        }];
      });
      const sortiere = (links: any, rechts: any) =>
        links.db1_quote - rechts.db1_quote
        || rechts.ueberschreitung_chf - links.ueberschreitung_chf
        || links.nr.localeCompare(rechts.nr, "de-CH");

      return res.json({
        aktive_warnungen: risiken.filter((auftrag) => auftrag.status !== "abgeschlossen").sort(sortiere),
        abgeschlossene_verluste: risiken.filter((auftrag) => auftrag.status === "abgeschlossen").sort(sortiere),
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  // ─── Offene Nachkalkulation (Dashboard) ─────────────────────────────────────
  // Ausschliesslich der explizit bestätigte Status gilt als vollständig. Der
  // Abschlusszeitpunkt des Auftrags nutzt end_datum; bei historischen Aufträgen
  // ohne Enddatum fällt die Anzeige auf erstellt zurück.
  app.get("/api/dashboard/offene-nachkalkulation", async (req, res) => {
    try {
      const identity = dashboardPreferenceIdentity(req);
      if (!identity) {
        return res.status(401).json({ message: "Authentifizierung erforderlich." });
      }

      const [offeneResult, gesamtResult] = await Promise.all([
        identity.client
          .from("auftraege")
          .select("id, nr, kunde, end_datum, erstellt, nachkalkulation_status", { count: "exact" })
          .eq("tenant_id", identity.tenantId)
          .eq("status", "abgeschlossen")
          .or("nachkalkulation_status.is.null,nachkalkulation_status.neq.abgeschlossen"),
        identity.client
          .from("auftraege")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", identity.tenantId)
          .eq("status", "abgeschlossen"),
      ]);
      if (offeneResult.error) throw offeneResult.error;
      if (gesamtResult.error) throw gesamtResult.error;

      const now = Date.now();
      const abschlusszeit = (auftrag: any): string | null => {
        const endDatum = typeof auftrag.end_datum === "string" ? auftrag.end_datum.trim() : "";
        return endDatum || (typeof auftrag.erstellt === "string" ? auftrag.erstellt : null);
      };
      const auftraege = (offeneResult.data || [])
        .map((auftrag: any) => {
          const abschlussdatum = abschlusszeit(auftrag);
          const zeitpunkt = abschlussdatum ? new Date(abschlussdatum).getTime() : Number.POSITIVE_INFINITY;
          const tage_seit_abschluss = Number.isFinite(zeitpunkt)
            ? Math.max(0, Math.floor((now - zeitpunkt) / (24 * 60 * 60 * 1000)))
            : null;
          return {
            id: auftrag.id,
            nr: auftrag.nr || "—",
            kunde: auftrag.kunde || null,
            abschlussdatum,
            tage_seit_abschluss,
            nachkalkulation_status: auftrag.nachkalkulation_status || "nicht_begonnen",
            sortierdatum: zeitpunkt,
          };
        })
        .sort((links: any, rechts: any) => links.sortierdatum - rechts.sortierdatum || links.nr.localeCompare(rechts.nr, "de-CH"))
        .slice(0, 10)
        .map(({ sortierdatum: _sortierdatum, ...auftrag }: any) => auftrag);

      return res.json({
        count: offeneResult.count || 0,
        total: gesamtResult.count || 0,
        auftraege,
      });
    } catch (e) {
      return res.status(500).json({ message: asError(e) });
    }
  });

  return httpServer;
}
