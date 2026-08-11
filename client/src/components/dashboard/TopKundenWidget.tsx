import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ReceiptText, Trophy, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCHF } from "@/lib/format";
import { DashboardWidget } from "./DashboardWidget";

interface TopKunde {
  kunde: string;
  umsatz_netto: number;
  anzahl_rechnungen: number;
}

interface TopKundenResponse {
  year: number;
  kunden: TopKunde[];
}

interface TopKundenWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

/**
 * Shows the highest customer revenue of the current Zurich calendar year.
 * The existing invoice list cannot filter by customer through the URL yet,
 * so the entries intentionally remain display-only rather than misleading links.
 */
export function TopKundenWidget({ visible, style }: TopKundenWidgetProps) {
  const {
    data,
    isLoading,
    isError,
  } = useQuery<TopKundenResponse>({
    queryKey: ["/api/dashboard/top-kunden"],
    queryFn: () => apiRequest("GET", "/api/dashboard/top-kunden").then((response) => response.json()),
    staleTime: 60_000,
    enabled: visible,
  });

  const currentZurichYear = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
  }).format(new Date()));
  const year = data?.year ?? currentZurichYear;
  const kunden = data?.kunden ?? [];
  const topUmsatz = kunden[0]?.umsatz_netto ?? 0;

  return (
    <DashboardWidget
      id="top_kunden"
      visible={visible}
      className="lg:col-span-12 mb-6"
      style={style}
    >
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UsersRound className="h-4 w-4" />
              </div>
              <h2 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Top-Kunden {year}
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Umsatz netto, fakturiert seit Jahresbeginn
            </p>
          </div>
          {isError && (
            <span className="inline-flex shrink-0 text-orange-600" aria-label="Top-Kunden konnten nicht geladen werden.">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : isError ? (
          <div className="py-5 text-center text-sm text-muted-foreground">
            Top-Kunden konnten nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : kunden.length === 0 ? (
          <div className="py-6 text-center">
            <ReceiptText className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">Noch keine fakturierten Rechnungen in diesem Jahr</p>
          </div>
        ) : (
          <ol className="divide-y">
            {kunden.map((kunde, index) => {
              const anteil = topUmsatz > 0 ? Math.max(0, Math.min(100, (kunde.umsatz_netto / topUmsatz) * 100)) : 0;
              return (
                <li key={kunde.kunde} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center gap-0.5 rounded-full bg-muted text-xs font-semibold tabular-nums">
                    <span>{index + 1}.</span>
                    {index === 0 && <Trophy className="h-3 w-3 text-amber-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={kunde.kunde}>{kunde.kunde}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {kunde.anzahl_rechnungen} Rechnung{kunde.anzahl_rechnungen === 1 ? "" : "en"}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${anteil}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatCHF(kunde.umsatz_netto)}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </DashboardWidget>
  );
}
