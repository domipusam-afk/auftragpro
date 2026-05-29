import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Clock, Package, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatCHF } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface KalkulationsPosition {
  id: string;
  typ: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  zuschlag_pct: number;
  betrag: number;
}

interface Zeiteintrag {
  id: string;
  mitarbeiter: string;
  datum: string;
  dauer_minuten: number;
  beschreibung?: string;
  ort?: string | null;
  maschinenpark?: string | null;
}

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  stundensatz: number;
}

interface Stundensatz {
  id: string;
  ort: string;
  maschinenpark: string | null;
  satz: number;
  grundsatz: number | null;
}

// Stundensatz-Berechnungslogik v38 (gleich wie Zeiterfassung.tsx)
// Werkstatt: grundsatz (aus stundensaetze) + Maschinen-Zuschlag (stundensaetze.satz)
// Avor/Montage: fixer Ort-Satz
function getNachkalkSatz(
  saetze: Stundensatz[],
  mitarbeiterListe: Mitarbeiter[],
  maName: string,
  ort: string | null | undefined,
  maschine: string | null | undefined
): number {
  if (!ort) {
    // Kein Ort: Personen-Satz aus Mitarbeiterakte (Fallback)
    const ma = mitarbeiterListe.find(m => `${m.vorname} ${m.nachname}` === maName);
    return ma ? Number(ma.stundensatz) : 0;
  }
  if (ort === "Werkstatt") {
    // Grundsatz aus stundensaetze (mit oder ohne Maschine)
    let grundsatz = 0;
    if (maschine) {
      const mMatch = saetze.find(s => s.ort === "Werkstatt" && s.maschinenpark === maschine);
      grundsatz = mMatch && mMatch.grundsatz != null ? Number(mMatch.grundsatz) : 0;
      const zuschlag = mMatch ? Number(mMatch.satz) : 0;
      return grundsatz + zuschlag;
    } else {
      // Werkstatt ohne Maschine: Grundsatz aus erstem Werkstatt-Eintrag
      const anyW = saetze.find(s => s.ort === "Werkstatt" && s.grundsatz != null);
      grundsatz = anyW ? Number(anyW.grundsatz) : 0;
      return grundsatz;
    }
  }
  // Avor / Montage: fixer Ort-Satz
  const match = saetze.find(s => s.ort === ort && !s.maschinenpark);
  return match ? Number(match.satz) : 0;
}

interface Eingangsrechnung {
  id: string;
  lieferant: string;
  betrag: number;
  datum: string;
  beschreibung?: string;
  auftrag_id?: string | null;
}

interface VkConfig {
  risiko_gewinn_prozent: number;
  rabatt_prozent: number;
  mwst_prozent: number;
}

const OPEN_STATUSES = ["anfrage", "angebot", "bestaetigt", "in_arbeit", "qualitaet", "rechnung"];

