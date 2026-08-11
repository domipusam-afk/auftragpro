import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CheckSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { DashboardWidget } from "./DashboardWidget";

interface DashboardAufgabe {
  id: string;
  titel: string;
  faellig_datum: string | null;
  auftrag: {
    id: string;
    nr: string | null;
    titel: string | null;
    kunde: string | null;
  } | null;
}

interface DashboardAufgabenResponse {
  total: number;
  aufgaben: DashboardAufgabe[];
}

interface AufgabenWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDueDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function AuftragHinweis({ auftrag }: { auftrag: DashboardAufgabe["auftrag"] }) {
  if (!auftrag) return null;
  const parts = [
    [auftrag.nr, auftrag.titel].filter(Boolean).join(" · "),
    auftrag.kunde,
  ].filter(Boolean);
  if (parts.length === 0) return null;

  return <div className="mt-0.5 truncate text-xs text-muted-foreground">{parts.join(" · ")}</div>;
}

/**
 * Compact team view of the current tenant's most urgent open tasks.
 * The detail page does not expose a task route yet, therefore rows lead to
 * the existing complete task list.
 */
export function AufgabenWidget({ visible, style }: AufgabenWidgetProps) {
  const {
    data,
    isLoading,
    isError,
  } = useQuery<DashboardAufgabenResponse>({
    queryKey: ["/api/dashboard/aufgaben"],
    queryFn: () => apiRequest("GET", "/api/dashboard/aufgaben").then((response) => response.json()),
    staleTime: 60_000,
  });

  const aufgaben = data?.aufgaben ?? [];
  const total = data?.total ?? 0;
  const today = todayIsoDate();

  return (
    <DashboardWidget
      id="aufgaben"
      visible={visible}
      className="lg:col-span-12 mb-6"
      style={style}
    >
      <Card className="p-5 bg-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CheckSquare className="h-4 w-4" />
            </div>
            <h2 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Offene Aufgaben (Gesamt: {total})
            </h2>
          </div>
          {isError && (
            <span className="inline-flex shrink-0 text-orange-600" aria-label="Aufgaben konnten nicht geladen werden.">
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
            Aufgaben konnten nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : aufgaben.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">Keine offenen Aufgaben</p>
            <p className="mt-1 text-xs text-muted-foreground">Das Team hat aktuell keine offenen To-Dos.</p>
          </div>
        ) : (
          <div className="divide-y">
            {aufgaben.map((aufgabe) => {
              const dueDate = formatDueDate(aufgabe.faellig_datum);
              const overdue = Boolean(aufgabe.faellig_datum && aufgabe.faellig_datum.slice(0, 10) < today);

              return (
                <Link key={aufgabe.id} href="/aufgaben">
                  <a
                    data-testid={`dashboard-aufgabe-${aufgabe.id}`}
                    className="flex items-center justify-between gap-3 rounded px-2 py-3 -mx-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{aufgabe.titel}</div>
                      <AuftragHinweis auftrag={aufgabe.auftrag} />
                    </div>
                    <div
                      className={cn(
                        "flex shrink-0 items-center gap-1 text-xs",
                        overdue ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>{dueDate ? `${overdue ? "Überfällig: " : "Fällig: "}${dueDate}` : "Ohne Fälligkeit"}</span>
                    </div>
                  </a>
                </Link>
              );
            })}
          </div>
        )}

        {!isLoading && !isError && (
          <div className="mt-4 border-t pt-3">
            <Link href="/aufgaben">
              <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Alle Aufgaben anzeigen <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </Link>
          </div>
        )}
      </Card>
    </DashboardWidget>
  );
}
