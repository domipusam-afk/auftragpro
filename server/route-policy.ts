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
  { method: "POST", path: "/api/auth/login", line: 335, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/verify-2fa", line: 472, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/setup-2fa", line: 531, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Einrichtung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/confirm-2fa", line: 570, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Bestätigung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-aendern", line: 601, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche Passwortänderung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/benutzer", line: 633, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer", line: 645, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/benutzer/:id", line: 671, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/benutzer/:id", line: 697, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer/:id/reset-2fa", line: 708, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stats", line: 722, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskennzahlen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reingewinn", line: 755, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Finanzkennzahlen im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege", line: 801, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege", line: 814, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id", line: 874, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id", line: 909, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/status", line: 980, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id", line: 1007, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/notizen", line: 1030, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/notizen", line: 1044, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/notizen/:nid", line: 1068, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente", line: 1080, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/dokumente", line: 1094, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente/:did/download", line: 1176, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/dokumente/:did", line: 1183, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/rechnungen", line: 1224, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen", line: 1238, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen/:rid/pdf", line: 2293, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/rechnungen", line: 2404, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/rechnungen/:id", line: 2418, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/rechnungen/:id", line: 2440, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/suche", line: 2452, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/q3", line: 2672, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen", line: 2679, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorlagen", line: 2692, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen/:vid/download", line: 2726, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorlagen/:vid", line: 2747, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/zeit", line: 2762, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/zeit", line: 2777, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/zeit/:zid", line: 2813, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/fotos/:auftragId", line: 2827, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/fotos/:auftragId", line: 2835, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/fotos/:id", line: 2844, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/formulare", line: 2853, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/formulare", line: 2861, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/formulare/:id", line: 2870, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/formulare/:id", line: 2878, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/ungelesen", line: 2888, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/als-gelesen", line: 2900, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/:auftragId", line: 2905, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/:auftragId", line: 2913, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden/next-nr", line: 2923, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden", line: 2942, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden", line: 2950, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/kunden/:id", line: 2971, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kunden/:id", line: 2979, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mitarbeiter", line: 2988, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mitarbeiter", line: 2996, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mitarbeiter/:id", line: 3006, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mitarbeiter/:id", line: 3014, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stempel/aktiv", line: 3025, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/ein", line: 3042, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/aus", line: 3068, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege/monatsauswertung", line: 3093, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege", line: 3109, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/zeiteintraege", line: 3119, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/test", line: 3147, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen", line: 3172, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/status-pipeline", line: 3183, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline/reorder", line: 3194, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline", line: 3206, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/einstellungen/status-pipeline/:id", line: 3218, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/einstellungen/status-pipeline/:id", line: 3235, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/:key", line: 3247, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/einstellungen/:key", line: 3255, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stundensaetze", line: 3270, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/stundensaetze/:id", line: 3278, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden/sync-from-auftrag", line: 3300, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/termine", line: 3378, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/termine", line: 3386, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/termine/:id", line: 3395, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/termine/:id", line: 3403, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/aufgaben", line: 3414, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/aufgaben", line: 3434, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/aufgaben/:id", line: 3461, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/aufgaben/:id", line: 3504, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/plantafel", line: 3513, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/plantafel", line: 3521, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/plantafel/:id", line: 3530, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mahnungen", line: 3539, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen", line: 3556, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mahnungen/:id", line: 3587, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mahnungen/:id", line: 3599, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen/:id/pdf", line: 3608, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragId", line: 3681, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragId", line: 3693, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/position/:id", line: 3714, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/eingangsrechnungen", line: 3723, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/eingangsrechnungen", line: 3734, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/eingangsrechnungen/:id", line: 3754, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/eingangsrechnungen/:id", line: 3766, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:auftr_id/offerten", line: 3816, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten", line: 3828, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:auftr_id/offerten", line: 3839, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/offerten/:id", line: 3886, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/offerten/:id", line: 3901, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-rechnung", line: 3912, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ping", line: 3993, access: "public", permissions: [], reason: "Betriebs-Ping ohne Geschäftsdaten.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/pdf", line: 3998, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten/:id/pdf", line: 4070, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lohnabrechnung/pdf", line: 4144, access: "permissions", permissions: ["ressourcen_lohnabrechnung"], reason: "Lohnabrechnungs-PDF.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stundenabrechnung/pdf", line: 4243, access: "permissions", permissions: ["ressourcen_stundenauswertung"], reason: "Stundenauswertungs-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/stunden", line: 4321, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/stunden", line: 4335, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/stunden", line: 4369, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/stunden/:sid", line: 4395, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/material", line: 4408, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/material", line: 4422, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/material/:mid", line: 4450, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/material/:mid", line: 4476, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4489, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4503, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4527, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4543, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/soek", line: 4556, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/soek", line: 4570, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/soek/:sid", line: 4594, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/soek/:sid", line: 4610, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/config", line: 4623, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/config", line: 4645, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/material", line: 4689, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/material", line: 4703, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/material/:mid", line: 4727, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/fremdleistungen", line: 4740, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/fremdleistungen", line: 4754, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/fremdleistungen/:fid", line: 4778, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/soek", line: 4791, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/soek", line: 4804, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/soek/:sid", line: 4818, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kalkulation-pdf", line: 4832, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulations-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ferien", line: 5419, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/ferien", line: 5436, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/ferien/:id", line: 5454, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/ferien/:id", line: 5463, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lieferanten", line: 5472, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lieferanten", line: 5481, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/lieferanten/:id", line: 5490, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lieferanten/:id", line: 5499, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/materialbestellungen", line: 5508, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/materialbestellungen", line: 5518, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/materialbestellungen/:id", line: 5527, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/materialbestellungen/:id", line: 5536, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/kommentare", line: 5545, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kommentare", line: 5557, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kommentare/:id", line: 5573, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskommentare.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5585, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5591, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hilfsmaterial/:id", line: 5597, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hilfsmaterial/:id", line: 5603, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5611, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5617, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5623, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5629, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5637, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", line: 5683, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5709, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-stunden/:id", line: 5717, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-stunden/:id", line: 5725, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-zeiterfassung/:zeitId", line: 5740, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-material", line: 5748, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-material", line: 5754, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-material/:id", line: 5760, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-material/:id", line: 5766, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5774, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5780, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-fremd/:id", line: 5786, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-fremd/:id", line: 5792, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5800, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5806, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-soek/:id", line: 5812, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-soek/:id", line: 5818, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/finanzen/uebersicht", line: 5827, access: "permissions", permissions: ["finanzmanagement_finanzen_uebersicht"], reason: "Finanzen-Übersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/wartung/rechnungsbetraege-neu-berechnen", line: 5843, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien", line: 5895, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien/warnungen", line: 5911, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/garantien", line: 5924, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/garantien/:id", line: 5933, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/garantien/:id", line: 5942, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/lieferschein-pdf", line: 5951, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/auftragsbestaetigung-pdf", line: 6036, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/abnahme-pdf", line: 6101, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen", line: 6206, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen/:docTyp", line: 6278, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/pdf-vorlagen/:docTyp", line: 6291, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/pdf-vorlagen/vorschau", line: 6339, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/send", line: 6477, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-auftrag", line: 6524, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lager", line: 6564, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager", line: 6572, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/lager/:id", line: 6580, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lager/:id", line: 6588, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager/:id/buchung", line: 6596, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/liefertermine", line: 6613, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/liefertermine", line: 6624, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/liefertermine/:id", line: 6632, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/liefertermine/:id", line: 6640, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mwst/auswertung", line: 6650, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/fibu", line: 6797, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/downloads/sign", line: 6805, access: "public", permissions: [], reason: "Bearer-Authentifizierung und Zielberechtigung werden im Signatur-Handler für den angeforderten Download geprüft.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/downloads/fetch", line: 6831, access: "public", permissions: [], reason: "Bewusste Ausnahme: einmaliger HMAC-signierter Kurzzeit-Token ist die Authentifizierung des Browser-Downloads.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/wiederholen", line: 6876, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/backup", line: 6935, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/public/auftrag/:token", line: 6966, access: "public", permissions: [], reason: "Redigierter Projektstatus über einen separaten Public-Token.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/generate-token", line: 7003, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/generate-token", line: 7024, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte", line: 7032, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte", line: 7041, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/schritte/:sid", line: 7053, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid", line: 7075, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 7084, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 7106, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid/fotos/:fid", line: 7116, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/positionen", line: 7157, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen", line: 7170, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/positionen/:pid", line: 7210, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/positionen/:pid", line: 7238, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen/import-vorkalkulation", line: 7253, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/kunden-nachricht", line: 7380, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
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
