import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Package, AlertTriangle, Search, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";

const KATEGORIEN = [
  "Profile & Träger",
  "Bleche & Platten",
  "Befestigungsmaterial",
  "Dichtungen & Profile",
  "Glas & Verglasung",
  "Fassadenelemente",
  "Werkzeuge",
  "Verbrauchsmaterial",
  "Sonstiges",
];

interface LagerArtikel {
  id: string;
  artikelnummer: string;
  bezeichnung: string;
  kategorie: string;
  einheit: string;
  bestand: number;
  mindestbestand: number;
  lagerort?: string;
  lieferant?: string;
  preis_pro_einheit?: number;
  notiz?: string;
}

interface BuchungForm {
  artikel_id: string;
  menge: number;
  typ: "eingang" | "ausgang";
  notiz: string;
}

export default function Lagerverwaltung() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [buchungDialog, setBuchungDialog] = useState<LagerArtikel | null>(null);
  const [editArtikel, setEditArtikel] = useState<LagerArtikel | null>(null);
  const [suche, setSuche] = useState("");
  const [filterKat, setFilterKat] = useState("alle");
  const [buchung, setBuchung] = useState<BuchungForm>({ artikel_id: "", menge: 1, typ: "eingang", notiz: "" });

  const emptyForm = {
    artikelnummer: "", bezeichnung: "", kategorie: KATEGORIEN[0],
    einheit: "Stk", bestand: 0, mindestbestand: 5,
    lagerort: "", lieferant: "", preis_pro_einheit: "", notiz: ""
  };
  const [form, setForm] = useState<any>(emptyForm);

  const { data: artikel = [], isLoading } = useQuery<LagerArtikel[]>({
    queryKey: ["/api/lager"],
    queryFn: () => apiRequest("GET", "/api/lager").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest(editArtikel ? "PUT" : "POST", editArtikel ? `/api/lager/${editArtikel.id}` : "/api/lager", {
      ...data,
      bestand: Number(data.bestand),
      mindestbestand: Number(data.mindestbestand),
      preis_pro_einheit: data.preis_pro_einheit ? Number(data.preis_pro_einheit) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lager"] });
      toast({ title: editArtikel ? "Artikel aktualisiert" : "Artikel erstellt" });
      setDialogOpen(false);
      setEditArtikel(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/lager/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lager"] });
      toast({ title: "Artikel gelöscht" });
    },
  });

  const buchungMutation = useMutation({
    mutationFn: (data: BuchungForm) => apiRequest("POST", `/api/lager/${data.artikel_id}/buchung`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lager"] });
      toast({ title: "Buchung gespeichert" });
      setBuchungDialog(null);
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const filtered = artikel.filter(a => {
    if (filterKat !== "alle" && a.kategorie !== filterKat) return false;
    if (suche && !a.bezeichnung.toLowerCase().includes(suche.toLowerCase()) && !a.artikelnummer.toLowerCase().includes(suche.toLowerCase())) return false;
    return true;
  });

  const unterMindest = artikel.filter(a => a.bestand <= a.mindestbestand).length;
  const gesamtwert = artikel.reduce((s, a) => s + (a.bestand * (a.preis_pro_einheit || 0)), 0);

  function openEdit(a: LagerArtikel) {
    setEditArtikel(a);
    setForm({ ...a, preis_pro_einheit: a.preis_pro_einheit?.toString() || "" });
    setDialogOpen(true);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Lagerverwaltung</h1>
          <p className="text-sm text-muted-foreground mt-1">Materialbestand & Lagerübersicht</p>
        </div>
        <Button onClick={() => { setEditArtikel(null); setForm(emptyForm); setDialogOpen(true); }} className="gap-2" style={{ backgroundColor: "#6b4c2a" }}>
          <Plus className="h-4 w-4" /> Artikel anlegen
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card className="p-4 text-center">
          <p className="text-xl font-bold">{artikel.length}</p>
          <p className="text-xs text-muted-foreground">Artikel total</p>
        </Card>
        <Card className={`p-4 text-center ${unterMindest > 0 ? "border-red-200 dark:border-red-800" : ""}`}>
          <p className={`text-xl font-bold ${unterMindest > 0 ? "text-red-600" : "text-green-600"}`}>{unterMindest}</p>
          <p className="text-xs text-muted-foreground">Unter Mindestbestand</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold">CHF {gesamtwert.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Lagerwert</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xl font-bold">{new Set(artikel.map(a => a.kategorie)).size}</p>
          <p className="text-xs text-muted-foreground">Kategorien</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Suchen..." className="pl-9" value={suche} onChange={e => setSuche(e.target.value)} />
        </div>
        <Select value={filterKat} onValueChange={setFilterKat}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Kategorien</SelectItem>
            {KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabelle */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          {suche || filterKat !== "alle" ? "Keine Artikel gefunden" : "Noch keine Artikel angelegt"}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Artikel</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Kategorie</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Bestand</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Lagerort</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Preis/Einheit</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(a => {
                  const krit = a.bestand <= a.mindestbestand;
                  return (
                    <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {krit && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                          <div>
                            <p className="font-medium">{a.bezeichnung}</p>
                            <p className="text-xs text-muted-foreground">{a.artikelnummer}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant="outline" className="text-xs">{a.kategorie}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${krit ? "text-red-600" : ""}`}>{a.bestand}</span>
                        <span className="text-xs text-muted-foreground ml-1">{a.einheit}</span>
                        {krit && <p className="text-xs text-red-500">Min: {a.mindestbestand}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-sm">{a.lagerort || "—"}</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {a.preis_pro_einheit ? `CHF ${Number(a.preis_pro_einheit).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Eingang"
                            onClick={() => { setBuchung({ artikel_id: a.id, menge: 1, typ: "eingang", notiz: "" }); setBuchungDialog(a); }}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600" title="Ausgang"
                            onClick={() => { setBuchung({ artikel_id: a.id, menge: 1, typ: "ausgang", notiz: "" }); setBuchungDialog(a); }}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600"
                            onClick={() => { if (confirm("Artikel löschen?")) deleteMutation.mutate(a.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog: Artikel anlegen/bearbeiten */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditArtikel(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editArtikel ? "Artikel bearbeiten" : "Neuer Lagerartikel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Artikelnummer</label>
                <Input placeholder="ART-001" value={form.artikelnummer} onChange={e => setForm((f: any) => ({ ...f, artikelnummer: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Kategorie</label>
                <Select value={form.kategorie} onValueChange={v => setForm((f: any) => ({ ...f, kategorie: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Bezeichnung *</label>
              <Input placeholder="z.B. Aluprofil 60x40mm" value={form.bezeichnung} onChange={e => setForm((f: any) => ({ ...f, bezeichnung: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Einheit</label>
                <Select value={form.einheit} onValueChange={v => setForm((f: any) => ({ ...f, einheit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Stk", "m", "m²", "kg", "Liter", "Rolle", "Pck"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Bestand</label>
                <Input type="number" value={form.bestand} onChange={e => setForm((f: any) => ({ ...f, bestand: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Mindestbestand</label>
                <Input type="number" value={form.mindestbestand} onChange={e => setForm((f: any) => ({ ...f, mindestbestand: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Lagerort</label>
                <Input placeholder="z.B. Regal A3" value={form.lagerort} onChange={e => setForm((f: any) => ({ ...f, lagerort: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Preis/Einheit (CHF)</label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.preis_pro_einheit} onChange={e => setForm((f: any) => ({ ...f, preis_pro_einheit: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Lieferant</label>
              <Input placeholder="Lieferantenname" value={form.lieferant} onChange={e => setForm((f: any) => ({ ...f, lieferant: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button style={{ backgroundColor: "#6b4c2a" }} disabled={!form.bezeichnung || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}>
                {createMutation.isPending ? "Speichern..." : editArtikel ? "Aktualisieren" : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Buchung */}
      <Dialog open={!!buchungDialog} onOpenChange={v => !v && setBuchungDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lagerbuchung — {buchungDialog?.bezeichnung}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="flex gap-2">
              <Button className={`flex-1 gap-2 ${buchung.typ === "eingang" ? "" : "opacity-50"}`}
                variant={buchung.typ === "eingang" ? "default" : "outline"}
                style={buchung.typ === "eingang" ? { backgroundColor: "#16a34a" } : {}}
                onClick={() => setBuchung(b => ({ ...b, typ: "eingang" }))}>
                <ArrowDown className="h-4 w-4" /> Eingang
              </Button>
              <Button className={`flex-1 gap-2 ${buchung.typ === "ausgang" ? "" : "opacity-50"}`}
                variant={buchung.typ === "ausgang" ? "default" : "outline"}
                style={buchung.typ === "ausgang" ? { backgroundColor: "#e8620a" } : {}}
                onClick={() => setBuchung(b => ({ ...b, typ: "ausgang" }))}>
                <ArrowUp className="h-4 w-4" /> Ausgang
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Menge ({buchungDialog?.einheit})</label>
              <Input type="number" min="1" value={buchung.menge} onChange={e => setBuchung(b => ({ ...b, menge: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notiz (optional)</label>
              <Input placeholder="z.B. Auftrag A-2026-0012" value={buchung.notiz} onChange={e => setBuchung(b => ({ ...b, notiz: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBuchungDialog(null)}>Abbrechen</Button>
              <Button style={{ backgroundColor: "#1a3a6b" }} disabled={buchungMutation.isPending}
                onClick={() => buchungMutation.mutate({ ...buchung, artikel_id: buchungDialog!.id })}>
                {buchungMutation.isPending ? "Buchen..." : "Buchen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
