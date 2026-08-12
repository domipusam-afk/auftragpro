import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Calculator, CalendarX2, CheckCircle2, FileWarning, Hourglass, Settings2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { formatCHF } from "@/lib/format";
import { DashboardWidget } from "./DashboardWidget";

interface AuftragReminderItem {
  id: string;
  auftragsnummer: string | null;
  kunde: string | null;
  auftragswert: number;
}

interface RechnungReminderItem {
  id: string;
  rechnungsnummer: string | null;
  auftrag_id: string | null;
  faellig_am: string;
  kunde: string | null;
  betrag_brutto: number;
}

interface AngebotReminderItem {
  id: string;
  angebotsnummer: string | null;
  auftrag_id: string | null;
  kunde: string | null;
  tage_offen: number;
  wert: number;
}

interface AuftragReminder {
  type: "vorkalkulation_fehlt" | "auftrag_ohne_termin";
  count: number;
  items: AuftragReminderItem[];
}

interface RechnungReminder {
  type: "rechnung_ueberfaellig";
  count: number;
  total_offen_brutto: number;
  items: RechnungReminderItem[];
}

interface AngebotReminder {
  type: "angebot_ohne_antwort";
  count: number;
  items: AngebotReminderItem[];
}

interface SmarteErinnerungenResponse {
  reminders: Array<AuftragReminder | RechnungReminder | AngebotReminder>;
}

interface SmarteErinnerungenWidgetProps {
  visible: boolean;
  style?: CSSProperties;
}

function AuftragReminderRows({ items }: { items: AuftragReminderItem[] }) {
  return (
    <ul className="divide-y rounded-md border bg-background/40">
      {items.map((auftrag) => (
        <li key={auftrag.id}>
          <Link href={`/auftraege/${auftrag.id}`}>
            <a className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/70">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {auftrag.auftragsnummer || "Auftrag"}
                  </span>
                  <span className="truncate text-sm font-medium">{auftrag.kunde || "Ohne Kundenbezeichnung"}</span>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCHF(auftrag.auftragswert)}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RechnungReminderRows({ items }: { items: RechnungReminderItem[] }) {
  return (
    <ul className="divide-y rounded-md border bg-background/40">
      {items.map((rechnung) => {
        const href = rechnung.auftrag_id ? `/auftraege/${rechnung.auftrag_id}` : "/rechnungen";
        return (
          <li key={rechnung.id}>
            <Link href={href}>
              <a className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/70">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {rechnung.rechnungsnummer || "Rechnung"}
                    </span>
                    <span className="truncate text-sm font-medium">{rechnung.kunde || "Ohne Kundenbezeichnung"}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Fällig am {rechnung.faellig_am}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCHF(rechnung.betrag_brutto)}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AngebotReminderRows({ items }: { items: AngebotReminderItem[] }) {
  return (
    <ul className="divide-y rounded-md border bg-background/40">
      {items.map((angebot) => {
        const href = angebot.auftrag_id ? `/auftraege/${angebot.auftrag_id}?tab=offerte` : "/offerten";
        return (
          <li key={angebot.id}>
            <Link href={href}>
              <a className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/70">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {angebot.angebotsnummer || "Angebot"}
                    </span>
                    <span className="truncate text-sm font-medium">{angebot.kunde || "Ohne Kundenbezeichnung"}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Seit {angebot.tage_offen} Tagen offen</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCHF(angebot.wert)}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </a>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact, preference-aware action prompts. The broader D2.3 invoice KPI
 * remains intentionally separate: it measures business health, while this
 * widget tells the user which next step to take. */
export function SmarteErinnerungenWidget({ visible, style }: SmarteErinnerungenWidgetProps) {
  const { data, isLoading, isError } = useQuery<SmarteErinnerungenResponse>({
    queryKey: ["/api/dashboard/reminders"],
    queryFn: () => apiRequest("GET", "/api/dashboard/reminders").then((response) => response.json()),
    staleTime: 60_000,
    enabled: visible,
  });

  const reminders = data?.reminders ?? [];
  const vorkalkulation = reminders.find((reminder): reminder is AuftragReminder => reminder.type === "vorkalkulation_fehlt");
  const termin = reminders.find((reminder): reminder is AuftragReminder => reminder.type === "auftrag_ohne_termin");
  const rechnung = reminders.find((reminder): reminder is RechnungReminder => reminder.type === "rechnung_ueberfaellig");
  const angebot = reminders.find((reminder): reminder is AngebotReminder => reminder.type === "angebot_ohne_antwort");

  return (
    <DashboardWidget
      id="smarte_erinnerungen"
      visible={visible}
      className="lg:col-span-12"
      style={style}
    >
      <Card className="border-primary/20 bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Erinnerungen</h2>
            <p className="mt-1 text-sm text-muted-foreground">Handlungsrelevante nächste Schritte für dein Team</p>
          </div>
          <Link href="/einstellungen?tab=dashboard">
            <a
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Dashboard-Erinnerungen anpassen"
              title="Dashboard-Erinnerungen anpassen"
            >
              <Settings2 className="h-4 w-4" />
            </a>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
            Erinnerungen konnten nicht geladen werden. Bitte Seite neu laden.
          </div>
        ) : reminders.length === 0 ? (
          <div className="flex min-h-24 flex-col items-center justify-center py-5 text-center">
            <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-600" />
            <p className="text-sm font-medium">Aktuell keine offenen Erinnerungen — gut gemacht!</p>
          </div>
        ) : (
          <div className="space-y-5">
            {vorkalkulation && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold">
                    {vorkalkulation.count} Auftrag{vorkalkulation.count === 1 ? "" : "e"} ohne Vorkalkulation
                  </h3>
                </div>
                <AuftragReminderRows items={vorkalkulation.items} />
              </section>
            )}

            {termin && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
                    <CalendarX2 className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold">
                    {termin.count} Auftrag{termin.count === 1 ? "" : "e"} ohne Termin
                  </h3>
                </div>
                <AuftragReminderRows items={termin.items} />
              </section>
            )}

            {rechnung && (
              <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    <FileWarning className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold">
                    {rechnung.count} Rechnung{rechnung.count === 1 ? "" : "en"} überfällig — {formatCHF(rechnung.total_offen_brutto)} offen
                  </h3>
                </div>
                <RechnungReminderRows items={rechnung.items} />
                <Link href="/mahnwesen">
                  <a className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    Jetzt Mahnung senden <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </Link>
              </section>
            )}

            {angebot && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200">
                    <Hourglass className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold">
                    {angebot.count} Angebot{angebot.count === 1 ? "" : "e"} ohne Antwort
                  </h3>
                </div>
                <AngebotReminderRows items={angebot.items} />
              </section>
            )}
          </div>
        )}
      </Card>
    </DashboardWidget>
  );
}
