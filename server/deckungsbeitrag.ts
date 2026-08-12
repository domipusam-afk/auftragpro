import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanzenUebersichtZeile } from "../shared/schema";

type KostenClient = SupabaseClient;

export interface AuftragIstKosten {
  lohn_zeiterfassung: number;
  lohn_manuell: number;
  material: number;
  fremdleistungen: number;
  soek: number;
  total: number;
}

const rundeGeld = (betrag: number) => Math.round(betrag * 100) / 100;

function summiereNachAuftrag(rows: any[] | null, feld: string): Map<string, number> {
  const summen = new Map<string, number>();
  for (const row of rows || []) {
    summen.set(row.auftrag_id, (summen.get(row.auftrag_id) || 0) + (Number(row[feld]) || 0));
  }
  return summen;
}

/**
 * Cost rate for a recorded hour. Workshop entries use base rate plus the
 * machine-specific surcharge; all other locations use their location rate.
 */
export function stundensatzFuer(saetze: any[], ort?: string | null, maschinenpark?: string | null): number {
  const o = ort || "Montage";
  if (o !== "Werkstatt") {
    const match = saetze.find((satz: any) => satz.ort === o && !satz.maschinenpark);
    return match ? (Number(match.satz) || 0) : 0;
  }

  const spezifisch = maschinenpark
    ? saetze.find((satz: any) => satz.ort === "Werkstatt" && satz.maschinenpark === maschinenpark)
    : undefined;
  const basis = spezifisch || saetze.find((satz: any) => satz.ort === "Werkstatt" && !satz.maschinenpark);
  return basis ? (Number(basis.grundsatz) || 0) + (Number(basis.satz) || 0) : 0;
}

/**
 * Computes the captured direct actual costs for each order exactly once.
 *
 * `nachkalkulation_stunden` only contributes manual rows. Time-capture rows
 * are derived directly from `zeiteintraege`, so copied `quelle=zeiterfassung`
 * rows can never be counted twice.
 */
