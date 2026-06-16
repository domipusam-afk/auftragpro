import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Briefcase,
  Clock,
  Hammer,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Banknote,
  CheckSquare,
  Bell,
  XCircle,
  FileText,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MailWarning,
} from "lucide-react";
import type { Auftrag, Stats, Rechnung } from "@shared/schema";
import { STATUS_LABEL } from "@shared/schema";
import { STATUS_BADGE, PRIO_BADGE, formatCHF, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  auftraege,
}: {
  label: string;
  value: number | string;
  icon: any;
  tone: "primary" | "amber" | "orange" | "green";
  auftraege?: Auftrag[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Klick außerhalb schliesst Dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
    green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200",
  };

  const hasAuftraege = auftraege && auftraege.length > 0;

  return (
    <div ref={ref} className="relative">
      <Card
        className={cn(
          "p-3 md:p-5 bg-card select-none",
          hasAuftraege && "cursor-pointer hover:shadow-md hover:border-foreground/20 transition-all"
        )}
        onClick={() => hasAuftraege && setOpen((o) => !o)}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs md:text-sm text-muted-foreground truncate">{label}</div>
            <div
              className="text-xl md:text-3xl font-bold mt-1"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid={`kpi-${label.toLowerCase()}`}
            >
              {value}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className={cn("h-10 w-10 rounded-md flex items-center justify-center", tones[tone])}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </div>
        {hasAuftraege && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-0.5">
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            {open ? "Schliessen" : "Aufträge anzeigen"}
          </div>
        )}
      </Card>

      {/* Dropdown */}
      {open && hasAuftraege && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
          style={{ minWidth: "260px" }}
        >
          <div className="px-3 py-2 bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {label} — {auftraege.length} Aufträge
          </div>
          <div className="max-h-72 overflow-y-auto divide-y">
            {auftraege.map((a) => (
              <Link key={a.id} href={`/auftraege/${a.id}`}>
                <a
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/60 transition-colors cursor-pointer"
                  onClick={() => setOpen(false)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{a.nr}</span>
                      <span className="text-sm font-medium truncate">{a.titel}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{a.kunde}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {a.angebots_betrag != null && (
                      <span className="text-xs font-semibold tabular-nums" style={{ color: "#6b4c2a" }}>
                        {formatCHF(a.angebots_betrag, a.waehrung)}
                      </span>
                    )}
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", STATUS_BADGE[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </div>
                </a>
              </Link>
            ))}
          </div>
          <div className="px-3 py-2 border-t bg-muted/30">
            <Link href={`/auftraege`}>
              <a className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setOpen(false)}>
                Alle Aufträge öffnen <ArrowRight className="h-3 w-3" />
              </a>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { hatZugriff } = useAuth();
  const darf_finanzen = hatZugriff("dashboard_finanzen");

  const { data: stats, isLoading: lStats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });
  const { data: auftraege, isLoading: lA } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
  });

  const { data: rechnungen = [] } = useQuery<Rechnung[]>({
    queryKey: ["/api/rechnungen"],
  });

  // Mahnungen
  const { data: mahnungen = [] } = useQuery<any[]>({
    queryKey: ["/api/mahnungen"],
    queryFn: () => apiRequest("GET", "/api/mahnungen").then((r) => r.json()),
  });

  // Finanzen Übersicht
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Jahresvergleich: welches Jahr anzeigen
  const [vergleichsJahr, setVergleichsJahr] = useState(now.getFullYear());
  // Monatsumsatz: nur Rechnungen die diesen Monat BEZAHLT wurden (vereinnahmte Entgelte)
  const monatsumsatz = (rechnungen as any[])
    .filter((r: any) => r.bezahlt_am && r.bezahlt_am.startsWith(thisMonth))
    .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
  // Offene Posten: unbezahlte, nicht stornierte Rechnungen
  const offenePosten = (rechnungen as any[])
    .filter((r: any) => !r.bezahlt_am && !r.storniert_am)
    .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
  // Anzahl offene Rechnungen für KPI-Tooltip
  const offeneRechnungenAnzahl = (rechnungen as any[]).filter((r: any) => !r.bezahlt_am && !r.storniert_am).length;
  const bezahlt = (rechnungen as any[])
    .filter((r: any) => !!r.bezahlt_am)
    .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
  const bezahltAnzahl = (rechnungen as any[]).filter((r: any) => !!r.bezahlt_am).length;

  const { data: offerten = [] } = useQuery<any[]>({
    queryKey: ["/api/offerten"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/offerten");
      return r.json();
    },
  });

  // Reingewinn aus VK/NK
  const { data: reingewinnData, isLoading: reingewinnLoading } = useQuery<{ reingewinn: number; detail: any[] }>({
    queryKey: ["/api/dashboard/reingewinn"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/dashboard/reingewinn");
      return r.json();
    },
    staleTime: 60_000, // 1 Min. cachen
  });
  const reingewinn = reingewinnData?.reingewinn ?? 0;

  // Fälligkeits-Warnungen
  const today = new Date(); today.setHours(0,0,0,0);
  const in7Days = new Date(today); in7Days.setDate(today.getDate() + 7);

  const ueberfaelligeRechnungen = (rechnungen as any[]).filter((r: any) =>
    !r.bezahlt_am && r.faellig_datum && new Date(r.faellig_datum) < today
  );
  const baldFaelligeRechnungen = (rechnungen as any[]).filter((r: any) =>
    !r.bezahlt_am && r.faellig_datum &&
    new Date(r.faellig_datum) >= today && new Date(r.faellig_datum) <= in7Days
  );
  const ablaufendeOfferten = (offerten as any[]).filter((o: any) => {
    if (o.status === "angenommen" || o.status === "abgelehnt") return false;
    const g = o.gueltigkeit;
    if (!g || isNaN(Date.parse(g))) return false; // "60 Tage" etc. überspringen
    const gDate = new Date(g); gDate.setHours(0,0,0,0);
    return gDate >= today && gDate <= in7Days;
  });

  // Wiederkehrende Aufträge die fällig sind
  const faelligeWiederkehrende = (auftraege || []).filter((a: any) => {
    if (!a.wiederkehrend_interval) return false;
    if (!a.naechste_faelligkeit) return false;
    return new Date(a.naechste_faelligkeit) <= today;
  });

  // Last 6 months for chart — nur bezahlte Rechnungen (vereinnahmte Entgelte)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("de-CH", { month: "short" });
    const total = (rechnungen as any[])
      .filter((r: any) => r.bezahlt_am && r.bezahlt_am.startsWith(key))
      .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
    return { key, label, total };
  });
  const maxMonth = Math.max(...last6Months.map((m) => m.total), 1);

  // Jahresvergleich: 12 Monate des gewählten Jahres vs. Vorjahr
  const jahresData = Array.from({ length: 12 }, (_, i) => {
    const monat = String(i + 1).padStart(2, "0");
    const keyAktuell = `${vergleichsJahr}-${monat}`;
    const keyVorjahr = `${vergleichsJahr - 1}-${monat}`;
    const label = new Date(vergleichsJahr, i, 1).toLocaleString("de-CH", { month: "short" });
    const aktuell = (rechnungen as any[])
      .filter((r: any) => r.bezahlt_am && r.bezahlt_am.startsWith(keyAktuell))
      .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
    const vorjahr = (rechnungen as any[])
      .filter((r: any) => r.bezahlt_am && r.bezahlt_am.startsWith(keyVorjahr))
      .reduce((s: number, r: any) => s + (Number(r.betrag) || 0), 0);
    return { label, aktuell, vorjahr };
  });
  const jahresTotal = jahresData.reduce((s, m) => s + m.aktuell, 0);
  const jahresVorjahr = jahresData.reduce((s, m) => s + m.vorjahr, 0);
  const maxJahr = Math.max(...jahresData.map((m) => Math.max(m.aktuell, m.vorjahr)), 1);

  // Mahnungen Kennzahlen
  const offeneMahnungen = (mahnungen as any[]).filter((m) => m.status !== "bezahlt" && m.status !== "abgeschrieben");
  const offeneMahnungenBetrag = offeneMahnungen.reduce((s: number, m: any) => {
    // Betrag aus verknüpfter Rechnung oder direkt
    return s + (Number(m.betrag) || Number(m.rechnungsbetrag) || 0);
  }, 0);

  const dringend = (auftraege || []).filter(
    (a) => a.prioritaet === "dringend" && a.status !== "abgeschlossen" && a.status !== "storniert"
  );
  const latest = (auftraege || []).slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold bg-background/80 backdrop-blur-sm rounded px-1 inline-block" style={{ fontFamily: "var(--font-display)" }}>
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1 bg-background/70 backdrop-blur-sm rounded px-1 inline-block">
            Übersicht aller laufenden Aufträge
          </p>
        </div>
        <Link href="/neu">
          <a>
            <Button data-testid="button-new-order" className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-md">
              <Plus className="h-4 w-4 mr-2" />
              Neuer Auftrag
            </Button>
          </a>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {lStats ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <KpiCard
              label="Gesamt"
              value={stats?.gesamt ?? 0}
              icon={Briefcase}
              tone="primary"
              auftraege={(auftraege || []).filter(a => a.status !== "storniert")}
            />
            <KpiCard
              label="Offen"
              value={stats?.offen ?? 0}
              icon={Clock}
              tone="amber"
              auftraege={(auftraege || []).filter(a => a.status === "anfrage" || a.status === "angebot" || a.status === "bestaetigt")}
            />
            <KpiCard
              label="In Bearbeitung"
              value={stats?.in_bearbeitung ?? 0}
              icon={Hammer}
              tone="orange"
              auftraege={(auftraege || []).filter(a => a.status === "in_arbeit")}
            />
            <KpiCard
              label="Abgeschlossen"
              value={stats?.abgeschlossen ?? 0}
              icon={CheckCircle2}
              tone="green"
              auftraege={(auftraege || []).filter(a => a.status === "abgeschlossen")}
            />
          </>
        )}
      </div>

      {/* Offerten Übersicht */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Offene Offerten"
          value={offerten.filter((o: any) => o.status !== 'angenommen' && o.status !== 'abgelehnt').length}
          icon={FileText}
          tone="amber"
        />
        <KpiCard
          label="Offerten-Wert"
          value={formatCHF(offerten.filter((o: any) => o.status !== 'angenommen' && o.status !== 'abgelehnt').reduce((s: number, o: any) => s + (Number(o.betrag_total) || 0), 0))}
          icon={TrendingUp}
          tone="primary"
        />
        <KpiCard
          label="Angenommen"
          value={offerten.filter((o: any) => o.status === 'angenommen').length}
          icon={CheckSquare}
          tone="green"
        />
        <KpiCard
          label="Abgelaufen"
          value={offerten.filter((o: any) => {
            if (o.status === 'angenommen' || o.status === 'abgelehnt') return false;
            const g = o.gueltigkeit; if (!g || isNaN(Date.parse(g))) return false;
            return new Date(g) < today;
          }).length}
          icon={XCircle}
          tone="amber"
        />
      </div>

      {/* Finanzen Übersicht — nur für Benutzer mit dashboard_finanzen Berechtigung */}
      {darf_finanzen && (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold bg-background/80 backdrop-blur-sm rounded px-1 inline-block" style={{ fontFamily: "var(--font-display)" }}>
            Finanzen Übersicht
          </h2>
          <a
            href="/api/export/fibu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-card border border-border text-foreground font-medium shadow-sm hover:bg-muted transition-colors"
            title="FIBU-Export als CSV (für Banana, Abacus, Excel)"
          >
            <Download className="h-3.5 w-3.5" />
            FIBU-Export CSV
          </a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <KpiCard
            label={`Monatsumsatz ${now.toLocaleString("de-CH", { month: "long" })}`}
            value={monatsumsatz > 0 ? formatCHF(monatsumsatz) : "CHF 0"}
            icon={TrendingUp}
            tone="green"
          />
          <KpiCard
            label={`Offene Posten (${offeneRechnungenAnzahl})`}
            value={formatCHF(offenePosten)}
            icon={AlertTriangle}
            tone="amber"
          />
          <KpiCard
            label={`Bezahlt (${bezahltAnzahl})`}
            value={formatCHF(bezahlt)}
            icon={CheckSquare}
            tone="green"
          />
          {/* Reingewinn aus VK/NK */}
          <div className="col-span-1">
            <Card className={cn(
              "p-3 md:p-5 bg-card h-full transition-all",
              reingewinn > 0 ? "border-green-300" : reingewinn < 0 ? "border-red-300" : ""
            )}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-xs md:text-sm text-muted-foreground truncate">Reingewinn VK/NK</div>
                  {reingewinnLoading ? (
                    <div className="h-8 w-24 bg-muted rounded animate-pulse mt-1" />
                  ) : (
                    <div
                      className="text-xl md:text-2xl font-bold mt-1 tabular-nums"
                      style={{
                        fontFamily: "var(--font-display)",
                        color: reingewinn > 0 ? "#16a34a" : reingewinn < 0 ? "#dc2626" : undefined,
                      }}
                    >
                      {reingewinn < 0 ? "−" : reingewinn > 0 ? "+" : ""}{formatCHF(Math.abs(reingewinn))}
                    </div>
                  )}
                  <div className="text-xs mt-0.5 font-medium"
                    style={{ color: reingewinn > 0 ? "#16a34a" : reingewinn < 0 ? "#dc2626" : "#6b7280" }}>
                    {reingewinnLoading ? "" : reingewinn > 0 ? "Gewinn" : reingewinn < 0 ? "Verlust" : "Keine VK/NK Daten"}
                  </div>
                </div>
                <div className={cn(
                  "h-10 w-10 rounded-md flex items-center justify-center shrink-0",
                  reingewinn > 0 ? "bg-green-100 text-green-600" : reingewinn < 0 ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground"
                )}>
                  {reingewinn >= 0
                    ? <TrendingUp className="h-5 w-5" />
                    : <TrendingDown className="h-5 w-5" />}
                </div>
              </div>
              {!reingewinnLoading && reingewinnData && reingewinnData.detail.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {reingewinnData.detail.length} Auftrag{reingewinnData.detail.length !== 1 ? "äge" : ""} mit VK/NK
                </div>
              )}
            </Card>
          </div>
          {/* Offene Mahnungen */}
          <Link href="/mahnwesen">
            <a className="block h-full">
              <Card className={cn(
                "p-3 md:p-5 bg-card h-full transition-all hover:shadow-md hover:border-foreground/20 cursor-pointer",
                offeneMahnungen.length > 0 && "border-orange-300"
              )}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs md:text-sm text-muted-foreground truncate">Offene Mahnungen</div>
                    <div className="text-xl md:text-3xl font-bold mt-1" style={{ fontFamily: "var(--font-display)", color: offeneMahnungen.length > 0 ? "#e8620a" : undefined }}>
                      {offeneMahnungen.length}
                    </div>
                    {offeneMahnungen.length > 0 && (
                      <div className="text-xs text-orange-600 font-medium mt-0.5">
                        ausstehend
                      </div>
                    )}
                  </div>
                  <div className={cn("h-10 w-10 rounded-md flex items-center justify-center", offeneMahnungen.length > 0 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground")}>
                    <MailWarning className="h-5 w-5" />
                  </div>
                </div>
              </Card>
            </a>
          </Link>
        </div>

        {/* Bar chart last 6 months */}
        <div className="bg-card rounded-lg border p-4 mb-4">
          <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Umsatz letzte 6 Monate</p>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 h-28 min-w-[280px]">
              {last6Months.map((m) => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1 min-w-[36px]">
                  <span className="text-[9px] text-muted-foreground font-medium">{m.total > 0 ? formatCHF(m.total).replace("CHF ","") : ""}</span>
                  <div
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: `${Math.max((m.total / (maxMonth || 1)) * 72, m.total > 0 ? 4 : 2)}px`,
                      background: m.key === thisMonth ? "#e8620a" : "#1a3a6b",
                      opacity: m.key === thisMonth ? 1 : 0.65,
                    }}
                    title={`${m.label}: ${formatCHF(m.total)}`}
                  />
                  <span className="text-[9px] text-muted-foreground text-center leading-tight">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Jahresvergleich */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Jahresvergleich (bezahlte Rechnungen)</p>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "#1a3a6b" }} />
                  {vergleichsJahr}: {formatCHF(jahresTotal)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 rounded-sm" style={{ background: "#6b4c2a", opacity: 0.45 }} />
                  {vergleichsJahr - 1}: {formatCHF(jahresVorjahr)}
                </span>
                {jahresVorjahr > 0 && (
                  <span className={cn("font-semibold", jahresTotal >= jahresVorjahr ? "text-green-600" : "text-red-500")}>
                    {jahresTotal >= jahresVorjahr ? "+" : ""}{((jahresTotal - jahresVorjahr) / jahresVorjahr * 100).toFixed(1)} %
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setVergleichsJahr((y) => y - 1)}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors border"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-semibold tabular-nums px-1">{vergleichsJahr}</span>
              <button
                onClick={() => setVergleichsJahr((y) => Math.min(y + 1, now.getFullYear()))}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted transition-colors border"
                disabled={vergleichsJahr >= now.getFullYear()}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1.5 h-32 min-w-[340px]">
              {jahresData.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-[20px]">
                  <div className="w-full flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max((m.aktuell / maxJahr) * 72, m.aktuell > 0 ? 4 : 2)}px`,
                        background: "#1a3a6b",
                      }}
                      title={`${m.label} ${vergleichsJahr}: ${formatCHF(m.aktuell)}`}
                    />
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max((m.vorjahr / maxJahr) * 40, m.vorjahr > 0 ? 3 : 1)}px`,
                        background: "#6b4c2a",
                        opacity: 0.45,
                      }}
                      title={`${m.label} ${vergleichsJahr - 1}: ${formatCHF(m.vorjahr)}`}
                    />
                  </div>
                  <span className="text-[8px] text-muted-foreground text-center leading-tight mt-0.5">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}



      {/* Fälligkeits-Warnungen */}
      {(ueberfaelligeRechnungen.length > 0 || baldFaelligeRechnungen.length > 0 || ablaufendeOfferten.length > 0 || faelligeWiederkehrende.length > 0) && (
        <div className="space-y-2 mb-2">
          {ueberfaelligeRechnungen.map((r: any) => (
            <Link key={r.id} href="/rechnungen">
              <a className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm hover:bg-red-100 transition-colors dark:bg-red-950/30 dark:border-red-800">
                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="flex-1 text-red-800 dark:text-red-300">
                  <span className="font-semibold">{r.nr}</span> — Rechnung überfällig seit {new Date(r.faellig_datum).toLocaleDateString("de-CH")}
                </span>
                <span className="font-bold tabular-nums text-red-700">CHF {Number(r.betrag).toLocaleString("de-CH")}</span>
              </a>
            </Link>
          ))}
          {baldFaelligeRechnungen.map((r: any) => (
            <Link key={r.id} href="/rechnungen">
              <a className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm hover:bg-amber-100 transition-colors dark:bg-amber-950/30 dark:border-amber-800">
                <Bell className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="flex-1 text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">{r.nr}</span> — fällig am {new Date(r.faellig_datum).toLocaleDateString("de-CH")}
                </span>
                <span className="font-bold tabular-nums text-amber-700">CHF {Number(r.betrag).toLocaleString("de-CH")}</span>
              </a>
            </Link>
          ))}
          {faelligeWiederkehrende.map((a: any) => (
            <Link key={a.id} href={`/auftraege/${a.id}`}>
              <a className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-sm hover:bg-blue-100 transition-colors dark:bg-blue-950/30 dark:border-blue-800">
                <RefreshCw className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="flex-1 text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">{a.nr} · {a.titel}</span> — Folge-Auftrag fällig seit {new Date(a.naechste_faelligkeit).toLocaleDateString("de-CH")}
                </span>
                <ArrowRight className="h-4 w-4 text-blue-500 shrink-0" />
              </a>
            </Link>
          ))}
          {ablaufendeOfferten.map((o: any) => (
            <Link key={o.id} href={`/auftraege/${o.auftrag_id}`}>
              <a className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-sm hover:bg-blue-100 transition-colors dark:bg-blue-950/30 dark:border-blue-800">
                <Bell className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="flex-1 text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">{o.nr}</span> {o.titel && `· ${o.titel}`} — Offerte läuft ab am {new Date(o.gueltigkeit).toLocaleDateString("de-CH")}
                </span>
                <ArrowRight className="h-4 w-4 text-blue-500 shrink-0" />
              </a>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="p-5 lg:col-span-2 bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold bg-background/80 backdrop-blur-sm rounded px-1 inline-block" style={{ fontFamily: "var(--font-display)" }}>
              Neueste Aufträge
            </h2>
            <Link href="/auftraege">
              <a className="text-sm text-primary hover:underline flex items-center gap-1">
                Alle ansehen <ArrowRight className="h-3 w-3" />
              </a>
            </Link>
          </div>
          {lA ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : latest.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Noch keine Aufträge. Erstelle deinen ersten Auftrag.
            </div>
          ) : (
            <div className="divide-y">
              {latest.map((a) => (
                <Link key={a.id} href={`/auftraege/${a.id}`}>
                  <a
                    data-testid={`row-auftrag-${a.id}`}
                    className="flex items-center justify-between py-3 hover:bg-muted/40 px-2 -mx-2 rounded cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{a.nr}</span>
                        <span className="font-medium truncate">{a.titel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {a.kunde} · {formatDate(a.erstellt)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("ml-2", STATUS_BADGE[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold bg-background/80 backdrop-blur-sm rounded px-1 inline-block" style={{ fontFamily: "var(--font-display)" }}>
              Dringend
            </h2>
          </div>
          {lA ? (
            <Skeleton className="h-12" />
          ) : dringend.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              Keine dringenden Aufträge.
            </div>
          ) : (
            <div className="space-y-3">
              {dringend.map((a) => (
                <Link key={a.id} href={`/auftraege/${a.id}`}>
                  <a
                    data-testid={`dringend-${a.id}`}
                    className="block p-2 -mx-2 rounded hover:bg-muted/40 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{a.nr}</span>
                      <Badge variant="outline" className={PRIO_BADGE[a.prioritaet]}>
                        {a.prioritaet}
                      </Badge>
                    </div>
                    <div className="text-sm font-medium mt-1 truncate">{a.titel}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.kunde}</div>
                    {a.angebots_betrag != null && (
                      <div className="text-xs mt-1 font-medium">
                        {formatCHF(a.angebots_betrag, a.waehrung)}
                      </div>
                    )}
                  </a>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
