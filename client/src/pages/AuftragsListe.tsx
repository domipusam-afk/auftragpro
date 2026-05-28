import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import type { Auftrag, Status, Prioritaet } from "@shared/schema";
import { STATUS_LABEL, STATUS_ORDER, PRIORITAETEN } from "@shared/schema";
import { STATUS_BADGE, PRIO_BADGE, formatCHF, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function AuftragsListe() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [prioFilter, setPrioFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<Auftrag | null>(null);
  const { toast } = useToast();

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

  const filtered = (data || []).filter((a) => {
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

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Aufträge
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} von {data?.length ?? 0} Aufträgen
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

      <Card className="p-4 mb-4 bg-card">
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
              {STATUS_ORDER.concat(["storniert"] as Status[]).map((s) => (
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

      <Card className="bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Keine Aufträge gefunden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
              <tbody className="divide-y">
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    data-testid={`row-${a.id}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{a.nr}</td>
                    <td className="px-4 py-3">
                      <Link href={`/auftraege/${a.id}`}>
                        <a className="font-medium hover:text-primary">{a.titel}</a>
                      </Link>
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
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-view-${a.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </a>
                        </Link>
                        <Link href={`/auftraege/${a.id}/bearbeiten`}>
                          <a>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-edit-${a.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </a>
                        </Link>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
