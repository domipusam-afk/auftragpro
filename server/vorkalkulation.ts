import type { SupabaseClient } from "@supabase/supabase-js";
import { berechneVorkalkulationsAngebotspreis } from "../shared/schema";

type VorkalkulationClient = SupabaseClient;

export interface AuftragVorkalkulation {
  lohn: number;
  material: number;
  fremdleistungen: number;
  soek: number;
  selbstkosten: number;
  netto_angebotspreis: number;
  brutto_angebotspreis: number;
}

function summe(rows: any[] | null, feld: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows || []) {
    const auftragId = row.auftrag_id;
    if (typeof auftragId !== "string" || !auftragId) continue;
    result.set(auftragId, (result.get(auftragId) || 0) + (Number(row[feld]) || 0));
  }
  return result;
}

function addiere(links: Map<string, number>, rechts: Map<string, number>): Map<string, number> {
  const result = new Map(links);
  rechts.forEach((betrag, auftragId) => {
    result.set(auftragId, (result.get(auftragId) || 0) + betrag);
  });
  return result;
}

/**
 * Builds the detailed quotation cost total from the active configuration and
 * all six detail tables. No authoritative total is persisted in the database;
 * the offered net value is therefore always produced by the shared quotation
 * price formula after the detailed self-cost total has been assembled.
 */
export async function berechneAuftragVorkalkulation(
  client: VorkalkulationClient,
  auftragIds: string[],
  tenantId?: string,
): Promise<Map<string, AuftragVorkalkulation>> {
  const ids = Array.from(new Set(auftragIds.filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (ids.length === 0) return new Map();

  const mitTenant = (query: any) => tenantId ? query.eq("tenant_id", tenantId) : query;
  const antworten = await Promise.all([
    mitTenant(client.from("vorkalkulation_config").select("auftrag_id, risiko_gewinn_prozent, rabatt_prozent, skonto_prozent, mwst_prozent").in("auftrag_id", ids)),
    mitTenant(client.from("vorkalkulation_stunden").select("auftrag_id, soll_stunden, stundensatz").in("auftrag_id", ids)),
    mitTenant(client.from("vorkalkulation_material").select("auftrag_id, total_chf").in("auftrag_id", ids)),
    mitTenant(client.from("vorkalkulation_hauptmaterial_flaeche").select("auftrag_id, total_chf").in("auftrag_id", ids)),
    mitTenant(client.from("vorkalkulation_hilfsmaterial").select("auftrag_id, total_chf").in("auftrag_id", ids)),
    mitTenant(client.from("vorkalkulation_fremdleistungen").select("auftrag_id, total_chf").in("auftrag_id", ids)),
    mitTenant(client.from("vorkalkulation_soek").select("auftrag_id, total_chf").in("auftrag_id", ids)),
  ]);
  const fehler = antworten.find((antwort) => antwort.error);
  if (fehler?.error) throw fehler.error;

  const [configs, stunden, profilMaterial, flaechenMaterial, hilfsMaterial, fremdleistungen, soek] = antworten;
  const lohn = new Map<string, number>();
  for (const zeile of stunden.data || []) {
    const auftragId = zeile.auftrag_id;
    if (typeof auftragId !== "string" || !auftragId) continue;
    const betrag = (Number(zeile.soll_stunden) || 0) * (Number(zeile.stundensatz) || 0);
    lohn.set(auftragId, (lohn.get(auftragId) || 0) + betrag);
  }
  const material = addiere(
    addiere(summe(profilMaterial.data, "total_chf"), summe(flaechenMaterial.data, "total_chf")),
    summe(hilfsMaterial.data, "total_chf"),
  );
  const fremd = summe(fremdleistungen.data, "total_chf");
  const soekKosten = summe(soek.data, "total_chf");

  const result = new Map<string, AuftragVorkalkulation>();
  for (const config of configs.data || []) {
    const auftragId = config.auftrag_id;
    if (typeof auftragId !== "string" || !auftragId) continue;
    const lohnKosten = lohn.get(auftragId) || 0;
    const materialKosten = material.get(auftragId) || 0;
    const fremdKosten = fremd.get(auftragId) || 0;
    const soekBetrag = soekKosten.get(auftragId) || 0;
    const selbstkosten = lohnKosten + materialKosten + fremdKosten + soekBetrag;
    const angebot = berechneVorkalkulationsAngebotspreis({
      selbstkosten,
      // The active calculation UI treats a missing or zero risk value as its
      // standard 10% markup. Keep the dashboard numerically identical.
      risiko_gewinn_prozent: Number(config.risiko_gewinn_prozent) || 10,
      rabatt_prozent: Number(config.rabatt_prozent) || 0,
      skonto_prozent: Number(config.skonto_prozent) || 0,
      mwst_prozent: Number(config.mwst_prozent) || 8.1,
    });
    result.set(auftragId, {
      lohn: lohnKosten,
      material: materialKosten,
      fremdleistungen: fremdKosten,
      soek: soekBetrag,
      selbstkosten,
      netto_angebotspreis: angebot.nettoAngebotspreis,
      brutto_angebotspreis: angebot.bruttoAngebotspreis,
    });
  }

  return result;
}
