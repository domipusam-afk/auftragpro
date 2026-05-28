import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCHF } from "@/lib/format";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, Banknote, ArrowUpRight, ArrowDownRight, Calendar
} from "lucide-react";
import type { Rechnung } from "@shared/schema";

function kw(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default function Liquiditaet() {
  const { data: rechnungen = [], isLoading: lR } = useQuery<Rechnung[]>({
    queryKey: ["/api/rechnungen"],
    queryFn: () => apiRequest("GET", "/api/rechnungen").then(r => r.json()),
  });

  const { data: eingangsrechnungen = [], isLoading: lE } = useQuery<any[]>({
    queryKey: ["/api/eingangsrechnungen"],
    queryFn: () => apiRequest("GET", "/api/eingangsrechnungen").then(r => r.json()),
  });

  const { data: mahnungen = [] } = useQuery<any[]>({
    queryKey: ["/api/mahnungen"],
    queryFn: () => apiRequest("GET", "/api/mahnungen").then(r => r.json()),
  });

  const isLoading = lR || lE;

  const now = new Date();
  const heute = now.toISOString().slice(0, 10);
  const thisMonth = heute.slice(0, 7);

  // Ausgaben (Eingangsrechnungen offen)
  const ausgabenOffen = eingangsrechnungen
    .filter((e: any) => e.status !== "bezahlt")
    .reduce((s: number, e: any) => s + (Number(e.betrag) || 0), 0);

  // Diese Woche fällig (Eingangsrechnungen)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const ausgabenDieseWoche = eingangsrechnungen
    .filter((e: any) => {
      if (e.status === "bezahlt") return false;
      if (!e.faellig_datum) return false;
      const f = new Date(e.faellig_datum);
      return f >= startOfWeek && f <= endOfWeek;
    })
    .reduce((s: number, e: any) => s + (Number(e.betrag) || 0), 0);

  // Einnahmen (Ausgangsrechnungen offen)
  const einnahmenOffen = (rechnungen as any[])
    .filter((r: any) => !r.bezahlt_am)
    .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);

  const einnahmenDieseWoche = (rechnungen as any[])
    .filter((r: any) => {
      if (r.bezahlt_am) return false;
      if (!r.faellig_datum) return false;
      const f = new Date(r.faellig_datum);
      return f >= startOfWeek && f <= endOfWeek;
    })
    .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);

  // Überfällig
  const ueberfaelligRechnungen = (rechnungen as any[]).filter((r: any) => {
    if (r.bezahlt_am) return false;
    if (!r.faellig_datum) return false;
    return new Date(r.faellig_datum) < now;
  });
  const ueberfaelligBetrag = ueberfaelligRechnungen.reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);

  // Monats-Zusammenfassung (letzte 6 Monate)
  const monate: { label: string; einnahmen: number; ausgaben: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("de-CH", { month: "short", year: "2-digit" });
    const einnahmen = (rechnungen as any[])
      .filter((r: any) => r.bezahlt_am && r.bezahlt_am.startsWith(m))
      .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
    const ausgaben = eingangsrechnungen
      .filter((e: any) => e.status === "bezahlt" && e.datum && e.datum.startsWith(m))
      .reduce((s: number, e: any) => s + (Number(e.betrag) || 0), 0);
    monate.push({ label, einnahmen, ausgaben });
  }

  const maxVal = Math.max(...monate.map(m => Math.max(m.einnahmen, m.ausgaben)), 1);

  // Nächste fällige Posten (kombiniert)
  const naechsteFaellig: { nr: string; typ: "einnahme" | "ausgabe"; betrag: number; faellig: string; name: string }[] = [];
  (rechnungen as any[]).forEach((r: any) => {
    if (!r.bezahlt_am && r.faellig_datum) {
      naechsteFaellig.push({ nr: r.nr || "-", typ: "einnahme", betrag: Number(r.betrag) || 0, faellig: r.faellig_datum, name: r.empfaenger_name || "-" });
    }
  });
  eingangsrechnungen.forEach((e: any) => {
    if (e.status !== "bezahlt" && e.faellig_datum) {
      naechsteFaellig.push({ nr: e.nr || "-", typ: "ausgabe", betrag: Number(e.betrag) || 0, faellig: e.faellig_datum, name: e.lieferant || "-" });
    }
  });
  naechsteFaellig.sort((a, b) => a.faellig.localeCompare(b.faellig));

  const netto = einnahmenOffen - ausgabenOffen;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Liquidität & Budgetübersicht
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Finanzielle Übersicht — offene Posten, Fälligkeiten & Monatsvergleich
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* KPI-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Ausstehend (Einnahmen)</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{formatCHF(einnahmenOffen)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Diese Woche: {formatCHF(einnahmenDieseWoche)}</p>
                </div>
                <div className="h-9 w-9 rounded-md bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <ArrowUpRight className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Offene Ausgaben</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{formatCHF(ausgabenOffen)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Diese Woche: {formatCHF(ausgabenDieseWoche)}</p>
                </div>
                <div className="h-9 w-9 rounded-md bg-red-100 dark:bg-red-950 flex items-center justify-center">
                  <ArrowDownRight className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Überfällig</p>
                  <p className="text-xl font-bold text-amber-600 mt-1">{formatCHF(ueberfaelligBetrag)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ueberfaelligRechnungen.length} Rechnung(en)</p>
                </div>
                <div className="h-9 w-9 rounded-md bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </Card>

            <Card className={`p-4 ${netto >= 0 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Netto-Position</p>
                  <p className={`text-xl font-bold mt-1 ${netto >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCHF(netto)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Einnahmen − Ausgaben</p>
                </div>
                <div className={`h-9 w-9 rounded-md flex items-center justify-center ${netto >= 0 ? "bg-green-100 dark:bg-green-950" : "bg-red-100 dark:bg-red-950"}`}>
                  <Banknote className={`h-5 w-5 ${netto >= 0 ? "text-green-600" : "text-red-600"}`} />
                </div>
              </div>
            </Card>
          </div>

          {/* Balkendiagramm Monatsverlauf */}
          <Card className="p-5 mb-6">
            <h2 className="font-semibold text-sm mb-4">Monatsverlauf (letzte 6 Monate)</h2>
            <div className="flex items-end gap-3 h-40">
              {monate.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end" style={{ height: 120 }}>
                    {/* Einnahmen */}
                    <div
                      className="flex-1 bg-green-500/70 rounded-t transition-all"
                      style={{ height: `${Math.max(2, (m.einnahmen / maxVal) * 100)}%` }}
                      title={`Einnahmen: ${formatCHF(m.einnahmen)}`}
                    />
                    {/* Ausgaben */}
                    <div
                      className="flex-1 bg-red-400/70 rounded-t transition-all"
                      style={{ height: `${Math.max(2, (m.ausgaben / maxVal) * 100)}%` }}
                      title={`Ausgaben: ${formatCHF(m.ausgaben)}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-sm bg-green-500/70" /> Einnahmen
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-3 h-3 rounded-sm bg-red-400/70" /> Ausgaben
              </div>
            </div>
          </Card>

          {/* Nächste fällige Posten */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-sm">Nächste Fälligkeiten</h2>
            </div>
            {naechsteFaellig.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                Keine offenen Posten
              </div>
            ) : (
              <div className="divide-y">
                {naechsteFaellig.slice(0, 15).map((p, i) => {
                  const faelligDate = new Date(p.faellig);
                  const istUeberfaellig = faelligDate < now;
                  const diffDays = Math.ceil((faelligDate.getTime() - now.getTime()) / 86400000);
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          p.typ === "einnahme" ? "bg-green-100 dark:bg-green-950" : "bg-red-100 dark:bg-red-950"
                        }`}>
                          {p.typ === "einnahme"
                            ? <ArrowUpRight className="h-4 w-4 text-green-600" />
                            : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.nr} · {p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.typ === "einnahme" ? "Ausgangsrechnung" : "Eingangsrechnung"} · Fällig: {p.faellig}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-semibold text-sm ${p.typ === "einnahme" ? "text-green-600" : "text-red-600"}`}>
                          {p.typ === "einnahme" ? "+" : "−"}{formatCHF(p.betrag)}
                        </span>
                        <Badge className={`text-xs ${
                          istUeberfaellig
                            ? "bg-red-100 text-red-700 border-red-200"
                            : diffDays <= 7
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}>
                          {istUeberfaellig ? `${Math.abs(diffDays)}d überfällig` : diffDays === 0 ? "Heute" : `${diffDays}d`}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
