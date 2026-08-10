/**
 * Kanonischer Katalog der AuftragsPro-Berechtigungen.
 *
 * Eine Berechtigung umfasst im gegenwärtigen Modell bewusst sowohl Lesen als
 * auch Erstellen/Ändern/Löschen. Eine spätere CRUD-/Export-Aufteilung ist hier
 * nicht vorweggenommen.
 */
export type PermissionScope = "module" | "unterpunkt";

export interface PermissionCatalogEntry {
  readonly key: string;
  readonly scope: PermissionScope;
  readonly module?: string;
  readonly name: string;
  readonly description: string;
  readonly adminOnly: boolean;
  /** Fachliche Voraussetzung; derzeit nur für die Preisansicht relevant. */
  readonly dependsOn?: string;
  /** Standardwert für neue Mitarbeiter, wenn kein Legacy-Wert vorhanden ist. */
  readonly defaultForEmployee?: boolean;
  /** Unterpunkt übernimmt bei Legacy-Daten nicht den bisherigen Modulwert. */
  readonly inheritsLegacyModuleFlag?: boolean;
}

export const PERMISSIONS_CATALOG = [
  { key: "dashboard_finanzen", scope: "module", name: "Dashboard Finanzübersicht", description: "Umsatz, Mahnungen und Finanzkennzahlen im Dashboard", adminOnly: false, defaultForEmployee: false },
  { key: "auftraege", scope: "module", name: "Aufträge", description: "Aufträge anzeigen, erstellen und Preisansicht verwalten", adminOnly: false, defaultForEmployee: true },
  { key: "auftraege_anzeigen", scope: "unterpunkt", module: "auftraege", name: "Aufträge anzeigen", description: "Aufträge anzeigen, erstellen und bearbeiten", adminOnly: false, defaultForEmployee: true },
  { key: "auftraege_preise_sichtbar", scope: "unterpunkt", module: "auftraege", name: "Preise sichtbar", description: "Angebots- und Rechnungsbeträge in Aufträgen sehen", adminOnly: false, dependsOn: "auftraege_anzeigen", defaultForEmployee: false, inheritsLegacyModuleFlag: false },
  { key: "zeiterfassung", scope: "module", name: "Zeiterfassung", description: "Arbeitszeiten erfassen und anzeigen", adminOnly: false, defaultForEmployee: true },
  { key: "rechnungen", scope: "module", name: "Rechnungen", description: "Rechnungen anzeigen und erstellen", adminOnly: false, defaultForEmployee: false },
  { key: "offerten", scope: "module", name: "Offerten", description: "Offerten anzeigen und erstellen", adminOnly: false, defaultForEmployee: true },
  { key: "kalkulation", scope: "module", name: "Kalkulation", description: "Vor- und Nachkalkulation", adminOnly: false, defaultForEmployee: false },
  { key: "kalkulation_vorkalkulation", scope: "unterpunkt", module: "kalkulation", name: "Vorkalkulation", description: "Vor- und Angebotskalkulation", adminOnly: false },
  { key: "kalkulation_nachkalkulation", scope: "unterpunkt", module: "kalkulation", name: "Nachkalkulation", description: "Nachkalkulation auswerten", adminOnly: false },
  { key: "finanzmanagement", scope: "module", name: "Finanzmanagement", description: "Finanzen, Mahnungen, MWST und Garantien", adminOnly: false, defaultForEmployee: false },
  { key: "finanzmanagement_finanzen_uebersicht", scope: "unterpunkt", module: "finanzmanagement", name: "Finanzen-Übersicht", description: "Finanzkennzahlen und Monatsübersicht", adminOnly: false },
  { key: "finanzmanagement_mahnwesen", scope: "unterpunkt", module: "finanzmanagement", name: "Mahnwesen", description: "Offene Rechnungen und Mahnungen", adminOnly: false },
  { key: "finanzmanagement_mwst", scope: "unterpunkt", module: "finanzmanagement", name: "MWST-Abrechnung", description: "MWST-Auswertung", adminOnly: false },
  { key: "finanzmanagement_eingangsrechnungen", scope: "unterpunkt", module: "finanzmanagement", name: "Eingangsrechnungen", description: "Eingangsrechnungen verwalten", adminOnly: false },
  { key: "finanzmanagement_garantien", scope: "unterpunkt", module: "finanzmanagement", name: "Garantieübersicht", description: "Garantien verwalten", adminOnly: false },
  { key: "einkauf", scope: "module", name: "Einkauf", description: "Lieferanten, Material und Lager", adminOnly: false, defaultForEmployee: true },
  { key: "einkauf_lieferanten_material", scope: "unterpunkt", module: "einkauf", name: "Lieferanten & Material", description: "Lieferanten und Material verwalten", adminOnly: false },
  { key: "einkauf_lagerverwaltung", scope: "unterpunkt", module: "einkauf", name: "Lagerverwaltung", description: "Lagerbestände verwalten", adminOnly: false },
  { key: "dokumente", scope: "module", name: "Dokumente", description: "Dokumente, Fotos, Formulare und Chat", adminOnly: false, defaultForEmployee: true },
  { key: "dokumente_fotodokumentation", scope: "unterpunkt", module: "dokumente", name: "Bild-/Fotodoku", description: "Fotos und Bilddokumentation", adminOnly: false },
  { key: "dokumente_formulare", scope: "unterpunkt", module: "dokumente", name: "Formulare & Unterschriften", description: "Formulare und Unterschriften", adminOnly: false },
  { key: "dokumente_chat_historie", scope: "unterpunkt", module: "dokumente", name: "Chat & Historie", description: "Nachrichten und Verlauf", adminOnly: false },
  { key: "dokumente_kundendatencenter", scope: "unterpunkt", module: "dokumente", name: "Kundendatencenter", description: "Kundendokumente und Datencenter", adminOnly: false },
  { key: "dokumente_uebersicht", scope: "unterpunkt", module: "dokumente", name: "Dokumente (+40)", description: "Dokumentenübersicht", adminOnly: false },
  { key: "ressourcen", scope: "module", name: "Ressourcen", description: "Mitarbeiter, Planung, Lohn und Aufgaben", adminOnly: false, defaultForEmployee: false },
  { key: "ressourcen_mitarbeiterakte", scope: "unterpunkt", module: "ressourcen", name: "Mitarbeiterakte", description: "Mitarbeiter verwalten", adminOnly: false },
  { key: "ressourcen_planung_termine", scope: "unterpunkt", module: "ressourcen", name: "Planung & Termine", description: "Termine planen", adminOnly: false },
  { key: "ressourcen_kalender", scope: "unterpunkt", module: "ressourcen", name: "Kalender", description: "Kalender anzeigen", adminOnly: false },
  { key: "ressourcen_plantafel", scope: "unterpunkt", module: "ressourcen", name: "Plantafel", description: "Einsatzplanung auf der Plantafel", adminOnly: false },
  { key: "ressourcen_ferienplanung", scope: "unterpunkt", module: "ressourcen", name: "Ferienplanung", description: "Ferien und Abwesenheiten planen", adminOnly: false },
  { key: "ressourcen_stundenauswertung", scope: "unterpunkt", module: "ressourcen", name: "Stundenauswertung", description: "Arbeitsstunden auswerten", adminOnly: false },
  { key: "ressourcen_lohnabrechnung", scope: "unterpunkt", module: "ressourcen", name: "Lohnabrechnung", description: "Lohnabrechnungen verwalten", adminOnly: false },
  { key: "ressourcen_aufgaben", scope: "unterpunkt", module: "ressourcen", name: "Aufgaben", description: "Eigene und zugewiesene Aufgaben", adminOnly: false },
  { key: "benutzerverwaltung", scope: "module", name: "Benutzerverwaltung", description: "Benutzer erstellen und verwalten", adminOnly: true, defaultForEmployee: false },
  { key: "einstellungen", scope: "module", name: "Einstellungen", description: "App-Einstellungen und Konfiguration", adminOnly: false, defaultForEmployee: false },
] as const satisfies readonly PermissionCatalogEntry[];

export type PermissionDefinition = (typeof PERMISSIONS_CATALOG)[number];
export type PermissionKey = PermissionDefinition["key"];
export type ModulePermissionKey = Extract<PermissionDefinition, { readonly scope: "module" }>["key"];
export type SubPermissionKey = Extract<PermissionDefinition, { readonly scope: "unterpunkt" }>["key"];

export const PERMISSION_BY_KEY: Readonly<Record<PermissionKey, PermissionCatalogEntry>> =
  Object.fromEntries(PERMISSIONS_CATALOG.map((permission) => [permission.key, permission])) as Readonly<Record<PermissionKey, PermissionCatalogEntry>>;

export function isPermissionKey(value: string): value is PermissionKey {
  return value in PERMISSION_BY_KEY;
}
