import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";


const MONATE = [
  { value: "1",  label: "Januar" },
  { value: "2",  label: "Februar" },
  { value: "3",  label: "März" },
  { value: "4",  label: "April" },
  { value: "5",  label: "Mai" },
  { value: "6",  label: "Juni" },
  { value: "7",  label: "Juli" },
  { value: "8",  label: "August" },
  { value: "9",  label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Dezember" },
];

// Schweizer AN-Abzüge (Arbeitnehmer-Anteil)
const ABZUEGE = [
  { key: "ahv", label: "AHV", rate: 0.053 },
  { key: "iv",  label: "IV",  rate: 0.014 },
  { key: "eo",  label: "EO",  rate: 0.005 },
  { key: "alv", label: "ALV", rate: 0.011 },
];
const TOTAL_AN_RATE = ABZUEGE.reduce((s, a) => s + a.rate, 0); // 0.083

const fmt = (n: number) =>
  n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Lohnabrechnung() {
  const { toast } = useToast();
  const now = new Date();

  const [monat,          setMonat]          = useState(String(now.getMonth() + 1));
  const [jahr,           setJahr]           = useState(String(now.getFullYear()));
  const [mitarbeiter,    setMitarbeiter]    = useState("");
  const [stundenansatz,  setStundenansatz]  = useState("45");
  const [inkl13,         setInkl13]         = useState(false);
  const [loading,        setLoading]        = useState(false);

  const { data: mitarbeiterListe = [] } = useQuery<any[]>({
    queryKey: ["/api/mitarbeiter"],
  });

  // Zeiteinträge für den gewählten Monat laden
  const { data: eintraege = [], isLoading: eintraegeLoading } = useQuery<any[]>({
    queryKey: ["/api/zeiteintraege", mitarbeiter, monat, jahr],
    queryFn: async () => {
      if (!mitarbeiter) return [];
      const r = await apiRequest("GET", "/api/zeiteintraege");
      const all: any[] = await r.json();
      const monPad = monat.padStart(2, "0");
      return all.filter((e: any) => {
        if (e.mitarbeiter !== mitarbeiter) return false;
        if (!e.datum) return false;
        const [y, m] = e.datum.split("-");
        return y === jahr && m === monPad;
      });
    },
    enabled: !!mitarbeiter,
  });

  const totalMin   = eintraege.reduce((s: number, e: any) => s + (e.dauer_minuten || 0), 0);
  const totalStd   = totalMin / 60;
  const ansatz     = Number(stundenansatz) || 0;
  const bruttoLohn = totalStd * ansatz;

  // 13. Monatslohn
  const dreizehnter = inkl13 ? bruttoLohn / 12 : 0;
  const bruttoTotal = bruttoLohn + dreizehnter;

  // Abzüge
  const abzuegeDetails = ABZUEGE.map(a => ({
    ...a,
    betrag: bruttoTotal * a.rate,
  }));
  const abzuegeTotal = bruttoTotal * TOTAL_AN_RATE;
  const nettolohn    = bruttoTotal - abzuegeTotal;

  const handlePdf = async () => {
    if (!mitarbeiter) {
      toast({ title: "Mitarbeiter wählen", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await apiRequest("POST", "/api/lohnabrechnung/pdf", {
          mitarbeiter_name: mitarbeiter,
          monat,
          jahr,
          stundenansatz: ansatz,
          inkl_dreizehnter: inkl13,
          dreizehnter_ml: dreizehnter,
          abzuege_total: abzuegeTotal,
          nettolohn,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const mName = MONATE.find(m => m.value === monat)?.label || monat;
      window.open(url, "_blank");
      toast({ title: "PDF erstellt", description: `Lohnabrechnung ${mName} ${jahr} für ${mitarbeiter} — im Browser-Tab geöffnet` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const monatName = MONATE.find(m => m.value === monat)?.label || monat;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Lohnabrechnung
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monatsabrechnung pro Mitarbeiter als PDF
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Einstellungen */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-4 space-y-4">
            <p className="text-sm font-semibold">Abrechnung erstellen</p>

            <div>
              <Label className="text-xs">Mitarbeiter</Label>
              <Select value={mitarbeiter} onValueChange={setMitarbeiter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Mitarbeiter wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {mitarbeiterListe.map((m: any) => (
                    <SelectItem key={m.id} value={`${m.vorname} ${m.nachname}`}>
                      {m.vorname} {m.nachname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Monat</Label>
                <Select value={monat} onValueChange={setMonat}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONATE.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Jahr</Label>
                <Select value={jahr} onValueChange={setJahr}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Stundenansatz CHF (optional)</Label>
              <Input
                type="number"
                value={stundenansatz}
                min={0}
                step="0.50"
                className="w-full sm:max-w-sm"
                onChange={e => setStundenansatz(e.target.value)}
                placeholder="z.B. 45.00"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Wird für Bruttolohn-Berechnung verwendet.
              </p>
            </div>

            {/* 13. Monatslohn Toggle */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="inkl13"
                checked={inkl13}
                onCheckedChange={v => setInkl13(!!v)}
              />
              <Label htmlFor="inkl13" className="text-sm cursor-pointer select-none">
                13. Monatslohn einschliessen
              </Label>
            </div>

            <Button
              className="w-full bg-[#6b4c2a] hover:bg-[#5a3e22] text-white"
              onClick={handlePdf}
              disabled={loading || !mitarbeiter}
            >
              <Download className="w-4 h-4 mr-2" />
              {loading ? "PDF wird erstellt..." : "Lohnabrechnung PDF"}
            </Button>
          </Card>

          {/* Lohn-Aufstellung */}
          {mitarbeiter && ansatz > 0 && (
            <Card className="p-4 space-y-2">
              <p className="text-sm font-semibold mb-3">Lohn-Aufstellung</p>

              {/* Bruttolohn */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bruttolohn</span>
                <span className="tabular-nums font-medium">CHF {fmt(bruttoLohn)}</span>
              </div>

              {/* 13. Monatslohn */}
              {inkl13 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">+ 13. ML (1/12)</span>
                  <span className="tabular-nums text-green-700 dark:text-green-400">
                    CHF {fmt(dreizehnter)}
                  </span>
                </div>
              )}

              {/* Brutto Total */}
              {inkl13 && (
                <div className="flex justify-between text-sm border-t pt-1 mt-1">
                  <span className="font-medium">= Brutto Total</span>
                  <span className="tabular-nums font-medium">CHF {fmt(bruttoTotal)}</span>
                </div>
              )}

              {/* Abzüge */}
              <div className="border-t pt-2 mt-1 space-y-1">
                {abzuegeDetails.map(a => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      - {a.label} ({(a.rate * 100).toFixed(1)}%)
                    </span>
                    <span className="tabular-nums text-red-600 dark:text-red-400">
                      CHF -{fmt(a.betrag)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Nettolohn */}
              <div className="flex justify-between items-baseline border-t-2 pt-2 mt-1">
                <span className="font-bold text-base">= Nettolohn</span>
                <span
                  className="tabular-nums font-bold text-lg"
                  style={{ color: "#e07b2a" }}
                >
                  CHF {fmt(nettolohn)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                AN-Abzüge total: CHF {fmt(abzuegeTotal)} ({(TOTAL_AN_RATE * 100).toFixed(1)}%)
              </p>
            </Card>
          )}
        </div>

        {/* Vorschau */}
        <div className="lg:col-span-2 space-y-4">
          {/* Zusammenfassung */}
          {mitarbeiter && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card className="p-4 text-center">
                <div className="flex items-center justify-center mb-1">
                  <Clock className="w-4 h-4 text-[#6b4c2a] mr-1" />
                </div>
                <p className="text-2xl font-bold">{Math.floor(totalStd)}<span className="text-sm font-normal">h</span> {totalMin % 60}<span className="text-sm font-normal">min</span></p>
                <p className="text-xs text-muted-foreground mt-1">Gesamtstunden</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">{eintraege.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Einträge</p>
              </Card>
              {ansatz > 0 && (
                <Card className="p-4 text-center col-span-2 sm:col-span-1">
                  <p className="text-2xl font-bold" style={{ color: "#e07b2a" }}>
                    CHF {fmt(nettolohn)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Nettolohn</p>
                </Card>
              )}
            </div>
          )}

          {/* Eintrags-Tabelle */}
          <Card className="bg-card overflow-hidden">
            <div className="p-4 border-b">
              <p className="text-sm font-semibold">
                {mitarbeiter
                  ? `Zeiteinträge: ${mitarbeiter} · ${monatName} ${jahr}`
                  : "Mitarbeiter wählen für Vorschau"}
              </p>
            </div>

            {!mitarbeiter ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Bitte zuerst einen Mitarbeiter auswählen.
              </div>
            ) : eintraegeLoading ? (
              <div className="p-6 space-y-2">
                <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
              </div>
            ) : eintraege.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Keine Zeiteinträge für {monatName} {jahr}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Datum</th>
                      <th className="text-left px-4 py-2 font-medium">Auftrag</th>
                      <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Tätigkeit</th>
                      <th className="text-center px-4 py-2 font-medium">Zeit</th>
                      <th className="text-right px-4 py-2 font-medium">Stunden</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {eintraege.map((e: any, i: number) => {
                      const datFmt = e.datum
                        ? new Date(e.datum + "T00:00:00").toLocaleDateString("de-CH", {
                            day: "2-digit", month: "2-digit",
                          })
                        : "—";
                      const stdH = ((e.dauer_minuten || 0) / 60).toFixed(2);
                      return (
                        <tr key={e.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                          <td className="px-4 py-2 tabular-nums text-xs">{datFmt}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {e.auftrag_id ? e.auftrag_id.slice(0, 8) + "…" : "Frei"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell truncate max-w-[150px]">
                            {e.beschreibung || "—"}
                          </td>
                          <td className="px-4 py-2 text-center text-xs tabular-nums">
                            {(e.start_zeit || "").slice(0,5)} – {(e.end_zeit || "").slice(0,5)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-xs text-[#6b4c2a]">
                            {stdH}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/50 border-t-2">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-xs font-bold text-right hidden sm:table-cell">Total:</td>
                      <td colSpan={1} className="px-4 py-2 text-xs font-bold text-right sm:hidden">Total:</td>
                      <td className="px-4 py-2 text-center text-xs font-bold">{totalMin} Min.</td>
                      <td className="px-4 py-2 text-right text-xs font-bold text-[#6b4c2a] tabular-nums">
                        {totalStd.toFixed(2)} Std.
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
