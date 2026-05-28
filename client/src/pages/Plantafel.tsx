import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Plantafel {
  id: string;
  auftrag_id?: string;
  ressource_id: string;
  ressource_typ: string;
  datum_von: string;
  datum_bis: string;
  notiz: string;
  farbe: string;
}

interface Mitarbeiter { id: string; vorname: string; nachname: string; position: string; }

const RESSOURCE_TYPEN = [
  { value: "mitarbeiter", label: "Mitarbeiter" },
  { value: "team", label: "Team / Kolonne" },
  { value: "maschine", label: "Maschine / Gerät" },
  { value: "fahrzeug", label: "Fahrzeug" },
  { value: "nachunternehmer", label: "Nachunternehmer" },
];

const FARBEN = ["#1a3a6b","#e8620a","#22c55e","#f59e0b","#6366f1","#ef4444","#0ea5e9","#8b5cf6"];

const emptyForm = {
  ressource_id: "", ressource_typ: "mitarbeiter",
  auftrag_id: "none", datum_von: "", datum_bis: "",
  notiz: "", farbe: "#1a3a6b",
};

export default function Plantafel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [form, setForm] = useState(emptyForm);

  const { data: planung = [], isLoading } = useQuery<Plantafel[]>({
    queryKey: ["/api/plantafel"],
    queryFn: () => apiRequest("GET", "/api/plantafel").then((r) => r.json()),
  });
  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });
  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  // Week grid
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const dateStr = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = dateStr(today);

  // Unique ressource list from planungen + mitarbeiter
  const ressourceList = [
    ...mitarbeiter.map((m) => ({
      id: m.id, label: `${m.vorname} ${m.nachname}`, typ: "mitarbeiter",
    })),
    ...planung
      .filter((p) => p.ressource_typ !== "mitarbeiter")
      .reduce((acc: { id: string; label: string; typ: string }[], p) => {
        if (!acc.find((a) => a.id === p.ressource_id)) {
          acc.push({ id: p.ressource_id, label: p.ressource_id, typ: p.ressource_typ });
        }
        return acc;
      }, []),
  ];

  const getPlanungForCell = (ressourceId: string, day: Date) => {
    const ds = dateStr(day);
    return planung.filter((p) =>
      p.ressource_id === ressourceId &&
      p.datum_von <= ds &&
      ds <= p.datum_bis
    );
  };

  const getAuftragTitel = (id?: string) => {
    if (!id || id === "none") return "";
    const a = auftraege.find((a) => a.id === id);
    return a ? a.titel : id;
  };

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/plantafel", {
        ...form, auftrag_id: form.auftrag_id === "none" ? null : form.auftrag_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plantafel"] });
      setOpen(false); setForm(emptyForm);
      toast({ title: "Planung hinzugefügt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/plantafel/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/plantafel"] }),
  });

  const WOCHENTAGE = ["Mo","Di","Mi","Do","Fr","Sa","So"];

  return (
    <div className="p-4 md:p-8 max-w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
            <LayoutGrid className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Plantafel</h1>
            <p className="text-sm text-muted-foreground">Ressourcen- und Kolonnenplanung</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyForm); }}>
          <Button className="text-white" style={{ background: "#e8620a" }} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Einsatz planen
            </Button>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Neuer Einsatz</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Ressourcentyp</Label>
                  <Select value={form.ressource_typ} onValueChange={(v) => setForm({ ...form, ressource_typ: v, ressource_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESSOURCE_TYPEN.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {form.ressource_typ === "mitarbeiter" ? (
                    <>
                      <Label className="text-xs">Mitarbeiter</Label>
                      <Select value={form.ressource_id} onValueChange={(v) => setForm({ ...form, ressource_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        <SelectContent>
                          {mitarbeiter.map((m) => <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <>
                      <Label className="text-xs">Name / Bezeichnung</Label>
                      <Input value={form.ressource_id} onChange={(e) => setForm({ ...form, ressource_id: e.target.value })} placeholder="z.B. Team A" />
                    </>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">Auftrag (optional)</Label>
                <Select value={form.auftrag_id} onValueChange={(v) => setForm({ ...form, auftrag_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Kein Auftrag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Kein Auftrag —</SelectItem>
                    {auftraege.filter((a) => !["abgeschlossen","storniert"].includes(a.status)).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Von (Datum)</Label>
                  <Input type="date" value={form.datum_von} onChange={(e) => setForm({ ...form, datum_von: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Bis (Datum)</Label>
                  <Input type="date" value={form.datum_bis} onChange={(e) => setForm({ ...form, datum_bis: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notiz</Label>
                <Input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="Bemerkung…" />
              </div>
              <div>
                <Label className="text-xs">Farbe</Label>
                <div className="flex gap-2 mt-1">
                  {FARBEN.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setForm({ ...form, farbe: f })}
                      className={cn("w-6 h-6 rounded-full border-2 transition-all", form.farbe === f ? "border-foreground scale-110" : "border-transparent")}
                      style={{ background: f }}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!form.ressource_id || !form.datum_von || !form.datum_bis || addMutation.isPending}
                className="w-full text-white"
                style={{ background: "#e8620a" }}
              >
                Einsatz planen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="p-2 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {dateStr(weekDays[0])} – {dateStr(weekDays[6])}
        </span>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="p-2 rounded hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="text-xs text-muted-foreground hover:text-foreground underline ml-2">
            Heute
          </button>
        )}
      </div>

      {/* Plantafel Grid */}
      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : ressourceList.length === 0 ? (
          <div className="p-10 text-center">
            <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Noch keine Mitarbeiter oder Ressourcen erfasst.</p>
            <p className="text-xs text-muted-foreground mt-1">Füge zuerst Mitarbeiter in der Mitarbeiterakte hinzu.</p>
          </div>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold min-w-[120px]">Ressource</th>
                {weekDays.map((d, i) => (
                  <th key={i} className={cn(
                    "px-2 py-2 text-center font-semibold min-w-[80px]",
                    dateStr(d) === todayStr && "bg-blue-50 text-blue-700",
                    i >= 5 && "text-muted-foreground"
                  )}>
                    <div>{WOCHENTAGE[i]}</div>
                    <div className="font-normal text-muted-foreground">{d.getDate()}.{d.getMonth()+1}.</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {ressourceList.map((ressource) => (
                <tr key={ressource.id}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium border-r">
                    <div>{ressource.label}</div>
                    <div className="text-muted-foreground text-[10px]">{RESSOURCE_TYPEN.find(r => r.value === ressource.typ)?.label}</div>
                  </td>
                  {weekDays.map((d, di) => {
                    const cellPlanung = getPlanungForCell(ressource.id, d);
                    return (
                      <td key={di} className={cn(
                        "px-1 py-1 align-top min-w-[80px]",
                        dateStr(d) === todayStr && "bg-blue-50/30",
                        di >= 5 && "bg-muted/20"
                      )}>
                        {cellPlanung.map((p) => (
                          <div
                            key={p.id}
                            className="rounded px-1.5 py-0.5 text-white text-[10px] mb-0.5 flex items-center justify-between gap-1 group"
                            style={{ background: p.farbe }}
                          >
                            <span className="truncate">{p.auftrag_id ? getAuftragTitel(p.auftrag_id) : p.notiz || "Einsatz"}</span>
                            <button
                              onClick={() => delMutation.mutate(p.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              title="Entfernen"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
