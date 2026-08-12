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
  { method: "POST", path: "/api/auth/verify-2fa", line: 411, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/setup-2fa", line: 470, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Einrichtung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/confirm-2fa", line: 509, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Bestätigung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-aendern", line: 540, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche Passwortänderung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/benutzer", line: 572, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer", line: 584, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/benutzer/:id", line: 610, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/benutzer/:id", line: 636, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer/:id/reset-2fa", line: 647, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stats", line: 661, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskennzahlen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reingewinn", line: 694, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Finanzkennzahlen im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege", line: 752, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege", line: 766, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id", line: 832, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id", line: 867, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/status", line: 938, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id", line: 965, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/notizen", line: 1034, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/notizen", line: 1048, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/notizen/:nid", line: 1072, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente", line: 1084, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/dokumente", line: 1098, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente/:did/download", line: 1180, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/dokumente/:did", line: 1187, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/rechnungen", line: 1228, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen", line: 1242, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen/:rid/pdf", line: 2327, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/rechnungen", line: 2438, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/rechnungen/:id", line: 2455, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/rechnungen/:id", line: 2495, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/suche", line: 2507, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/q3", line: 2727, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen", line: 2734, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorlagen", line: 2747, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen/:vid/download", line: 2781, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorlagen/:vid", line: 2802, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/zeit", line: 2817, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/zeit", line: 2832, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/zeit/:zid", line: 2868, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/fotos/:auftragId", line: 2882, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/fotos/:auftragId", line: 2890, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/fotos/:id", line: 2899, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/formulare", line: 2908, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/formulare", line: 2916, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/formulare/:id", line: 2925, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/formulare/:id", line: 2933, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/ungelesen", line: 2943, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/als-gelesen", line: 2955, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/:auftragId", line: 2960, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/:auftragId", line: 2968, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden/next-nr", line: 2978, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden", line: 2997, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden", line: 3010, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/kunden/:id", line: 3034, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kunden/:id", line: 3045, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mitarbeiter", line: 3054, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mitarbeiter", line: 3062, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mitarbeiter/:id", line: 3072, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mitarbeiter/:id", line: 3080, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stempel/aktiv", line: 3091, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/ein", line: 3108, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/aus", line: 3134, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege/monatsauswertung", line: 3159, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege", line: 3175, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/zeiteintraege", line: 3185, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/test", line: 3213, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen", line: 3238, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/status-pipeline", line: 3249, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline/reorder", line: 3260, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline", line: 3272, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/einstellungen/status-pipeline/:id", line: 3284, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/einstellungen/status-pipeline/:id", line: 3301, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/:key", line: 3313, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/einstellungen/:key", line: 3321, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stundensaetze", line: 3336, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/stundensaetze/:id", line: 3344, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden/sync-from-auftrag", line: 3366, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/termine", line: 3471, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/termine", line: 3479, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/termine/:id", line: 3490, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/termine/:id", line: 3500, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/aufgaben", line: 3511, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/aufgaben", line: 3531, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/aufgaben/:id", line: 3558, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/aufgaben/:id", line: 3601, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/plantafel", line: 3610, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/plantafel", line: 3618, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/plantafel/:id", line: 3627, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mahnungen", line: 3636, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen", line: 3653, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mahnungen/:id", line: 3684, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mahnungen/:id", line: 3696, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen/:id/pdf", line: 3705, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragId", line: 3778, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragId", line: 3790, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/position/:id", line: 3811, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/eingangsrechnungen", line: 3820, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/eingangsrechnungen", line: 3831, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/eingangsrechnungen/:id", line: 3851, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/eingangsrechnungen/:id", line: 3863, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:auftr_id/offerten", line: 3913, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten", line: 3925, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:auftr_id/offerten", line: 3937, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/offerten/:id", line: 3992, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/offerten/:id", line: 4007, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-rechnung", line: 4018, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ping", line: 4101, access: "public", permissions: [], reason: "Betriebs-Ping ohne Geschäftsdaten.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/pdf", line: 4106, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten/:id/pdf", line: 4178, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lohnabrechnung/pdf", line: 4252, access: "permissions", permissions: ["ressourcen_lohnabrechnung"], reason: "Lohnabrechnungs-PDF.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stundenabrechnung/pdf", line: 4351, access: "permissions", permissions: ["ressourcen_stundenauswertung"], reason: "Stundenauswertungs-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/stunden", line: 4429, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/stunden", line: 4443, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/stunden", line: 4477, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/stunden/:sid", line: 4503, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/material", line: 4516, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/material", line: 4530, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/material/:mid", line: 4558, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/material/:mid", line: 4584, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4597, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4611, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4635, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4651, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/soek", line: 4664, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/soek", line: 4678, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/soek/:sid", line: 4702, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/soek/:sid", line: 4718, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/config", line: 4731, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/config", line: 4753, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kalkulation-pdf", line: 4802, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulations-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ferien", line: 5389, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/ferien", line: 5406, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/ferien/:id", line: 5424, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/ferien/:id", line: 5433, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lieferanten", line: 5442, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lieferanten", line: 5451, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/lieferanten/:id", line: 5460, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lieferanten/:id", line: 5469, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/materialbestellungen", line: 5478, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/materialbestellungen", line: 5488, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/materialbestellungen/:id", line: 5497, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/materialbestellungen/:id", line: 5506, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/kommentare", line: 5515, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kommentare", line: 5527, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kommentare/:id", line: 5544, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskommentare.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5556, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5562, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hilfsmaterial/:id", line: 5568, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hilfsmaterial/:id", line: 5574, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5582, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5588, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5594, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5600, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5608, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", line: 5671, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5701, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-stunden/:id", line: 5726, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-stunden/:id", line: 5755, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-zeiterfassung/:zeitId", line: 5776, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-material", line: 5790, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-material", line: 5799, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-material/:id", line: 5820, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-material/:id", line: 5842, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5853, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5862, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-fremd/:id", line: 5882, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-fremd/:id", line: 5903, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5914, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5923, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-soek/:id", line: 5947, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-soek/:id", line: 5979, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/finanzen/uebersicht", line: 5991, access: "permissions", permissions: ["finanzmanagement_finanzen_uebersicht"], reason: "Finanzen-Übersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/wartung/rechnungsbetraege-neu-berechnen", line: 6009, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien", line: 6062, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien/warnungen", line: 6078, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/garantien", line: 6091, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/garantien/:id", line: 6100, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/garantien/:id", line: 6109, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/lieferschein-pdf", line: 6118, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/auftragsbestaetigung-pdf", line: 6203, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/abnahme-pdf", line: 6268, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen", line: 6373, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen/:docTyp", line: 6445, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/pdf-vorlagen/:docTyp", line: 6458, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/pdf-vorlagen/vorschau", line: 6506, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/send", line: 6644, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-auftrag", line: 6691, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lager", line: 6731, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager", line: 6739, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/lager/:id", line: 6747, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lager/:id", line: 6755, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager/:id/buchung", line: 6763, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/liefertermine", line: 6780, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/liefertermine", line: 6791, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/liefertermine/:id", line: 6799, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/liefertermine/:id", line: 6807, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mwst/auswertung", line: 6817, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/fibu", line: 6970, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/downloads/sign", line: 6978, access: "public", permissions: [], reason: "Bearer-Authentifizierung und Zielberechtigung werden im Signatur-Handler für den angeforderten Download geprüft.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/downloads/fetch", line: 7004, access: "public", permissions: [], reason: "Bewusste Ausnahme: einmaliger HMAC-signierter Kurzzeit-Token ist die Authentifizierung des Browser-Downloads.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/wiederholen", line: 7049, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/backup", line: 7108, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/public/auftrag/:token", line: 7139, access: "public", permissions: [], reason: "Redigierter Projektstatus über einen separaten Public-Token.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/generate-token", line: 7176, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/generate-token", line: 7197, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte", line: 7205, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte", line: 7214, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/schritte/:sid", line: 7226, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid", line: 7248, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 7268, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 7290, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid/fotos/:fid", line: 7300, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/positionen", line: 7341, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen", line: 7354, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/positionen/:pid", line: 7394, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/positionen/:pid", line: 7422, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen/import-vorkalkulation", line: 7437, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/kunden-nachricht", line: 7564, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/preferences", line: 7719, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönliche Dashboard-Kachel- und Erinnerungspräferenzen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/dashboard/preferences", line: 7745, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönliche Dashboard-Kachel- und Erinnerungspräferenzen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reminders", line: 7783, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönlich konfigurierbare Handlungserinnerungen für Aufträge, Rechnungen und Offerten.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/aufgaben", line: 8007, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Team-Ansicht offener Aufgaben im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/ueberfaellige-rechnungen", line: 8065, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Überfällige Rechnungen und offene Bruttobeträge im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/top-kunden", line: 8164, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Top-Kunden nach fakturiertem Netto-Umsatz im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/deckungsbeitrag", line: 8238, access: "permissions", permissions: ["dashboard_finanzen"], reason: "DB1 nach Rechnungsdatum und erfassten direkten IST-Kosten im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/verlustrisiko", line: 8340, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Harte Warnung bei erfassten IST-Kosten über detaillierter Vorkalkulation und DB1 unter 10 %.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/nachkalkulation/:id/status", line: 7608, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Expliziten Abschluss der Nachkalkulation setzen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/offene-nachkalkulation", line: 8433, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Abgeschlossene Aufträge ohne explizit abgeschlossene Nachkalkulation im Dashboard.", currentEnforcement: "unguarded" },
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
