import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleAlert, Info, TrendingDown } from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { formatCHF } from "@/lib/format";
import { DashboardWidget } from "./DashboardWidget";

interface VerlustrisikoAuftrag {
  id: string;
  nr: string;
  kunde: string | null;
  vorkalkulation_selbstkosten: number;
  vorkalkulation_netto: number;
  ist_kosten: number;
  ueberschreitung_chf: number;
  ueberschreitung_prozent: number;
  db1: number;
  db1_quote: number;
}

interface VerlustrisikoResponse {
  aktive_warnungen: VerlustrisikoAuftrag[];
  abgeschlossene_verluste: VerlustrisikoAuftrag[];
}

interface VerlustrisikoWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

function quote(quoteValue: number): string {
  return `${quoteValue.toLocaleString("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function RisikoZeile({ auftrag, neutral = false }: { auftrag: VerlustrisikoAuftrag; neutral?: boolean }) {
  return (
    <Link href={`/nachkalkulation/${auftrag.id}`}>
      <a className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-black/[0.03]">
        <TrendingDown className={`h-4 w-4 shrink-0 ${neutral ? "text-slate-500" : "text-red-700"}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{auftrag.nr}</div>
          <div className="truncate text-xs text-muted-foreground">{auftrag.kunde || "Kein Kunde hinterlegt"}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-semibold tabular-nums ${neutral ? "text-slate-700" : "text-red-700"}`}>
            +{formatCHF(auftrag.ueberschreitung_chf)} · +{quote(auftrag.ueberschreitung_prozent)}
          </div>
          <div className="text-xs text-muted-foreground">
            DB1 {quote(auftrag.db1_quote)}
          </div>
        </div>
      </a>
    </Link>
  );
}

/**
 * Shows the deliberately hard loss-risk rule only: captured actual costs must
 * already exceed the detailed quotation self-costs and the DB1 quote must be
 * under 10%. It never guesses at incomplete future cost capture.
 */
export function VerlustrisikoWidget({ visible, style }: VerlustrisikoWidgetProps) {
  const { data, isLoading, isError } = useQuery<VerlustrisikoResponse>({
    queryKey: ["/api/dashboard/verlustrisiko"],
    queryFn: () => apiRequest("GET", "/api/dashboard/verlustrisiko").then((response) => response.json()),
    staleTime: 60_000,
    enabled: visible,
  });

  const aktiveWarnungen = data?.aktive_warnungen || [];
  const abgeschlosseneVerluste = data?.abgeschlossene_verluste || [];
  const leer = aktiveWarnungen.length === 0 && abgeschlosseneVerluste.length === 0;

  return (
    <DashboardWidget
      id="verlustrisiko"
      visible={visible}
      className="lg:col-span-12 mb-6"
      style={style}
    >
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-700">
                <CircleAlert className="h-4 w-4" />
              </div>
              <h2 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Verlustrisiko
              </h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Hinweis zur Kostenbasis"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  Basiert auf bereits erfassten Kosten — nicht erfasste Zeiten oder Material werden nicht berücksichtigt.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Basiert auf bereits erfassten Kosten — nicht erfasste Zeiten oder Material werden nicht berücksichtigt.
            </p>
          </div>
          {isError && (
            <span className="inline-flex shrink-0 text-orange-600" aria-label="Verlustrisiko konnte nicht geladen werden.">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Verlustrisiko konnte nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : leer ? (
          <div className="py-7 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-green-600" />
            <p className="text-sm font-medium">Aktuell kein erkanntes Verlustrisiko</p>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {aktiveWarnungen.length > 0 && (
              <section className="overflow-hidden rounded-md border border-red-200 bg-red-50/60">
                <div className="border-b border-red-200 bg-red-100/70 px-3 py-2 text-sm font-semibold text-red-900">
                  {aktiveWarnungen.length} {aktiveWarnungen.length === 1 ? "Auftrag" : "Aufträge"} in Ausführung mit Verlustrisiko
                </div>
                <div className="divide-y divide-red-100">
                  {aktiveWarnungen.map((auftrag) => <RisikoZeile key={auftrag.id} auftrag={auftrag} />)}
                </div>
              </section>
            )}

            {abgeschlosseneVerluste.length > 0 && (
              <section className="overflow-hidden rounded-md border bg-slate-50/70">
                <div className="border-b bg-slate-100/80 px-3 py-2 text-sm font-semibold text-slate-700">
                  {abgeschlosseneVerluste.length} abgeschlossene {abgeschlosseneVerluste.length === 1 ? "Auftrag war ein Verlustgeschäft" : "Aufträge waren Verlustgeschäfte"}
                </div>
                <div className="divide-y">
                  {abgeschlosseneVerluste.map((auftrag) => <RisikoZeile key={auftrag.id} auftrag={auftrag} neutral />)}
                </div>
              </section>
            )}
          </div>
        )}
      </Card>
    </DashboardWidget>
  );
}
