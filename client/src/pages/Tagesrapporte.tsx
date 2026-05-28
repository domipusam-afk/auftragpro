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
import { Plus, Sun, Cloud, CloudRain, Snowflake, Wind, FileText, Trash2, Eye, ChevronDown, ChevronUp } from "lucide-react";
import type { Auftrag } from "@shared/schema";
import { useAuth } from "@/lib/auth";

const WETTER_OPTIONS = [
  { value: "sonnig", label: "Sonnig", icon: Sun, color: "text-yellow-500" },
  { value: "bewoelkt", label: "Bewölkt", icon: Cloud, color: "text-gray-500" },
  { value: "regen", label: "Regen", icon: CloudRain, color: "text-blue-500" },
  { value: "schnee", label: "Schnee/Frost", icon: Snowflake, color: "text-blue-200" },
  { value: "wind", label: "Windig", icon: Wind, color: "text-teal-500" },
];

interface Rapport {
  id: string;
  auftrag_id: string;
  datum: string;
  mitarbeiter: string;
  wetter: string;
  temperatur?: string;
  arbeiten: string;
  material_verbraucht?: string;
  besonderheiten?: string;
  stunden_gesamt?: number;
  created_at: string;
}

function WetterIcon({ wetter }: { wetter: string }) {
  const opt = WETTER_OPTIONS.find(w => w.value === wetter);
  if (!opt) return null;
  const Icon = opt.icon;
  return <Icon className={`h-4 w-4 ${opt.color}`} />;
}

