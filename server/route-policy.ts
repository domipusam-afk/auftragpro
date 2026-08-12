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
  { method: "POST", path: "/api/auth/login", line: 231, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/verify-2fa", line: 368, access: "public", permissions: [], reason: "Legacy-Anmeldefluss muss vor einer Sitzung erreichbar sein.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/setup-2fa", line: 427, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Einrichtung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/confirm-2fa", line: 466, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche 2FA-Bestätigung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auth/passwort-aendern", line: 497, access: "permissions", permissions: ["einstellungen"], reason: "Persönliche Passwortänderung; bei Aktivierung zusätzlich an req.auth-Identität binden.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/benutzer", line: 529, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer", line: 541, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/benutzer/:id", line: 567, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/benutzer/:id", line: 593, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/benutzer/:id/reset-2fa", line: 604, access: "admin-only", permissions: [], reason: "Benutzerverwaltung und 2FA-Reset sind hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stats", line: 618, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskennzahlen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reingewinn", line: 651, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Finanzkennzahlen im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege", line: 697, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege", line: 710, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id", line: 770, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id", line: 805, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/status", line: 876, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id", line: 903, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/notizen", line: 926, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/notizen", line: 940, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/notizen/:nid", line: 964, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente", line: 976, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/dokumente", line: 990, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/dokumente/:did/download", line: 1072, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/dokumente/:did", line: 1079, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/rechnungen", line: 1120, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen", line: 1134, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/rechnungen/:rid/pdf", line: 2189, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/rechnungen", line: 2300, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/rechnungen/:id", line: 2314, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/rechnungen/:id", line: 2336, access: "permissions", permissions: ["rechnungen"], reason: "Rechnungen und Rechnungs-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/suche", line: 2348, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/q3", line: 2568, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen", line: 2575, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorlagen", line: 2588, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorlagen/:vid/download", line: 2622, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorlagen/:vid", line: 2643, access: "permissions", permissions: ["dokumente_uebersicht"], reason: "Dokumentenübersicht und Dokumentvorlagen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/zeit", line: 2658, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/zeit", line: 2673, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/zeit/:zid", line: 2709, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/fotos/:auftragId", line: 2723, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/fotos/:auftragId", line: 2731, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/fotos/:id", line: 2740, access: "permissions", permissions: ["dokumente_fotodokumentation"], reason: "Bild- und Fotodokumentation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/formulare", line: 2749, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/formulare", line: 2757, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/formulare/:id", line: 2766, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/formulare/:id", line: 2774, access: "permissions", permissions: ["dokumente_formulare"], reason: "Formulare und Unterschriften.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/ungelesen", line: 2784, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/als-gelesen", line: 2796, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/chat/:auftragId", line: 2801, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/chat/:auftragId", line: 2809, access: "permissions", permissions: ["dokumente_chat_historie"], reason: "Chat und Historie.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden/next-nr", line: 2819, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kunden", line: 2838, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden", line: 2846, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/kunden/:id", line: 2867, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kunden/:id", line: 2875, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mitarbeiter", line: 2884, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mitarbeiter", line: 2892, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mitarbeiter/:id", line: 2902, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mitarbeiter/:id", line: 2910, access: "permissions", permissions: ["ressourcen_mitarbeiterakte"], reason: "Mitarbeiterakte.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stempel/aktiv", line: 2921, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/ein", line: 2938, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stempel/aus", line: 2964, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege/monatsauswertung", line: 2989, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/zeiteintraege", line: 3005, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/zeiteintraege", line: 3015, access: "permissions", permissions: ["zeiterfassung"], reason: "Zeiterfassung und Stempeluhr.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/test", line: 3043, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen", line: 3068, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/status-pipeline", line: 3079, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline/reorder", line: 3090, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/einstellungen/status-pipeline", line: 3102, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/einstellungen/status-pipeline/:id", line: 3114, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/einstellungen/status-pipeline/:id", line: 3131, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/einstellungen/:key", line: 3143, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/einstellungen/:key", line: 3151, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/stundensaetze", line: 3166, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/stundensaetze/:id", line: 3174, access: "permissions", permissions: ["einstellungen"], reason: "App-Einstellungen und Kostensätze.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kunden/sync-from-auftrag", line: 3196, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Kundenstamm beziehungsweise Auftragssuche.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/termine", line: 3274, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/termine", line: 3282, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/termine/:id", line: 3291, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/termine/:id", line: 3299, access: "permissions", permissions: ["ressourcen_planung_termine"], reason: "Planung und Termine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/aufgaben", line: 3310, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/aufgaben", line: 3330, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/aufgaben/:id", line: 3357, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/aufgaben/:id", line: 3400, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Aufgaben.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/plantafel", line: 3409, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/plantafel", line: 3417, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/plantafel/:id", line: 3426, access: "permissions", permissions: ["ressourcen_plantafel"], reason: "Plantafel.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mahnungen", line: 3435, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen", line: 3452, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/mahnungen/:id", line: 3483, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/mahnungen/:id", line: 3495, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/mahnungen/:id/pdf", line: 3504, access: "permissions", permissions: ["finanzmanagement_mahnwesen"], reason: "Mahnwesen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragId", line: 3577, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragId", line: 3589, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/position/:id", line: 3610, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/eingangsrechnungen", line: 3619, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/eingangsrechnungen", line: 3630, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/eingangsrechnungen/:id", line: 3650, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/eingangsrechnungen/:id", line: 3662, access: "permissions", permissions: ["finanzmanagement_eingangsrechnungen"], reason: "Eingangsrechnungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:auftr_id/offerten", line: 3712, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten", line: 3724, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:auftr_id/offerten", line: 3735, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/offerten/:id", line: 3782, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/offerten/:id", line: 3797, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-rechnung", line: 3808, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ping", line: 3889, access: "public", permissions: [], reason: "Betriebs-Ping ohne Geschäftsdaten.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/pdf", line: 3894, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/offerten/:id/pdf", line: 3966, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lohnabrechnung/pdf", line: 4040, access: "permissions", permissions: ["ressourcen_lohnabrechnung"], reason: "Lohnabrechnungs-PDF.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/stundenabrechnung/pdf", line: 4139, access: "permissions", permissions: ["ressourcen_stundenauswertung"], reason: "Stundenauswertungs-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/stunden", line: 4217, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/stunden", line: 4231, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/stunden", line: 4265, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/stunden/:sid", line: 4291, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/material", line: 4304, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/material", line: 4318, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/material/:mid", line: 4346, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/material/:mid", line: 4372, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4385, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/fremdleistungen", line: 4399, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4423, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/fremdleistungen/:fid", line: 4439, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/soek", line: 4452, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/vorkalkulation/:id/soek", line: 4466, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/vorkalkulation/:id/soek/:sid", line: 4490, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/vorkalkulation/:id/soek/:sid", line: 4506, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/vorkalkulation/:id/config", line: 4519, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/vorkalkulation/:id/config", line: 4541, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/material", line: 4585, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/material", line: 4599, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/material/:mid", line: 4623, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/fremdleistungen", line: 4636, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/fremdleistungen", line: 4650, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/fremdleistungen/:fid", line: 4674, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/nachkalkulation/:id/soek", line: 4687, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/nachkalkulation/:id/soek", line: 4700, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/nachkalkulation/:id/soek/:sid", line: 4714, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kalkulation-pdf", line: 4728, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulations-PDF.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/ferien", line: 5315, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/ferien", line: 5332, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/ferien/:id", line: 5350, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/ferien/:id", line: 5359, access: "permissions", permissions: ["ressourcen_ferienplanung"], reason: "Ferienplanung.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lieferanten", line: 5368, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lieferanten", line: 5377, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/lieferanten/:id", line: 5386, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lieferanten/:id", line: 5395, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/materialbestellungen", line: 5404, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/materialbestellungen", line: 5414, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/materialbestellungen/:id", line: 5423, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/materialbestellungen/:id", line: 5432, access: "permissions", permissions: ["einkauf_lieferanten_material"], reason: "Lieferanten, Material und Bestellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/kommentare", line: 5441, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/kommentare", line: 5453, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kommentare/:id", line: 5469, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Auftragskommentare.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5481, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hilfsmaterial", line: 5487, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hilfsmaterial/:id", line: 5493, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hilfsmaterial/:id", line: 5499, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5507, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/hauptmaterial-flaeche", line: 5513, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5519, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/hauptmaterial-flaeche/:id", line: 5525, access: "permissions", permissions: ["kalkulation_vorkalkulation"], reason: "Vorkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5533, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden/sync-zeiterfassung", line: 5579, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-stunden", line: 5605, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-stunden/:id", line: 5613, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-stunden/:id", line: 5621, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-zeiterfassung/:zeitId", line: 5636, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-material", line: 5644, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-material", line: 5650, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-material/:id", line: 5656, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-material/:id", line: 5662, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5670, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-fremd", line: 5676, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-fremd/:id", line: 5682, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-fremd/:id", line: 5688, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5696, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/kalkulation/:auftragsId/nk-soek", line: 5702, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/kalkulation/nk-soek/:id", line: 5708, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/kalkulation/nk-soek/:id", line: 5714, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Nachkalkulation.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/finanzen/uebersicht", line: 5723, access: "permissions", permissions: ["finanzmanagement_finanzen_uebersicht"], reason: "Finanzen-Übersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/wartung/rechnungsbetraege-neu-berechnen", line: 5739, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien", line: 5791, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/garantien/warnungen", line: 5807, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/garantien", line: 5820, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/garantien/:id", line: 5829, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/garantien/:id", line: 5838, access: "permissions", permissions: ["finanzmanagement_garantien"], reason: "Garantieübersicht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/lieferschein-pdf", line: 5847, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/auftragsbestaetigung-pdf", line: 5932, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/abnahme-pdf", line: 5997, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen", line: 6102, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/pdf-vorlagen/:docTyp", line: 6174, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/pdf-vorlagen/:docTyp", line: 6187, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/pdf-vorlagen/vorschau", line: 6235, access: "permissions", permissions: ["einstellungen"], reason: "PDF-Vorlagen gehören zu den Einstellungen.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/email/send", line: 6373, access: "admin-only", permissions: [], reason: "E-Mail-Versand ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/offerten/:id/zu-auftrag", line: 6420, access: "permissions", permissions: ["offerten"], reason: "Offerten und Offerten-PDFs.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/lager", line: 6460, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager", line: 6468, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/lager/:id", line: 6476, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/lager/:id", line: 6484, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/lager/:id/buchung", line: 6492, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/liefertermine", line: 6509, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/liefertermine", line: 6520, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/liefertermine/:id", line: 6528, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/liefertermine/:id", line: 6536, access: "permissions", permissions: ["einkauf_lagerverwaltung"], reason: "Lagerverwaltung und Liefertermine.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/mwst/auswertung", line: 6546, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/export/fibu", line: 6699, access: "permissions", permissions: ["finanzmanagement_mwst"], reason: "MWST-Auswertung beziehungsweise Finanzexport.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/downloads/sign", line: 6707, access: "public", permissions: [], reason: "Bearer-Authentifizierung und Zielberechtigung werden im Signatur-Handler für den angeforderten Download geprüft.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/downloads/fetch", line: 6733, access: "public", permissions: [], reason: "Bewusste Ausnahme: einmaliger HMAC-signierter Kurzzeit-Token ist die Authentifizierung des Browser-Downloads.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/wiederholen", line: 6778, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/backup", line: 6837, access: "admin-only", permissions: [], reason: "Wartung beziehungsweise vollständiger Datenexport ist hochprivilegiert.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/public/auftrag/:token", line: 6868, access: "public", permissions: [], reason: "Redigierter Projektstatus über einen separaten Public-Token.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/generate-token", line: 6905, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/generate-token", line: 6926, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte", line: 6934, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte", line: 6943, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/schritte/:sid", line: 6955, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid", line: 6977, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 6986, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/schritte/:sid/fotos", line: 7008, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/schritte/:sid/fotos/:fid", line: 7018, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/auftraege/:id/positionen", line: 7059, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen", line: 7072, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/positionen/:pid", line: 7112, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "DELETE", path: "/api/auftraege/:id/positionen/:pid", line: 7140, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "POST", path: "/api/auftraege/:id/positionen/import-vorkalkulation", line: 7155, access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/auftraege/:id/kunden-nachricht", line: 7282, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Aufträge, Status, Notizen, Positionen, Schritte und Kunden-Nachricht.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/preferences", line: 7437, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönliche Dashboard-Kachel- und Erinnerungspräferenzen.", currentEnforcement: "unguarded" },
  { method: "PUT", path: "/api/dashboard/preferences", line: 7463, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönliche Dashboard-Kachel- und Erinnerungspräferenzen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/reminders", line: 7501, access: "permissions", permissions: ["auftraege_anzeigen"], reason: "Persönlich konfigurierbare Handlungserinnerungen für Aufträge, Rechnungen und Offerten.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/aufgaben", line: 7725, access: "permissions", permissions: ["ressourcen_aufgaben"], reason: "Team-Ansicht offener Aufgaben im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/ueberfaellige-rechnungen", line: 7783, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Überfällige Rechnungen und offene Bruttobeträge im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/top-kunden", line: 7882, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Top-Kunden nach fakturiertem Netto-Umsatz im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/deckungsbeitrag", line: 7956, access: "permissions", permissions: ["dashboard_finanzen"], reason: "DB1 nach Rechnungsdatum und erfassten direkten IST-Kosten im Dashboard.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/verlustrisiko", line: 8058, access: "permissions", permissions: ["dashboard_finanzen"], reason: "Harte Warnung bei erfassten IST-Kosten über detaillierter Vorkalkulation und DB1 unter 10 %.", currentEnforcement: "unguarded" },
  { method: "PATCH", path: "/api/nachkalkulation/:id/status", line: 7326, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Expliziten Abschluss der Nachkalkulation setzen.", currentEnforcement: "unguarded" },
  { method: "GET", path: "/api/dashboard/offene-nachkalkulation", line: 8151, access: "permissions", permissions: ["kalkulation_nachkalkulation"], reason: "Abgeschlossene Aufträge ohne explizit abgeschlossene Nachkalkulation im Dashboard.", currentEnforcement: "unguarded" },
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
