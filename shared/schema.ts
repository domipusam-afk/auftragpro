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

/**
 * Bestimmt, wie ein Auftrag kalkuliert wird:
 * - "detailliert": volle Vorkalkulation (Lohn nach Bereich, Material einzeln,
 *   Fremdleistungen, Risiko/Gewinn-Zuschlag) über die Vorkalkulation-Tabs.
 * - "pauschal": einfacher Pauschal-Angebotsbetrag (Feld angebots_betrag, brutto)
 *   für kleine/einfache Aufträge, ohne die Vorkalkulation-Tabs ausfüllen zu müssen.
 * Explizites Feld (Spalte auftraege.angebots_typ) statt einer impliziten Ableitung
 * über "existiert eine Vorkalkulation ja/nein" — siehe Pauschalbetrag-Feature.
 */
export type AngebotsTyp = "detailliert" | "pauschal";

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
  /** "detailliert" (volle Vorkalkulation) oder "pauschal" (Pauschal-Angebotsbetrag). */
  angebots_typ?: AngebotsTyp;
  /** Brutto-Betrag (inkl. MWST) — bei "pauschal" der einzige Angebotspreis, bei "detailliert" von der Vorkalkulation befuellt. */
  angebots_betrag?: number | null;
  /** Spiegel der Tabelle "rechnungen" (brutto). Serverseitig abgeleitet, nicht beschreibbar. */
  rechnungs_betrag?: number | null;
  waehrung: string;
  verantwortlicher?: string | null;
  erstellt?: string;
  aktualisiert?: string;
  /** Von GET /api/auftraege ergänzt: Anzahl zugehöriger Rechnungen. */
  anzahl_rechnungen?: number;
  /** true, wenn mindestens eine Rechnung existiert und alle bezahlt sind. */
  rechnung_bezahlt?: boolean;
  /** Datum der letzten Zahlung. */
  rechnung_bezahlt_am?: string | null;
  /** Token für den öffentlichen Kundenstatus-Link (Projektstatus-Seite), null wenn kein Link generiert wurde. */
  public_token?: string | null;
}

/** Zeile der Finanzen-Übersicht (GET /api/finanzen/uebersicht) — abgeschlossene Aufträge. */
export interface FinanzenUebersichtZeile {
  id: string;
  nr: string;
  titel: string;
  kunde: string;
  waehrung: string;
  /** Summe aller Rechnungen exkl. MWST (direkt aus der Tabelle "rechnungen"). */
  umsatz_netto: number;
  /** Anteil davon, der bereits bezahlt ist. */
  bezahlt_netto: number;
  /** Noch offener Betrag (umsatz_netto − bezahlt_netto). */
  offen_netto: number;
  /** Datum der letzten Zahlung, sonst null. */
  bezahlt_am: string | null;
  /** true, wenn alle Rechnungen des Auftrags bezahlt sind. */
  voll_bezahlt: boolean;
  anzahl_rechnungen: number;
  /** IST-Selbstkosten aus der Nachkalkulation (Lohn + Material + Fremdleistungen + SOEK). */
  kosten: number;
  reingewinn: number;
  hat_rechnung: boolean;
  hat_kosten: boolean;
}

/**
 * Summen über die Zeilen der Finanzen-Übersicht.
 * Einzige Stelle, an der die Totals gebildet werden — die Dashboard-Kachel und die
 * Seite Finanzen-Übersicht rechnen beide hiermit, damit sie nicht auseinanderlaufen.
 */
export function finanzenSummen(zeilen: FinanzenUebersichtZeile[]) {
  // Ohne gestellte Rechnung ist der Umsatz unbekannt — solche Aufträge würden sonst
  // ihre IST-Kosten als Verlust in die Summen einrechnen.
  const abgerechnet = zeilen.filter((z) => z.hat_rechnung);
  const summe = (feld: (z: FinanzenUebersichtZeile) => number) =>
    Math.round(abgerechnet.reduce((s, z) => s + feld(z), 0) * 100) / 100;
  return {
    anzahl: abgerechnet.length,
    umsatz: summe((z) => z.umsatz_netto),
    kosten: summe((z) => z.kosten),
    reingewinn: summe((z) => z.reingewinn),
    offen: summe((z) => z.offen_netto),
    ohneKosten: abgerechnet.filter((z) => !z.hat_kosten).length,
    ohneRechnung: zeilen.length - abgerechnet.length,
  };
}

/**
 * Eingabe für die Vorkalkulations-Angebotspreis-Berechnung.
 * selbstkosten muss bereits Hauptmaterial + Hilfsmaterial + Fremdleistungen +
 * SOEK + Lohn/Stunden enthalten.
 */
