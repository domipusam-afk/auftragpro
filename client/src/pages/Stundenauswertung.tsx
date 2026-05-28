import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  stundensatz: number;
  status: string;
}

interface Zeiteintrag {
  id: string;
  mitarbeiter: string;
  mitarbeiter_id?: string;
  datum: string;
  dauer_minuten: number;
  auftrag_id?: string;
  beschreibung?: string;
}

function getWorkdaysInMonth(year: number, month: number): number {
  const days = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// Soll-Stunden: Arbeitstage / 5 * Wochenstunden
function getSollStunden(workdays: number, wochenstunden: number): number {
  return Math.round((workdays / 5) * wochenstunden * 10) / 10;
}

export default function Stundenauswertung() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const monthName = new Date(year, month, 1).toLocaleString("de-CH", { month: "long", year: "numeric" });
  const workdays = getWorkdaysInMonth(year, month);
  // Wochenstunden aus Einstellungen (default 41h)
  const { data: einstellungenRaw = [] } = useQuery<{schluessel: string, wert: string}[]>({
    queryKey: ["/api/einstellungen"],
    queryFn: () => apiRequest("GET", "/api/einstellungen").then((r) => r.json()),
  });
  const wochenstunden = useMemo(() => {
    const e = einstellungenRaw.find((x) => x.schluessel === "wochenstunden");
    return e ? parseFloat(e.wert) || 41 : 41;
  }, [einstellungenRaw]);

  const { data: mitarbeiter = [], isLoading: lMA } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const mo = String(month + 1).padStart(2, "0");
  const { data: zeiteintraege = [], isLoading: lZ } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/zeiteintraege/monatsauswertung", year, month],
    queryFn: () =>
      apiRequest("GET", `/api/zeiteintraege/monatsauswertung?jahr=${year}&monat=${mo}`)
        .then((r) => r.json()),
  });

  const isLoading = lMA || lZ;

  // Calculate per-employee stats
  const stats = mitarbeiter
    .filter((m) => m.status === "aktiv")
    .map((ma) => {
      const name = `${ma.vorname} ${ma.nachname}`;
      // Match by name (existing zeiteintraege use name string)
      const myZeit = zeiteintraege.filter(
        (z) =>
          z.mitarbeiter === name ||
          z.mitarbeiter === ma.id ||
          z.mitarbeiter_id === ma.id
      );
      const istMinuten = myZeit.reduce((s, z) => s + (z.dauer_minuten || 0), 0);
      const istStunden = istMinuten / 60;
      const sollStunden = getSollStunden(workdays, wochenstunden);
      const diffStunden = istStunden - sollStunden;
      const pct = sollStunden > 0 ? Math.min((istStunden / sollStunden) * 100, 100) : 0;
      return { ma, name, istStunden, sollStunden, diffStunden, pct, eintraege: myZeit.length };
    });

  const totalIst = stats.reduce((s, r) => s + r.istStunden, 0);
  const totalSoll = stats.reduce((s, r) => s + r.sollStunden, 0);

  const handlePdfStunden = async (maName: string, maVorname: string, maNachname: string, stundensatz: number) => {
    const fullName = `${maVorname} ${maNachname}`;
    setPdfLoading(maName);
    try {
      const r = await apiRequest("POST", "/api/stundenabrechnung/pdf", {
        mitarbeiter_name: fullName,
        monat: String(month + 1).padStart(2, "0"),
        jahr: year,
        stundenansatz: stundensatz,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const mo = new Date(year, month, 1).toLocaleString("de-CH", { month: "long" });
      window.open(url, "_blank");
      toast({ title: "PDF erstellt", description: `Stundenabrechnung ${mo} ${year} für ${fullName} — im Browser-Tab geöffnet` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
            <BarChart2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Stundenauswertung
            </h1>
            <p className="text-sm text-muted-foreground">Soll-Ist Vergleich · {wochenstunden} h/Woche</p>
          </div>
        </div>

        {/* Monatsnavigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-36 text-center">{monthName}</span>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Arbeitstage</p>
          <p className="text-3xl font-bold mt-1">{workdays}</p>
          <p className="text-xs text-muted-foreground mt-1">Soll/Person: {getSollStunden(workdays, wochenstunden)} h</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Erfasste Stunden (Gesamt)</p>
          <p className="text-3xl font-bold mt-1">{totalIst.toFixed(1)} h</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Soll Gesamt</p>
          <p className="text-3xl font-bold mt-1">{totalSoll} h</p>
          <p className={cn("text-xs mt-1 font-medium", totalIst - totalSoll >= 0 ? "text-green-600" : "text-red-600")}>
            {totalIst - totalSoll >= 0 ? "+" : ""}{(totalIst - totalSoll).toFixed(1)} h
          </p>
        </Card>
      </div>

      {/* Per-employee table */}
      <Card className="p-5">
        <h2 className="font-semibold mb-4 text-sm uppercase tracking-wide text-muted-foreground">
          Auswertung nach Mitarbeiter — {monthName}
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : stats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Keine Mitarbeiter gefunden.</p>
        ) : (
          <div className="space-y-4">
            {stats.map(({ ma, name, istStunden, sollStunden, diffStunden, pct, eintraege }) => (
              <div key={ma.id} className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{(ma as any).position || "—"} · {eintraege} Einträge</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{istStunden.toFixed(1)} h</p>
                      <p className={cn("text-xs font-medium", diffStunden >= 0 ? "text-green-600" : "text-red-600")}>
                        {diffStunden >= 0 ? "+" : ""}{diffStunden.toFixed(1)} h
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePdfStunden(name, ma.vorname, ma.nachname, ma.stundensatz)}
                      disabled={pdfLoading === name}
                      className="h-8 px-2 text-xs gap-1"
                      title="Stundenabrechnung PDF"
                    >
                      <Download className="w-3 h-3" />
                      {pdfLoading === name ? "..." : "PDF"}
                    </Button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct >= 100 ? "bg-green-500" : pct >= 75 ? "bg-orange-400" : "bg-red-400"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Ist: {istStunden.toFixed(1)} h</span>
                  <span>Soll: {sollStunden} h ({pct.toFixed(0)}%)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
