import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CalendarCheck, ChevronLeft, ChevronRight, Users, Pencil, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Auftrag } from "@shared/schema";

interface Termin {
  id: string;
  titel: string;
  datum_von: string;
  datum_bis: string;
  typ: string;
  farbe: string;
  mitarbeiter_ids: string[];
  auftrag_id?: string;
}

interface Mitarbeiter { id: string; vorname: string; nachname: string; }

const TYP_COLOR: Record<string, string> = {
  termin: "#3b82f6",
  auftrag: "#e8620a",
  intern: "#6b7280",
  urlaub: "#22c55e",
  krank: "#ef4444",
};

const TYP_OPTIONS = [
  { value: "termin", label: "Termin" },
  { value: "auftrag", label: "Auftrag" },
  { value: "intern", label: "Intern" },
  { value: "urlaub", label: "Urlaub" },
  { value: "krank", label: "Krank" },
];

const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const WEEKDAYS = ["Mo","Di","Mi","Do","Fr","Sa","So"];

function toDatetimeLocal(dateStr: string): string {
  if (!dateStr) return "";
  // if it already has T, return as-is (trim seconds)
  if (dateStr.includes("T")) return dateStr.slice(0, 16);
  return dateStr;
}

function toISOString(val: string): string {
  if (!val) return "";
  // datetime-local gives "YYYY-MM-DDTHH:mm", store as ISO
  return val.length === 16 ? val + ":00" : val;
}

interface CreateForm {
  titel: string;
  datum_von: string;
  datum_bis: string;
  typ: string;
  mitarbeiter_ids: string[];
}

interface EditForm {
  titel: string;
  datum_von: string;
  datum_bis: string;
  typ: string;
  mitarbeiter_ids: string[];
}

