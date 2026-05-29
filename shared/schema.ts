// Shared TypeScript types for AuftragsPro
// Database is in Supabase (no Drizzle/SQLite). These are simple types only.

export type Status =
  | "anfrage"
  | "angebot"
  | "bestaetigt"
  | "in_arbeit"
  | "qualitaet"
  | "rechnung"
  | "abgeschlossen"
  | "storniert";

export type Prioritaet = "niedrig" | "normal" | "hoch" | "dringend";

export type Kategorie =
  | "Metallbau"
  | "Schreinerei"
  | "Metallbau / Schreinerei";

export interface Auftrag {
  id: string;
  nr: string;
  titel: string;
  kunde: string;
  kunde_adresse?: string | null;
  kunde_email?: string | null;
  kunde_telefon?: string | null;
  beschreibung?: string | null;
  status: Status;
  prioritaet: Prioritaet;
  kategorie?: string | null;
  start_datum?: string | null;
  end_datum?: string | null;
  angebots_betrag?: number | null;
  rechnungs_betrag?: number | null;
  waehrung: string;
  verantwortlicher?: string | null;
  erstellt?: string;
  aktualisiert?: string;
}

export interface VerlaufEintrag {
  id: string;
  auftrag_id: string;
  status: Status;
  kommentar?: string | null;
  von?: string | null;
  datum: string;
}

export interface Notiz {
  id: string;
  auftrag_id: string;
  text: string;
  von?: string | null;
  datum: string;
}

export interface Dokument {
  id: string;
  auftrag_id: string;
  name: string;
  mime: string;
  size_bytes: number;
  kat?: string | null;
  beschreibung?: string | null;
  storage_path?: string | null;
  datum: string;
}

export interface Rechnungsvorlage {
  id: string;
  name: string;
  mime: string;
  size_bytes: number;
  aktiv: boolean;
  erstellt: string;
}

export interface RechnungsPosition {
  beschreibung: string;
  menge: number;
  einzelpreis: number;
  betrag: number;
}

export interface Rechnung {
  id: string;
  auftrag_id: string;
  nr: string;
  betrag: number;
  waehrung: string;
  positionen: RechnungsPosition[];
  notiz?: string | null;
  faellig_datum?: string | null;
  bezahlt_am?: string | null;
  datum?: string | null;
  empfaenger_name?: string | null;
  erstellt: string;
}

export interface Stats {
  gesamt: number;
  offen: number;
  in_bearbeitung: number;
  abgeschlossen: number;
}

export const STATUS_LABEL: Record<Status, string> = {
  anfrage: "Anfrage",
  angebot: "Angebot",
  bestaetigt: "Bestätigt",
  in_arbeit: "In Arbeit",
  qualitaet: "Qualitätsprüfung",
  rechnung: "Rechnung",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
};

export const STATUS_ORDER: Status[] = [
  "anfrage",
  "angebot",
  "bestaetigt",
  "in_arbeit",
  "qualitaet",
  "rechnung",
  "abgeschlossen",
];

export const PRIORITAETEN: Prioritaet[] = ["niedrig", "normal", "hoch", "dringend"];

export const KATEGORIEN: Kategorie[] = [
  "Metallbau",
  "Schreinerei",
  "Metallbau / Schreinerei",
];

// ─── Zeiterfassung ────────────────────────────────────────────────────────────
export interface Zeiteintrag {
  id: string;
  auftrag_id: string;
  mitarbeiter: string;
  beschreibung: string;
  datum: string;
  start_zeit: string;
  end_zeit: string;
  dauer_minuten: number;
  erstellt: string;
  ort?: string | null;
  maschinenpark?: string | null;
}

export type ZeiteintragInsert = Omit<Zeiteintrag, 'id' | 'erstellt'>;

// ─── Offerten ─────────────────────────────────────────────────────────────────
export interface OffertePosition {
  nr: number;
  titel: string;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  total: number;
}

export interface Offerte {
  id: string;
  auftrag_id: string;
  nr: string;
  ansprechpartner?: string | null;
  telefon?: string | null;
  email?: string | null;
  anrede?: string | null;
  empfaenger_name?: string | null;
  empfaenger_strasse?: string | null;
  empfaenger_plz_ort?: string | null;
  projekt_beschreibung?: string | null;
  intro_text?: string | null;
  positionen: OffertePosition[];
  rabatt_prozent: number;
  mwst_prozent: number;
  liefertermin: string;
  zahlungsbedingungen: string;
  gueltigkeit: string;
  schluss_text?: string | null;
  datum: string;
  status: string;
  erstellt: string;
}
