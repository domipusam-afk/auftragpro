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
import { Plus, AlertOctagon, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import type { Auftrag } from "@shared/schema";
import { formatDate } from "@/lib/format";

const STATUS_CONFIG = {
  offen:       { label: "Offen",        color: "bg-red-100 text-red-700 border-red-200",        icon: AlertOctagon },
  in_bearbeitung: { label: "In Bearbeitung", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  erledigt:    { label: "Erledigt",     color: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle2 },
  abgelehnt:   { label: "Abgelehnt",   color: "bg-gray-100 text-gray-600 border-gray-200",      icon: XCircle },
} as const;

const PRIORITAET_CONFIG = {
  hoch:   { label: "Hoch",   color: "bg-red-100 text-red-700" },
  mittel: { label: "Mittel", color: "bg-amber-100 text-amber-700" },
  tief:   { label: "Tief",   color: "bg-gray-100 text-gray-600" },
};

interface Reklamation {
  id: string;
  auftrag_id?: string;
  titel: string;
  beschreibung: string;
  status: keyof typeof STATUS_CONFIG;
  prioritaet: keyof typeof PRIORITAET_CONFIG;
  verantwortlicher?: string;
  gemeldet_am: string;
  faellig_bis?: string;
  massnahmen?: string;
  created_at: string;
}

const emptyForm = {
  auftrag_id: "", titel: "", beschreibung: "",
  status: "offen" as const, prioritaet: "mittel" as const,
  verantwortlicher: "", gemeldet_am: new Date().toISOString().slice(0, 10),
  faellig_bis: "", massnahmen: "",
};

export default function Reklamationen() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Reklamation | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("alle");
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);

  const { data: auftraege = [] } = useQuery<Auftrag[]>({ queryKey: ["/api/auftraege"] });
  const { data: reklamationen = [], isLoading } = useQuery<Reklamation[]>({
    queryKey: ["/api/reklamationen"],
    queryFn: () => apiRequest("GET", "/api/reklamationen").then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof emptyForm) =>
      editItem
        ? apiRequest("PUT", `/api/reklamationen/${editItem.id}`, data)
        : apiRequest("POST", "/api/reklamationen", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reklamationen"] });
      toast({ title: editItem ? "Reklamation aktualisiert" : "Reklamation erstellt" });
      setDialogOpen(false);
      setEditItem(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/reklamationen/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reklamationen"] });
      toast({ title: "Reklamation gelöscht" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PUT", `/api/reklamationen/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reklamationen"] }),
  });

  const aMap = new Map(auftraege.map(a => [a.id, a]));

  const filtered = reklamationen.filter(r =>
    filterStatus === "alle" || r.status === filterStatus
  );

  function openEdit(r: Reklamation) {
    setEditItem(r);
    setForm({ ...emptyForm, ...r, auftrag_id: r.auftrag_id || "" });
    setDialogOpen(true);
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Reklamationen & Mängel</h1>
          <p className="text-sm text-muted-foreground mt-1">Garantiefälle, Mängelrügen, Nachbesserungen</p>
        </div>
        <Button onClick={() => { setEditItem(null); setForm(emptyForm); setDialogOpen(true); }} className="gap-2" style={{ backgroundColor: "#1a3a6b" }}>
          <Plus className="h-4 w-4" /> Reklamation erfassen
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const count = reklamationen.filter(r => r.status === key).length;
          const Icon = cfg.icon;
          return (
            <Card key={key} className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/20 transition-colors"
              onClick={() => setFilterStatus(filterStatus === key ? "alle" : key)}>
              <div className={`h-9 w-9 rounded-md flex items-center justify-center ${cfg.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-50" />
          Keine Reklamationen vorhanden
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.offen;
            const prioCfg = PRIORITAET_CONFIG[r.prioritaet] || PRIORITAET_CONFIG.mittel;
            const auftrag = r.auftrag_id ? aMap.get(r.auftrag_id) : null;
            const expanded = expandedId === r.id;
            return (
              <Card key={r.id} className="overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : r.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-sm">{r.titel}</span>
                        <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                        <Badge className={`text-xs ${prioCfg.color}`}>{prioCfg.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Gemeldet: {r.gemeldet_am}</span>
                        {auftrag && <span>{auftrag.nr} · {auftrag.titel}</span>}
                        {r.verantwortlicher && <span>→ {r.verantwortlicher}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(r); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/10">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Beschreibung</p>
                      <p className="text-sm whitespace-pre-wrap">{r.beschreibung}</p>
                    </div>
                    {r.massnahmen && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Massnahmen</p>
                        <p className="text-sm whitespace-pre-wrap">{r.massnahmen}</p>
                      </div>
                    )}
                    {r.faellig_bis && (
                      <p className="text-xs text-muted-foreground">Fällig bis: <strong>{r.faellig_bis}</strong></p>
                    )}
                    {/* Status-Änderung */}
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-xs text-muted-foreground">Status ändern:</span>
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <Button key={key} size="sm" variant="outline"
                          className={`text-xs h-7 ${r.status === key ? cfg.color : ""}`}
                          onClick={() => statusMutation.mutate({ id: r.id, status: key })}>
                          {cfg.label}
                        </Button>
                      ))}
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 text-xs"
                        onClick={() => { if (confirm("Löschen?")) deleteMutation.mutate(r.id); }}>
                        Löschen
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditItem(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Reklamation bearbeiten" : "Neue Reklamation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Titel *</label>
              <Input placeholder="Kurzbeschreibung des Problems" value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Auftrag</label>
                <Select value={form.auftrag_id} onValueChange={v => setForm(f => ({ ...f, auftrag_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Auftrag wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Kein Auftrag</SelectItem>
                    {auftraege.map(a => <SelectItem key={a.id} value={a.id}>{a.nr} · {a.titel}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priorität</label>
                <Select value={form.prioritaet} onValueChange={v => setForm(f => ({ ...f, prioritaet: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITAET_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Beschreibung *</label>
              <Textarea rows={4} placeholder="Detaillierte Beschreibung des Mangels..." value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Gemeldet am</label>
                <Input type="date" value={form.gemeldet_am} onChange={e => setForm(f => ({ ...f, gemeldet_am: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Fällig bis</label>
                <Input type="date" value={form.faellig_bis} onChange={e => setForm(f => ({ ...f, faellig_bis: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Verantwortlicher</label>
              <Input placeholder="Name des Verantwortlichen" value={form.verantwortlicher} onChange={e => setForm(f => ({ ...f, verantwortlicher: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Massnahmen</label>
              <Textarea rows={3} placeholder="Geplante oder bereits getroffene Massnahmen..." value={form.massnahmen} onChange={e => setForm(f => ({ ...f, massnahmen: e.target.value }))} />
            </div>
            {editItem && (
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button style={{ backgroundColor: "#1a3a6b" }} disabled={!form.titel || !form.beschreibung || saveMutation.isPending}
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
