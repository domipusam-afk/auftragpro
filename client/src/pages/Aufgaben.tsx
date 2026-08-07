import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import type { Aufgabe, AufgabeStatus, Auftrag } from "@shared/schema";

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
}

const emptyForm = {
  titel: "",
  beschreibung: "",
  auftrag_id: "none",
  mitarbeiter_id: "none",
  faellig_datum: "",
};

function formatDueDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function Aufgaben() {
  const { toast } = useToast();
  const [status, setStatus] = useState<AufgabeStatus>("offen");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Aufgabe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Aufgabe | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: aufgaben = [], isLoading } = useQuery<Aufgabe[]>({
    queryKey: ["/api/aufgaben", status],
    queryFn: () => apiRequest("GET", `/api/aufgaben?status=${status}`).then((r) => r.json()),
  });

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        titel: form.titel.trim(),
        beschreibung: form.beschreibung.trim() || null,
        auftrag_id: form.auftrag_id === "none" ? null : form.auftrag_id,
        mitarbeiter_id: form.mitarbeiter_id === "none" ? null : form.mitarbeiter_id,
        faellig_datum: form.faellig_datum || null,
      };
      const response = editing
        ? await apiRequest("PATCH", `/api/aufgaben/${editing.id}`, payload)
        : await apiRequest("POST", "/api/aufgaben", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aufgaben"] });
      toast({ title: editing ? "Aufgabe aktualisiert" : "Aufgabe erstellt" });
      closeDialog();
    },
    onError: () => toast({ title: "Aufgabe konnte nicht gespeichert werden", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: AufgabeStatus }) => {
      const response = await apiRequest("PATCH", `/api/aufgaben/${id}`, { status: nextStatus });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/aufgaben"] });
      toast({
        title: variables.nextStatus === "abgeschlossen" ? "Aufgabe abgeschlossen" : "Aufgabe wieder geöffnet",
      });
    },
    onError: () => toast({ title: "Status konnte nicht geändert werden", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/aufgaben/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/aufgaben"] });
      setDeleteTarget(null);
      toast({ title: "Aufgabe gelöscht" });
    },
    onError: () => toast({ title: "Aufgabe konnte nicht gelöscht werden", variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (aufgabe: Aufgabe) => {
    setEditing(aufgabe);
    setForm({
      titel: aufgabe.titel,
      beschreibung: aufgabe.beschreibung || "",
      auftrag_id: aufgabe.auftrag_id || "none",
      mitarbeiter_id: aufgabe.mitarbeiter_id || "none",
      faellig_datum: aufgabe.faellig_datum?.slice(0, 10) || "",
    });
    setDialogOpen(true);
  };

  const getAuftrag = (id?: string | null) => auftraege.find((auftrag) => auftrag.id === id);
  const getMitarbeiter = (id?: string | null) => mitarbeiter.find((person) => person.id === id);
  const isOverdue = (aufgabe: Aufgabe) =>
    aufgabe.status === "offen" &&
    Boolean(aufgabe.faellig_datum && aufgabe.faellig_datum.slice(0, 10) < todayIsoDate());

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1a3a6b]">
            <ClipboardCheck className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Aufgaben</h1>
            <p className="text-sm text-muted-foreground">Alltägliche To-Dos einfach im Blick behalten</p>
          </div>
        </div>
        <Button
          data-testid="button-new-aufgabe"
          className="w-full text-white sm:w-auto"
          style={{ background: "#e8620a" }}
          onClick={openNew}
        >
          <Plus className="mr-2 h-4 w-4" />
          Neue Aufgabe
        </Button>
      </div>

      <div className="inline-flex rounded-lg border bg-muted/30 p-1" role="tablist" aria-label="Aufgabenstatus">
        <button
          type="button"
          role="tab"
          aria-selected={status === "offen"}
          data-testid="tab-aufgaben-offen"
          onClick={() => setStatus("offen")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            status === "offen" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Offen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={status === "abgeschlossen"}
          data-testid="tab-aufgaben-abgeschlossen"
          onClick={() => setStatus("abgeschlossen")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            status === "abgeschlossen" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Abgeschlossen
        </button>
      </div>

      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="p-4">
            <div className="flex gap-3">
              <Skeleton className="mt-1 h-4 w-4" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
            </div>
          </Card>
        ))}

        {!isLoading && aufgaben.length === 0 && (
          <Card className="border-dashed p-9 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <h2 className="font-semibold">{status === "offen" ? "Keine offenen Aufgaben" : "Noch keine abgeschlossenen Aufgaben"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === "offen" ? "Erstelle eine Aufgabe für das nächste To-Do." : "Abgehakte Aufgaben erscheinen hier."}
            </p>
          </Card>
        )}

        {!isLoading && aufgaben.map((aufgabe) => {
          const auftrag = getAuftrag(aufgabe.auftrag_id);
          const person = getMitarbeiter(aufgabe.mitarbeiter_id);
          const completed = aufgabe.status === "abgeschlossen";
          const overdue = isOverdue(aufgabe);

          return (
            <Card key={aufgabe.id} data-testid={`aufgabe-${aufgabe.id}`} className={cn("p-4", completed && "bg-muted/25")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Checkbox
                    id={`aufgabe-${aufgabe.id}`}
                    data-testid={`checkbox-aufgabe-${aufgabe.id}`}
                    checked={completed}
                    disabled={statusMutation.isPending}
                    aria-label={completed ? `"${aufgabe.titel}" wieder öffnen` : `"${aufgabe.titel}" abschliessen`}
                    onCheckedChange={() => statusMutation.mutate({
                      id: aufgabe.id,
                      nextStatus: completed ? "offen" : "abgeschlossen",
                    })}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`aufgabe-${aufgabe.id}`} className={cn(
                      "block cursor-pointer break-words text-sm font-semibold",
                      completed && "text-muted-foreground line-through"
                    )}>
                      {aufgabe.titel}
                    </label>
                    {aufgabe.beschreibung && (
                      <p className="mt-1 break-words text-sm text-muted-foreground">{aufgabe.beschreibung}</p>
                    )}

                    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                      {auftrag && (
                        <Link
                          href={`/auftraege/${auftrag.id}`}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-[#1a3a6b] hover:bg-muted"
                          title={`${auftrag.nr} — ${auftrag.titel}`}
                        >
                          <BriefcaseBusiness className="h-3 w-3 shrink-0" />
                          <span className="whitespace-nowrap">{auftrag.nr}</span>
                        </Link>
                      )}
                      {aufgabe.faellig_datum && (
                        <Badge variant="outline" className={cn(
                          "gap-1 whitespace-nowrap",
                          overdue && "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                        )}>
                          <CalendarDays className="h-3 w-3 shrink-0" />
                          {overdue ? "Überfällig: " : "Fällig: "}{formatDueDate(aufgabe.faellig_datum)}
                        </Badge>
                      )}
                      {person && (
                        <Badge variant="outline" className="gap-1 whitespace-nowrap">
                          <UserRound className="h-3 w-3 shrink-0" />
                          {person.vorname} {person.nachname}
                        </Badge>
                      )}
                      {completed && aufgabe.erledigt_am && (
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          Erledigt am {formatDateTime(aufgabe.erledigt_am)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-1 border-t pt-3 sm:border-t-0 sm:pt-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Aufgabe bearbeiten"
                    data-testid={`button-edit-aufgabe-${aufgabe.id}`}
                    onClick={() => openEdit(aufgabe)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Aufgabe bearbeiten</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="Aufgabe löschen"
                    data-testid={`button-delete-aufgabe-${aufgabe.id}`}
                    onClick={() => setDeleteTarget(aufgabe)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Aufgabe löschen</span>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
          </DialogHeader>
          <form
            className="mt-2 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (form.titel.trim()) saveMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="aufgabe-titel">Titel</Label>
              <Input
                id="aufgabe-titel"
                data-testid="input-aufgabe-titel"
                value={form.titel}
                onChange={(event) => setForm({ ...form, titel: event.target.value })}
                placeholder="z. B. Material bestellen"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aufgabe-beschreibung">Beschreibung <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="aufgabe-beschreibung"
                data-testid="input-aufgabe-beschreibung"
                value={form.beschreibung}
                onChange={(event) => setForm({ ...form, beschreibung: event.target.value })}
                placeholder="Weitere Informationen zur Aufgabe…"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label>Auftrag <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.auftrag_id} onValueChange={(value) => setForm({ ...form, auftrag_id: value })}>
                  <SelectTrigger data-testid="select-aufgabe-auftrag"><SelectValue placeholder="Kein Auftrag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Kein Auftrag —</SelectItem>
                    {auftraege.map((auftrag) => (
                      <SelectItem key={auftrag.id} value={auftrag.id}>{auftrag.nr} — {auftrag.titel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label>Zuständig <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={form.mitarbeiter_id} onValueChange={(value) => setForm({ ...form, mitarbeiter_id: value })}>
                  <SelectTrigger data-testid="select-aufgabe-mitarbeiter"><SelectValue placeholder="Nicht zugeteilt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nicht zugeteilt —</SelectItem>
                    {mitarbeiter.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.vorname} {person.nachname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-w-[15rem] space-y-1.5">
              <Label htmlFor="aufgabe-faellig">Fälligkeitsdatum <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="aufgabe-faellig"
                data-testid="input-aufgabe-faellig"
                type="date"
                value={form.faellig_datum}
                onChange={(event) => setForm({ ...form, faellig_datum: event.target.value })}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeDialog}>Abbrechen</Button>
              <Button type="submit" data-testid="button-save-aufgabe" disabled={!form.titel.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? "Speichern…" : editing ? "Änderungen speichern" : "Aufgabe erstellen"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Aufgabe löschen?"
        description={`Die Aufgabe „${deleteTarget?.titel || ""}“ wird endgültig gelöscht.`}
      />
    </div>
  );
}