export default function Tagesrapporte() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewRapport, setViewRapport] = useState<Rapport | null>(null);
  const [filterAuftrag, setFilterAuftrag] = useState("alle");
  const [filterMonat, setFilterMonat] = useState(new Date().toISOString().slice(0, 7));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    auftrag_id: "",
    datum: new Date().toISOString().slice(0, 10),
    wetter: "sonnig",
    temperatur: "",
    arbeiten: "",
    material_verbraucht: "",
    besonderheiten: "",
    stunden_gesamt: "",
  });

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
  });

  const { data: rapporte = [], isLoading } = useQuery<Rapport[]>({
    queryKey: ["/api/tagesrapporte"],
    queryFn: () => apiRequest("GET", "/api/tagesrapporte").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/tagesrapporte", {
      ...data,
      mitarbeiter: user?.name || user?.email || "Unbekannt",
      stunden_gesamt: data.stunden_gesamt ? Number(data.stunden_gesamt) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tagesrapporte"] });
      toast({ title: "Rapport gespeichert" });
      setDialogOpen(false);
      setForm({ auftrag_id: "", datum: new Date().toISOString().slice(0, 10), wetter: "sonnig", temperatur: "", arbeiten: "", material_verbraucht: "", besonderheiten: "", stunden_gesamt: "" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tagesrapporte/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tagesrapporte"] });
      toast({ title: "Rapport gelöscht" });
    },
  });

  const aMap = new Map(auftraege.map(a => [a.id, a]));

  const filtered = rapporte.filter(r => {
    if (filterAuftrag !== "alle" && r.auftrag_id !== filterAuftrag) return false;
    if (filterMonat && !r.datum.startsWith(filterMonat)) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Tagesrapporte</h1>
          <p className="text-sm text-muted-foreground mt-1">Digitale Tagesrapporte für alle Aufträge</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2" style={{ backgroundColor: "#e8620a" }}>
          <Plus className="h-4 w-4" /> Rapport erfassen
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <Select value={filterAuftrag} onValueChange={setFilterAuftrag}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Auftrag filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Aufträge</SelectItem>
            {auftraege.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.nr} · {a.titel}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="month" value={filterMonat} onChange={e => setFilterMonat(e.target.value)} className="w-40" />
      </div>

      {/* Statistiken */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="p-3 text-center">
          <p className="text-xl font-bold text-[#6b4c2a]">{filtered.length}</p>
          <p className="text-xs text-muted-foreground">Rapporte</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold">{filtered.reduce((s, r) => s + (r.stunden_gesamt || 0), 0).toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">Stunden total</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold">{new Set(filtered.map(r => r.auftrag_id)).size}</p>
          <p className="text-xs text-muted-foreground">Aufträge</p>
        </Card>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Noch keine Rapporte erfasst
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const auftrag = aMap.get(r.auftrag_id);
            const expanded = expandedId === r.id;
            return (
              <Card key={r.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <WetterIcon wetter={r.wetter} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{r.datum}</span>
                        {auftrag && (
                          <Badge variant="outline" className="text-xs">{auftrag.nr}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{r.mitarbeiter}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{r.arbeiten}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.stunden_gesamt != null && (
                      <Badge variant="secondary" className="text-xs">{r.stunden_gesamt}h</Badge>
                    )}
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Wetter</p>
                        <div className="flex items-center gap-1.5">
                          <WetterIcon wetter={r.wetter} />
                          <span className="text-sm capitalize">{WETTER_OPTIONS.find(w => w.value === r.wetter)?.label || r.wetter}
                          {r.temperatur ? ` · ${r.temperatur}°C` : ""}</span>
                        </div>
                      </div>
                      {r.stunden_gesamt != null && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Geleistete Stunden</p>
                          <p className="text-sm">{r.stunden_gesamt}h</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Geleistete Arbeiten</p>
                      <p className="text-sm whitespace-pre-wrap">{r.arbeiten}</p>
                    </div>
                    {r.material_verbraucht && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Material verbraucht</p>
                        <p className="text-sm whitespace-pre-wrap">{r.material_verbraucht}</p>
                      </div>
                    )}
                    {r.besonderheiten && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Besonderheiten / Vorkommnisse</p>
                        <p className="text-sm whitespace-pre-wrap text-amber-700 dark:text-amber-300">{r.besonderheiten}</p>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => { if (confirm("Rapport löschen?")) deleteMutation.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4 mr-1" /> Löschen
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Rapport erfassen */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tagesrapport erfassen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Auftrag *</label>
              <Select value={form.auftrag_id} onValueChange={v => setForm(f => ({ ...f, auftrag_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Auftrag wählen" /></SelectTrigger>
                <SelectContent>
                  {auftraege.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nr} · {a.titel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Datum *</label>
                <Input type="date" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Stunden gesamt</label>
                <Input type="number" step="0.5" placeholder="8.0" value={form.stunden_gesamt} onChange={e => setForm(f => ({ ...f, stunden_gesamt: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Wetter</label>
                <Select value={form.wetter} onValueChange={v => setForm(f => ({ ...f, wetter: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WETTER_OPTIONS.map(w => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Temperatur (°C)</label>
                <Input placeholder="z.B. 18" value={form.temperatur} onChange={e => setForm(f => ({ ...f, temperatur: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Geleistete Arbeiten *</label>
              <Textarea rows={4} placeholder="Was wurde heute gemacht? Montage, Schweissen, Verkleidung..." value={form.arbeiten} onChange={e => setForm(f => ({ ...f, arbeiten: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Material verbraucht</label>
              <Textarea rows={2} placeholder="z.B. 10x Aluprofil 60x40, 2kg Schrauben..." value={form.material_verbraucht} onChange={e => setForm(f => ({ ...f, material_verbraucht: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Besonderheiten / Vorkommnisse</label>
              <Textarea rows={2} placeholder="Verzögerungen, Mängel, Kundenfeedback..." value={form.besonderheiten} onChange={e => setForm(f => ({ ...f, besonderheiten: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button
                style={{ backgroundColor: "#e8620a" }}
                disabled={!form.auftrag_id || !form.arbeiten || createMutation.isPending}
                onClick={() => createMutation.mutate(form)}
              >
                {createMutation.isPending ? "Speichern..." : "Rapport speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
