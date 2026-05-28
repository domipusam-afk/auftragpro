import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Umbrella, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
}

interface FerienEintrag {
  id: string;
  mitarbeiter_id: string;
  mitarbeiter?: { id: string; vorname: string; nachname: string };
  von: string;
  bis: string;
  typ: string;
  notiz?: string;
  erstellt: string;
}

const TYP_FARBEN: Record<string, string> = {
  ferien: "bg-blue-200 text-blue-800 border-blue-300",
  krank: "bg-red-200 text-red-800 border-red-300",
  frei: "bg-green-200 text-green-800 border-green-300",
  militaer: "bg-yellow-200 text-yellow-800 border-yellow-300",
};

const TYP_LABELS: Record<string, string> = {
  ferien: "Ferien",
  krank: "Krank",
  frei: "Frei",
  militaer: "Militär",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function dateInRange(dateStr: string, von: string, bis: string) {
  return dateStr >= von && dateStr <= bis;
}

export default function Ferienplanung() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ mitarbeiter_id: "", von: "", bis: "", typ: "ferien", notiz: "" });

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based

  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const { data: ferien = [], isLoading } = useQuery<FerienEintrag[]>({
    queryKey: ["/api/ferien"],
    queryFn: () => apiRequest("GET", "/api/ferien").then((r) => r.json()),
  });

  const addMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ferien", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ferien"] });
      setDialogOpen(false);
      setForm({ mitarbeiter_id: "", von: "", bis: "", typ: "ferien", notiz: "" });
      toast({ title: "Eintrag hinzugefügt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ferien/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ferien"] });
      toast({ title: "Eintrag gelöscht" });
    },
  });

  const daysInMonth = getDaysInMonth(year, month);
  const monthName = new Date(year, month, 1).toLocaleString("de-CH", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const getMitarbeiterName = (id: string) => {
    const m = mitarbeiter.find((x) => x.id === id);
    return m ? `${m.vorname} ${m.nachname}` : id;
  };

  // Filter ferien for this month
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const monthFerien = ferien.filter((f) => f.von <= monthEnd && f.bis >= monthStart);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
            <Umbrella className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Ferienplanung
            </h1>
            <p className="text-sm text-muted-foreground">Urlaub, Krankmeldungen und freie Tage</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} style={{ background: "#e8620a" }} className="text-white">
          <Plus className="h-4 w-4 mr-2" /> Neuer Eintrag
        </Button>
      </div>

      {/* Legende */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(TYP_LABELS).map(([typ, label]) => (
          <span key={typ} className={cn("px-3 py-1 rounded-full text-xs font-medium border", TYP_FARBEN[typ])}>
            {label}
          </span>
        ))}
      </div>

      {/* Monatsnavigation */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {monthName}
          </h2>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 font-semibold border-b w-40 min-w-40">Mitarbeiter</th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const d = new Date(year, month, day);
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <th key={day} className={cn("p-1 text-center font-medium border-b min-w-[28px]", isWeekend && "bg-muted/50 text-muted-foreground")}>
                        {day}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.length === 0 ? (
                  <tr><td colSpan={daysInMonth + 1} className="text-center py-6 text-muted-foreground">Keine Mitarbeiter erfasst.</td></tr>
                ) : (
                  mitarbeiter.map((ma) => {
                    const maFerien = monthFerien.filter((f) => f.mitarbeiter_id === ma.id);
                    return (
                      <tr key={ma.id} className="border-b hover:bg-muted/20">
                        <td className="p-2 font-medium truncate max-w-[160px]">{ma.vorname} {ma.nachname}</td>
                        {Array.from({ length: daysInMonth }, (_, i) => {
                          const day = i + 1;
                          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          const match = maFerien.find((f) => dateInRange(dateStr, f.von, f.bis));
                          const d = new Date(year, month, day);
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <td key={day} className={cn("p-0.5 text-center border-l", isWeekend && "bg-muted/30")}>
                              {match && (
                                <div
                                  className={cn("rounded text-[9px] px-0.5 py-0.5 font-medium", TYP_FARBEN[match.typ] || "bg-gray-100 text-gray-700")}
                                  title={TYP_LABELS[match.typ] || match.typ}
                                >
                                  {(TYP_LABELS[match.typ] || match.typ).slice(0, 1)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Eintragliste */}
      <Card className="p-5">
        <h3 className="font-semibold mb-3 text-sm">Alle Einträge ({ferien.length})</h3>
        {ferien.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Noch keine Einträge.</p>
        ) : (
          <div className="space-y-2">
            {ferien.map((f) => {
              const name = f.mitarbeiter
                ? `${f.mitarbeiter.vorname} ${f.mitarbeiter.nachname}`
                : getMitarbeiterName(f.mitarbeiter_id);
              return (
                <div key={f.id} className="flex items-center gap-3 p-2 rounded border">
                  <Badge variant="outline" className={cn("text-xs", TYP_FARBEN[f.typ] || "")}>
                    {TYP_LABELS[f.typ] || f.typ}
                  </Badge>
                  <span className="font-medium text-sm">{name}</span>
                  <span className="text-xs text-muted-foreground">{f.von} bis {f.bis}</span>
                  {f.notiz && <span className="text-xs text-muted-foreground italic">· {f.notiz}</span>}
                  <button
                    onClick={() => delMut.mutate(f.id)}
                    className="ml-auto p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Neuer Ferieneintrag</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Mitarbeiter</Label>
              <Select value={form.mitarbeiter_id} onValueChange={(v) => setForm((f) => ({ ...f, mitarbeiter_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Mitarbeiter wählen…" /></SelectTrigger>
                <SelectContent>
                  {mitarbeiter.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Von</Label>
                <Input type="date" value={form.von} onChange={(e) => setForm((f) => ({ ...f, von: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Bis</Label>
                <Input type="date" value={form.bis} onChange={(e) => setForm((f) => ({ ...f, bis: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={form.typ} onValueChange={(v) => setForm((f) => ({ ...f, typ: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ferien">Ferien</SelectItem>
                  <SelectItem value="krank">Krank</SelectItem>
                  <SelectItem value="frei">Frei</SelectItem>
                  <SelectItem value="militaer">Militär</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notiz (optional)</Label>
              <Input value={form.notiz} onChange={(e) => setForm((f) => ({ ...f, notiz: e.target.value }))} placeholder="Bemerkung…" />
            </div>
            <Button
              className="w-full text-white"
              style={{ background: "#e8620a" }}
              onClick={() => addMut.mutate()}
              disabled={!form.mitarbeiter_id || !form.von || !form.bis || addMut.isPending}
            >
              <Plus className="h-4 w-4 mr-2" /> Eintrag speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
