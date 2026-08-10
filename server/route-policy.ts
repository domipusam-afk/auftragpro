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
  { method: "POST", path: "/api/auth/login", line: 274, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/verify-2fa", line: 340, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/setup-2fa", line: 397, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Einrichtung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/confirm-2fa", line: 436, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Bestätigung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-aendern", line: 467, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche Passwortänderung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/benutzer", line: 499, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer", line: 511, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/benutzer/:id", line: 537, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/benutzer/:id", line: 563, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer/:id/reset-2fa", line: 574, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stats", line: 588, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskennzahlen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reingewinn", line: 621, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Finanzkennzahlen im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege", line: 667, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege", line: 680, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id", line: 740, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id", line: 775, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/status", line: 846, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id", line: 873, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/notizen", line: 896, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/notizen", line: 910, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/notizen/:nid", line: 934, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente", line: 946, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/dokumente", line: 960, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente/:did/download", line: 1001, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/dokumente/:did", line: 1036, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/rechnungen", line: 1077, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen", line: 1091, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen/:rid/pdf", line: 2146, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/rechnungen", line: 2257, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/rechnungen/:id", line: 2271, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/rechnungen/:id", line: 2293, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/suche", line: 2305, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/q3", line: 2358, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen", line: 2512, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorlagen", line: 2525, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen/:vid/download", line: 2559, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorlagen/:vid", line: 2580, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/zeit", line: 2595, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/zeit", line: 2610, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/zeit/:zid", line: 2646, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/fotos/:auftragId", line: 2660, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/fotos/:auftragId", line: 2668, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/fotos/:id", line: 2677, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/formulare", line: 2686, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/formulare", line: 2694, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/formulare/:id", line: 2703, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/formulare/:id", line: 2711, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/ungelesen", line: 2721, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/als-gelesen", line: 2733, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/:auftragId", line: 2738, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/:auftragId", line: 2746, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden/next-nr", line: 2756, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden", line: 2775, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden", line: 2783, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/kunden/:id", line: 2804, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kunden/:id", line: 2812, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mitarbeiter", line: 2821, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mitarbeiter", line: 2829, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mitarbeiter/:id", line: 2839, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mitarbeiter/:id", line: 2847, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stempel/aktiv", line: 2858, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/ein", line: 2875, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/aus", line: 2901, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege/monatsauswertung", line: 2926, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege", line: 2942, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/zeiteintraege", line: 2952, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/test", line: 2980, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen", line: 3005, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/status-pipeline", line: 3016, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline/reorder", line: 3027, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline", line: 3039, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/einstellungen/status-pipeline/:id", line: 3051, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/einstellungen/status-pipeline/:id", line: 3068, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/:key", line: 3080, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/einstellungen/:key", line: 3088, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stundensaetze", line: 3103, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/stundensaetze/:id", line: 3111, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden/sync-from-auftrag", line: 3133, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/termine", line: 3211, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/termine", line: 3219, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/termine/:id", line: 3228, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/termine/:id", line: 3236, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/aufgaben", line: 3247, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/aufgaben", line: 3267, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/aufgaben/:id", line: 3294, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/aufgaben/:id", line: 3337, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/plantafel", line: 3346, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/plantafel", line: 3354, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/plantafel/:id", line: 3363, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mahnungen", line: 3372, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen", line: 3389, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mahnungen/:id", line: 3420, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mahnungen/:id", line: 3432, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen/:id/pdf", line: 3441, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragId", line: 3514, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragId", line: 3526, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/position/:id", line: 3547, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/eingangsrechnungen", line: 3556, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/eingangsrechnungen", line: 3567, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/eingangsrechnungen/:id", line: 3587, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/eingangsrechnungen/:id", line: 3599, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:auftr_id/offerten", line: 3649, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten", line: 3661, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:auftr_id/offerten", line: 3672, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/offerten/:id", line: 3719, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/offerten/:id", line: 3734, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-rechnung", line: 3745, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ping", line: 3826, access: "public", permissions: [], reason: "Betriebs-Ping ohne Geschäftsdaten.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/pdf", line: 3831, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten/:id/pdf", line: 3903, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lohnabrechnung/pdf", line: 3977, access: "permissions", permissions: ["ressourcen_lohnabrechnung"], reason: "Lohnabrechnungs-PDF.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stundenabrechnung/pdf", line: 4076, access: "permissions", permissions: ["ressourcen_stundenauswertung"], reason: "Stundenauswertungs-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/stunden", line: 4154, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/stunden", line: 4168, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/stunden", line: 4202, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/stunden/:sid", line: 4228, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/material", line: 4241, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/material", line: 4255, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/material/:mid", line: 4283, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/material/:mid", line: 4309, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4322, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4336, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4360, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4376, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/soek", line: 4389, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/soek", line: 4403, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/soek/:sid", line: 4427, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/soek/:sid", line: 4443, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/config", line: 4456, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/config", line: 4478, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/material", line: 4522, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/material", line: 4536, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/material/:mid", line: 4560, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/fremdleistungen", line: 4573, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/fremdleistungen", line: 4587, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/fremdleistungen/:fid", line: 4611, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/soek", line: 4624, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/soek", line: 4637, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/soek/:sid", line: 4651, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kalkulation-pdf", line: 4665, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulations-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ferien", line: 5252, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/ferien", line: 5269, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/ferien/:id", line: 5287, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/ferien/:id", line: 5296, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lieferanten", line: 5305, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lieferanten", line: 5314, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/lieferanten/:id", line: 5323, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lieferanten/:id", line: 5332, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/materialbestellungen", line: 5341, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/materialbestellungen", line: 5351, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/materialbestellungen/:id", line: 5360, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/materialbestellungen/:id", line: 5369, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/kommentare", line: 5378, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kommentare", line: 5390, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kommentare/:id", line: 5406, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskommentare.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5418, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5424, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hilfsmaterial/:id", line: 5430, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hilfsmaterial/:id", line: 5436, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5444, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5450, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5456, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5462, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5470, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", line: 5516, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5542, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-stunden/:id", line: 5550, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-stunden/:id", line: 5558, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-zeiterfassung/:zeitId", line: 5573, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-material", line: 5581, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-material", line: 5587, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-material/:id", line: 5593, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-material/:id", line: 5599, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5607, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5613, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-fremd/:id", line: 5619, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-fremd/:id", line: 5625, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5633, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5639, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-soek/:id", line: 5645, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-soek/:id", line: 5651, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/finanzen/uebersicht", line: 5660, access: "permissions", permissions: ["finanzmanagement_finanzen_uebersicht"], reason: "Finanzen-Übersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/wartung/rechnungsbetraege-neu-berechnen", line: 5676, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien", line: 5728, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien/warnungen", line: 5744, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/garantien", line: 5757, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/garantien/:id", line: 5766, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/garantien/:id", line: 5775, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/lieferschein-pdf", line: 5784, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/auftragsbestaetigung-pdf", line: 5869, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/abnahme-pdf", line: 5934, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen", line: 6039, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen/:docTyp", line: 6111, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/pdf-vorlagen/:docTyp", line: 6124, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/pdf-vorlagen/vorschau", line: 6172, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/send", line: 6310, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-auftrag", line: 6357, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lager", line: 6397, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager", line: 6405, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/lager/:id", line: 6413, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lager/:id", line: 6421, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager/:id/buchung", line: 6429, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/liefertermine", line: 6446, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/liefertermine", line: 6457, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/liefertermine/:id", line: 6465, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/liefertermine/:id", line: 6473, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mwst/auswertung", line: 6483, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/fibu", line: 6567, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/wiederholen", line: 6625, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/backup", line: 6684, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/public/auftrag/:token", line: 6715, access: "public", permissions: [], reason: "Redigierter Projektstatus über einen separaten Public-Token.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/generate-token", line: 6752, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/generate-token", line: 6773, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte", line: 6781, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte", line: 6790, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/schritte/:sid", line: 6802, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid", line: 6824, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 6833, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 6855, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid/fotos/:fid", line: 6865, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/positionen", line: 6906, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen", line: 6919, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/positionen/:pid", line: 6959, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/positionen/:pid", line: 6987, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen/import-vorkalkulation", line: 7002, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/kunden-nachricht", line: 7129, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
] as const satisfies readonly RoutePolicy[];

export const ROUTE_POLICY_BY_FINGERPRINT: Readonly<Record<string, RoutePolicy>> =
  Object.fromEntries(ROUTE_POLICIES.map((policy) => [`${policy.method} ${policy.path}`, policy]));

export function getRoutePolicy(method: string, path: string): RoutePolicy | undefined {
  return ROUTE_POLICY_BY_FINGERPRINT[`${method.toUpperCase()} ${path}`];
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