export interface VorkalkulationInput {
  selbstkosten: number;
  risiko_gewinn_prozent: number;
  rabatt_prozent: number;
  skonto_prozent: number;
  mwst_prozent?: number;
}

export interface VorkalkulationErgebnis {
  selbstkosten: number;
  risikoGewinnBetrag: number;
  nettoOhneRabatt: number;
  rabattBetrag: number;
  nettoNachRabatt: number;
  skontoBetrag: number;
  /** Netto-Angebotspreis exkl. MWST — die massgebende "Vorkalkulations-Summe". */
  nettoAngebotspreis: number;
  mwstBetrag: number;
  /** Brutto-Angebotspreis inkl. MWST (nur berechnet, wenn mwst_prozent übergeben wurde). */
  bruttoAngebotspreis: number;
}

/**
 * EINZIGE Berechnungsfunktion für die Vorkalkulations-Summe (Netto-Angebotspreis)
 * im gesamten Repository (Bug 2, finale Konsolidierung).
 *
 * Firmen-Kalkulationslogik (Sheet 10, siehe VorkalkulationDetail.tsx):
 *   1) Selbstkosten (inkl. Hilfsmaterial) + Risiko/Gewinn-Zuschlag
 *   2) + Rabatt-Prozentsatz als AUFSCHLAG (nicht Abzug!)
 *   3) + Skonto-Prozentsatz als AUFSCHLAG (nicht Abzug!)
 *   4) + MWST → Bruttopreis
 *
 * Frontend (VorkalkulationDetail.tsx, NachkalkulationDetail.tsx) und Backend
 * (server/routes.ts, PDF-Erzeugung) rufen ausschliesslich diese Funktion auf,
 * damit es keine zweite, potenziell abweichende Formel mehr geben kann.
 */
export function berechneVorkalkulationsAngebotspreis(input: VorkalkulationInput): VorkalkulationErgebnis {
  const selbstkosten = Number(input.selbstkosten) || 0;
  const risiko = (Number(input.risiko_gewinn_prozent) || 0) / 100;
  const rabatt = (Number(input.rabatt_prozent) || 0) / 100;
  const skonto = (Number(input.skonto_prozent) || 0) / 100;
  const mwst = (Number(input.mwst_prozent) || 0) / 100;

  const risikoGewinnBetrag = selbstkosten * risiko;
  const nettoOhneRabatt = selbstkosten + risikoGewinnBetrag;
  const rabattBetrag = nettoOhneRabatt * rabatt;
  const nettoNachRabatt = nettoOhneRabatt + rabattBetrag;
  const skontoBetrag = nettoNachRabatt * skonto;
  const nettoAngebotspreis = nettoNachRabatt + skontoBetrag;
  const mwstBetrag = nettoAngebotspreis * mwst;
  const bruttoAngebotspreis = nettoAngebotspreis + mwstBetrag;

  return {
    selbstkosten,
    risikoGewinnBetrag,
    nettoOhneRabatt,
    rabattBetrag,
    nettoNachRabatt,
    skontoBetrag,
    nettoAngebotspreis,
    mwstBetrag,
    bruttoAngebotspreis,
  };
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
  /** Netto-Betrag exkl. MWST, wie in der Tabelle "rechnungen" gespeichert (Positionssumme). */
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

/**
 * Schweizer Standard-MWST-Satz, der aktuell überall im Rechnungs-PDF und in der
 * QR-Rechnung verwendet wird (server/routes.ts). Rechnungen kennen (noch) keinen
 * abweichenden Satz pro Rechnung — deshalb ein fixer Prozentsatz statt eines
 * Felds auf der Tabelle "rechnungen".
 */
export const MWST_SATZ_RECHNUNG = 8.1;

/**
 * Bruttobetrag (inkl. MWST) einer Rechnung — das, was der Kunde tatsächlich
 * bezahlen muss/bezahlt hat. rechnungen.betrag ist netto (Positionssumme exkl.
 * MWST); dieselbe Umrechnung verwendet bereits die PDF-Erzeugung
 * (server/routes.ts, mwstPct = 8.1). Einzige Stelle für diese Umrechnung im
 * Frontend, damit Listenanzeige und PDF nicht auseinanderlaufen.
 */
export function rechnungBruttoBetrag(betragNetto: number | null | undefined): number {
  const netto = Number(betragNetto) || 0;
  return Math.round(netto * (1 + MWST_SATZ_RECHNUNG / 100) * 100) / 100;
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