export default function Nachkalkulation() {
  const [selectedAuftrag, setSelectedAuftrag] = useState("");

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: mitarbeiterListe = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const { data: stundensaetze = [] } = useQuery<Stundensatz[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: () => apiRequest("GET", "/api/stundensaetze").then((r) => r.json()),
  });

  const { data: kalkPositionen = [], isLoading: kalkLoading } = useQuery<KalkulationsPosition[]>({
    queryKey: ["/api/kalkulation", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/kalkulation/${selectedAuftrag}`).then((r) => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: vkConfig } = useQuery<VkConfig>({
    queryKey: ["/api/vorkalkulation/config", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${selectedAuftrag}/config`).then((r) => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: zeiteintraege = [], isLoading: zeitLoading } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/auftraege", selectedAuftrag, "zeit"],
    queryFn: () => apiRequest("GET", `/api/auftraege/${selectedAuftrag}/zeit`).then((r) => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: eingangsrechnungen = [], isLoading: eingangsLoading } = useQuery<Eingangsrechnung[]>({
    queryKey: ["/api/eingangsrechnungen"],
    queryFn: () => apiRequest("GET", "/api/eingangsrechnungen").then((r) => r.json()),
  });

  const selectedAuftragData = auftraege.find((a) => a.id === selectedAuftrag);
  const isLoading = kalkLoading || zeitLoading || eingangsLoading;

  // IST-Kosten Arbeit: pro Eintrag den korrekten Satz berechnen
  const totalZeitMin = zeiteintraege.reduce((s, z) => s + (z.dauer_minuten || 0), 0);
  const istArbeit = zeiteintraege.reduce((sum, z) => {
    const satz = getNachkalkSatz(stundensaetze, mitarbeiterListe, z.mitarbeiter, z.ort, z.maschinenpark);
    return sum + ((z.dauer_minuten || 0) / 60) * satz;
  }, 0);
  // Durchschnittssatz zur Anzeige
  const avgSatz = totalZeitMin > 0 ? (istArbeit / (totalZeitMin / 60)) : 0;

  const eingangsAufAuftrag = eingangsrechnungen.filter((e) => e.auftrag_id === selectedAuftrag);
  const istMaterial = eingangsAufAuftrag.reduce((s, e) => s + e.betrag, 0);

  const istGesamt = istArbeit + istMaterial;

  // SOLL-Kosten (Vorkalkulation)
  const sollMaterial = kalkPositionen.filter(p => p.typ === "material").reduce((s, p) => s + p.betrag, 0);
  const sollArbeit = kalkPositionen.filter(p => p.typ === "arbeit").reduce((s, p) => s + p.betrag, 0);
  const sollGesamt = kalkPositionen.reduce((s, p) => s + p.betrag, 0);

  const angebotsBetrag = selectedAuftragData?.angebots_betrag || 0;

  // VK-Offertpreis berechnen (gleiche Logik wie ZusammenfassungBlock)
  const vkSelbstkosten = sollGesamt; // Aus kalkPositionen (Arbeit + Material + Fremd + SOEK)
  const risikoGewinnPct = vkConfig?.risiko_gewinn_prozent ?? 15;
  const rabattPct = vkConfig?.rabatt_prozent ?? 0;
  const mwstPct = vkConfig?.mwst_prozent ?? 8.1;
  const vkRisikoGewinn = vkSelbstkosten * (risikoGewinnPct / 100);
  const vkNettoOhneRabatt = vkSelbstkosten + vkRisikoGewinn;
  const vkRabatt = vkNettoOhneRabatt * (rabattPct / 100);
  const vkNetto = vkNettoOhneRabatt - vkRabatt; // Nettooffertpreis exkl. MWST
  const vkMwst = vkNetto * (mwstPct / 100);
  const vkBrutto = vkNetto + vkMwst; // Bruttooffertpreis inkl. MWST

  // Gewinn: VK-Nettooffertpreis vs. IST-Kosten (korrekte Vergleichsbasis)
  const gewinnVsVk = vkNetto - istGesamt;
  // Gewinn vs. manuell eingetragener Auftragswert (zusätzlich, wenn vorhanden)
  const gewinnVsAngebot = angebotsBetrag > 0 ? angebotsBetrag - istGesamt : null;

  // Abweichungen Soll/Ist
  const abwMaterial = istMaterial - sollMaterial;
  const abwArbeit = istArbeit - sollArbeit;
  const abwGesamt = istGesamt - sollGesamt;

  const abwPct = sollGesamt > 0 ? (abwGesamt / sollGesamt) * 100 : 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Nachkalkulation in Echtzeit
          </h1>
          <p className="text-sm text-muted-foreground">Soll/Ist-Vergleich während des Projekts</p>
        </div>
      </div>

      {/* Auftrag */}
      <Card className="p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Auftrag wählen</label>
            <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Auftrag wählen…" />
              </SelectTrigger>
              <SelectContent>
                {auftraege.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 w-full border">
              <p className="font-medium mb-0.5">Stundensatz</p>
              <p className="text-foreground font-mono">
                {totalZeitMin > 0
                  ? `Ø CHF ${avgSatz.toFixed(2)}/h (berechnet pro Eintrag)`
                  : "Wird aus Einstellungen gelesen (Ort + Maschine)"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {selectedAuftrag && (
        <>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : (
            <>
              {/* Soll vs Ist Übersicht */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Material */}
                <Card className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-semibold">Material</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Soll (Kalkulation)</span><span>{formatCHF(sollMaterial)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                      <span>Ist (Eingangsrechnungen)</span><span>{formatCHF(istMaterial)}</span>
                    </div>
                    <div className={cn("flex justify-between text-xs font-bold pt-1 border-t", abwMaterial > 0 ? "text-red-600" : "text-green-600")}>
                      <span>Abweichung</span>
                      <span>{abwMaterial > 0 ? "+" : ""}{formatCHF(abwMaterial)}</span>
                    </div>
                  </div>
                </Card>

                {/* Arbeit */}
                <Card className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <p className="text-sm font-semibold">Arbeit</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Soll (Kalkulation)</span><span>{formatCHF(sollArbeit)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                      <span>Ist ({Math.floor(totalZeitMin/60)}h {totalZeitMin%60}min × Ø {formatCHF(avgSatz)}/h)</span>
                      <span>{formatCHF(istArbeit)}</span>
                    </div>
                    <div className={cn("flex justify-between text-xs font-bold pt-1 border-t", abwArbeit > 0 ? "text-red-600" : "text-green-600")}>
                      <span>Abweichung</span>
                      <span>{abwArbeit > 0 ? "+" : ""}{formatCHF(abwArbeit)}</span>
                    </div>
                  </div>
                </Card>

                {/* Gesamt */}
                <Card className={cn("p-4 space-y-2 border-2", abwGesamt > 0 ? "border-red-300" : "border-green-300")}>
                  <div className="flex items-center gap-2">
                    {abwGesamt > 0
                      ? <TrendingUp className="h-4 w-4 text-red-600" />
                      : <TrendingDown className="h-4 w-4 text-green-600" />
                    }
                    <p className="text-sm font-semibold">Gesamt</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Soll</span><span>{formatCHF(sollGesamt)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                      <span>Ist</span><span>{formatCHF(istGesamt)}</span>
                    </div>
                    <div className={cn("flex justify-between text-sm font-bold pt-1 border-t", abwGesamt > 0 ? "text-red-600" : "text-green-600")}>
                      <span>Abw. {abwPct.toFixed(1)}%</span>
                      <span>{abwGesamt > 0 ? "+" : ""}{formatCHF(abwGesamt)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Gewinnprognose */}
              {vkNetto > 0 && (
                <div className="space-y-3">
                  {/* VK-Offertpreis Übersicht */}
                  <Card className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">VK-Offertpreis (berechnet)</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Selbstkosten (Soll)</span>
                        <span className="tabular-nums font-mono">{formatCHF(vkSelbstkosten)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>+ Risiko/Gewinn {risikoGewinnPct}%</span>
                        <span className="tabular-nums font-mono">+{formatCHF(vkRisikoGewinn)}</span>
                      </div>
                      {rabattPct > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>− Rabatt {rabattPct}%</span>
                          <span className="tabular-nums font-mono">−{formatCHF(vkRabatt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t pt-1.5">
                        <span>Nettooffertpreis (exkl. MWST)</span>
                        <span className="tabular-nums font-mono">{formatCHF(vkNetto)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>+ MWST {mwstPct}%</span>
                        <span className="tabular-nums font-mono">+{formatCHF(vkMwst)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base border-t pt-1.5" style={{ color: "hsl(var(--primary))" }}>
                        <span>Bruttooffertpreis (inkl. MWST)</span>
                        <span className="tabular-nums font-mono">{formatCHF(vkBrutto)}</span>
                      </div>
                      {angebotsBetrag > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                          <span>Eingetragener Auftragswert</span>
                          <span className="tabular-nums font-mono">{formatCHF(angebotsBetrag)}</span>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Gewinn vs. VK-Nettooffertpreis (Hauptvergleich) */}
                  <Card className={cn("p-4 flex items-center justify-between", gewinnVsVk >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
                    <div className="flex items-center gap-2">
                      {gewinnVsVk >= 0
                        ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                        : <AlertCircle className="h-5 w-5 text-red-600" />
                      }
                      <div>
                        <p className="text-sm font-semibold">Gewinn vs. VK-Offertpreis</p>
                        <p className="text-xs text-muted-foreground">
                          Netto {formatCHF(vkNetto)} − IST-Kosten {formatCHF(istGesamt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-2xl font-bold", gewinnVsVk >= 0 ? "text-green-700" : "text-red-700")}>
                        {formatCHF(gewinnVsVk)}
                      </p>
                      <p className={cn("text-xs font-medium", gewinnVsVk >= 0 ? "text-green-600" : "text-red-600")}>
                        {vkNetto > 0 ? ((gewinnVsVk / vkNetto) * 100).toFixed(1) : "0"}% Marge
                      </p>
                    </div>
                  </Card>

                  {/* Gewinn vs. Auftragswert (wenn eingetragen) */}
                  {gewinnVsAngebot !== null && (
                    <Card className={cn("p-4 flex items-center justify-between border-dashed", gewinnVsAngebot >= 0 ? "border-green-200 bg-green-50/50" : "border-orange-200 bg-orange-50/50")}>
                      <div className="flex items-center gap-2">
                        {gewinnVsAngebot >= 0
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-orange-600" />
                        }
                        <div>
                          <p className="text-sm font-medium">Gewinn vs. Auftragswert</p>
                          <p className="text-xs text-muted-foreground">
                            Auftrag {formatCHF(angebotsBetrag)} − IST-Kosten {formatCHF(istGesamt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-xl font-bold", gewinnVsAngebot >= 0 ? "text-green-700" : "text-orange-700")}>
                          {formatCHF(gewinnVsAngebot)}
                        </p>
                        <p className={cn("text-xs font-medium", gewinnVsAngebot >= 0 ? "text-green-600" : "text-orange-600")}>
                          {angebotsBetrag > 0 ? ((gewinnVsAngebot / angebotsBetrag) * 100).toFixed(1) : "0"}% Marge
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* Zeiteinträge Detail */}
              {zeiteintraege.length > 0 && (
                <Card className="p-5 space-y-3">
                  <p className="text-sm font-semibold">Zeiterfassung Detail</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="pb-2 pr-3">Mitarbeiter</th>
                          <th className="pb-2 pr-3">Datum</th>
                          <th className="pb-2 pr-3 text-right">Stunden</th>
                          <th className="pb-2 text-right">Kosten</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {zeiteintraege.map((z) => {
                          const h = Math.floor(z.dauer_minuten / 60);
                          const m = z.dauer_minuten % 60;
                          const satzZ = getNachkalkSatz(stundensaetze, mitarbeiterListe, z.mitarbeiter, z.ort, z.maschinenpark);
                          const kosten = (z.dauer_minuten / 60) * satzZ;
                          return (
                            <tr key={z.id}>
                              <td className="py-1.5 pr-3 font-medium">{z.mitarbeiter}</td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{z.datum}</td>
                              <td className="py-1.5 pr-3 text-right">{h}h {m}min</td>
                              <td className="py-1.5 text-right font-medium">{formatCHF(kosten)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td colSpan={2} className="pt-2">Total Arbeit</td>
                          <td className="pt-2 text-right">{Math.floor(totalZeitMin/60)}h {totalZeitMin%60}min</td>
                          <td className="pt-2 text-right" style={{ color: "#e8620a" }}>{formatCHF(istArbeit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}

              {/* Eingangsrechnungen Detail */}
              {eingangsAufAuftrag.length > 0 && (
                <Card className="p-5 space-y-3">
                  <p className="text-sm font-semibold">Materialkosten (Eingangsrechnungen)</p>
                  <div className="space-y-2">
                    {eingangsAufAuftrag.map((e) => (
                      <div key={e.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                        <div>
                          <p className="font-medium">{e.lieferant}</p>
                          {e.beschreibung && <p className="text-xs text-muted-foreground">{e.beschreibung}</p>}
                        </div>
                        <span className="font-semibold">{formatCHF(e.betrag)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {kalkPositionen.length === 0 && zeiteintraege.length === 0 && eingangsAufAuftrag.length === 0 && (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    Noch keine Daten vorhanden. Erfasse zuerst eine Vorkalkulation, Zeiteinträge oder Eingangsrechnungen für diesen Auftrag.
                  </p>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
