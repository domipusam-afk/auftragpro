/**
 * FinanzenUebersicht — Umsatz und Reingewinn aller abgeschlossenen Aufträge.
 * Umsatz = Rechnungsbetrag (netto), Reingewinn = Umsatz netto − IST-Kosten aus der Nachkalkulation.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, PiggyBank, Search, TrendingUp, Wallet } from "lucide-react";
import { formatCHF, formatDate } from "@/lib/format";
import { finanzenSummen, type FinanzenUebersichtZeile } from "@shared/schema";

function gewinnFarbe(wert: number) {
  return wert >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400";
}

/** Zahlungsstatus einer Zeile — "Bezahlt am …", "Teilweise" oder "Offen". */
function ZahlStatus({ z }: { z: FinanzenUebersichtZeile }) {
  if (!z.hat_rechnung) return <span className="text-muted-foreground text-xs">—</span>;
  if (z.voll_bezahlt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {z.bezahlt_am ? formatDate(z.bezahlt_am) : "Bezahlt"}
      </span>
    );
  }
  const teilweise = z.bezahlt_netto > 0;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-500">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      {teilweise ? "Teilweise" : "Offen"}
    </span>
  );
}

function Hinweis({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertCircle className="h-3.5 w-3.5 text-amber-600 inline-block align-text-bottom ml-1" />
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function FinanzenUebersicht() {
  const [search, setSearch] = useState("");

  const { data = [], isLoading, isError } = useQuery<FinanzenUebersichtZeile[]>({
    queryKey: ["/api/finanzen/uebersicht"],
    queryFn: () => apiRequest("GET", "/api/finanzen/uebersicht").then((r) => r.json()),
  });

  const gefiltert = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return data;
    return data.filter(
      (z) =>
        z.nr?.toLowerCase().includes(s) ||
        z.titel?.toLowerCase().includes(s) ||
        z.kunde?.toLowerCase().includes(s)
    );
  }, [data, search]);

  const {
    anzahl: anzahlAbgerechnet,
    umsatz: totalUmsatz,
    kosten: totalKosten,
    reingewinn: totalGewinn,
    offen: totalOffen,
    ohneKosten,
    ohneRechnung,
  } = finanzenSummen(gefiltert);
  const marge = totalUmsatz > 0 ? (totalGewinn / totalUmsatz) * 100 : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Finanzen-Übersicht
          </h1>
          <p className="text-sm text-muted-foreground">
            Umsatz und Reingewinn je abgeschlossenem Auftrag
          </p>
        </div>
      </div>

      <Card className="p-4 border-l-4" style={{ borderLeftColor: "hsl(var(--primary))" }}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Umsatz</strong> ist der Rechnungsbetrag exkl. MWST (aus allen gestellten Rechnungen des Auftrags).
          Der <strong>Reingewinn</strong> ist der Umsatz abzüglich der IST-Kosten aus der Nachkalkulation
          (Lohn, Material, Fremdleistungen und SOEK/Spesen).
        </p>
      </Card>

      {isError && (
        <Card className="p-6 flex items-center gap-3 border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Fehler beim Laden der Finanzdaten.</p>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* Summen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Total Umsatz (exkl. MWST)
              </div>
              <p className="text-2xl font-bold font-mono mt-1 tabular-nums">{formatCHF(totalUmsatz)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <PiggyBank className="h-3.5 w-3.5" /> Total Reingewinn
              </div>
              <p className={`text-2xl font-bold font-mono mt-1 tabular-nums ${gewinnFarbe(totalGewinn)}`}>
                {formatCHF(totalGewinn)}
              </p>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Marge</div>
              <p className={`text-2xl font-bold font-mono mt-1 tabular-nums ${gewinnFarbe(totalGewinn)}`}>
                {marge === null ? "—" : `${marge.toFixed(1)} %`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {anzahlAbgerechnet} von {gefiltert.length} abgeschlossenen Aufträgen abgerechnet
              </p>
            </Card>
          </div>

          {/* Suche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Auftrag suchen (Nr., Titel, Kunde)…"
              className="pl-9"
              data-testid="input-finanzen-search"
            />
          </div>

          {(ohneRechnung > 0 || ohneKosten > 0 || totalOffen > 0.005) && (
            <div className="space-y-1">
              {ohneRechnung > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-500 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {ohneRechnung} {ohneRechnung === 1 ? "Auftrag hat" : "Aufträge haben"} noch keine Rechnung —
                  ohne Rechnungsbetrag ist kein Umsatz und kein Reingewinn berechenbar; diese zählen nicht in die Summen.
                </p>
              )}
              {totalOffen > 0.005 && (
                <p className="text-xs text-amber-700 dark:text-amber-500 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Davon sind {formatCHF(totalOffen)} noch nicht bezahlt — der Umsatz ist fakturiert,
                  aber noch nicht vereinnahmt.
                </p>
              )}
              {ohneKosten > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-500 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {ohneKosten} {ohneKosten === 1 ? "Auftrag hat" : "Aufträge haben"} keine IST-Kosten in der
                  Nachkalkulation — der Reingewinn entspricht dort dem vollen Umsatz.
                </p>
              )}
            </div>
          )}

          {gefiltert.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground text-sm">
                {search ? "Keine Aufträge gefunden." : "Noch keine abgeschlossenen Aufträge."}
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {/* Mobile: Karten-Layout */}
              <div className="md:hidden divide-y">
                {gefiltert.map((z) => (
                  <Link key={z.id} href={`/nachkalkulation/${z.id}`}>
                    <a className="block p-4 space-y-2 hover:bg-muted/30 transition-colors" data-testid={`finanzen-row-${z.id}`}>
                      <div>
                        <div className="font-mono text-xs text-muted-foreground">{z.nr}</div>
                        <div className="font-medium">{z.titel}</div>
                        <div className="text-sm text-muted-foreground">{z.kunde}</div>
                        <div className="mt-1"><ZahlStatus z={z} /></div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Umsatz</div>
                          <div className="font-medium font-mono tabular-nums text-sm">
                            {z.hat_rechnung ? formatCHF(z.umsatz_netto, z.waehrung) : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Reingewinn</div>
                          {z.hat_rechnung ? (
                            <div className={`font-semibold font-mono tabular-nums text-sm ${gewinnFarbe(z.reingewinn)}`}>
                              {formatCHF(z.reingewinn, z.waehrung)}
                              {!z.hat_kosten && <Hinweis text="Keine IST-Kosten in der Nachkalkulation erfasst" />}
                            </div>
                          ) : (
                            <div className="font-mono tabular-nums text-sm text-muted-foreground">
                              —<Hinweis text="Noch keine Rechnung gestellt" />
                            </div>
                          )}
                        </div>
                      </div>
                    </a>
                  </Link>
                ))}
                <div className="flex items-center justify-between gap-3 p-4 bg-muted/30 font-semibold text-sm">
                  <span>Total</span>
                  <div className="flex gap-4">
                    <span className="font-mono tabular-nums">{formatCHF(totalUmsatz)}</span>
                    <span className={`font-mono tabular-nums ${gewinnFarbe(totalGewinn)}`}>{formatCHF(totalGewinn)}</span>
                  </div>
                </div>
              </div>

              {/* Desktop: Tabelle */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Auftrag</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Zahlung</TableHead>
                      <TableHead className="text-right">Umsatz</TableHead>
                      <TableHead className="text-right">IST-Kosten</TableHead>
                      <TableHead className="text-right">Reingewinn</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gefiltert.map((z) => (
                      <TableRow key={z.id} data-testid={`finanzen-row-${z.id}`}>
                        <TableCell>
                          <Link href={`/auftraege/${z.id}`}>
                            <a className="hover:text-primary">
                              <span className="font-mono text-xs text-muted-foreground mr-2">{z.nr}</span>
                              <span className="font-medium">{z.titel}</span>
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{z.kunde}</TableCell>
                        <TableCell><ZahlStatus z={z} /></TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {z.hat_rechnung ? formatCHF(z.umsatz_netto, z.waehrung) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {z.hat_kosten ? formatCHF(z.kosten, z.waehrung) : "—"}
                        </TableCell>
                        {z.hat_rechnung ? (
                          <TableCell className={`text-right font-mono tabular-nums font-semibold ${gewinnFarbe(z.reingewinn)}`}>
                            {formatCHF(z.reingewinn, z.waehrung)}
                            {!z.hat_kosten && <Hinweis text="Keine IST-Kosten in der Nachkalkulation erfasst" />}
                          </TableCell>
                        ) : (
                          <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                            —<Hinweis text="Noch keine Rechnung gestellt" />
                          </TableCell>
                        )}
                        <TableCell>
                          <Link href={`/nachkalkulation/${z.id}`}>
                            <a title="Nachkalkulation öffnen" className="text-muted-foreground hover:text-primary">
                              <ArrowRight className="h-4 w-4" />
                            </a>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 hover:bg-muted/30 font-semibold">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatCHF(totalUmsatz)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatCHF(totalKosten)}</TableCell>
                      <TableCell className={`text-right font-mono tabular-nums ${gewinnFarbe(totalGewinn)}`}>
                        {formatCHF(totalGewinn)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
