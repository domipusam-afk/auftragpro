import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, Eye, Pencil, Trash2, ChevronDown, ChevronRight, ArchiveRestore, CheckCircle2, RefreshCw } from "lucide-react";
import type { Auftrag, Status, Prioritaet } from "@shared/schema";
import { STATUS_LABEL, STATUS_ORDER, PRIORITAETEN } from "@shared/schema";
import { STATUS_BADGE, PRIO_BADGE, formatCHF, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Status, die als "abgeschlossen / archiviert" gelten
const DONE_STATUSES: Status[] = ["abgeschlossen", "storniert"];

export default function AuftragsListe() {
  const search = useSearch(); // z.B. "?status=offen"
  const params = new URLSearchParams(search);
  const initialStatus = params.get("status") || "all";

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [prioFilter, setPrioFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<Auftrag | null>(null);
  const [archivOpen, setArchivOpen] = useState(initialStatus === "abgeschlossen" || initialStatus === "storniert");
  const [wiederkehrendOpen, setWiederkehrendOpen] = useState(false);
  const { toast } = useToast();

  // Wenn sich die URL ändert (z.B. Navigation via Dashboard), Filter aktualisieren
  useEffect(() => {
    const p = new URLSearchParams(search);
    const s = p.get("status") || "all";
    setStatusFilter(s);
    if (s === "abgeschlossen" || s === "storniert") setArchivOpen(true);
  }, [search]);

  const { data, isLoading } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/auftraege/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Auftrag gelöscht" });
      setToDelete(null);
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const reactivateMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("PATCH", `/api/auftraege/${id}/status`, { status: "in_arbeit" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Auftrag reaktiviert", description: "Status auf «In Arbeit» zurückgesetzt." });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const allAuftraege = data || [];

  // Aktive Aufträge (nicht abgeschlossen / storniert)
  const aktiveFiltered = allAuftraege
    .filter((a) => !DONE_STATUSES.includes(a.status as Status))
    .filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (prioFilter !== "all" && a.prioritaet !== prioFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        if (
          !a.titel?.toLowerCase().includes(s) &&
          !a.kunde?.toLowerCase().includes(s) &&
          !a.nr?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });

  // Wiederkehrende Aufträge (alle mit gesetztem Interval, unabhängig von Status)
  const wiederkehrendAuftraege = allAuftraege
    .filter((a) => !!(a as any).wiederkehrend_interval)
    .filter((a) => {
      if (q) {
        const s = q.toLowerCase();
        if (!a.titel?.toLowerCase().includes(s) && !a.kunde?.toLowerCase().includes(s) && !a.nr?.toLowerCase().includes(s)) return false;
      }
      return true;
    });

  const INTERVAL_LABEL: Record<string, string> = {
    monatlich: 'Monatlich',
    quartalsweise: 'Quartalsweise',
    halbjaehrlich: 'Halbjährlich',
    jaehrlich: 'Jährlich',
  };

  // Abgeschlossene / stornierte Aufträge
  const archivFiltered = allAuftraege
    .filter((a) => DONE_STATUSES.includes(a.status as Status))
    .filter((a) => {
      if (q) {
        const s = q.toLowerCase();
        if (
          !a.titel?.toLowerCase().includes(s) &&
          !a.kunde?.toLowerCase().includes(s) &&
          !a.nr?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    })
    // Neueste zuerst
    .sort((a, b) => new Date(b.erstellt).getTime() - new Date(a.erstellt).getTime());

  // Status-Filter-Optionen: nur aktive Status anzeigen (abgeschlossen im Archiv)
  const activeStatusOptions = STATUS_ORDER.filter((s) => !DONE_STATUSES.includes(s));

  // Mobile-Kartenansicht einer Auftragszeile (< md), ersetzt die Tabelle auf schmalen Screens
  function AuftragCard({ a, showReactivate = false, extraBadge }: { a: Auftrag; showReactivate?: boolean; extraBadge?: React.ReactNode }) {
    return (
      <div
        data-testid={`row-${a.id}`}
        className="p-4 space-y-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">{a.nr}</div>
            <div className="flex items-center flex-wrap gap-1 mt-0.5">
              <Link href={`/auftraege/${a.id}`}>
                <a className="font-medium hover:text-primary">{a.titel}</a>
              </Link>
              {extraBadge}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">{a.kunde}</div>
          </div>
          <div className="font-medium tabular-nums text-right shrink-0">
            {formatCHF(a.angebots_betrag, a.waehrung)}
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-1.5">
          <Badge variant="outline" className={cn(STATUS_BADGE[a.status])}>
            {STATUS_LABEL[a.status]}
          </Badge>
          <Badge variant="outline" className={cn(PRIO_BADGE[a.prioritaet])}>
            {a.prioritaet}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">{formatDate(a.erstellt)}</span>
        </div>
        <div className="flex items-center justify-end gap-1 pt-1">
          <Link href={`/auftraege/${a.id}`}>
            <a>
              <Button size="icon" variant="ghost" data-testid={`button-view-${a.id}`}>
                <Eye className="h-4 w-4" />
              </Button>
            </a>
          </Link>
          <Link href={`/auftraege/${a.id}/bearbeiten`}>
            <a>
              <Button size="icon" variant="ghost" data-testid={`button-edit-${a.id}`}>
                <Pencil className="h-4 w-4" />
              </Button>
            </a>
          </Link>
          {showReactivate ? (
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-reactivate-${a.id}`}
              onClick={() => reactivateMut.mutate(a.id)}
              disabled={reactivateMut.isPending}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              title="Zu aktiven Aufträgen zurückschieben"
            >
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            data-testid={`button-delete-${a.id}`}
            onClick={() => setToDelete(a)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  }

  function AuftragRow({ a, showReactivate = false, extraBadge }: { a: Auftrag; showReactivate?: boolean; extraBadge?: React.ReactNode }) {
    return (
      <tr
        key={a.id}
        data-testid={`row-${a.id}`}
        className="hover:bg-muted/30 transition-colors"
      >
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.nr}</td>
        <td className="px-4 py-3">
          <div className="flex items-center flex-wrap gap-1">
            <Link href={`/auftraege/${a.id}`}>
              <a className="font-medium hover:text-primary">{a.titel}</a>
            </Link>
            {extraBadge}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{a.kunde}</td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={cn(STATUS_BADGE[a.status])}>
            {STATUS_LABEL[a.status]}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={cn(PRIO_BADGE[a.prioritaet])}>
            {a.prioritaet}
          </Badge>
        </td>
        <td className="px-4 py-3 text-right font-medium tabular-nums">
          {formatCHF(a.angebots_betrag, a.waehrung)}
        </td>
        <td className="px-4 py-3 text-right text-muted-foreground text-xs">
          {formatDate(a.erstellt)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <Link href={`/auftraege/${a.id}`}>
              <a>
                <Button size="icon" variant="ghost" data-testid={`button-view-${a.id}`}>
                  <Eye className="h-4 w-4" />
                </Button>
              </a>
            </Link>
            <Link href={`/auftraege/${a.id}/bearbeiten`}>
              <a>
                <Button size="icon" variant="ghost" data-testid={`button-edit-${a.id}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </a>
            </Link>
            {showReactivate ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid={`button-reactivate-${a.id}`}
                      onClick={() => reactivateMut.mutate(a.id)}
                      disabled={reactivateMut.isPending}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Zu aktiven Aufträgen zurückschieben</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              data-testid={`button-delete-${a.id}`}
              onClick={() => setToDelete(a)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  const tableHead = (
    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
      <tr>
        <th className="text-left px-4 py-3 font-medium">Nr.</th>
        <th className="text-left px-4 py-3 font-medium">Titel</th>
        <th className="text-left px-4 py-3 font-medium">Kunde</th>
        <th className="text-left px-4 py-3 font-medium">Status</th>
        <th className="text-left px-4 py-3 font-medium">Priorität</th>
        <th className="text-right px-4 py-3 font-medium">Betrag</th>
        <th className="text-right px-4 py-3 font-medium">Erstellt</th>
        <th className="px-4 py-3"></th>
      </tr>
    </thead>
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Aufträge
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {aktiveFiltered.length} aktive Aufträge
            {archivFiltered.length > 0 && ` · ${archivFiltered.length} abgeschlossen`}
          </p>
        </div>
        <Link href="/neu">
          <a>
            <Button
              data-testid="button-new-order"
              className="bg-secondary hover:bg-secondary/90 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neuer Auftrag
            </Button>
          </a>
        </Link>
      </div>

      {/* Filter */}
      <Card className="p-4 bg-card">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="input-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Titel, Kunde oder Nr. suchen…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="md:w-48" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {activeStatusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={prioFilter} onValueChange={setPrioFilter}>
            <SelectTrigger className="md:w-44" data-testid="select-prio-filter">
              <SelectValue placeholder="Priorität" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Prioritäten</SelectItem>
              {PRIORITAETEN.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* ── Aktive Aufträge ── */}
      <Card className="bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : aktiveFiltered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {q || statusFilter !== "all" || prioFilter !== "all"
              ? "Keine Aufträge gefunden."
              : "Alle Aufträge sind abgeschlossen."}
          </div>
        ) : (
          <>
            {/* Mobile: Karten-Layout */}
            <div className="md:hidden divide-y">
              {aktiveFiltered.map((a) => (
                <AuftragCard key={a.id} a={a} showReactivate={false} />
              ))}
            </div>
            {/* Desktop: Tabelle */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                {tableHead}
                <tbody className="divide-y">
                  {aktiveFiltered.map((a) => (
                    <AuftragRow key={a.id} a={a} showReactivate={false} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ── Abgeschlossene Projekte (Archiv) ── */}
      {(archivFiltered.length > 0 || !isLoading) && (
        <Collapsible open={archivOpen} onOpenChange={setArchivOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors text-left"
              data-testid="toggle-archiv"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">
                  Abgeschlossene Projekte
                </span>
                {archivFiltered.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                    {archivFiltered.length}
                  </Badge>
                )}
              </div>
              {archivOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <Card className="mt-2 bg-card overflow-hidden border-dashed">
              {archivFiltered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Noch keine abgeschlossenen Aufträge.
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Abgeschlossene und stornierte Aufträge · Mit{" "}
                      <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                        <ArchiveRestore className="h-3 w-3" /> Reaktivieren
                      </span>{" "}
                      zurück zu aktiven Aufträgen schieben
                    </p>
                  </div>
                  <div className="md:hidden divide-y opacity-80">
                    {archivFiltered.map((a) => (
                      <AuftragCard key={a.id} a={a} showReactivate={true} />
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm opacity-80">
                      {tableHead}
                      <tbody className="divide-y">
                        {archivFiltered.map((a) => (
                          <AuftragRow key={a.id} a={a} showReactivate={true} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Wiederkehrende Aufträge (gleicher Stil wie Archiv) ── */}
      {(wiederkehrendAuftraege.length > 0 || !isLoading) && (
        <Collapsible open={wiederkehrendOpen} onOpenChange={setWiederkehrendOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors text-left"
              data-testid="toggle-wiederkehrend"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">
                  Wiederkehrende Aufträge
                </span>
                {wiederkehrendAuftraege.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                    {wiederkehrendAuftraege.length}
                  </Badge>
                )}
              </div>
              {wiederkehrendOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2 bg-card overflow-hidden border-dashed">
              {wiederkehrendAuftraege.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Noch keine wiederkehrenden Aufträge. Intervall in einem Auftrag setzen.
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Aufträge mit automatischem Intervall — Wartungsverträge, Jahresservice etc.
                    </p>
                  </div>
                  <div className="md:hidden divide-y opacity-90">
                    {wiederkehrendAuftraege.map((a) => (
                      <AuftragCard key={a.id} a={a} showReactivate={false} extraBadge={
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 ml-1">
                          <RefreshCw className="h-3 w-3 mr-1" />
                          {INTERVAL_LABEL[(a as any).wiederkehrend_interval] || (a as any).wiederkehrend_interval}
                        </Badge>
                      } />
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm opacity-90">
                      {tableHead}
                      <tbody className="divide-y">
                        {wiederkehrendAuftraege.map((a) => (
                          <AuftragRow key={a.id} a={a} showReactivate={false} extraBadge={
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 ml-1">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              {INTERVAL_LABEL[(a as any).wiederkehrend_interval] || (a as any).wiederkehrend_interval}
                            </Badge>
                          } />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auftrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.nr} — {toDelete?.titel}. Diese Aktion kann nicht rückgängig gemacht
              werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              onClick={() => toDelete && delMut.mutate(toDelete.id)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