export default function Kalender() {
  const now = new Date();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    titel: "",
    datum_von: "",
    datum_bis: "",
    typ: "termin",
    mitarbeiter_ids: [],
  });

  // Edit dialog state
  const [editTermin, setEditTermin] = useState<Termin | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    titel: "",
    datum_von: "",
    datum_bis: "",
    typ: "termin",
    mitarbeiter_ids: [],
  });

  const { data: termine = [] } = useQuery<Termin[]>({
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

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: Omit<CreateForm, "mitarbeiter_ids"> & { mitarbeiter_ids: string[] }) =>
      apiRequest("POST", "/api/termine", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/termine"] });
      toast({ title: "✅ Termin erstellt" });
      setShowCreate(false);
    },
    onError: () => toast({ title: "Fehler beim Erstellen", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: EditForm & { id: string }) =>
      apiRequest("PATCH", `/api/termine/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/termine"] });
      toast({ title: "✅ Termin gespeichert" });
      setEditTermin(null);
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/termine/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/termine"] });
      toast({ title: "Termin gelöscht" });
      setEditTermin(null);
    },
    onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
  });

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const getTermineForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return termine.filter((t) => {
      const von = (t.datum_von ?? '').slice(0, 10);
      const bis = (t.datum_bis ?? '').slice(0, 10);
      return von <= dateStr && dateStr <= bis;
    });
  };

  const getMaName = (id: string) => {
    const m = mitarbeiter.find((m) => m.id === id);
    return m ? `${m.vorname} ${m.nachname}` : id;
  };

  const getAuftragTitel = (id?: string) => {
    if (!id) return null;
    const a = auftraege.find((a) => a.id === id);
    return a ? `${a.nr} — ${a.titel}` : null;
  };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const selectedDateStr = selectedDay ? `${year}-${String(month+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}` : null;
  const selectedTermine = selectedDay ? getTermineForDay(parseInt(selectedDay)) : [];

  // Open create dialog for a specific day
  const openCreate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setCreateForm({
      titel: "",
      datum_von: `${dateStr}T08:00`,
      datum_bis: `${dateStr}T09:00`,
      typ: "termin",
      mitarbeiter_ids: [],
    });
    setShowCreate(true);
  };

  // Open edit dialog
  const openEdit = (t: Termin, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTermin(t);
    setEditForm({
      titel: t.titel,
      datum_von: toDatetimeLocal(t.datum_von),
      datum_bis: toDatetimeLocal(t.datum_bis),
      typ: t.typ,
      mitarbeiter_ids: t.mitarbeiter_ids ?? [],
    });
  };

  const handleCreate = () => {
    if (!createForm.titel.trim()) {
      toast({ title: "Titel ist erforderlich", variant: "destructive" });
      return;
    }
    createMut.mutate({
      ...createForm,
      datum_von: toISOString(createForm.datum_von),
      datum_bis: toISOString(createForm.datum_bis),
    });
  };

  const handleUpdate = () => {
    if (!editTermin) return;
    if (!editForm.titel.trim()) {
      toast({ title: "Titel ist erforderlich", variant: "destructive" });
      return;
    }
    updateMut.mutate({
      id: editTermin.id,
      ...editForm,
      datum_von: toISOString(editForm.datum_von),
      datum_bis: toISOString(editForm.datum_bis),
    });
  };

  const handleDelete = () => {
    if (!editTermin) return;
    if (!window.confirm(`Termin "${editTermin.titel}" wirklich löschen?`)) return;
    deleteMut.mutate(editTermin.id);
  };

  const toggleMitarbeiter = (id: string, form: CreateForm | EditForm, setForm: (f: any) => void) => {
    const ids = form.mitarbeiter_ids.includes(id)
      ? form.mitarbeiter_ids.filter((x) => x !== id)
      : [...form.mitarbeiter_ids, id];
    setForm({ ...form, mitarbeiter_ids: ids });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
            <CalendarCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Kalender</h1>
            <p className="text-sm text-muted-foreground">Terminübersicht aller Mitarbeiter</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          onClick={() => {
            const dateStr = todayStr;
            setCreateForm({
              titel: "",
              datum_von: `${dateStr}T08:00`,
              datum_bis: `${dateStr}T09:00`,
              typ: "termin",
              mitarbeiter_ids: [],
            });
            setShowCreate(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Termin erstellen
        </Button>
      </div>

      {/* Month Navigation */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-3 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold">{MONTHS[month]} {year}</h2>
          <button
            onClick={nextMonth}
            className="p-3 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} className="h-16 md:h-20" />;
            const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayTermine = getTermineForDay(day);
            const isToday = dateStr === todayStr;
            const isSelected = String(day) === selectedDay;
            const isWeekend = ((startDow + (day - 1)) % 7) >= 5;

            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedDay(isSelected ? null : String(day));
                }}
                onDoubleClick={() => openCreate(day)}
                className={cn(
                  "h-16 md:h-20 p-1 rounded-md border text-left flex flex-col transition-colors relative group",
                  isSelected ? "border-[#e8620a] bg-orange-50" : isToday ? "border-[#1a3a6b] bg-blue-50" : "border-transparent hover:bg-muted",
                  isWeekend && "bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full",
                    isToday ? "bg-[#1a3a6b] text-white" : "text-foreground"
                  )}>
                    {day}
                  </span>
                  {/* + button to create termin on this day */}
                  <button
                    onClick={(e) => { e.stopPropagation(); openCreate(day); }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-4 h-4 rounded flex items-center justify-center hover:bg-primary/10 transition-opacity"
                    title="Termin erstellen"
                    aria-label={`Termin am ${day}. erstellen`}
                  >
                    <Plus className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                  {dayTermine.slice(0, 2).map((t) => (
                    <button
                      key={t.id}
                      onClick={(e) => openEdit(t, e)}
                      className="text-white text-[10px] px-1 rounded truncate leading-tight hover:brightness-90 transition-all text-left"
                      style={{ background: TYP_COLOR[t.typ] || t.farbe }}
                      title={t.titel}
                    >
                      {t.titel}
                    </button>
                  ))}
                  {dayTermine.length > 2 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{dayTermine.length - 2}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">Auf Tag klicken zum Auswählen · + Symbol oder Doppelklick für neuen Termin · Auf Termin klicken zum Bearbeiten</p>
      </Card>

      {/* Selected Day Detail */}
      {selectedDay && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {parseInt(selectedDay)}. {MONTHS[month]} {year}
              {selectedTermine.length === 0 && <span className="text-muted-foreground font-normal ml-2">— Keine Termine</span>}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => openCreate(parseInt(selectedDay))}
            >
              <Plus className="h-4 w-4 mr-1" /> Termin
            </Button>
          </div>
          {selectedTermine.map((t) => (
            <div key={t.id} className="flex gap-3 items-start">
              <div className="w-1 mt-1 rounded-full self-stretch shrink-0" style={{ background: TYP_COLOR[t.typ] || t.farbe, minWidth: 4 }} />
              <div className="space-y-0.5 flex-1">
                <p className="text-sm font-medium">{t.titel}</p>
                <p className="text-xs text-muted-foreground">
                  {(t.datum_von ?? '').slice(11, 16)} – {(t.datum_bis ?? '').slice(11, 16)}
                </p>
                {t.auftrag_id && getAuftragTitel(t.auftrag_id) && (
                  <p className="text-xs text-blue-600">{getAuftragTitel(t.auftrag_id)}</p>
                )}
                {t.mitarbeiter_ids?.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />{t.mitarbeiter_ids.map(getMaName).join(", ")}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 shrink-0"
                onClick={(e) => openEdit(t, e)}
                title="Bearbeiten"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* Upcoming Termine */}
      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold">Nächste Termine</p>
        {termine
          .filter((t) => (t.datum_von ?? '') >= todayStr)
          .sort((a, b) => (a.datum_von ?? '').localeCompare(b.datum_von ?? ''))
          .slice(0, 5)
          .map((t) => (
            <div key={t.id} className="flex items-center gap-3 text-sm border-b pb-2 last:border-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TYP_COLOR[t.typ] || t.farbe }} />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{t.titel}</span>
                {t.auftrag_id && getAuftragTitel(t.auftrag_id) && (
                  <span className="text-xs text-muted-foreground ml-2">{getAuftragTitel(t.auftrag_id)}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {(t.datum_von ?? '').slice(0, 10)} {(t.datum_von ?? '').slice(11, 16)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                onClick={(e) => openEdit(t, e)}
                title="Bearbeiten"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        {termine.filter((t) => (t.datum_von ?? '') >= todayStr).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Keine kommenden Termine.</p>
        )}
      </Card>

      {/* ── Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-full max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Neuer Termin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="create-titel">Titel *</Label>
              <Input
                id="create-titel"
                placeholder="Terminbezeichnung"
                value={createForm.titel}
                onChange={(e) => setCreateForm({ ...createForm, titel: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="create-von">Startzeit</Label>
                <Input
                  id="create-von"
                  type="datetime-local"
                  value={createForm.datum_von}
                  onChange={(e) => setCreateForm({ ...createForm, datum_von: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="create-bis">Endzeit</Label>
                <Input
                  id="create-bis"
                  type="datetime-local"
                  value={createForm.datum_bis}
                  onChange={(e) => setCreateForm({ ...createForm, datum_bis: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-typ">Typ / Farbe</Label>
              <select
                id="create-typ"
                value={createForm.typ}
                onChange={(e) => setCreateForm({ ...createForm, typ: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background min-h-[44px]"
              >
                {TYP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {mitarbeiter.length > 0 && (
              <div className="space-y-1">
                <Label>Mitarbeiter (optional)</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {mitarbeiter.map((ma) => (
                    <button
                      key={ma.id}
                      type="button"
                      onClick={() => toggleMitarbeiter(ma.id, createForm, setCreateForm)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px]",
                        createForm.mitarbeiter_ids.includes(ma.id)
                          ? "bg-[#1a3a6b] text-white border-[#1a3a6b]"
                          : "bg-background border-input hover:bg-muted"
                      )}
                    >
                      {ma.vorname} {ma.nachname}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="min-h-[44px] w-full sm:w-auto" onClick={() => setShowCreate(false)}>
              Abbrechen
            </Button>
            <Button
              className="min-h-[44px] w-full sm:w-auto"
              style={{ background: "#1a3a6b" }}
              onClick={handleCreate}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTermin} onOpenChange={(open) => { if (!open) setEditTermin(null); }}>
        <DialogContent className="w-full max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Termin bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="edit-titel">Titel *</Label>
              <Input
                id="edit-titel"
                placeholder="Terminbezeichnung"
                value={editForm.titel}
                onChange={(e) => setEditForm({ ...editForm, titel: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-von">Startzeit</Label>
                <Input
                  id="edit-von"
                  type="datetime-local"
                  value={editForm.datum_von}
                  onChange={(e) => setEditForm({ ...editForm, datum_von: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-bis">Endzeit</Label>
                <Input
                  id="edit-bis"
                  type="datetime-local"
                  value={editForm.datum_bis}
                  onChange={(e) => setEditForm({ ...editForm, datum_bis: e.target.value })}
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-typ">Typ / Farbe</Label>
              <select
                id="edit-typ"
                value={editForm.typ}
                onChange={(e) => setEditForm({ ...editForm, typ: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background min-h-[44px]"
              >
                {TYP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {mitarbeiter.length > 0 && (
              <div className="space-y-1">
                <Label>Mitarbeiter (optional)</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {mitarbeiter.map((ma) => (
                    <button
                      key={ma.id}
                      type="button"
                      onClick={() => toggleMitarbeiter(ma.id, editForm, setEditForm)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px]",
                        editForm.mitarbeiter_ids.includes(ma.id)
                          ? "bg-[#1a3a6b] text-white border-[#1a3a6b]"
                          : "bg-background border-input hover:bg-muted"
                      )}
                    >
                      {ma.vorname} {ma.nachname}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              className="min-h-[44px] w-full sm:w-auto"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleteMut.isPending ? "Löschen…" : "Löschen"}
            </Button>
            <div className="flex gap-2 flex-1 sm:justify-end">
              <Button variant="outline" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => setEditTermin(null)}>
                Abbrechen
              </Button>
              <Button
                className="min-h-[44px] flex-1 sm:flex-none"
                style={{ background: "#1a3a6b" }}
                onClick={handleUpdate}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? "Speichern…" : "Speichern"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
