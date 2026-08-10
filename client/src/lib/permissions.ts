/**
 * Berechtigungssystem für AuftragsPro
 *
 * Admins haben immer vollen Zugriff. Mehrteilige Hauptmodule besitzen neben
 * ihrem (kompatiblen) Hauptmodul-Flag einzelne Flags für jeden Navigationspunkt.
 * Alte gespeicherte Hauptmodul-Flags werden beim Lesen automatisch auf alle
 * zugehörigen Unterpunkte übertragen.
 */

import {
  PERMISSIONS_CATALOG,
  type ModulePermissionKey,
  type PermissionCatalogEntry,
  type PermissionKey,
  type SubPermissionKey,
} from "@shared/permissions-catalog";

export type ModulKey = ModulePermissionKey;
export type UnterpunktKey = SubPermissionKey;
export type BerechtigungKey = PermissionKey;
export type Berechtigungen = Record<BerechtigungKey, boolean>;

export interface UnterpunktInfo {
  key: UnterpunktKey;
  label: string;
  beschreibung: string;
  /** Standard für neue Mitarbeiter, falls kein gespeicherter Wert vorhanden ist. */
  standard?: boolean;
  /** Übernimmt bei einer alten Berechtigungs-JSON den bisherigen Modulschalter. */
  uebernimmtAltesModulFlag?: boolean;
}

export interface ModulInfo {
  key: ModulKey;
  label: string;
  beschreibung: string;
  standard: boolean;
  unterpunkte?: readonly UnterpunktInfo[];
}

const KATALOG_EINTRAEGE: readonly PermissionCatalogEntry[] = PERMISSIONS_CATALOG;

const katalogUnterpunkte = (modul: ModulKey): readonly UnterpunktInfo[] =>
  KATALOG_EINTRAEGE
    .filter((permission) => permission.scope === "unterpunkt" && permission.module === modul)
    .map((permission) => ({
      key: permission.key as UnterpunktKey,
      label: permission.name,
      beschreibung: permission.description,
      standard: permission.defaultForEmployee,
      uebernimmtAltesModulFlag: permission.inheritsLegacyModuleFlag,
    }));

/**
 * UI-Metadaten werden aus dem gemeinsamen Katalog abgeleitet. Damit sind
 * Client und künftige Server-Gates auf dieselben 36 Schlüssel festgelegt.
 */
export const ALLE_MODULE: readonly ModulInfo[] = KATALOG_EINTRAEGE
  .filter((permission) => permission.scope === "module")
  .map((permission) => {
    const unterpunkte = katalogUnterpunkte(permission.key as ModulKey);
    return {
      key: permission.key as ModulKey,
      label: permission.name,
      beschreibung: permission.description,
      standard: permission.defaultForEmployee ?? false,
      ...(unterpunkte.length ? { unterpunkte } : {}),
    };
  });

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
 * Fehlt ein Unterpunkt-Flag (bei einem alten Benutzerobjekt), übernimmt es
 * grundsätzlich den Wert des früheren Hauptmodul-Flags. Sensible neue
 * Zusatzrechte können diesen Legacy-Fallback bewusst deaktivieren.
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
          : unterpunkt.uebernimmtAltesModulFlag !== false && istBoolean(rawModulwert)
            ? legacyModulwert
            : unterpunkt.standard ?? legacyModulwert;
      }
      // Das Hauptmodul ist eine abgeleitete Sammelberechtigung: sichtbar, wenn
      // mindestens ein Unterpunkt verfügbar ist.
      result[modul.key] = modul.key === "auftraege"
        ? result.auftraege_anzeigen
        : modul.unterpunkte.some((unterpunkt) => result[unterpunkt.key]);
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
