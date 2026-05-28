import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Plus, Pencil, Trash2, Mail, Phone, Building2, ShoppingCart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCHF } from "@/lib/format";

interface Lieferant {
  id: string;
  firma: string;
  kontaktperson?: string;
  email?: string;
  telefon?: string;
  adresse?: string;
  plz?: string;
  ort?: string;
  konditionen?: string;
  notiz?: string;
  erstellt: string;
}

interface Bestellung {
  id: string;
  lieferant_id?: string;
  auftrag_id?: string;
  artikel: string;
  menge: number;
  einheit?: string;
  preis?: number;
  status: string;
  bestellt_am?: string;
  geliefert_am?: string;
  notiz?: string;
  erstellt: string;
}

const STATUS_COLORS: Record<string, string> = {
  bestellt: "bg-blue-100 text-blue-800 border-blue-200",
  geliefert: "bg-green-100 text-green-800 border-green-200",
  storniert: "bg-red-100 text-red-800 border-red-200",
  ausstehend: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

const emptyLieferant: Omit<Lieferant, "id" | "erstellt"> = {
  firma: "",
  kontaktperson: "",
  email: "",
  telefon: "",
  adresse: "",
  plz: "",
  ort: "",
  konditionen: "",
  notiz: "",
};

const emptyBestellung: Omit<Bestellung, "id" | "erstellt"> = {
  lieferant_id: "",
  auftrag_id: "",
  artikel: "",
  menge: 1,
  einheit: "Stk",
  preis: 0,
  status: "ausstehend",
  bestellt_am: "",
  geliefert_am: "",
  notiz: "",
};

export default function Lieferanten() {
  const { toast } = useToast();
  const [lieferantDialog, setLieferantDialog] = useState(false);
  const [editLieferant, setEditLieferant] = useState<Lieferant | null>(null);
  const [lForm, setLForm] = useState<typeof emptyLieferant>(emptyLieferant);
  const [bestellungDialog, setBestellungDialog] = useState(false);
  const [bForm, setBForm] = useState<typeof emptyBestellung>(emptyBestellung);
  const [bestellungFilter, setBestellungFilter] = useState("alle");
  const [editBestellung, setEditBestellung] = useState<Bestellung | null>(null);

  const { data: lieferanten = [], isLoading: lL } = useQuery<Lieferant[]>({
    queryKey: ["/api/lieferanten"],
    queryFn: () => apiRequest("GET", "/api/lieferanten").then((r) => r.json()),
  });

  const { data: bestellungen = [], isLoading: lB } = useQuery<Bestellung[]>({
    queryKey: ["/api/materialbestellungen"],
    queryFn: () => apiRequest("GET", "/api/materialbestellungen").then((r) => r.json()),
  });

  const { data: auftraege = [] } = useQuery<any[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const saveLieferantMut = useMutation({
    mutationFn: () =>
      editLieferant
        ? apiRequest("PATCH", `/api/lieferanten/${editLieferant.id}`, lForm)
        : apiRequest("POST", "/api/lieferanten", lForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lieferanten"] });
      setLieferantDialog(false);
      setEditLieferant(null);
      setLForm(emptyLieferant);
      toast({ title: editLieferant ? "Lieferant aktualisiert" : "Lieferant hinzugefügt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delLieferantMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/lieferanten/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lieferanten"] });
      toast({ title: "Lieferant gelöscht" });
    },
  });

  const saveBestellungMut = useMutation({
    mutationFn: () =>
      editBestellung
        ? apiRequest("PATCH", `/api/materialbestellungen/${editBestellung.id}`, bForm)
        : apiRequest("POST", "/api/materialbestellungen", bForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materialbestellungen"] });
      setBestellungDialog(false);
      setBForm(emptyBestellung);
      setEditBestellung(null);
      toast({ title: editBestellung ? "Bestellung aktualisiert" : "Bestellung erstellt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const updateBestellungMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/materialbestellungen/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/materialbestellungen"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const delBestellungMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/materialbestellungen/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/materialbestellungen"] }),
  });

  const openLieferantEdit = (l: Lieferant) => {
    setEditLieferant(l);
    setLForm({ firma: l.firma, kontaktperson: l.kontaktperson || "", email: l.email || "", telefon: l.telefon || "", adresse: l.adresse || "", plz: l.plz || "", ort: l.ort || "", konditionen: l.konditionen || "", notiz: l.notiz || "" });
    setLieferantDialog(true);
  };

  const getLieferantName = (id: string) => {
    const l = lieferanten.find((x) => x.id === id);
    return l ? l.firma : id || "—";
  };

  const filteredBestellungen = bestellungFilter === "alle"
    ? bestellungen
    : bestellungen.filter((b) => b.status === bestellungFilter);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#6b4c2a" }}>
          <Package className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Lieferanten & Material
          </h1>
          <p className="text-sm text-muted-foreground">Lieferanten und Materialbestellungen verwalten</p>
        </div>
      </div>

      <Tabs defaultValue="lieferanten">
        <TabsList>
          <TabsTrigger value="lieferanten">
            <Building2 className="h-4 w-4 mr-1" /> Lieferanten ({lieferanten.length})
          </TabsTrigger>
          <TabsTrigger value="bestellungen">
            <ShoppingCart className="h-4 w-4 mr-1" /> Bestellungen ({bestellungen.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Lieferanten */}
        <TabsContent value="lieferanten" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => { setEditLieferant(null); setLForm(emptyLieferant); setLieferantDialog(true); }}
              style={{ background: "#e8620a" }} className="text-white"
            >
              <Plus className="h-4 w-4 mr-2" /> Neuer Lieferant
            </Button>
          </div>

          {lL ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : lieferanten.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Noch keine Lieferanten. Füge deinen ersten hinzu.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lieferanten.map((l) => (
                <Card key={l.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{l.firma}</p>
                      {l.kontaktperson && <p className="text-xs text-muted-foreground">{l.kontaktperson}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openLieferantEdit(l)} className="p-1 rounded hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => delLieferantMut.mutate(l.id)} className="p-1 rounded hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
                      </button>
                    </div>
                  </div>
                  {l.email && (
                    <a href={`mailto:${l.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Mail className="h-3 w-3" /> {l.email}
                    </a>
                  )}
                  {l.telefon && (
                    <a href={`tel:${l.telefon}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Phone className="h-3 w-3" /> {l.telefon}
                    </a>
                  )}
                  {(l.plz || l.ort) && (
                    <p className="text-xs text-muted-foreground">{l.plz} {l.ort}</p>
                  )}
                  {l.konditionen && (
                    <p className="text-xs text-muted-foreground italic">{l.konditionen}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab: Bestellungen */}
        <TabsContent value="bestellungen" className="mt-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              {["alle", "ausstehend", "bestellt", "geliefert", "storniert"].map((s) => (
                <button
                  key={s}
                  onClick={() => setBestellungFilter(s)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    bestellungFilter === s
                      ? "bg-[#1a3a6b] text-white border-[#1a3a6b]"
                      : "text-muted-foreground border-border hover:border-[#1a3a6b]"
                  )}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <Button onClick={() => { setEditBestellung(null); setBForm(emptyBestellung); setBestellungDialog(true); }} style={{ background: "#e8620a" }} className="text-white">
              <Plus className="h-4 w-4 mr-2" /> Neue Bestellung
            </Button>
          </div>

          {lB ? (
            <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : filteredBestellungen.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Keine Bestellungen vorhanden.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredBestellungen.map((b) => (
                <Card key={b.id} className="p-3 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[b.status] || "")}>
                        {b.status}
                      </Badge>
                      <span className="font-medium text-sm">{b.artikel}</span>
                      <span className="text-xs text-muted-foreground">{b.menge} {b.einheit || ""}</span>
                      {b.preis != null && b.preis > 0 && (
                        <span className="text-xs font-medium" style={{ color: "#e8620a" }}>
                          {formatCHF(b.preis)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Lieferant: {getLieferantName(b.lieferant_id || "")}
                      {b.bestellt_am && ` · Bestellt: ${b.bestellt_am}`}
                      {b.geliefert_am && ` · Geliefert: ${b.geliefert_am}`}
                      {b.notiz && ` · ${b.notiz}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {b.status === "ausstehend" && (
                      <button
                        onClick={() => updateBestellungMut.mutate({ id: b.id, status: "bestellt" })}
                        className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        Bestellt
                      </button>
                    )}
                    {b.status === "bestellt" && (
                      <button
                        onClick={() => updateBestellungMut.mutate({ id: b.id, status: "geliefert" })}
                        className="px-2 py-1 text-xs rounded border border-green-300 text-green-700 hover:bg-green-50"
                      >
                        Geliefert
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditBestellung(b);
                        setBForm({ lieferant_id: b.lieferant_id || "", auftrag_id: b.auftrag_id || "", artikel: b.artikel, menge: b.menge, einheit: b.einheit || "Stk", preis: b.preis || 0, status: b.status, bestellt_am: b.bestellt_am || "", geliefert_am: b.geliefert_am || "", notiz: b.notiz || "" });
                        setBestellungDialog(true);
                      }}
                      className="p-1 rounded hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => delBestellungMut.mutate(b.id)}
                      className="p-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Lieferant Dialog */}
      <Dialog open={lieferantDialog} onOpenChange={setLieferantDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editLieferant ? "Lieferant bearbeiten" : "Neuer Lieferant"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Firma *</Label>
              <Input value={lForm.firma} onChange={(e) => setLForm((f) => ({ ...f, firma: e.target.value }))} placeholder="Lieferant AG" />
            </div>
            <div>
              <Label className="text-xs">Kontaktperson</Label>
              <Input value={lForm.kontaktperson} onChange={(e) => setLForm((f) => ({ ...f, kontaktperson: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input type="email" value={lForm.email} onChange={(e) => setLForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={lForm.telefon} onChange={(e) => setLForm((f) => ({ ...f, telefon: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Adresse</Label>
              <Input value={lForm.adresse} onChange={(e) => setLForm((f) => ({ ...f, adresse: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">PLZ</Label>
              <Input value={lForm.plz} onChange={(e) => setLForm((f) => ({ ...f, plz: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Ort</Label>
              <Input value={lForm.ort} onChange={(e) => setLForm((f) => ({ ...f, ort: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Konditionen</Label>
              <Input value={lForm.konditionen} onChange={(e) => setLForm((f) => ({ ...f, konditionen: e.target.value }))} placeholder="z.B. 30 Tage netto" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notiz</Label>
              <Textarea value={lForm.notiz} onChange={(e) => setLForm((f) => ({ ...f, notiz: e.target.value }))} rows={2} />
            </div>
          </div>
          <Button
            className="w-full text-white mt-3"
            style={{ background: "#e8620a" }}
            onClick={() => saveLieferantMut.mutate()}
            disabled={!lForm.firma || saveLieferantMut.isPending}
          >
            {editLieferant ? "Aktualisieren" : "Speichern"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Bestellung Dialog */}
      <Dialog open={bestellungDialog} onOpenChange={setBestellungDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBestellung ? "Bestellung bearbeiten" : "Neue Materialbestellung"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-xs">Lieferant</Label>
              <Select value={bForm.lieferant_id || "__none__"} onValueChange={(v) => setBForm((f) => ({ ...f, lieferant_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Lieferant wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Lieferant</SelectItem>
                  {lieferanten.map((l) => <SelectItem key={l.id} value={l.id}>{l.firma}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Auftrag (optional)</Label>
              <Select value={bForm.auftrag_id || "__none__"} onValueChange={(v) => setBForm((f) => ({ ...f, auftrag_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Auftrag wählen…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kein Auftrag</SelectItem>
                  {(auftraege as any[]).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Artikel *</Label>
              <Input value={bForm.artikel} onChange={(e) => setBForm((f) => ({ ...f, artikel: e.target.value }))} placeholder="Artikelbezeichnung" />
            </div>
            <div>
              <Label className="text-xs">Menge</Label>
              <Input type="number" value={bForm.menge} onChange={(e) => setBForm((f) => ({ ...f, menge: Number(e.target.value) }))} />
            </div>
            <div>
              <Label className="text-xs">Einheit</Label>
              <Input value={bForm.einheit} onChange={(e) => setBForm((f) => ({ ...f, einheit: e.target.value }))} placeholder="Stk, m, kg…" />
            </div>
            <div>
              <Label className="text-xs">Preis (CHF)</Label>
              <Input type="number" value={bForm.preis} onChange={(e) => setBForm((f) => ({ ...f, preis: Number(e.target.value) }))} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={bForm.status} onValueChange={(v) => setBForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ausstehend">Ausstehend</SelectItem>
                  <SelectItem value="bestellt">Bestellt</SelectItem>
                  <SelectItem value="geliefert">Geliefert</SelectItem>
                  <SelectItem value="storniert">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Bestellt am</Label>
              <Input type="date" value={bForm.bestellt_am} onChange={(e) => setBForm((f) => ({ ...f, bestellt_am: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Geliefert am</Label>
              <Input type="date" value={bForm.geliefert_am} onChange={(e) => setBForm((f) => ({ ...f, geliefert_am: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notiz</Label>
              <Input value={bForm.notiz} onChange={(e) => setBForm((f) => ({ ...f, notiz: e.target.value }))} />
            </div>
          </div>
          <Button
            className="w-full text-white mt-3"
            style={{ background: "#e8620a" }}
            onClick={() => saveBestellungMut.mutate()}
            disabled={!bForm.artikel || saveBestellungMut.isPending}
          >
            {editBestellung ? "Aktualisieren" : "Bestellung speichern"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
