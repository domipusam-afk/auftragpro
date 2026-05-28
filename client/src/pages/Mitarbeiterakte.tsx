import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Plus, Pencil, Trash2, Phone, Mail, Euro,
  ChevronLeft, ChevronRight, Clock, CalendarDays, TrendingUp, BarChart2, ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCHF } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  position: string;
  stundensatz: number;
  eintrittsdatum: string;
  status: string;
  notiz: string;
}

interface Zeiteintrag {
  id: string;
  auftrag_id: string | null;
  mitarbeiter_id: string;
  mitarbeiter: string;
  beschreibung: string;
  datum: string;
  start_zeit: string;
  end_zeit: string | null;
  dauer_minuten: number;
}

const STATUS_COLOR: Record<string, string> = {
  aktiv: "bg-green-100 text-green-800 border-green-200",
  inaktiv: "bg-gray-100 text-gray-600 border-gray-200",
  krank: "bg-yellow-100 text-yellow-800 border-yellow-200",
  urlaub: "bg-blue-100 text-blue-800 border-blue-200",
};

const emptyForm = {
  vorname: "", nachname: "", email: "", telefon: "",
  position: "", stundensatz: "", eintrittsdatum: "", status: "aktiv", notiz: "",
};

function formatDauer(min: number) {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ─── Lohnabrechnung eines Mitarbeiters ────────────────────────────────────────
function LohnabrechnungPanel({ ma }: { ma: Mitarbeiter }) {
  const now = new Date();
  const [jahr, setJahr] = useState(now.getFullYear());
  const [monat, setMonat] = useState(now.getMonth() + 1);

  const monatName = new Date(jahr, monat - 1, 1).toLocaleString("de-CH", { month: "long" });

  const maName = `${ma.vorname} ${ma.nachname}`;
  const { data: eintraege = [], isLoading } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/zeiteintraege/monatsauswertung", jahr, monat, maName],
    queryFn: () => {
      return apiRequest(
        "GET",
        `/api/zeiteintraege/monatsauswertung?jahr=${jahr}&monat=${monat}&mitarbeiter_id=${encodeURIComponent(maName)}`
      ).then((r) => r.json());
    },
  });

  const prevMonth = () => { if (monat === 1) { setJahr(j => j - 1); setMonat(12); } else setMonat(m => m - 1); };
  const nextMonth = () => { if (monat === 12) { setJahr(j => j + 1); setMonat(1); } else setMonat(m => m + 1); };

  const totalMin = eintraege.reduce((s, e) => s + (e.dauer_minuten || 0), 0);
  const totalH = totalMin / 60;
  const lohn = totalH * (ma.stundensatz || 0);
  const arbeitstage = new Set(eintraege.map((e) => e.datum)).size;

  return (
    <div className="space-y-4 mt-3">
      {/* Monatsnavigation */}
      <div className="flex items-center gap-2">
        <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
        <span className="font-semibold text-sm w-36 text-center">{monatName} {jahr}</span>
        <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Zusammenfassung */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-muted/40 p-3 text-center">
          <CalendarDays className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-lg font-bold">{arbeitstage}</p>
          <p className="text-[11px] text-muted-foreground">Arbeitstage</p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-3 text-center">
          <Clock className="h-4 w-4 mx-auto mb-1" style={{ color: "hsl(var(--primary))" }} />
          <p className="text-lg font-bold" style={{ color: "hsl(var(--primary))" }}>
            {Math.floor(totalMin / 60)}h{totalMin % 60 > 0 ? ` ${totalMin % 60}m` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">Gesamtstunden</p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-600" />
          <p className="text-lg font-bold text-green-700 dark:text-green-400">
            {lohn > 0 ? `CHF ${lohn.toFixed(0)}` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">Lohnkosten</p>
        </div>
      </div>

      {/* Einträge-Tabelle */}
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : eintraege.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Keine Zeiteinträge für {monatName} {jahr}.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {eintraege.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded border bg-card px-3 py-2 text-xs">
              <span className="text-muted-foreground w-24 shrink-0">{e.datum}</span>
              <span className="bg-muted px-2 py-0.5 rounded">{e.start_zeit} – {e.end_zeit || "läuft"}</span>
              {e.dauer_minuten > 0 && (
                <span className="font-bold shrink-0" style={{ color: "hsl(var(--primary))" }}>
                  {formatDauer(e.dauer_minuten)}
                </span>
              )}
              <span className="text-muted-foreground flex-1 truncate">{e.beschreibung}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Mitarbeiterakte() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: mitarbeiter = [], isLoading } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, stundensatz: parseFloat(String(form.stundensatz).replace(",", ".")) || 0 };
      if (editId) return apiRequest("PATCH", `/api/mitarbeiter/${editId}`, payload);
      return apiRequest("POST", "/api/mitarbeiter", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mitarbeiter"] });
      setOpen(false); setEditId(null); setForm(emptyForm);
      toast({ title: editId ? "Mitarbeiter aktualisiert" : "Mitarbeiter hinzugefügt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mitarbeiter/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mitarbeiter"] }),
  });

  const openEdit = (m: Mitarbeiter) => {
    setEditId(m.id);
    setForm({ ...m, stundensatz: String(m.stundensatz) });
    setOpen(true);
  };

  const aktiv = mitarbeiter.filter((m) => m.status === "aktiv").length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Mitarbeiterakte</h1>
            <p className="text-sm text-muted-foreground">{aktiv} aktive Mitarbeiter</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/stundenauswertung">
            <a>
              <Button variant="outline" className="gap-1.5">
                <BarChart2 className="h-4 w-4" /> Stundenauswertung <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </a>
          </Link>
          <Button
            onClick={() => setOpen(true)}
            className="text-white gap-1.5"
            style={{ background: "hsl(var(--primary))" }}
          >
            <Plus className="h-4 w-4" /> Mitarbeiter hinzufügen
          </Button>
        </div>
      </div>

      {/* Dialog ausserhalb des Headers — verhindert Overlay-Konflikt */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vorname</Label>
                <Input value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Nachname</Label>
                <Input value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">E-Mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Position / Funktion</Label>
                <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="z.B. Schlosser" />
              </div>
              <div>
                <Label className="text-xs">Stundensatz (CHF)</Label>
                <Input value={form.stundensatz} onChange={(e) => setForm({ ...form, stundensatz: e.target.value })} placeholder="95.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Eintrittsdatum</Label>
                <Input type="date" value={form.eintrittsdatum} onChange={(e) => setForm({ ...form, eintrittsdatum: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="inaktiv">Inaktiv</SelectItem>
                    <SelectItem value="krank">Krank</SelectItem>
                    <SelectItem value="urlaub">Urlaub</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notiz</Label>
              <Input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="Bemerkungen, Dokumente…" />
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.vorname || !form.nachname || saveMutation.isPending}
              className="w-full text-white"
              style={{ background: "hsl(var(--primary))" }}
            >
              {editId ? "Speichern" : "Hinzufügen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Liste */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : mitarbeiter.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">Noch keine Mitarbeiter erfasst.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {mitarbeiter.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{m.vorname} {m.nachname}</p>
                      <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[m.status] || "")}>
                        {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                      </Badge>
                    </div>
                    {m.position && <p className="text-xs text-muted-foreground mt-0.5">{m.position}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground text-xs flex items-center gap-1 hover:text-foreground"
                      title="Lohnabrechnung"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Lohnabrechnung</span>
                    </button>
                    <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => delMutation.mutate(m.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="h-3 w-3" />{m.email}
                    </a>
                  )}
                  {m.telefon && (
                    <a href={`tel:${m.telefon}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3 w-3" />{m.telefon}
                    </a>
                  )}
                  {m.stundensatz > 0 && (
                    <span className="flex items-center gap-1 font-medium" style={{ color: "hsl(var(--primary))" }}>
                      <Euro className="h-3 w-3" />{formatCHF(m.stundensatz)}/h
                    </span>
                  )}
                  {m.eintrittsdatum && (
                    <span className="text-muted-foreground">Eintritt: {m.eintrittsdatum}</span>
                  )}
                </div>
                {m.notiz && <p className="text-xs text-muted-foreground border-t pt-2 mt-2">{m.notiz}</p>}
              </div>

              {/* Lohnabrechnung ausklappbar */}
              {expandedId === m.id && (
                <div className="border-t bg-muted/20 px-4 pb-4">
                  <LohnabrechnungPanel ma={m} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
