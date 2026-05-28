import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Package,
  Wrench,
  Receipt,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Minus,
  Calculator,
} from "lucide-react";
import { formatCHF } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Stundensatz {
  id: string;
  ort: string;
  maschinenpark: string | null;
  satz: number;
  grundsatz: number | null;
}

interface VkStunde {
  id?: string;
  auftrag_id: string;
  ort: string;
  maschinenpark?: string | null;
  soll_stunden: number;
  stundensatz: number;
}

interface VkMaterial {
  id?: string;
  auftrag_id: string;
  pos: number;
  profil: string;
  total_chf: number;
}

interface VkFremd {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  total_chf: number;
}

interface VkSoek {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  total_chf: number;
}

interface VkConfig {
  id?: string;
  auftrag_id: string;
  risiko_gewinn_prozent: number;
  rabatt_prozent: number;
  mwst_prozent: number;
}

interface Zeiteintrag {
  id: string;
  mitarbeiter: string;
  datum: string;
  dauer_minuten: number;
  ort?: string | null;
  maschinenpark?: string | null;
}

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  stundensatz: number;
}

interface NakaMaterial {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  lieferant: string;
  betrag_chf: number;
}

interface NakaFremd {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  lieferant: string;
  betrag_chf: number;
}

interface Eingangsrechnung {
  id: string;
  lieferant: string;
  betrag: number;
  datum: string;
  beschreibung?: string;
  auftrag_id?: string | null;
}

// ─── Stundensatz-Berechnung ──────────────────────────────────────────────────

function getOrtSatz(saetze: Stundensatz[], ort: string, maschine: string | null): number {
  const match = saetze.find((s) => {
    if (ort === "Werkstatt") return s.ort === "Werkstatt" && s.maschinenpark === maschine;
    return s.ort === ort && !s.maschinenpark;
  });
  if (!match) return 0;
  if (ort === "Werkstatt" && match.grundsatz) return Number(match.grundsatz) + Number(match.satz);
  return Number(match.satz);
}

function getNachkalkSatz(
  saetze: Stundensatz[],
  mitarbeiterListe: Mitarbeiter[],
  maName: string,
  ort: string | null | undefined,
  maschine: string | null | undefined
): number {
  if (!ort) {
    const ma = mitarbeiterListe.find(m => `${m.vorname} ${m.nachname}` === maName);
    return ma ? Number(ma.stundensatz) : 0;
  }
  if (ort === "Werkstatt") {
    if (maschine) {
      const mMatch = saetze.find(s => s.ort === "Werkstatt" && s.maschinenpark === maschine);
      const grundsatz = mMatch && mMatch.grundsatz != null ? Number(mMatch.grundsatz) : 0;
      const zuschlag = mMatch ? Number(mMatch.satz) : 0;
      return grundsatz + zuschlag;
    } else {
      const anyW = saetze.find(s => s.ort === "Werkstatt" && s.grundsatz != null);
      return anyW ? Number(anyW.grundsatz) : 0;
    }
  }
  const match = saetze.find(s => s.ort === ort && !s.maschinenpark);
  return match ? Number(match.satz) : 0;
}

// ─── Vergleichs-Zeile ────────────────────────────────────────────────────────

