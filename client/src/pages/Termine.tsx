import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Plus, Trash2, Pencil, Users, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Termin {
  id: string;
  titel: string;
  beschreibung: string;
  auftrag_id?: string;
  mitarbeiter_ids: string[];
  datum_von: string;
  datum_bis: string;
  ganztags: boolean;
  typ: string;
  farbe: string;
}

interface Mitarbeiter { id: string; vorname: string; nachname: string; }

const TYP_OPTIONS = [
  { value: "termin", label: "Termin" },
  { value: "auftrag", label: "Auftragseinsatz" },
  { value: "intern", label: "Intern" },
  { value: "urlaub", label: "Urlaub" },
  { value: "krank", label: "Krank" },
];

const TYP_COLOR: Record<string, string> = {
  termin: "bg-blue-100 text-blue-800",
  auftrag: "bg-orange-100 text-orange-800",
  intern: "bg-gray-100 text-gray-700",
  urlaub: "bg-green-100 text-green-800",
  krank: "bg-red-100 text-red-800",
};

const emptyForm = {
  titel: "", beschreibung: "", auftrag_id: "none",
  datum_von: new Date().toISOString().slice(0,16),
  datum_bis: new Date().toISOString().slice(0,16),
  ganztags: false, typ: "termin", farbe: "#1a3a6b",
  mitarbeiter_ids: [] as string[],
};

export default function Termine() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("alle");

  const { data: termine = [], isLoading } = useQuery<Termin[]>({
    queryKey: ["/api/termine"],
    queryFn: () => apiRequest("GET", "/api/termine").then((r) => r.json()),
  });
  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });
  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const getMaName = (id: string) => {
    const m = mitarbeiter.find((m) => m.id === id);
    return m ? `${m.vorname} ${m.nachname}` : id;
  };

  const getAuftragTitel = (id?: string) => {
    if (!id || id === "none") return null;
    const a = auftraege.find((a) => a.id === id);
    return a ? `${a.nr} — ${a.titel}` : null;
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, auftrag_id: form.auftrag_id === "none" ? null : form.auftrag_id };
      if (editId) return apiRequest("PATCH", `/api/termine/${editId}`, payload);
      return apiRequest("POST", "/api/termine", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/termine"] });
      setOpen(false); setEditId(null); setForm(emptyForm);
      toast({ title: editId ? "Termin aktualisiert" : "Termin erstellt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/termine/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/termine"] }),
  });

  const openEdit = (t: Termin) => {
    setEditId(t.id);
    setForm({ ...t, auftrag_id: t.auftrag_id || "none" });
    setOpen(true);
  };

  const toggleMitarbeiter = (id: string) => {
    setForm((f) => ({
      ...f,
      mitarbeiter_ids: f.mitarbeiter_ids.includes(id)
        ? f.mitarbeiter_ids.filter((m) => m !== id)
        : [...f.mitarbeiter_ids, id],
    }));
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = filter === "alle"
    ? termine
    : filter === "heute"
    ? termine.filter((t) => (t.datum_von ?? '').slice(0, 10) === today)
    : termine.filter((t) => t.typ === filter);

  // Upcoming sorted
  const sorted = [...filtered].sort((a, b) => (a.datum_von ?? '').localeCompare(b.datum_von ?? ''));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
            <CalendarDays className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Planung & Termine</h1>
            <p className="text-sm text-muted-foreground">Einsätze und Termine planen</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
          <Button className="text-white" style={{ background: "#e8620a" }} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Neuer Termin
            </Button>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">Titel</Label>
                <Input value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Typ</Label>
                  <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYP_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Auftrag (optional)</Label>
                  <Select value={form.auftrag_id} onValueChange={(v) => setForm({ ...form, auftrag_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Kein Auftrag" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Kein Auftrag —</SelectItem>
                      {auftraege.map((a) => <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Von</Label>
                  <Input type="datetime-local" value={form.datum_von} onChange={(e) => setForm({ ...form, datum_von: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Bis</Label>
                  <Input type="datetime-local" value={form.datum_bis} onChange={(e) => setForm({ ...form, datum_bis: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Beschreibung</Label>
                <Input value={form.beschreibung} onChange={(e) => setForm({ ...form, beschreibung: e.target.value })} placeholder="Informationen zum Termin…" />
              </div>
              {mitarbeiter.length > 0 && (
                <div>
                  <Label className="text-xs">Mitarbeiter</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {mitarbeiter.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMitarbeiter(m.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs border transition-colors",
                          form.mitarbeiter_ids.includes(m.id)
                            ? "bg-[#1a3a6b] text-white border-[#1a3a6b]"
                            : "text-muted-foreground border-border hover:border-[#1a3a6b]"
                        )}
                      >
                        {m.vorname} {m.nachname}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.titel || !form.datum_von || !form.datum_bis || saveMutation.isPending}
                className="w-full text-white"
                style={{ background: "#e8620a" }}
              >
                {editId ? "Speichern" : "Termin erstellen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: "alle", label: "Alle" },
          { value: "heute", label: "Heute" },
          ...TYP_OPTIONS,
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              filter === f.value
                ? "bg-[#1a3a6b] text-white border-[#1a3a6b]"
                : "text-muted-foreground border-border hover:border-[#1a3a6b]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Keine Termine vorhanden.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((t) => {
            const auftragTitel = getAuftragTitel(t.auftrag_id);
            const isPast = t.datum_bis < new Date().toISOString();
            return (
              <Card key={t.id} className={cn("p-4", isPast && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ background: t.farbe || "#1a3a6b", minWidth: 4 }}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{t.titel}</span>
                      <Badge variant="outline" className={cn("text-xs", TYP_COLOR[t.typ] || "")}>
                        {TYP_OPTIONS.find((o) => o.value === t.typ)?.label || t.typ}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(t.datum_von ?? '').slice(0, 16).replace("T", " ")} – {(t.datum_bis ?? '').slice(11, 16)}
                    </p>
                    {auftragTitel && (
                      <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />{auftragTitel}
                      </p>
                    )}
                    {t.mitarbeiter_ids?.length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t.mitarbeiter_ids.map(getMaName).join(", ")}
                      </p>
                    )}
                    {t.beschreibung && <p className="text-xs text-muted-foreground">{t.beschreibung}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => delMutation.mutate(t.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
