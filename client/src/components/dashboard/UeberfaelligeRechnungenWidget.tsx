import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, FileWarning, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCHF } from "@/lib/format";
import { DashboardWidget } from "./DashboardWidget";

interface UeberfaelligeRechnung {
  id: string;
  rechnungsnummer: string | null;
  auftrag_id: string | null;
  faellig_am: string;
  kunde: string | null;
  betrag_brutto: number;
  tage_ueberfaellig: number;
}

interface UeberfaelligeRechnungenResponse {
  count: number;
  total_offen_brutto: number;
  items: UeberfaelligeRechnung[];
}

interface UeberfaelligeRechnungenWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

/**
 * Shows the tenant's overdue receivables from the centrally defined,
 * server-side calculation. There is no standalone invoice-detail route yet;
 * linked invoices therefore open their existing order detail.
 */
export function UeberfaelligeRechnungenWidget({ visible, style }: UeberfaelligeRechnungenWidgetProps) {
  const {
    data,
    isLoading,
    isError,
  } = useQuery<UeberfaelligeRechnungenResponse>({
    queryKey: ["/api/dashboard/ueberfaellige-rechnungen"],
    queryFn: () => apiRequest("GET", "/api/dashboard/ueberfaellige-rechnungen").then((response) => response.json()),
    staleTime: 60_000,
    enabled: visible,
  });

  const count = data?.count ?? 0;
  const totalOffenBrutto = data?.total_offen_brutto ?? 0;
  const items = data?.items ?? [];

  return (
    <DashboardWidget
      id="ueberfaellige_rechnungen"
      visible={visible}
      className="lg:col-span-12 mb-6"
      style={style}
    >
      <Card className="border-amber-200 bg-card p-5 dark:border-amber-900/70">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                <FileWarning className="h-4 w-4" />
              </div>
              <h2 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Überfällige Rechnungen
              </h2>
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-9 w-64" />
            ) : (
              <p className="mt-3 text-xl font-bold tabular-nums sm:text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                {count} überfällige Rechnung{count === 1 ? "" : "en"} — offen {formatCHF(totalOffenBrutto)}
              </p>
            )}
          </div>
          {isError && (
            <span className="inline-flex shrink-0 text-orange-600" aria-label="Überfällige Rechnungen konnten nicht geladen werden.">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : isError ? (
          <div className="py-5 text-center text-sm text-muted-foreground">
            Überfällige Rechnungen konnten nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : count === 0 ? (
          <div className="py-6 text-center">
            <ReceiptText className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">Keine überfälligen Rechnungen</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.slice(0, 5).map((rechnung) => (
              <Link key={rechnung.id} href={rechnung.auftrag_id ? `/auftraege/${rechnung.auftrag_id}` : "/rechnungen"}>
                <a
                  data-testid={`dashboard-ueberfaellige-rechnung-${rechnung.id}`}
                  className="flex items-center justify-between gap-3 rounded px-2 py-3 -mx-2 transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/20"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {rechnung.rechnungsnummer || "Rechnung ohne Nummer"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {rechnung.kunde || "Kein Kunde hinterlegt"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">{formatCHF(rechnung.betrag_brutto)}</div>
                    <div className="mt-0.5 text-xs font-medium text-destructive">
                      seit {rechnung.tage_ueberfaellig} Tag{rechnung.tage_ueberfaellig === 1 ? "" : "en"} überfällig
                    </div>
                  </div>
                </a>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && !isError && count > 0 && (
          <div className="mt-4 border-t pt-3">
            <Link href="/rechnungen">
              <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Alle anzeigen <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </Link>
          </div>
        )}
      </Card>
    </DashboardWidget>
  );
}
