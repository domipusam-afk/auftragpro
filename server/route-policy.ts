/**
 * Vollständige, noch nicht registrierte Policy-Matrix für server/routes.ts.
 *
 * Stand Etappe 7: Der Legacy-Request-Pfad registriert weder requireAuth noch
 * requirePermission. currentEnforcement dokumentiert dieses Ist-Verhalten;
 * access/permissions beschreiben den Ziel-Gatekeeper für die spätere Umschaltung.
 */
import type { RequestHandler } from "express";
import { PERMISSION_BY_KEY, type PermissionKey } from "../shared/permissions-catalog";

export type RouteAccess = "public" | "permissions" | "admin-only";
export type CurrentRouteEnforcement = "unguarded" | "guarded";

export interface RoutePolicy {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
  readonly path: string;
  /** Zeile der Routendefinition in server/routes.ts zum Zeitpunkt der Matrix. */
  readonly line: number;
  readonly access: RouteAccess;
  /** Alle genannten Rechte sind erforderlich; public/admin-only bleibt leer. */
  readonly permissions: readonly PermissionKey[];
  readonly reason: string;
  /** Beobachtetes Verhalten in Etappe 7, nicht die Ziel-Policy. */
  readonly currentEnforcement: CurrentRouteEnforcement;
}

export const ROUTE_POLICIES = [
  { method: "POST", path: "/api/auth/login", line: 297, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/verify-2fa", line: 590, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-vergessen", line: 464, access: "public", permissions: [], reason: "Self-Service Passwort-Reset muss vor einer Sitzung erreichbar sein; Enumeration-Schutz durch generische Antwort.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-zuruecksetzen", line: 535, access: "public", permissions: [], reason: "Self-Service Passwort-Reset muss vor einer Sitzung erreichbar sein; Absicherung durch kurzlebigen, gehashten Einmal-Token.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/setup-2fa", line: 651, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Einrichtung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/confirm-2fa", line: 693, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Bestätigung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-aendern", line: 734, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche Passwortänderung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/benutzer", line: 771, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer", line: 787, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/benutzer/:id", line: 821, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/benutzer/:id", line: 911, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer/:id/reset-2fa", line: 937, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stats", line: 960, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskennzahlen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reingewinn", line: 996, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Finanzkennzahlen im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege", line: 1057, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege", line: 1073, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id", line: 1144, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id", line: 1186, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/status", line: 1261, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id", line: 1293, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/notizen", line: 1371, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/notizen", line: 1385, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/notizen/:nid", line: 1409, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente", line: 1421, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/dokumente", line: 1441, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente/:did/download", line: 1530, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/dokumente/:did", line: 1542, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dokumente/alle", line: 1576, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Konsolidierter Dokumente+Fotos-Endpoint (Performance-Fix statt N+1 pro Auftrag).", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/rechnungen", line: 1634, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen", line: 1654, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen/:rid/pdf", line: 2745, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/rechnungen", line: 2862, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/rechnungen/:id", line: 2879, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/rechnungen/:id", line: 2923, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/suche", line: 2947, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/q3", line: 3167, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen", line: 3174, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorlagen", line: 3190, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen/:vid/download", line: 3227, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorlagen/:vid", line: 3251, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/zeit", line: 3276, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/zeit", line: 3291, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/zeit/:zid", line: 3327, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/fotos/:auftragId", line: 3344, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/fotos/:auftragId", line: 3362, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/fotos/:id", line: 3396, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/formulare", line: 3433, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/formulare", line: 3448, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/formulare/:id", line: 3470, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/formulare/:id", line: 3502, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/ungelesen", line: 3525, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/als-gelesen", line: 3540, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/:auftragId", line: 3547, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/:auftragId", line: 3567, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden/next-nr", line: 3606, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden", line: 3630, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden", line: 3649, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/kunden/:id", line: 3678, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kunden/:id", line: 3698, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mitarbeiter", line: 3730, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mitarbeiter", line: 3744, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mitarbeiter/:id", line: 3765, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mitarbeiter/:id", line: 3786, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stempel/aktiv", line: 3803, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/ein", line: 3820, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/aus", line: 3846, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege/monatsauswertung", line: 3871, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege", line: 3887, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/zeiteintraege", line: 3897, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/test", line: 3926, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/public/login-bg", line: 3956, access: "public", permissions: [], reason: "Bewusst öffentlicher Login-Hintergrund; einziger unauthentifiziert lesbarer Einstellungs-Key.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen", line: 3975, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/status-pipeline", line: 4001, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline/reorder", line: 4015, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline", line: 4045, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/einstellungen/status-pipeline/:id", line: 4068, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/einstellungen/status-pipeline/:id", line: 4090, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/:key", line: 4127, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/einstellungen/:key", line: 4148, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stundensaetze", line: 4171, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/stundensaetze/:id", line: 4185, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden/sync-from-auftrag", line: 4212, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/termine", line: 4331, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/termine", line: 4339, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/termine/:id", line: 4350, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/termine/:id", line: 4360, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/aufgaben", line: 4371, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/aufgaben", line: 4394, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/aufgaben/:id", line: 4439, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/aufgaben/:id", line: 4513, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/cron/aufgaben-erinnerung", line: 4540, access: "public", permissions: [], reason: "Interner Scheduler-Endpoint ohne Benutzer-Session; per x-cron-secret-Header geschuetzt statt Login.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/plantafel", line: 4630, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/plantafel", line: 4638, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/plantafel/:id", line: 4647, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mahnungen", line: 4656, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen", line: 4676, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mahnungen/:id", line: 4714, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mahnungen/:id", line: 4730, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen/:id/pdf", line: 4742, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragId", line: 4818, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragId", line: 4830, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/position/:id", line: 4851, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/eingangsrechnungen", line: 4860, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/eingangsrechnungen", line: 4874, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/eingangsrechnungen/:id", line: 4897, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/eingangsrechnungen/:id", line: 4913, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:auftr_id/offerten", line: 4968, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten", line: 4986, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:auftr_id/offerten", line: 5001, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/offerten/:id", line: 5062, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/offerten/:id", line: 5081, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-rechnung", line: 5097, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ping", line: 5180, access: "public", permissions: [], reason: "Betriebs-Ping ohne Geschäftsdaten.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/pdf", line: 5185, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten/:id/pdf", line: 5259, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lohnabrechnung/pdf", line: 5335, access: "permissions", permissions: ["ressourcen_lohnabrechnung"], reason: "Lohnabrechnungs-PDF.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stundenabrechnung/pdf", line: 5434, access: "permissions", permissions: ["ressourcen_stundenauswertung"], reason: "Stundenauswertungs-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/stunden", line: 5512, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/stunden", line: 5526, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/stunden", line: 5560, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/stunden/:sid", line: 5586, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/material", line: 5599, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/material", line: 5613, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/material/:mid", line: 5641, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/material/:mid", line: 5667, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/fremdleistungen", line: 5680, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/fremdleistungen", line: 5694, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 5718, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 5734, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/soek", line: 5747, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/soek", line: 5761, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/soek/:sid", line: 5785, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/soek/:sid", line: 5801, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/config", line: 5814, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/config", line: 5836, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kalkulation-pdf", line: 5885, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulations-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ferien", line: 6475, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/ferien", line: 6492, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/ferien/:id", line: 6510, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/ferien/:id", line: 6519, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lieferanten", line: 6544, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lieferanten", line: 6557, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/lieferanten/:id", line: 6573, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lieferanten/:id", line: 6591, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/materialbestellungen", line: 6649, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/materialbestellungen", line: 6664, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/materialbestellungen/:id", line: 6687, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/materialbestellungen/:id", line: 6711, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/kommentare", line: 6727, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kommentare", line: 6739, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kommentare/:id", line: 6756, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskommentare.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 6768, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 6774, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hilfsmaterial/:id", line: 6780, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hilfsmaterial/:id", line: 6786, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 6794, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 6800, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 6806, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 6812, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 6820, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", line: 6883, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 6913, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-stunden/:id", line: 6938, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-stunden/:id", line: 6967, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-zeiterfassung/:zeitId", line: 6988, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-material", line: 7002, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-material", line: 7011, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-material/:id", line: 7032, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-material/:id", line: 7054, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 7065, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 7074, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-fremd/:id", line: 7094, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-fremd/:id", line: 7115, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-soek", line: 7126, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-soek", line: 7135, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-soek/:id", line: 7159, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-soek/:id", line: 7191, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/finanzen/uebersicht", line: 7203, access: "permissions", permissions: ["finanzmanagement_finanzen_uebersicht"], reason: "Finanzen-Übersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/wartung/rechnungsbetraege-neu-berechnen", line: 7221, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien", line: 7276, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien/warnungen", line: 7294, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/garantien", line: 7309, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/garantien/:id", line: 7320, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/garantien/:id", line: 7332, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/lieferschein-pdf", line: 7343, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/auftragsbestaetigung-pdf", line: 7430, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/abnahme-pdf", line: 7497, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen", line: 7604, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen/:docTyp", line: 7692, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/pdf-vorlagen/:docTyp", line: 7708, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/pdf-vorlagen/vorschau", line: 7750, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/send", line: 7932, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-auftrag", line: 7979, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lager", line: 8043, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager", line: 8056, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/lager/:id", line: 8072, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lager/:id", line: 8089, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager/:id/buchung", line: 8105, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/liefertermine", line: 8170, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/liefertermine", line: 8186, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/liefertermine/:id", line: 8206, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/liefertermine/:id", line: 8227, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mwst/auswertung", line: 8245, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/fibu", line: 8398, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/downloads/sign", line: 8406, access: "public", permissions: [], reason: "Bearer-Authentifizierung und Zielberechtigung werden im Signatur-Handler für den angeforderten Download geprüft.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/downloads/fetch", line: 8432, access: "public", permissions: [], reason: "Bewusste Ausnahme: einmaliger HMAC-signierter Kurzzeit-Token ist die Authentifizierung des Browser-Downloads.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/wiederholen", line: 8477, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/backup", line: 8554, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/public/auftrag/:token", line: 8616, access: "public", permissions: [], reason: "Redigierter Projektstatus über einen separaten Public-Token.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/generate-token", line: 8655, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/generate-token", line: 8696, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte", line: 8711, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte", line: 8720, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/schritte/:sid", line: 8732, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid", line: 8754, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 8777, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 8814, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid/fotos/:fid", line: 8833, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/positionen", line: 8897, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen", line: 8910, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/positionen/:pid", line: 8950, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/positionen/:pid", line: 8978, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen/import-vorkalkulation", line: 8993, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/kunden-nachricht", line: 9120, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/preferences", line: 9282, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönliche Dashboard-Kachel- und Erinnerungspräferenzen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/dashboard/preferences", line: 9308, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönliche Dashboard-Kachel- und Erinnerungspräferenzen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reminders", line: 9346, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönlich konfigurierbare Handlungserinnerungen für Aufträge, Rechnungen und Offerten.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/aufgaben", line: 9570, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Team-Ansicht offener Aufgaben im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/ueberfaellige-rechnungen", line: 9628, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Überfällige Rechnungen und offene Bruttobeträge im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/top-kunden", line: 9727, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Top-Kunden nach fakturiertem Netto-Umsatz im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/deckungsbeitrag", line: 9801, access: "permissions", permissions: ["dashboard_finanzen"], reason: "DB1 nach Rechnungsdatum und erfassten direkten IST-Kosten im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/verlustrisiko", line: 9903, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Harte Warnung bei erfassten IST-Kosten über detaillierter Vorkalkulation und DB1 unter 10 %.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/nachkalkulation/:id/status", line: 9171, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Expliziten Abschluss der Nachkalkulation setzen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/offene-nachkalkulation", line: 9996, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Abgeschlossene Aufträge ohne explizit abgeschlossene Nachkalkulation im Dashboard.", currentEnforcement: "unguarded" },
] as const satisfies readonly RoutePolicy[];

export const ROUTE_POLICY_BY_FINGERPRINT: Readonly<Record<string, RoutePolicy>> =
  Object.fromEntries(ROUTE_POLICIES.map((policy) => [`${policy.method} ${policy.path}`, policy]));

export function getRoutePolicy(method: string, path: string): RoutePolicy | undefined {
  return ROUTE_POLICY_BY_FINGERPRINT[`${method.toUpperCase()} ${path}`];
}

/**
 * Finds a matrix entry for an incoming Express request path. Exact paths win
 * before parameterized paths, so static endpoints such as /api/ping cannot
 * accidentally be consumed by a broad :id pattern.
 */
export function matchRoutePolicy(method: string, path: string): RoutePolicy | undefined {
  const normalizedMethod = method.toUpperCase();
  const exact = getRoutePolicy(normalizedMethod, path) || getRoutePolicy("ALL", path);
  if (exact) return exact;

  const candidates = ROUTE_POLICIES.filter((policy) => {
    const policyMethod: string = policy.method;
    if (policyMethod !== normalizedMethod && policyMethod !== "ALL") return false;
    const expression = `^${policy.path
      .split("/")
      .map((segment) => segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("/")}$`;
    return new RegExp(expression).test(path);
  });

  // When more than one parameterized shape matches, prefer the more literal
  // route. This mirrors Express's intended static-over-parameter semantics.
  return candidates.sort((left, right) => {
    const literalSegments = (policy: RoutePolicy) =>
      policy.path.split("/").filter((segment) => segment.length > 0 && !segment.startsWith(":")).length;
    return literalSegments(right) - literalSegments(left)
      || right.path.split("/").length - left.path.split("/").length;
  })[0];
}

function toPermissionObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return toPermissionObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Reine Berechtigungsprüfung für den späteren Gatekeeper; derzeit nirgendwo registriert. */
export function isRoutePolicyAllowed(
  policy: RoutePolicy,
  rolle: string | undefined,
  berechtigungen: unknown,
): boolean {
  if (policy.access === "public") return true;
  if (rolle === "admin") return true;
  if (policy.access === "admin-only") return false;

  const grants = toPermissionObject(berechtigungen);
  const hasPermission = (permission: PermissionKey): boolean => {
    const definition = PERMISSION_BY_KEY[permission];
    if (grants[permission] !== true) return false;
    return !definition.dependsOn || hasPermission(definition.dependsOn as PermissionKey);
  };
  return policy.permissions.every(hasPermission);
}

/**
 * Vorbereitung für die spätere Routenregistrierung. Diese Funktion wird in
 * Etappe 7 absichtlich nicht in server/routes.ts importiert oder verwendet.
 */
export function createRequirePermission(policy: RoutePolicy): RequestHandler {
  return (req, res, next) => {
    if (policy.access === "public") return next();
    if (!req.auth) {
      res.status(401).json({ message: "Authentifizierung erforderlich" });
      return;
    }
    if (!isRoutePolicyAllowed(policy, req.auth.rolle, req.auth.berechtigungen)) {
      res.status(403).json({ message: "Berechtigung fehlt" });
      return;
    }
    next();
  };
}
