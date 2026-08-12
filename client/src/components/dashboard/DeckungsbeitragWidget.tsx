import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Calculator, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCHF } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DashboardWidget } from "./DashboardWidget";

interface DeckungsbeitragAuftrag {
  id: string;
  nr: string;
  titel: string;
  umsatz_netto: number;
  ist_kosten: number;
  db1: number;
  db1_quote: number | null;
  richtung: "staerkster" | "schwaechster";
}

interface DeckungsbeitragResponse {
  year: number;
  anzahl_auftraege: number;
  anzahl_fakturierte_auftraege: number;
  ausgeschlossen_ohne_kosten: number;
  umsatz_netto: number;
  ist_kosten: number;
  db1: number;
  db1_quote: number | null;
  beitraege: DeckungsbeitragAuftrag[];
}

interface DeckungsbeitragWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

function quoteTone(quote: number | null): string {
  if (quote === null) return "text-muted-foreground";
  if (quote >= 25) return "text-green-600";
  if (quote >= 10) return "text-amber-600";
  return "text-red-600";
}

/**
 * DB1 uses Zurich-year invoice revenue and only orders carrying at least one
 * recorded actual-cost position. This prevents missing cost capture from
 * presenting an artificial 100% contribution margin.
 */
export function DeckungsbeitragWidget({ visible, style }: DeckungsbeitragWidgetProps) {
  const { data, isLoading, isError } = useQuery<DeckungsbeitragResponse>({
    queryKey: ["/api/dashboard/deckungsbeitrag"],
    queryFn: () => apiRequest("GET", "/api/dashboard/deckungsbeitrag").then((response) => response.json()),
    staleTime: 60_000,
    enabled: visible,
  });

  const currentZurichYear = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
  }).format(new Date()));
  const year = data?.year ?? currentZurichYear;
  const hasData = (data?.anzahl_auftraege || 0) > 0;

  return (
    <DashboardWidget
      id="deckungsbeitrag"
      visible={visible}
      className="lg:col-span-12"
      style={style}
    >
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Calculator className="h-4 w-4" />
              </div>
              <h2 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Deckungsbeitrag (DB1) {year}
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Umsatz netto minus erfasste direkte IST-Kosten · fakturiert seit Jahresbeginn
            </p>
          </div>
          {isError && (
            <span className="inline-flex shrink-0 text-orange-600" aria-label="Deckungsbeitrag konnte nicht geladen werden.">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Deckungsbeitrag konnte nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : !hasData ? (
          <div className="py-7 text-center">
            <ReceiptText className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">
              Noch keine fakturierten Aufträge mit vollständiger Kostenerfassung in diesem Jahr
            </p>
            {(data?.ausgeschlossen_ohne_kosten || 0) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {data?.ausgeschlossen_ohne_kosten === 1 ? "Ein fakturierter Auftrag ist" : `${data?.ausgeschlossen_ohne_kosten} fakturierte Aufträge sind`} ohne erfasste IST-Kosten nicht enthalten.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">DB1</div>
                <div className="mt-1 text-2xl font-bold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                  {data!.db1 < 0 ? "−" : ""}{formatCHF(Math.abs(data!.db1))}
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">DB1-Quote</div>
                <div className={cn("mt-1 text-2xl font-bold tabular-nums", quoteTone(data!.db1_quote))} style={{ fontFamily: "var(--font-display)" }}>
                  {data!.db1_quote === null ? "—" : `${data!.db1_quote.toLocaleString("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Grün ab 25 %, gelb ab 10 %</div>
              </div>
              <dl className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Umsatz netto</dt>
                  <dd className="font-medium tabular-nums">{formatCHF(data!.umsatz_netto)}</dd>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <dt className="text-muted-foreground">IST-Kosten erfasst</dt>
                  <dd className="font-medium tabular-nums">{formatCHF(data!.ist_kosten)}</dd>
                </div>
              </dl>
            </div>

            {data!.beitraege.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Stärkste / schwächste Beiträge
                </p>
                <div className="divide-y">
                  {data!.beitraege.map((auftrag) => {
                    const staerkster = auftrag.richtung === "staerkster";
                    return (
                      <div key={auftrag.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                        {staerkster
                          ? <ArrowUpRight className="h-4 w-4 shrink-0 text-green-600" />
                          : <ArrowDownRight className="h-4 w-4 shrink-0 text-red-600" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{auftrag.nr} · {auftrag.titel}</div>
                          <div className="text-xs text-muted-foreground">
                            Umsatz {formatCHF(auftrag.umsatz_netto)} · Kosten {formatCHF(auftrag.ist_kosten)}
                          </div>
                        </div>
                        <div className={cn("shrink-0 text-right text-sm font-semibold tabular-nums", auftrag.db1 >= 0 ? "text-green-600" : "text-red-600")}>
                          {auftrag.db1 < 0 ? "−" : "+"}{formatCHF(Math.abs(auftrag.db1))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {data!.ausgeschlossen_ohne_kosten > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                {data!.ausgeschlossen_ohne_kosten === 1 ? "Ein fakturierter Auftrag ist" : `${data!.ausgeschlossen_ohne_kosten} fakturierte Aufträge sind`} ohne erfasste IST-Kosten bewusst nicht in DB1 enthalten.
              </p>
            )}
          </>
        )}
      </Card>
    </DashboardWidget>
  );
}
