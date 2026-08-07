/**
 * Berechtigungssystem für AuftragsPro
 *
 * Admins haben immer vollen Zugriff. Mehrteilige Hauptmodule besitzen neben
 * ihrem (kompatiblen) Hauptmodul-Flag einzelne Flags für jeden Navigationspunkt.
 * Alte gespeicherte Hauptmodul-Flags werden beim Lesen automatisch auf alle
 * zugehörigen Unterpunkte übertragen.
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

export type UnterpunktKey =
  | "kalkulation_vorkalkulation"
  | "kalkulation_nachkalkulation"
  | "finanzmanagement_finanzen_uebersicht"
  | "finanzmanagement_mahnwesen"
  | "finanzmanagement_mwst"
  | "finanzmanagement_eingangsrechnungen"
  | "finanzmanagement_garantien"
  | "einkauf_lieferanten_material"
  | "einkauf_lagerverwaltung"
  | "dokumente_fotodokumentation"
  | "dokumente_formulare"
  | "dokumente_chat_historie"
  | "dokumente_kundendatencenter"
  | "dokumente_uebersicht"
  | "ressourcen_mitarbeiterakte"
  | "ressourcen_planung_termine"
  | "ressourcen_kalender"
  | "ressourcen_plantafel"
  | "ressourcen_ferienplanung"
  | "ressourcen_stundenauswertung"
  | "ressourcen_lohnabrechnung"
  | "ressourcen_aufgaben";

export type BerechtigungKey = ModulKey | UnterpunktKey;
export type Berechtigungen = Record<BerechtigungKey, boolean>;

export interface UnterpunktInfo {
  key: UnterpunktKey;
  label: string;
  beschreibung: string;
}

export interface ModulInfo {
  key: ModulKey;
  label: string;
  beschreibung: string;
  standard: boolean;
  unterpunkte?: readonly UnterpunktInfo[];
}

const KALKULATION_UNTERPUNKTE = [
  { key: "kalkulation_vorkalkulation", label: "Vorkalkulation", beschreibung: "Vor- und Angebotskalkulation" },
  { key: "kalkulation_nachkalkulation", label: "Nachkalkulation", beschreibung: "Nachkalkulation auswerten" },
] as const satisfies readonly UnterpunktInfo[];

const FINANZMANAGEMENT_UNTERPUNKTE = [
  { key: "finanzmanagement_finanzen_uebersicht", label: "Finanzen-Übersicht", beschreibung: "Finanzkennzahlen und Monatsübersicht" },
  { key: "finanzmanagement_mahnwesen", label: "Mahnwesen", beschreibung: "Offene Rechnungen und Mahnungen" },
  { key: "finanzmanagement_mwst", label: "MWST-Abrechnung", beschreibung: "MWST-Auswertung" },
  { key: "finanzmanagement_eingangsrechnungen", label: "Eingangsrechnungen", beschreibung: "Eingangsrechnungen verwalten" },
  { key: "finanzmanagement_garantien", label: "Garantieübersicht", beschreibung: "Garantien verwalten" },
] as const satisfies readonly UnterpunktInfo[];

const EINKAUF_UNTERPUNKTE = [
  { key: "einkauf_lieferanten_material", label: "Lieferanten & Material", beschreibung: "Lieferanten und Material verwalten" },
  { key: "einkauf_lagerverwaltung", label: "Lagerverwaltung", beschreibung: "Lagerbestände verwalten" },
] as const satisfies readonly UnterpunktInfo[];

const DOKUMENTE_UNTERPUNKTE = [
  { key: "dokumente_fotodokumentation", label: "Bild-/Fotodoku", beschreibung: "Fotos und Bilddokumentation" },
  { key: "dokumente_formulare", label: "Formulare & Unterschriften", beschreibung: "Formulare und Unterschriften" },
  { key: "dokumente_chat_historie", label: "Chat & Historie", beschreibung: "Nachrichten und Verlauf" },
  { key: "dokumente_kundendatencenter", label: "Kundendatencenter", beschreibung: "Kundendokumente und Datencenter" },
  { key: "dokumente_uebersicht", label: "Dokumente (+40)", beschreibung: "Dokumentenübersicht" },
] as const satisfies readonly UnterpunktInfo[];

const RESSOURCEN_UNTERPUNKTE = [
  { key: "ressourcen_mitarbeiterakte", label: "Mitarbeiterakte", beschreibung: "Mitarbeiter verwalten" },
  { key: "ressourcen_planung_termine", label: "Planung & Termine", beschreibung: "Termine planen" },
  { key: "ressourcen_kalender", label: "Kalender", beschreibung: "Kalender anzeigen" },
  { key: "ressourcen_plantafel", label: "Plantafel", beschreibung: "Einsatzplanung auf der Plantafel" },
  { key: "ressourcen_ferienplanung", label: "Ferienplanung", beschreibung: "Ferien und Abwesenheiten planen" },
  { key: "ressourcen_stundenauswertung", label: "Stundenauswertung", beschreibung: "Arbeitsstunden auswerten" },
  { key: "ressourcen_lohnabrechnung", label: "Lohnabrechnung", beschreibung: "Lohnabrechnungen verwalten" },
  { key: "ressourcen_aufgaben", label: "Aufgaben", beschreibung: "Eigene und zugewiesene Aufgaben" },
] as const satisfies readonly UnterpunktInfo[];

export const ALLE_MODULE: readonly ModulInfo[] = [
  { key: "dashboard_finanzen", label: "Dashboard Finanzübersicht", beschreibung: "Umsatz, Mahnungen und Finanzkennzahlen im Dashboard", standard: false },
  { key: "auftraege", label: "Aufträge", beschreibung: "Aufträge anzeigen, erstellen und bearbeiten", standard: true },
  { key: "zeiterfassung", label: "Zeiterfassung", beschreibung: "Arbeitszeiten erfassen und anzeigen", standard: true },
  { key: "rechnungen", label: "Rechnungen", beschreibung: "Rechnungen anzeigen und erstellen", standard: false },
  { key: "offerten", label: "Offerten", beschreibung: "Offerten anzeigen und erstellen", standard: true },
  { key: "kalkulation", label: "Kalkulation", beschreibung: "Vor- und Nachkalkulation", standard: false, unterpunkte: KALKULATION_UNTERPUNKTE },
  { key: "finanzmanagement", label: "Finanzmanagement", beschreibung: "Finanzen, Mahnungen, MWST und Garantien", standard: false, unterpunkte: FINANZMANAGEMENT_UNTERPUNKTE },
  { key: "einkauf", label: "Einkauf", beschreibung: "Lieferanten, Material und Lager", standard: true, unterpunkte: EINKAUF_UNTERPUNKTE },
  { key: "dokumente", label: "Dokumente", beschreibung: "Dokumente, Fotos, Formulare und Chat", standard: true, unterpunkte: DOKUMENTE_UNTERPUNKTE },
  { key: "ressourcen", label: "Ressourcen", beschreibung: "Mitarbeiter, Planung, Lohn und Aufgaben", standard: false, unterpunkte: RESSOURCEN_UNTERPUNKTE },
  { key: "benutzerverwaltung", label: "Benutzerverwaltung", beschreibung: "Benutzer erstellen und verwalten", standard: false },
  { key: "einstellungen", label: "Einstellungen", beschreibung: "App-Einstellungen und Konfiguration", standard: false },
];

export const ALLE_UNTERPUNKTE = ALLE_MODULE.flatMap((modul) => modul.unterpunkte || []);

/** Einzelne, im Dialog zählbare Zugriffsbereiche (keine Sammel-Schalter). */
export const ALLE_EINZELBERECHTIGUNGEN: readonly BerechtigungKey[] = ALLE_MODULE.flatMap((modul) =>
  modul.unterpunkte?.map((unterpunkt) => unterpunkt.key) || [modul.key]
);

function istBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function asObjekt(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Normalisiert gespeicherte Rechte in das aktuelle Format.
 *
 * Fehlt ein Unterpunkt-Flag (bei einem alten Benutzerobjekt), übernimmt es den
 * Wert des früheren Hauptmodul-Flags. Dadurch behalten bestehende Mitarbeiter
 * beim Release exakt ihren bisherigen Zugriff.
 */
export function normalisiereBerechtigungen(value?: unknown): Berechtigungen {
  const raw = asObjekt(value);
  const result = {} as Berechtigungen;

  for (const modul of ALLE_MODULE) {
    if (modul.unterpunkte?.length) {
      const rawModulwert = raw[modul.key];
      const legacyModulwert = istBoolean(rawModulwert) ? rawModulwert : modul.standard;
      for (const unterpunkt of modul.unterpunkte) {
        const rawUnterpunktwert = raw[unterpunkt.key];
        result[unterpunkt.key] = istBoolean(rawUnterpunktwert)
          ? rawUnterpunktwert
          : legacyModulwert;
      }
      // Das Hauptmodul ist eine abgeleitete Sammelberechtigung: sichtbar, wenn
      // mindestens ein Unterpunkt verfügbar ist.
      result[modul.key] = modul.unterpunkte.some((unterpunkt) => result[unterpunkt.key]);
    } else {
      const rawModulwert = raw[modul.key];
      result[modul.key] = istBoolean(rawModulwert) ? rawModulwert : modul.standard;
    }
  }

  return result;
}

/** Standard-Berechtigungen für neue Mitarbeiter. */
export function standardBerechtigungen(): Berechtigungen {
  return normalisiereBerechtigungen({});
}

/** Liest eine Berechtigungs-JSON-Spalte defensiv und normalisiert sie. */
export function parseBerechtigungen(berechtigungen: string | null | undefined): Berechtigungen {
  if (!berechtigungen) return standardBerechtigungen();
  try {
    return normalisiereBerechtigungen(JSON.parse(berechtigungen));
  } catch {
    return standardBerechtigungen();
  }
}

/** Setzt alle Unterpunkte eines Moduls auf einen gemeinsamen Wert. */
export function setzeModulBerechtigung(
  berechtigungen: Berechtigungen,
  modul: ModulInfo,
  erlaubt: boolean
): Berechtigungen {
  const next = { ...berechtigungen, [modul.key]: erlaubt };
  for (const unterpunkt of modul.unterpunkte || []) next[unterpunkt.key] = erlaubt;
  return next;
}

/** Prüft ob ein Benutzer Zugriff auf ein Modul oder einen einzelnen Unterpunkt hat. */
export function hatZugriff(
  rolle: string,
  berechtigungen: string | null | undefined,
  berechtigung: BerechtigungKey
): boolean {
  if (rolle === "admin") return true;
  return parseBerechtigungen(berechtigungen)[berechtigung];
}
