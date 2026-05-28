import { useState, useRef, useEffect } from "react";
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
import { FileSignature, Plus, Trash2, Pencil, CheckCircle2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Formular {
  id: string;
  auftrag_id?: string;
  typ: string;
  titel: string;
  inhalt: Record<string, string>;
  unterschrift_auftraggeber: string;
  unterschrift_mitarbeiter: string;
  status: string;
  erstellt: string;
}

const FORMULAR_TYPEN = [
  {
    value: "bautagebuch", label: "Bautagebuch",
    felder: [
      { key: "datum", label: "Datum", typ: "date" },
      { key: "wetter", label: "Wetter", typ: "text" },
      { key: "mitarbeiter_vor_ort", label: "Mitarbeiter vor Ort", typ: "text" },
      { key: "ausgefuehrte_arbeiten", label: "Ausgeführte Arbeiten", typ: "textarea" },
      { key: "besonderheiten", label: "Besonderheiten / Hindernisse", typ: "textarea" },
      { key: "material_verbraucht", label: "Verbrauchtes Material", typ: "textarea" },
    ],
  },
  {
    value: "aufmassprotokoll", label: "Aufmaßprotokoll",
    felder: [
      { key: "datum", label: "Datum", typ: "date" },
      { key: "objekt", label: "Objekt / Baustelle", typ: "text" },
      { key: "aufmass_positionen", label: "Aufmaß-Positionen (Beschreibung + Masse)", typ: "textarea" },
      { key: "bemerkungen", label: "Bemerkungen", typ: "textarea" },
    ],
  },
  {
    value: "abnahmeschein", label: "Abnahmeschein",
    felder: [
      { key: "datum", label: "Datum Abnahme", typ: "date" },
      { key: "ausgefuehrte_leistungen", label: "Ausgeführte Leistungen", typ: "textarea" },
      { key: "maengel", label: "Mängel / Vorbehalte", typ: "textarea" },
      { key: "abnahme_ergebnis", label: "Abnahmeergebnis", typ: "text" },
    ],
  },
  {
    value: "begehungsprotokoll", label: "Begehungsprotokoll",
    felder: [
      { key: "datum", label: "Datum", typ: "date" },
      { key: "teilnehmer", label: "Teilnehmer", typ: "text" },
      { key: "feststellungen", label: "Feststellungen", typ: "textarea" },
      { key: "massnahmen", label: "Vereinbarte Massnahmen", typ: "textarea" },
    ],
  },
  {
    value: "messprotokoll", label: "Messprotokoll",
    felder: [
      { key: "datum", label: "Datum", typ: "date" },
      { key: "messobjekt", label: "Messobjekt", typ: "text" },
      { key: "messwerte", label: "Messwerte", typ: "textarea" },
      { key: "fazit", label: "Fazit / Beurteilung", typ: "textarea" },
    ],
  },
  {
    value: "materialnachweis", label: "Materialnachweis",
    felder: [
      { key: "datum", label: "Datum", typ: "date" },
      { key: "material_liste", label: "Material-Liste (Bezeichnung, Menge, Einheit)", typ: "textarea" },
      { key: "lieferant", label: "Lieferant", typ: "text" },
      { key: "bemerkungen", label: "Bemerkungen", typ: "textarea" },
    ],
  },
];

const STATUS_COLOR: Record<string, string> = {
  entwurf: "bg-gray-100 text-gray-700",
  ausgefuellt: "bg-blue-100 text-blue-800",
  unterschrieben: "bg-green-100 text-green-800",
};

// ── Canvas-Unterschriften-Pad ────────────────────────────────────────────────

function UnterschriftPad({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value && value.startsWith("data:")) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    drawing.current = true;
    lastPos.current = getPos(e, canvas);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current || !lastPos.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a3a6b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
  }

  function stopDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    onChange(canvasRef.current!.toDataURL());
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <button type="button" onClick={clear} className="text-xs text-muted-foreground hover:text-destructive underline">Löschen</button>
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={150}
        className="w-full border rounded-md bg-white touch-none cursor-crosshair"
        style={{ touchAction: "none" }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {value && value.startsWith("data:") && (
        <p className="text-xs text-green-600">✓ Unterschrift gespeichert</p>
      )}
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export default function Formulare() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedAuftrag, setSelectedAuftrag] = useState("none");
  const [typ, setTyp] = useState("bautagebuch");
  const [felder, setFelder] = useState<Record<string, string>>({});
  const [unterschriftAG, setUnterschriftAG] = useState("");
  const [unterschriftMA, setUnterschriftMA] = useState("");
  const [filterTyp, setFilterTyp] = useState("alle");

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: formulare = [], isLoading } = useQuery<Formular[]>({
    queryKey: ["/api/formulare"],
    queryFn: () => apiRequest("GET", "/api/formulare").then((r) => r.json()),
  });

  const selectedTypDef = FORMULAR_TYPEN.find((t) => t.value === typ);

  const saveMutation = useMutation({
    mutationFn: () => {
      const isFilled = Object.values(felder).some((v) => v.trim());
      const hasSignature =
        (unterschriftAG && unterschriftAG.startsWith("data:")) ||
        (unterschriftMA && unterschriftMA.startsWith("data:"));
      const status = hasSignature ? "unterschrieben" : isFilled ? "ausgefuellt" : "entwurf";
      const payload = {
        auftrag_id: selectedAuftrag === "none" ? null : selectedAuftrag,
        typ,
        titel: `${selectedTypDef?.label || typ} — ${new Date().toLocaleDateString("de-CH")}`,
        inhalt: felder,
        unterschrift_auftraggeber: unterschriftAG,
        unterschrift_mitarbeiter: unterschriftMA,
        status,
      };
      if (editId) return apiRequest("PATCH", `/api/formulare/${editId}`, payload);
      return apiRequest("POST", "/api/formulare", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formulare"] });
      setOpen(false); setEditId(null); setFelder({}); setUnterschriftAG(""); setUnterschriftMA("");
      toast({ title: editId ? "Formular aktualisiert" : "Formular gespeichert" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/formulare/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/formulare"] }),
  });

  const openEdit = (f: Formular) => {
    setEditId(f.id);
    setTyp(f.typ);
    setSelectedAuftrag(f.auftrag_id || "none");
    setFelder(f.inhalt || {});
    setUnterschriftAG(f.unterschrift_auftraggeber || "");
    setUnterschriftMA(f.unterschrift_mitarbeiter || "");
    setOpen(true);
  };

  const getAuftragTitel = (id?: string) => {
    if (!id) return null;
    const a = auftraege.find((a) => a.id === id);
    return a ? `${a.nr} — ${a.titel}` : null;
  };

  const filtered = filterTyp === "alle" ? formulare : formulare.filter((f) => f.typ === filterTyp);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
            <FileSignature className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Formulare & Unterschriften</h1>
            <p className="text-sm text-muted-foreground">Bautagebuch, Abnahmeschein, Protokolle und mehr</p>
          </div>
        </div>
        <Button onClick={() => { setEditId(null); setFelder({}); setUnterschriftAG(""); setUnterschriftMA(""); setOpen(true); }} className="text-white" style={{ background: "#e8620a" }}>
          <Plus className="h-4 w-4 mr-2" /> Neues Formular
        </Button>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setFelder({}); setUnterschriftAG(""); setUnterschriftMA(""); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Formular bearbeiten" : "Neues Formular"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Formulartyp</Label>
                <Select value={typ} onValueChange={(v) => { setTyp(v); setFelder({}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMULAR_TYPEN.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Auftrag (optional)</Label>
                <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
                  <SelectTrigger><SelectValue placeholder="Kein Auftrag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Kein Auftrag —</SelectItem>
                    {auftraege.map((a) => <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dynamische Felder */}
            {selectedTypDef?.felder.map((feld) => (
              <div key={feld.key}>
                <Label className="text-xs">{feld.label}</Label>
                {feld.typ === "textarea" ? (
                  <textarea
                    value={felder[feld.key] || ""}
                    onChange={(e) => setFelder({ ...felder, [feld.key]: e.target.value })}
                    className="flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-1"
                    placeholder={feld.label}
                  />
                ) : (
                  <Input
                    type={feld.typ}
                    value={felder[feld.key] || ""}
                    onChange={(e) => setFelder({ ...felder, [feld.key]: e.target.value })}
                    placeholder={feld.label}
                  />
                )}
              </div>
            ))}

            {/* Unterschriften */}
            <div className="border-t pt-3 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unterschriften</p>
              <UnterschriftPad
                label="Unterschrift Auftraggeber"
                value={unterschriftAG}
                onChange={setUnterschriftAG}
              />
              <UnterschriftPad
                label="Unterschrift Mitarbeiter"
                value={unterschriftMA}
                onChange={setUnterschriftMA}
              />
            </div>

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full text-white"
              style={{ background: "#e8620a" }}
            >
              {editId ? "Aktualisieren" : "Formular speichern"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterTyp("alle")}
          className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",
            filterTyp === "alle" ? "bg-[#1a3a6b] text-white border-[#1a3a6b]" : "text-muted-foreground border-border")}
        >Alle</button>
        {FORMULAR_TYPEN.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilterTyp(t.value)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              filterTyp === t.value ? "bg-[#1a3a6b] text-white border-[#1a3a6b]" : "text-muted-foreground border-border")}
          >{t.label}</button>
        ))}
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Noch keine Formulare vorhanden.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const auftragTitel = getAuftragTitel(f.auftrag_id);
            const hasAGSig = f.unterschrift_auftraggeber && f.unterschrift_auftraggeber.startsWith("data:");
            const hasMASig = f.unterschrift_mitarbeiter && f.unterschrift_mitarbeiter.startsWith("data:");
            return (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{f.titel}</span>
                      <Badge variant="outline" className={cn("text-xs", STATUS_COLOR[f.status] || "")}>
                        {f.status === "entwurf" ? "Entwurf" : f.status === "ausgefuellt" ? "Ausgefüllt" : "Unterschrieben"}
                      </Badge>
                    </div>
                    {auftragTitel && <p className="text-xs text-blue-600">{auftragTitel}</p>}
                    {(hasAGSig || hasMASig) && (
                      <div className="flex items-center gap-3 flex-wrap mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Unterschriften vorhanden
                        </span>
                        {hasAGSig && (
                          <img
                            src={f.unterschrift_auftraggeber}
                            alt="Unterschrift Auftraggeber"
                            className="max-h-10 border rounded bg-white"
                            title="Unterschrift Auftraggeber"
                          />
                        )}
                        {hasMASig && (
                          <img
                            src={f.unterschrift_mitarbeiter}
                            alt="Unterschrift Mitarbeiter"
                            className="max-h-10 border rounded bg-white"
                            title="Unterschrift Mitarbeiter"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => delMutation.mutate(f.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
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
