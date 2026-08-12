import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { DashboardWidget } from "./DashboardWidget";

type NachkalkulationStatus = "nicht_begonnen" | "in_bearbeitung" | "abgeschlossen";

interface OffeneNachkalkulationAuftrag {
  id: string;
  nr: string;
  kunde: string | null;
  abschlussdatum: string | null;
  tage_seit_abschluss: number | null;
  nachkalkulation_status: NachkalkulationStatus;
}

interface OffeneNachkalkulationResponse {
  count: number;
  total: number;
  auftraege: OffeneNachkalkulationAuftrag[];
}

interface OffeneNachkalkulationWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

const STATUS_LABEL: Record<NachkalkulationStatus, string> = {
  nicht_begonnen: "Nicht begonnen",
  in_bearbeitung: "In Bearbeitung",
  abgeschlossen: "Abgeschlossen",
};

function statusClass(status: NachkalkulationStatus): string {
  return status === "in_bearbeitung"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : status === "abgeschlossen"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-slate-200 bg-slate-50 text-slate-700";
}

export function OffeneNachkalkulationWidget({ visible, style }: OffeneNachkalkulationWidgetProps) {
  const { data, isLoading, isError } = useQuery<OffeneNachkalkulationResponse>({
    queryKey: ["/api/dashboard/offene-nachkalkulation"],
    queryFn: () => apiRequest("GET", "/api/dashboard/offene-nachkalkulation").then((response) => response.json()),
    staleTime: 60_000,
    enabled: visible,
  });

  const count = data?.count || 0;

  return (
    <DashboardWidget
      id="offene_nachkalkulation"
      visible={visible}
      className="lg:col-span-12 mb-6"
      style={style}
    >
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <ClipboardList className="h-4 w-4" />
              </div>
              <h2 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Offene Nachkalkulation
              </h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Abgeschlossene Aufträge ohne explizit abgeschlossene Nachkalkulation
            </p>
          </div>
          {isError && (
            <span className="inline-flex shrink-0 text-orange-600" aria-label="Offene Nachkalkulation konnte nicht geladen werden.">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="mt-5 space-y-2">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Offene Nachkalkulation konnte nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : count === 0 ? (
          <div className="py-7 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-green-600" />
            <p className="text-sm font-medium">Alle abgeschlossenen Aufträge sind nachkalkuliert</p>
          </div>
        ) : (
          <>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-amber-700" style={{ fontFamily: "var(--font-display)" }}>
                {count}
              </span>
              <span className="text-sm font-medium">
                Auftrag{count === 1 ? "" : "träge"} ohne vollständige Nachkalkulation
              </span>
            </div>
            <div className="mt-4 divide-y border-t">
              {data?.auftraege.map((auftrag) => (
                <Link key={auftrag.id} href={`/nachkalkulation/${auftrag.id}`}>
                  <a className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{auftrag.nr}</div>
                      <div className="truncate text-xs text-muted-foreground">{auftrag.kunde || "Kein Kunde hinterlegt"}</div>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      {auftrag.tage_seit_abschluss === null
                        ? "Abschlussdatum unbekannt"
                        : `abgeschlossen seit ${auftrag.tage_seit_abschluss} Tagen`}
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 text-[10px]", statusClass(auftrag.nachkalkulation_status))}>
                      {STATUS_LABEL[auftrag.nachkalkulation_status]}
                    </Badge>
                  </a>
                </Link>
              ))}
            </div>
            {count > (data?.auftraege.length || 0) && (
              <p className="mt-3 text-xs text-muted-foreground">
                Die zehn am längsten offenen Aufträge werden angezeigt.
              </p>
            )}
          </>
        )}
      </Card>
    </DashboardWidget>
  );
}
