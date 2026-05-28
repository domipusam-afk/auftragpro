import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Phone, Mail, Pencil, Trash2, Search } from "lucide-react";

const GEWERKE = [
  "Glaserei", "Schlosserei", "Isolation / Wärmedämmung", "Abdichtung",
  "Gerüstbau", "Schreiner", "Elektriker", "Sanitär/Heizung", "Maler",
  "Planung / Ingenieur", "Sonstiges"
];

interface Subunternehmer {
  id: string;
  firma: string;
  gewerk: string;
  kontakt_person?: string;
  telefon?: string;
  email?: string;
  adresse?: string;
  mwst_nr?: string;
  stundenansatz?: number;
  bewertung?: number;
  notiz?: string;
}

const emptyForm = {
  firma: "", gewerk: GEWERKE[0], kontakt_person: "",
  telefon: "", email: "", adresse: "", mwst_nr: "",
  stundenansatz: "", bewertung: "", notiz: ""
};

export default function SubunternehmerPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Subunternehmer | null>(null);
  const [suche, setSuche] = useState("");
  const [filterGewerk, setFilterGewerk] = useState("alle");
  const [form, setForm] = useState<any>(emptyForm);

  const { data: subuns = [], isLoading } = useQuery<Subunternehmer[]>({
    queryKey: ["/api/subunternehmer"],
    queryFn: () => apiRequest("GET", "/api/subunternehmer").then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editItem
      ? apiRequest("PUT", `/api/subunternehmer/${editItem.id}`, { ...data, stundenansatz: data.stundenansatz ? Number(data.stundenansatz) : null, bewertung: data.bewertung ? Number(data.bewertung) : null })
      : apiRequest("POST", "/api/subunternehmer", { ...data, stundenansatz: data.stundenansatz ? Number(data.stundenansatz) : null, bewertung: data.bewertung ? Number(data.bewertung) : null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subunternehmer"] });
      toast({ title: editItem ? "Aktualisiert" : "Subunternehmer erstellt" });
      setDialogOpen(false);
      setEditItem(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/subunternehmer/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subunternehmer"] });
      toast({ title: "Gelöscht" });
    },
  });

  const filtered = subuns.filter(s => {
    if (filterGewerk !== "alle" && s.gewerk !== filterGewerk) return false;
    if (suche && !s.firma.toLowerCase().includes(suche.toLowerCase()) && !(s.gewerk || "").toLowerCase().includes(suche.toLowerCase())) return false;
    return true;
  });

  function openEdit(s: Subunternehmer) {
    setEditItem(s);
    setForm({ ...emptyForm, ...s, stundenansatz: s.stundenansatz?.toString() || "", bewertung: s.bewertung?.toString() || "" });
    setDialogOpen(true);
  }

  function sterne(n: number) {
    return "★".repeat(n) + "☆".repeat(5 - n);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Subunternehmer</h1>
          <p className="text-sm text-muted-foreground mt-1">Externe Firmen & Gewerke</p>
        </div>
        <Button onClick={() => { setEditItem(null); setForm(emptyForm); setDialogOpen(true); }} className="gap-2" style={{ backgroundColor: "#1a3a6b" }}>
          <Plus className="h-4 w-4" /> Subunternehmer hinzufügen
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="p-4 text-center">
          <p className="text-xl font-bold">{subuns.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold">{new Set(subuns.map(s => s.gewerk)).size}</p>
          <p className="text-xs text-muted-foreground">Gewerke</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold">
            {subuns.filter(s => s.bewertung && s.bewertung >= 4).length}
          </p>
          <p className="text-xs text-muted-foreground">Top-Bewertet (4★+)</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Firma suchen..." className="pl-9" value={suche} onChange={e => setSuche(e.target.value)} />
        </div>
        <Select value={filterGewerk} onValueChange={setFilterGewerk}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Gewerk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Gewerke</SelectItem>
            {GEWERKE.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Karten */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Noch keine Subunternehmer erfasst
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.firma}</p>
                  <Badge variant="outline" className="text-xs mt-1">{s.gewerk}</Badge>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                    onClick={() => { if (confirm("Löschen?")) deleteMutation.mutate(s.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                {s.kontakt_person && <p className="text-muted-foreground">{s.kontakt_person}</p>}
                {s.telefon && (
                  <a href={`tel:${s.telefon}`} className="flex items-center gap-1.5 text-primary hover:underline">
                    <Phone className="h-3.5 w-3.5" />{s.telefon}
                  </a>
                )}
                {s.email && (
                  <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-primary hover:underline truncate">
                    <Mail className="h-3.5 w-3.5" />{s.email}
                  </a>
                )}
              </div>
              <div className="flex items-center justify-between mt-auto pt-2 border-t">
                {s.stundenansatz ? (
                  <span className="text-xs text-muted-foreground">CHF {s.stundenansatz}/h</span>
                ) : <span />}
                {s.bewertung ? (
                  <span className="text-amber-500 text-xs font-medium">{sterne(s.bewertung)}</span>
                ) : <span />}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditItem(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Subunternehmer bearbeiten" : "Neuer Subunternehmer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Firma *</label>
                <Input placeholder="Firmenname" value={form.firma} onChange={e => setForm((f: any) => ({ ...f, firma: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Gewerk</label>
                <Select value={form.gewerk} onValueChange={v => setForm((f: any) => ({ ...f, gewerk: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GEWERKE.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Kontaktperson</label>
                <Input placeholder="Name" value={form.kontakt_person} onChange={e => setForm((f: any) => ({ ...f, kontakt_person: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Telefon</label>
                <Input placeholder="+41 71 000 00 00" value={form.telefon} onChange={e => setForm((f: any) => ({ ...f, telefon: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">E-Mail</label>
              <Input type="email" placeholder="info@firma.ch" value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Adresse</label>
              <Input placeholder="Strasse, PLZ Ort" value={form.adresse} onChange={e => setForm((f: any) => ({ ...f, adresse: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Stundenansatz (CHF)</label>
                <Input type="number" step="0.5" placeholder="85.00" value={form.stundenansatz} onChange={e => setForm((f: any) => ({ ...f, stundenansatz: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Bewertung (1–5)</label>
                <Select value={form.bewertung.toString()} onValueChange={v => setForm((f: any) => ({ ...f, bewertung: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={n.toString()}>{n} Stern{n > 1 ? "e" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">MWST-Nr.</label>
              <Input placeholder="CHE-000.000.000" value={form.mwst_nr} onChange={e => setForm((f: any) => ({ ...f, mwst_nr: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notiz</label>
              <Textarea rows={2} value={form.notiz} onChange={e => setForm((f: any) => ({ ...f, notiz: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button style={{ backgroundColor: "#1a3a6b" }} disabled={!form.firma || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}>
                {saveMutation.isPending ? "Speichern..." : editItem ? "Aktualisieren" : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