export async function berechneAuftragIstKosten(
  client: KostenClient,
  auftragIds: string[],
  tenantId?: string,
): Promise<Map<string, AuftragIstKosten>> {
  const ids = Array.from(new Set(auftragIds.filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (ids.length === 0) return new Map();

  const mitTenant = (query: any) => tenantId ? query.eq("tenant_id", tenantId) : query;
  const antworten = await Promise.all([
    mitTenant(client.from("stundensaetze").select("*")),
    mitTenant(client.from("nachkalkulation_stunden").select("auftrag_id, total_chf").in("auftrag_id", ids).eq("quelle", "manuell")),
    mitTenant(client.from("zeiteintraege").select("auftrag_id, dauer_minuten, ort, maschinenpark").in("auftrag_id", ids)),
    mitTenant(client.from("nachkalkulation_material").select("auftrag_id, betrag_chf").in("auftrag_id", ids)),
    mitTenant(client.from("nachkalkulation_fremdleistungen").select("auftrag_id, betrag_chf").in("auftrag_id", ids)),
    mitTenant(client.from("nachkalkulation_soek").select("auftrag_id, total_chf").in("auftrag_id", ids)),
  ]);
  const fehler = antworten.find((antwort) => antwort.error);
  if (fehler?.error) throw fehler.error;

  const [saetze, nkStunden, zeiteintraege, nkMaterial, nkFremd, nkSoek] = antworten;
  const lohnManuell = summiereNachAuftrag(nkStunden.data, "total_chf");
  const material = summiereNachAuftrag(nkMaterial.data, "betrag_chf");
  const fremdleistungen = summiereNachAuftrag(nkFremd.data, "betrag_chf");
  const soek = summiereNachAuftrag(nkSoek.data, "total_chf");
  const lohnZeiterfassung = new Map<string, number>();

  for (const eintrag of zeiteintraege.data || []) {
    const satz = stundensatzFuer(saetze.data || [], eintrag.ort, eintrag.maschinenpark);
    const betrag = ((Number(eintrag.dauer_minuten) || 0) / 60) * satz;
    lohnZeiterfassung.set(
      eintrag.auftrag_id,
      (lohnZeiterfassung.get(eintrag.auftrag_id) || 0) + betrag,
    );
  }

  const kostenJeAuftrag = new Map<string, AuftragIstKosten>();
  for (const id of ids) {
    const lohn_zeiterfassung = lohnZeiterfassung.get(id) || 0;
    const lohn_manuell = lohnManuell.get(id) || 0;
    const materialKosten = material.get(id) || 0;
    const fremd = fremdleistungen.get(id) || 0;
    const soekKosten = soek.get(id) || 0;
    kostenJeAuftrag.set(id, {
      lohn_zeiterfassung,
      lohn_manuell,
      material: materialKosten,
      fremdleistungen: fremd,
      soek: soekKosten,
      total: lohn_zeiterfassung + lohn_manuell + materialKosten + fremd + soekKosten,
    });
  }
  return kostenJeAuftrag;
}

/**
 * Shared basis of the finance overview and the DB1 dashboard endpoint.
 * `tenantId` must be passed by every caller so that finance data is strictly
 * scoped to the authenticated tenant. The parameter stays optional only for
 * TypeScript ergonomics — passing `undefined` from a real request path is a
 * multi-tenant leak.
 */
export async function ladeFinanzenUebersichtZeilen(
  client: KostenClient,
  tenantId?: string,
): Promise<FinanzenUebersichtZeile[]> {
  let auftraegeQuery = client
    .from("auftraege")
    .select("id, nr, titel, kunde, waehrung, end_datum, erstellt")
    .eq("status", "abgeschlossen");
  if (tenantId) auftraegeQuery = auftraegeQuery.eq("tenant_id", tenantId);
  const { data: auftraege, error } = await auftraegeQuery;
  if (error) throw error;

  const ids = (auftraege || []).map((auftrag: any) => auftrag.id);
  if (ids.length === 0) return [];

  // Der Mandantenschutz laeuft ueber die Auftrag-Vorselektion oben: Rechnungen werden
  // strikt via auftrag_id IN (...) an den Mandanten gebunden. Ein zusaetzlicher
  // .eq("tenant_id") auf rechnungen ist nicht noetig und waere sogar fragil — sollte
  // rechnungen.tenant_id einmal NULL sein (kein DB-Trigger), wuerde die Rechnung
  // faelschlich ausgefiltert und der Umsatz falsch ausgewiesen.
  const rechnungenQuery = client
    .from("rechnungen")
    .select("auftrag_id, betrag, bezahlt_am")
    .in("auftrag_id", ids);
  const [{ data: rechnungen, error: rechnungenError }, kostenJeAuftrag] = await Promise.all([
    rechnungenQuery,
    berechneAuftragIstKosten(client, ids, tenantId),
  ]);
  if (rechnungenError) throw rechnungenError;

  const rechnungenJeAuftrag = new Map<string, any[]>();
  for (const rechnung of rechnungen || []) {
    const liste = rechnungenJeAuftrag.get(rechnung.auftrag_id) || [];
    liste.push(rechnung);
    rechnungenJeAuftrag.set(rechnung.auftrag_id, liste);
  }

  const summe = (liste: any[]) => liste.reduce((sum: number, rechnung: any) => sum + (Number(rechnung.betrag) || 0), 0);
  const sortSchluessel = (auftrag: any) => String(auftrag.end_datum || auftrag.erstellt || "");
  return [...(auftraege || [])]
    .sort((links: any, rechts: any) => sortSchluessel(rechts).localeCompare(sortSchluessel(links)))
    .map((auftrag: any) => {
      const rechnungenDesAuftrags = rechnungenJeAuftrag.get(auftrag.id) || [];
      const bezahlteRechnungen = rechnungenDesAuftrags.filter((rechnung) => rechnung.bezahlt_am);
      const umsatzNetto = rundeGeld(summe(rechnungenDesAuftrags));
      const bezahltNetto = rundeGeld(summe(bezahlteRechnungen));
      const bezahltAm = bezahlteRechnungen
        .map((rechnung) => String(rechnung.bezahlt_am))
        .sort()
        .pop() || null;
      const kosten = kostenJeAuftrag.get(auftrag.id)?.total || 0;

      return {
        id: auftrag.id,
        nr: auftrag.nr,
        titel: auftrag.titel,
        kunde: auftrag.kunde,
        waehrung: auftrag.waehrung || "CHF",
        umsatz_netto: umsatzNetto,
        bezahlt_netto: bezahltNetto,
        offen_netto: rundeGeld(umsatzNetto - bezahltNetto),
        bezahlt_am: bezahltAm,
        voll_bezahlt: rechnungenDesAuftrags.length > 0 && bezahlteRechnungen.length === rechnungenDesAuftrags.length,
        anzahl_rechnungen: rechnungenDesAuftrags.length,
        kosten,
        reingewinn: rundeGeld(umsatzNetto - kosten),
        hat_rechnung: rechnungenDesAuftrags.length > 0,
        hat_kosten: kosten > 0,
      };
    });
}

/** Zurich-local calendar year bounds, shared by invoice-date dashboard KPIs. */
export function zurichKalenderjahr(): { year: number; yearStart: string; nextYearStart: string } {
  const datum = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
  }).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
  const year = Number(datum.year);
  return {
    year,
    yearStart: new Date(`${year}-01-01T00:00:00+01:00`).toISOString(),
    nextYearStart: new Date(`${year + 1}-01-01T00:00:00+01:00`).toISOString(),
  };
}