function VergleichsZeile({
  label,
  vk,
  nk,
  icon: Icon,
  iconColor,
}: {
  label: string;
  vk: number;
  nk: number;
  icon: React.ElementType;
  iconColor: string;
}) {
  const diff = nk - vk;
  const pct = vk > 0 ? (diff / vk) * 100 : 0;
  const isPositiv = diff <= 0; // Kosten-Unterschreitung = positiv

  return (
    <tr className="border-b last:border-0 hover:bg-muted/10">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
          <span className="font-medium text-sm">{label}</span>
        </div>
      </td>
      <td className="p-3 text-right tabular-nums text-sm text-muted-foreground">
        {vk > 0 ? formatCHF(vk) : "—"}
      </td>
      <td className="p-3 text-right tabular-nums text-sm font-medium">
        {nk > 0 ? formatCHF(nk) : "—"}
      </td>
      <td className="p-3 text-right tabular-nums text-sm">
        {(vk > 0 || nk > 0) ? (
          <span className={cn("font-bold", isPositiv ? "text-green-600" : "text-red-600")}>
            {diff > 0 ? "+" : ""}{formatCHF(diff)}
          </span>
        ) : "—"}
      </td>
      <td className="p-3 text-right tabular-nums text-xs">
        {vk > 0 && (vk > 0 || nk > 0) ? (
          <Badge
            variant="outline"
            className={cn("text-xs font-bold border-0", isPositiv ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}
          >
            {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
          </Badge>
        ) : null}
      </td>
    </tr>
  );
}

// ─── Hauptseite ─────────────────────────────────────────────────────────────────

export default function KalkulationsUebersicht() {
  const [selectedAuftrag, setSelectedAuftrag] = useState("");

  // Stammdaten
  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then(r => r.json()),
  });

  const { data: stundensaetze = [] } = useQuery<Stundensatz[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: () => apiRequest("GET", "/api/stundensaetze").then(r => r.json()),
  });

  const { data: mitarbeiterListe = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then(r => r.json()),
  });

  // VK-Daten
  const { data: vkStunden = [], isLoading: vkStdLoading } = useQuery<VkStunde[]>({
    queryKey: ["/api/vorkalkulation/stunden", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${selectedAuftrag}/stunden`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: vkMaterial = [], isLoading: vkMatLoading } = useQuery<VkMaterial[]>({
    queryKey: ["/api/vorkalkulation/material", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${selectedAuftrag}/material`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: vkFremd = [], isLoading: vkFremdLoading } = useQuery<VkFremd[]>({
    queryKey: ["/api/vorkalkulation/fremdleistungen", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${selectedAuftrag}/fremdleistungen`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: vkSoek = [], isLoading: vkSoekLoading } = useQuery<VkSoek[]>({
    queryKey: ["/api/vorkalkulation/soek", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${selectedAuftrag}/soek`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: vkConfig } = useQuery<VkConfig>({
    queryKey: ["/api/vorkalkulation/config", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${selectedAuftrag}/config`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  // NK-Daten (IST)
  const { data: zeiteintraege = [], isLoading: zeitLoading } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/auftraege", selectedAuftrag, "zeit"],
    queryFn: () => apiRequest("GET", `/api/auftraege/${selectedAuftrag}/zeit`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: nakaMaterial = [], isLoading: nakaMatLoading } = useQuery<NakaMaterial[]>({
    queryKey: ["/api/nachkalkulation/material", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/nachkalkulation/${selectedAuftrag}/material`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: nakaFremd = [], isLoading: nakaFremdLoading } = useQuery<NakaFremd[]>({
    queryKey: ["/api/nachkalkulation/fremdleistungen", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/nachkalkulation/${selectedAuftrag}/fremdleistungen`).then(r => r.json()),
    enabled: !!selectedAuftrag,
  });

  const { data: eingangsrechnungen = [] } = useQuery<Eingangsrechnung[]>({
    queryKey: ["/api/eingangsrechnungen"],
    queryFn: () => apiRequest("GET", "/api/eingangsrechnungen").then(r => r.json()),
  });

  const isLoading = vkStdLoading || vkMatLoading || vkFremdLoading || vkSoekLoading || zeitLoading || nakaMatLoading || nakaFremdLoading;

  const selectedAuftragData = auftraege.find(a => a.id === selectedAuftrag);

  // ─── VK-Berechnungen ────────────────────────────────────────────────────────

  const vkLohnkosten = vkStunden.reduce((s, r) => {
    const satz = getOrtSatz(stundensaetze, r.ort, (r as any).maschinenpark ?? null);
    return s + Number(r.soll_stunden) * satz;
  }, 0);

  const vkTotalMaterial = vkMaterial.reduce((s, m) => s + Number(m.total_chf), 0);
  const vkTotalFremd = vkFremd.reduce((s, f) => s + Number(f.total_chf), 0);
  const vkTotalSoek = vkSoek.reduce((s, s2) => s + Number(s2.total_chf), 0);

  const risikoGewinnPct = vkConfig?.risiko_gewinn_prozent ?? 0;
  const rabattPct = vkConfig?.rabatt_prozent ?? 0;
  const mwstPct = vkConfig?.mwst_prozent ?? 8.1;
  const gemeinkostensatz = 25; // Standard

  const vkGemeinkosten = vkLohnkosten * (gemeinkostensatz / 100);
  const vkSelbstkosten = vkTotalMaterial + vkTotalFremd + vkLohnkosten + vkGemeinkosten + vkTotalSoek;
  const vkRisikoGewinn = vkSelbstkosten * (risikoGewinnPct / 100);
  const vkNetto = vkSelbstkosten + vkRisikoGewinn;
  const vkRabatt = vkNetto * (rabattPct / 100);
  const vkNacRabatt = vkNetto - vkRabatt;
  const vkMwst = vkNacRabatt * (mwstPct / 100);
  const vkBrutto = vkNacRabatt + vkMwst;

  const vkStundenTotal = vkStunden.reduce((s, r) => s + Number(r.soll_stunden), 0);

  // Stunden nach Bereich
  const vkStdByOrt = {
    avor: vkStunden.filter(r => r.ort === "Avor").reduce((s, r) => s + Number(r.soll_stunden), 0),
    werkstatt: vkStunden.filter(r => r.ort === "Werkstatt").reduce((s, r) => s + Number(r.soll_stunden), 0),
    montage: vkStunden.filter(r => r.ort === "Montage").reduce((s, r) => s + Number(r.soll_stunden), 0),
  };
  const vkKostByOrt = {
    avor: vkStunden.filter(r => r.ort === "Avor").reduce((s, r) => s + Number(r.soll_stunden) * getOrtSatz(stundensaetze, r.ort, null), 0),
    werkstatt: vkStunden.filter(r => r.ort === "Werkstatt").reduce((s, r) => s + Number(r.soll_stunden) * getOrtSatz(stundensaetze, r.ort, (r as any).maschinenpark ?? null), 0),
    montage: vkStunden.filter(r => r.ort === "Montage").reduce((s, r) => s + Number(r.soll_stunden) * getOrtSatz(stundensaetze, r.ort, null), 0),
  };

  // ─── NK-Berechnungen ────────────────────────────────────────────────────────

  const totalZeitMin = zeiteintraege.reduce((s, z) => s + (z.dauer_minuten || 0), 0);
  const nkIstArbeit = zeiteintraege.reduce((sum, z) => {
    const satz = getNachkalkSatz(stundensaetze, mitarbeiterListe, z.mitarbeiter, z.ort, z.maschinenpark);
    return sum + ((z.dauer_minuten || 0) / 60) * satz;
  }, 0);

  const nkIstStdByOrt = {
    avor: zeiteintraege.filter(z => z.ort === "Avor").reduce((s, z) => s + z.dauer_minuten / 60, 0),
    werkstatt: zeiteintraege.filter(z => z.ort === "Werkstatt").reduce((s, z) => s + z.dauer_minuten / 60, 0),
    montage: zeiteintraege.filter(z => z.ort === "Montage").reduce((s, z) => s + z.dauer_minuten / 60, 0),
  };
  const nkIstKostByOrt = {
    avor: zeiteintraege.filter(z => z.ort === "Avor").reduce((s, z) => s + (z.dauer_minuten / 60) * getNachkalkSatz(stundensaetze, mitarbeiterListe, z.mitarbeiter, z.ort, z.maschinenpark), 0),
    werkstatt: zeiteintraege.filter(z => z.ort === "Werkstatt").reduce((s, z) => s + (z.dauer_minuten / 60) * getNachkalkSatz(stundensaetze, mitarbeiterListe, z.mitarbeiter, z.ort, z.maschinenpark), 0),
    montage: zeiteintraege.filter(z => z.ort === "Montage").reduce((s, z) => s + (z.dauer_minuten / 60) * getNachkalkSatz(stundensaetze, mitarbeiterListe, z.mitarbeiter, z.ort, z.maschinenpark), 0),
  };

  // IST-Material: aus Nachkalkulation + Eingangsrechnungen
  const nkIstMaterial = nakaMaterial.reduce((s, m) => s + Number(m.betrag_chf), 0)
    + eingangsrechnungen.filter(e => e.auftrag_id === selectedAuftrag).reduce((s, e) => s + e.betrag, 0);
  const nkIstFremd = nakaFremd.reduce((s, f) => s + Number(f.betrag_chf), 0);
  const nkSelbstkosten = nkIstMaterial + nkIstFremd + nkIstArbeit;

  const angebotsBetrag = selectedAuftragData?.angebots_betrag || 0;

  // ─── Gewinn/Verlust ──────────────────────────────────────────────────────────

  const gewinnVsVk = vkBrutto - nkSelbstkosten; // positiv = Gewinn besser als geplant
  const gewinnVsAngebot = angebotsBetrag > 0 ? angebotsBetrag - nkSelbstkosten : null;

  const hasData = vkStundenTotal > 0 || vkTotalMaterial > 0 || vkTotalFremd > 0 || vkTotalSoek > 0 || totalZeitMin > 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Kalkulations-Übersicht
          </h1>
          <p className="text-sm text-muted-foreground">Vergleich Vorkalkulation (SOLL) vs. Ist-Kosten (NK)</p>
        </div>
      </div>

      {/* Auftrags-Auswahl */}
      <Card className="p-4">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Auftrag wählen</label>
        <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Auftrag wählen…" />
          </SelectTrigger>
          <SelectContent>
            {auftraege.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nr} — {a.titel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedAuftragData && (
          <div className="mt-2 flex gap-3 flex-wrap">
            <Badge variant="outline" className="text-xs">
              Status: {selectedAuftragData.status}
            </Badge>
            {angebotsBetrag > 0 && (
              <Badge variant="outline" className="text-xs">
                Angebot: {formatCHF(angebotsBetrag)}
              </Badge>
            )}
          </div>
        )}
      </Card>

      {selectedAuftrag && (
        <>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : !hasData ? (
            <Card className="p-10 text-center">
              <Calculator className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Noch keine Kalkulationsdaten für diesen Auftrag.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Erfasse zuerst eine Vorkalkulation im Auftrag.
              </p>
            </Card>
          ) : (
            <>
              {/* ── KPIs ─────────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">VK Selbstkosten</p>
                  <p className="text-base font-bold tabular-nums">{formatCHF(vkSelbstkosten)}</p>
                  <p className="text-xs text-muted-foreground">{vkStundenTotal.toFixed(1)} h geplant</p>
                </Card>
                <Card className="p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">VK Bruttooffertpreis</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: "hsl(var(--primary))" }}>{formatCHF(vkBrutto)}</p>
                  <p className="text-xs text-muted-foreground">inkl. {mwstPct}% MWST</p>
                </Card>
                <Card className="p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">NK Ist-Kosten</p>
                  <p className="text-base font-bold tabular-nums">{formatCHF(nkSelbstkosten)}</p>
                  <p className="text-xs text-muted-foreground">{(totalZeitMin / 60).toFixed(1)} h erfasst</p>
                </Card>
                <Card className={cn(
                  "p-3 space-y-0.5 border-2",
                  gewinnVsAngebot !== null
                    ? gewinnVsAngebot >= 0 ? "border-green-300" : "border-red-300"
                    : vkBrutto >= nkSelbstkosten ? "border-green-300" : "border-red-300"
                )}>
                  <p className="text-xs text-muted-foreground">
                    {angebotsBetrag > 0 ? "Gewinn (Angebot)" : "VK vs. NK Differenz"}
                  </p>
                  <p className={cn(
                    "text-base font-bold tabular-nums",
                    (gewinnVsAngebot ?? gewinnVsVk) >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {formatCHF(gewinnVsAngebot ?? gewinnVsVk)}
                  </p>
                  {angebotsBetrag > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {((( gewinnVsAngebot ?? 0) / angebotsBetrag) * 100).toFixed(1)}% Marge
                    </p>
                  )}
                </Card>
              </div>

              {/* ── Haupt-Vergleichstabelle ─────────────────────────────── */}
              <Card className="overflow-hidden">
                <div className="p-4 border-b flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
                  <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                    SOLL vs. IST — Kostenvergleich
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                        <th className="text-left p-3">Kostenart</th>
                        <th className="text-right p-3 w-28">VK (Soll)</th>
                        <th className="text-right p-3 w-28">NK (Ist)</th>
                        <th className="text-right p-3 w-28">Differenz</th>
                        <th className="text-right p-3 w-20">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      <VergleichsZeile
                        label="Hauptmaterial"
                        vk={vkTotalMaterial}
                        nk={nkIstMaterial}
                        icon={Package}
                        iconColor="text-blue-600"
                      />
                      <VergleichsZeile
                        label="Fremdleistungen"
                        vk={vkTotalFremd}
                        nk={nkIstFremd}
                        icon={Wrench}
                        iconColor="text-purple-600"
                      />
                      <VergleichsZeile
                        label="Lohneinzelkosten (Stunden)"
                        vk={vkLohnkosten}
                        nk={nkIstArbeit}
                        icon={Clock}
                        iconColor="text-orange-600"
                      />
                      <VergleichsZeile
                        label="Gemeinkosten"
                        vk={vkGemeinkosten}
                        nk={0}
                        icon={Calculator}
                        iconColor="text-gray-500"
                      />
                      <VergleichsZeile
                        label="Sondereinzelkosten (SOEK)"
                        vk={vkTotalSoek}
                        nk={0}
                        icon={Receipt}
                        iconColor="text-amber-600"
                      />
                    </tbody>
                    <tfoot>
                      <tr className="font-bold border-t-2 bg-primary/5">
                        <td className="p-3">
                          <span className="text-sm">Total Selbstkosten</span>
                        </td>
                        <td className="p-3 text-right tabular-nums" style={{ color: "hsl(var(--primary))" }}>
                          {formatCHF(vkSelbstkosten)}
                        </td>
                        <td className="p-3 text-right tabular-nums font-bold">
                          {formatCHF(nkSelbstkosten)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={cn("font-bold", nkSelbstkosten <= vkSelbstkosten ? "text-green-600" : "text-red-600")}>
                            {nkSelbstkosten - vkSelbstkosten > 0 ? "+" : ""}{formatCHF(nkSelbstkosten - vkSelbstkosten)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs font-bold border-0",
                              nkSelbstkosten <= vkSelbstkosten ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}
                          >
                            {vkSelbstkosten > 0
                              ? `${(((nkSelbstkosten - vkSelbstkosten) / vkSelbstkosten) * 100).toFixed(1)}%`
                              : "—"}
                          </Badge>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              {/* ── Stunden-Detail nach Bereich ─────────────────────────── */}
              {(vkStundenTotal > 0 || totalZeitMin > 0) && (
                <Card className="overflow-hidden">
                  <div className="p-4 border-b flex items-center gap-2">
                    <Clock className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
                    <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                      Stunden-Vergleich nach Bereich
                    </h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                        <th className="text-left p-3">Bereich</th>
                        <th className="text-right p-3">VK Std.</th>
                        <th className="text-right p-3">IST Std.</th>
                        <th className="text-right p-3">Diff. Std.</th>
                        <th className="text-right p-3">VK Kosten</th>
                        <th className="text-right p-3">IST Kosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "AVOR (Techn. Büro)", key: "avor" as const },
                        { label: "Werkstatt", key: "werkstatt" as const },
                        { label: "Montage", key: "montage" as const },
                      ].map(({ label, key }) => {
                        const vkH = vkStdByOrt[key];
                        const nkH = nkIstStdByOrt[key];
                        const vkK = vkKostByOrt[key];
                        const nkK = nkIstKostByOrt[key];
                        const diff = nkH - vkH;
                        if (vkH === 0 && nkH === 0) return null;
                        return (
                          <tr key={key} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="p-3 font-medium">{label}</td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">
                              {vkH > 0 ? `${vkH.toFixed(1)} h` : "—"}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {nkH > 0 ? `${nkH.toFixed(1)} h` : "—"}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {(vkH > 0 || nkH > 0) ? (
                                <span className={cn("font-bold text-xs", diff <= 0 ? "text-green-600" : "text-red-600")}>
                                  {diff > 0 ? "+" : ""}{diff.toFixed(1)} h
                                </span>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">
                              {vkK > 0 ? formatCHF(vkK) : "—"}
                            </td>
                            <td className="p-3 text-right tabular-nums font-medium">
                              {nkK > 0 ? formatCHF(nkK) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="font-bold bg-primary/5 border-t-2">
                        <td className="p-3">Total</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {vkStundenTotal.toFixed(1)} h
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {(totalZeitMin / 60).toFixed(1)} h
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {(() => {
                            const diff = (totalZeitMin / 60) - vkStundenTotal;
                            return (
                              <span className={cn("font-bold text-xs", diff <= 0 ? "text-green-600" : "text-red-600")}>
                                {diff > 0 ? "+" : ""}{diff.toFixed(1)} h
                              </span>
                            );
                          })()}
                        </td>
                        <td className="p-3 text-right tabular-nums" style={{ color: "hsl(var(--primary))" }}>
                          {formatCHF(vkLohnkosten)}
                        </td>
                        <td className="p-3 text-right tabular-nums font-bold">
                          {formatCHF(nkIstArbeit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
              )}

              {/* ── Offertpreis-Struktur (VK) ────────────────────────────── */}
              {vkSelbstkosten > 0 && (
                <Card className="overflow-hidden">
                  <div className="p-4 border-b flex items-center gap-2">
                    <Calculator className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
                    <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                      Offertpreis-Struktur (Vorkalkulation)
                    </h2>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { label: "Hauptmaterial (1.0 + 1.1)", value: vkTotalMaterial },
                      { label: "Hilfsmaterial (2.)", value: 0, note: "in Material enthalten" },
                      { label: "Fremdleistungen (3.)", value: vkTotalFremd },
                      { label: "Lohneinzelkosten (4.+5.+7.)", value: vkLohnkosten },
                      { label: `Gemeinkosten (${gemeinkostensatz}% auf LEK)`, value: vkGemeinkosten },
                      { label: "Sondereinzelkosten (9.)", value: vkTotalSoek },
                    ].map(({ label, value, note }) => (
                      <div key={label} className="flex justify-between items-center text-sm py-1 border-b border-dashed last:border-0">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">
                          {note ? <span className="text-xs italic text-muted-foreground">{note}</span> : formatCHF(value)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-sm py-1.5 border-t-2 font-bold">
                      <span>10. Selbstkosten</span>
                      <span className="tabular-nums" style={{ color: "hsl(var(--primary))" }}>{formatCHF(vkSelbstkosten)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm py-1 border-b border-dashed text-muted-foreground">
                      <span>+ Risiko & Gewinn ({risikoGewinnPct}%)</span>
                      <span className="tabular-nums">+ {formatCHF(vkRisikoGewinn)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm py-1 border-b border-dashed text-muted-foreground">
                      <span>Nettooffertpreis</span>
                      <span className="tabular-nums font-medium">{formatCHF(vkNetto)}</span>
                    </div>
                    {rabattPct > 0 && (
                      <div className="flex justify-between items-center text-sm py-1 border-b border-dashed text-muted-foreground">
                        <span>− Rabatt ({rabattPct}%)</span>
                        <span className="tabular-nums">− {formatCHF(vkRabatt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm py-1 border-b border-dashed text-muted-foreground">
                      <span>+ MWST ({mwstPct}%)</span>
                      <span className="tabular-nums">+ {formatCHF(vkMwst)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-t-2 font-bold">
                      <span className="text-base">Bruttooffertpreis</span>
                      <span className="text-base tabular-nums" style={{ color: "hsl(var(--primary))" }}>{formatCHF(vkBrutto)}</span>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Gewinn/Verlust-Prognose ──────────────────────────────── */}
              <Card className={cn(
                "p-5 border-2",
                (gewinnVsAngebot ?? gewinnVsVk) >= 0 ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/20"
              )}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {(gewinnVsAngebot ?? gewinnVsVk) >= 0
                      ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                      : <AlertCircle className="h-6 w-6 text-red-600 shrink-0" />}
                    <div>
                      <p className="font-semibold text-base">
                        {angebotsBetrag > 0 ? "Gewinn-/Verlustprognose (Angebot)" : "VK vs. NK Ergebnis"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {angebotsBetrag > 0
                          ? `Angebot ${formatCHF(angebotsBetrag)} − IST-Kosten ${formatCHF(nkSelbstkosten)}`
                          : `VK Brutto ${formatCHF(vkBrutto)} − IST-Kosten ${formatCHF(nkSelbstkosten)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-2xl font-bold tabular-nums",
                      (gewinnVsAngebot ?? gewinnVsVk) >= 0 ? "text-green-700" : "text-red-700"
                    )}>
                      {formatCHF(gewinnVsAngebot ?? gewinnVsVk)}
                    </p>
                    {angebotsBetrag > 0 && (
                      <p className={cn("text-sm font-medium", (gewinnVsAngebot ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                        {((( gewinnVsAngebot ?? 0) / angebotsBetrag) * 100).toFixed(1)}% Marge
                      </p>
                    )}
                  </div>
                </div>

                {/* Kennzahlen */}
                {vkStundenTotal > 0 && (
                  <div className="mt-4 pt-4 border-t border-current/20 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Fr./h (VK)</p>
                      <p className="text-sm font-bold tabular-nums">
                        {vkStundenTotal > 0 ? formatCHF(vkBrutto / vkStundenTotal) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fr./h (IST)</p>
                      <p className="text-sm font-bold tabular-nums">
                        {(totalZeitMin / 60) > 0 ? formatCHF(nkSelbstkosten / (totalZeitMin / 60)) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Stunden VK</p>
                      <p className="text-sm font-bold tabular-nums">{vkStundenTotal.toFixed(1)} h</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Stunden IST</p>
                      <p className="text-sm font-bold tabular-nums">{(totalZeitMin / 60).toFixed(1)} h</p>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
