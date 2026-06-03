/**
 * Berechtigungssystem für AuftragsPro
 *
 * Admins haben immer vollen Zugriff.
 * Mitarbeiter haben nur Zugriff auf Module die explizit aktiviert sind.
 * Ist berechtigungen = null → Standardberechtigungen für Mitarbeiter.
 */

export type ModulKey =
  | "dashboard_finanzen"
  | "auftraege"
  | "zeiterfassung"
  | "rechnungen"
  | "offerten"
  | "kalkulation"
  | "finanzmanagement"
  | "einkauf"
  | "dokumente"
  | "ressourcen"
  | "benutzerverwaltung"
  | "einstellungen";

export interface ModulInfo {
  key: ModulKey;
  label: string;
  beschreibung: string;
  standard: boolean; // Standard für neue Mitarbeiter
}

export const ALLE_MODULE: ModulInfo[] = [
  { key: "dashboard_finanzen",  label: "Dashboard Finanzübersicht", beschreibung: "Umsatz, Mahnungen und Finanzkennzahlen im Dashboard", standard: false },
  { key: "auftraege",           label: "Aufträge",                  beschreibung: "Aufträge anzeigen, erstellen und bearbeiten",           standard: true  },
  { key: "zeiterfassung",       label: "Zeiterfassung",             beschreibung: "Arbeitszeiten erfassen und anzeigen",                   standard: true  },
  { key: "rechnungen",          label: "Rechnungen",                beschreibung: "Rechnungen anzeigen und erstellen",                     standard: false },
  { key: "offerten",            label: "Offerten",                  beschreibung: "Offerten anzeigen und erstellen",                       standard: true  },
  { key: "kalkulation",         label: "Kalkulation",               beschreibung: "Vor- und Nachkalkulation",                             standard: false },
  { key: "finanzmanagement",    label: "Finanzmanagement",          beschreibung: "MWST, Monatsauswertung, Mahnwesen",                    standard: false },
  { key: "einkauf",             label: "Einkauf",                   beschreibung: "Materialeinkauf und Bestellungen",                      standard: true  },
  { key: "dokumente",           label: "Dokumente",                 beschreibung: "Dokumente und Dateien verwalten",                       standard: true  },
  { key: "ressourcen",          label: "Ressourcen",                beschreibung: "Mitarbeiterakte, Stundenauswertung, Lohnabrechnung",    standard: false },
  { key: "benutzerverwaltung",  label: "Benutzerverwaltung",        beschreibung: "Benutzer erstellen und verwalten",                     standard: false },
  { key: "einstellungen",       label: "Einstellungen",             beschreibung: "App-Einstellungen und Konfiguration",                  standard: false },
];

/** Standard-Berechtigungen für neue Mitarbeiter */
export function standardBerechtigungen(): Record<ModulKey, boolean> {
  return Object.fromEntries(
    ALLE_MODULE.map((m) => [m.key, m.standard])
  ) as Record<ModulKey, boolean>;
}

/**
 * Prüft ob ein Benutzer Zugriff auf ein Modul hat.
 * Admins haben immer vollen Zugriff.
 */
export function hatZugriff(
  rolle: string,
  berechtigungen: string | null | undefined,
  modul: ModulKey
): boolean {
  if (rolle === "admin") return true;
  if (!berechtigungen) {
    // Kein Eintrag → Standardberechtigungen
    return standardBerechtigungen()[modul];
  }
  try {
    const parsed: Record<ModulKey, boolean> = JSON.parse(berechtigungen);
    return parsed[modul] ?? standardBerechtigungen()[modul];
  } catch {
    return standardBerechtigungen()[modul];
  }
}
