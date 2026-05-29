import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Upload,
  Download,
  Plus,
  Trash,
  FileText,
  Printer,
  Check,
  Clock,
  Send,
  Eye,
  ArrowRightLeft,
  MapPin,
  Cpu,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Calculator,
  MessageCircle,
  ShieldCheck,
  Truck,
  FileCheck,
  Package,
  AlertTriangle,
  Link2,
  Link2Off,
  Copy,
  AlertCircle,
  CheckCircle2,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type {
  Auftrag,
  VerlaufEintrag,
  Notiz,
  Dokument,
  Status,
  Rechnung,
  RechnungsPosition,
  Zeiteintrag,
  Offerte,
  OffertePosition,
} from "@shared/schema";
import { STATUS_LABEL, STATUS_ORDER } from "@shared/schema";
import { STATUS_BADGE, PRIO_BADGE, formatCHF, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface DetailData extends Auftrag {
  verlauf: VerlaufEintrag[];
  notizen: Notiz[];
  dokumente: Dokument[];
}

interface Props {
  id: string;
}

function StatusPipeline({
  current,
  onChange,
  disabled,
}: {
  current: Status;
  onChange: (s: Status) => void;
  disabled?: boolean;
}) {
  const currentIdx = STATUS_ORDER.indexOf(current);
  const isCancelled = current === "storniert";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_ORDER.map((s, i) => {
          const done = currentIdx >= i && !isCancelled;
          const active = currentIdx === i && !isCancelled;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onChange(s)}
              className={cn(
                "min-w-[90px] flex-1 px-3 py-2 text-xs font-medium rounded-md border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : done
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
              )}
              data-testid={`pipeline-${s}`}
            >
              <div className="flex items-center gap-1.5 justify-center">
                {done && <Check className="h-3 w-3" />}
                <span className="text-[10px] opacity-70">{i + 1}.</span>
                <span className="truncate">{STATUS_LABEL[s]}</span>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("storniert")}
        className={cn(
          "self-start text-xs px-3 py-1.5 rounded-md border transition-colors",
          isCancelled
            ? "bg-destructive text-destructive-foreground border-destructive"
            : "text-destructive border-destructive/30 hover:bg-destructive/10"
        )}
        data-testid="pipeline-storniert"
      >
        Storniert
      </button>
    </div>
  );
}

function NotizenTab({ id, notizen }: { id: string; notizen: Notiz[] }) {
  const [text, setText] = useState("");
  const { toast } = useToast();

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/auftraege/${id}/notizen`, { text });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
      setText("");
      toast({ title: "Notiz hinzugefügt" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: async (nid: string) => {
      await apiRequest("DELETE", `/api/auftraege/${id}/notizen/${nid}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
      toast({ title: "Notiz gelöscht" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Textarea
          data-testid="input-notiz"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Neue Notiz…"
          rows={3}
        />
        <Button
          data-testid="button-add-notiz"
          onClick={() => text.trim() && addMut.mutate()}
          disabled={!text.trim() || addMut.isPending}
          className="self-end bg-secondary hover:bg-secondary/90 text-white"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          Notiz speichern
        </Button>
      </div>
      <div className="space-y-3">
        {notizen.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Noch keine Notizen.
          </div>
        ) : (
          notizen.map((n) => (
            <div
              key={n.id}
              className="p-3 rounded border bg-muted/30"
              data-testid={`notiz-${n.id}`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(n.datum)}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => delMut.mutate(n.id)}
                >
                  <Trash className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap mt-1">{n.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DokumenteTab({ id, dokumente }: { id: string; dokumente: Dokument[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kat, setKat] = useState("Plan/Zeichnung");
  const [beschreibung, setBeschreibung] = useState("");
  const { toast } = useToast();

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kat", kat);
      fd.append("beschreibung", beschreibung);
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const r = await fetch(`${API_BASE}/api/auftraege/${id}/dokumente`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
      if (fileRef.current) fileRef.current.value = "";
      setBeschreibung("");
      toast({ title: "Datei hochgeladen" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler beim Upload", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async (did: string) => {
      await apiRequest("DELETE", `/api/auftraege/${id}/dokumente/${did}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
      toast({ title: "Datei gelöscht" });
    },
  });

  const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-muted/20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Kategorie</Label>
            <Select value={kat} onValueChange={setKat}>
              <SelectTrigger className="mt-1" data-testid="select-doc-kat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Plan/Zeichnung">Plan/Zeichnung</SelectItem>
                <SelectItem value="Angebot">Angebot</SelectItem>
                <SelectItem value="Rechnung">Rechnung</SelectItem>
                <SelectItem value="Foto">Foto</SelectItem>
                <SelectItem value="Sonstiges">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Beschreibung (optional)</Label>
            <Input
              data-testid="input-doc-beschreibung"
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.step,.stp,.xlsx,.zip,application/pdf,image/*"
            data-testid="input-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
            }}
            className="text-sm flex-1"
          />
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        {uploadMut.isPending && (
          <p className="text-xs text-muted-foreground mt-2">Lädt hoch…</p>
        )}
      </Card>

      <div className="space-y-2">
        {dokumente.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Noch keine Dokumente hochgeladen.
          </div>
        ) : (
          dokumente.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 p-3 rounded border bg-card"
              data-testid={`doc-${d.id}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.kat} · {(d.size_bytes / 1024).toFixed(1)} KB · {formatDate(d.datum)}
                  </div>
                  {d.beschreibung && (
                    <div className="text-xs text-muted-foreground mt-0.5">{d.beschreibung}</div>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <a
                  href={`${API_BASE}/api/auftraege/${id}/dokumente/${d.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="icon" variant="ghost" data-testid={`button-download-${d.id}`}>
                    <Download className="h-4 w-4" />
                  </Button>
                </a>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid={`button-delete-doc-${d.id}`}
                  onClick={() => delMut.mutate(d.id)}
                >
                  <Trash className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function rechnungZahlungsBadge(r: Rechnung) {
  if (r.bezahlt_am) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> Bezahlt {r.bezahlt_am}
      </span>
    );
  }
  if (!r.faellig_datum) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border">Offen</span>
  );
  const faellig = new Date(r.faellig_datum);
  const heute = new Date(); heute.setHours(0,0,0,0);
  if (faellig < heute) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
      <AlertCircle className="w-3 h-3" /> Überfällig
    </span>
  );
  const diffDays = Math.ceil((faellig.getTime() - heute.getTime()) / (1000*60*60*24));
  if (diffDays <= 7) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3" /> Fällig in {diffDays}d
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
      <Clock className="w-3 h-3" /> Fällig {formatDate(r.faellig_datum!)}
    </span>
  );
}

function RechnungenTab({
  id,
  auftrag,
}: {
  id: string;
  auftrag: Auftrag;
}) {
  const [positionen, setPositionen] = useState<RechnungsPosition[]>([
    { beschreibung: "", menge: 1, einzelpreis: 0, betrag: 0 },
  ]);
  const [faellig, setFaellig] = useState("");
  const [notiz, setNotiz] = useState("");
  const { toast } = useToast();

  const { data: rechnungen = [] } = useQuery<Rechnung[]>({
    queryKey: ["/api/auftraege", id, "rechnungen"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/auftraege/${id}/rechnungen`);
      return r.json();
    },
  });

  const bezahltMut = useMutation({
    mutationFn: async ({ rid, bezahlt_am }: { rid: string; bezahlt_am: string | null }) => {
      const r = await apiRequest("PATCH", `/api/rechnungen/${rid}`, { bezahlt_am });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "rechnungen"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rechnungen"] });
      toast({ title: "Zahlungsstatus aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const total = positionen.reduce(
    (s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0),
    0
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/auftraege/${id}/rechnungen`, {
        positionen: positionen.map((p) => ({
          ...p,
          betrag: Number(p.menge) * Number(p.einzelpreis),
        })),
        notiz,
        faellig_datum: faellig || null,
        waehrung: auftrag.waehrung || "CHF",
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "rechnungen"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rechnungen"] }); // Sync globale Rechnungsliste
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] }); // Sync Dashboard
      setPositionen([{ beschreibung: "", menge: 1, einzelpreis: 0, betrag: 0 }]);
      setFaellig("");
      setNotiz("");
      toast({ title: "Rechnung erstellt", description: "Rechnung wurde gespeichert und ist in der Rechnungsübersicht sichtbar." });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updatePos = (i: number, field: keyof RechnungsPosition, value: any) => {
    setPositionen((arr) => {
      const next = [...arr];
      (next[i] as any)[field] = field === "beschreibung" ? value : Number(value) || 0;
      next[i].betrag = (Number(next[i].menge) || 0) * (Number(next[i].einzelpreis) || 0);
      return next;
    });
  };

  const downloadPdf = async (rid: string, nr: string) => {
    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    try {
      const r = await fetch(`${API_BASE}/api/auftraege/${id}/rechnungen/${rid}/pdf`, {
        method: "POST",
      });
      if (r.status === 400) {
        // Keine PDF-Vorlage hinterlegt
        const body = await r.json().catch(() => ({ message: "Keine PDF-Vorlage" }));
        toast({
          title: "PDF-Vorlage fehlt",
          description: body.message,
          variant: "destructive",
        });
        return;
      }
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "PDF erstellt", description: `Rechnung ${nr} — im Browser-Tab geöffnet` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="font-semibold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Neue Rechnung
        </h3>


        <div className="space-y-3">
          {positionen.map((p, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2 bg-white dark:bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#6b4c2a]">Pos. {i + 1}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
                  onClick={() => setPositionen((arr) => arr.filter((_, j) => j !== i))}
                  disabled={positionen.length === 1}>
                  <Trash className="w-3 h-3" />
                </Button>
              </div>
              <div>
                <Label className="text-xs">Beschreibung (Titel + Details)</Label>
                <Textarea
                  value={p.beschreibung}
                  onChange={(e) => updatePos(i, "beschreibung", e.target.value)}
                  placeholder={"Erste Zeile = Titel (fett im PDF)\nWeitere Zeilen = Unterpunkte\nz.B.:\nHauseingangstüre\nWärme gedämmt\nEinbruchsklasse RC2"}
                  rows={4}
                  className="text-sm font-mono mt-1"
                  data-testid={`input-pos-beschreibung-${i}`}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">↵ Enter = neue Zeile wird als Unterpunkt im PDF dargestellt</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Menge</Label>
                  <Input type="number" step="0.01" value={p.menge}
                    onChange={(e) => updatePos(i, "menge", e.target.value)}
                    data-testid={`input-pos-menge-${i}`} />
                </div>
                <div>
                  <Label className="text-xs">Einzelpreis CHF</Label>
                  <Input type="number" step="0.01" value={p.einzelpreis}
                    onChange={(e) => updatePos(i, "einzelpreis", e.target.value)}
                    data-testid={`input-pos-preis-${i}`} />
                </div>
                <div>
                  <Label className="text-xs">Betrag CHF</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm font-semibold">
                    {(p.menge * p.einzelpreis).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="button-add-pos"
            onClick={() =>
              setPositionen((arr) => [
                ...arr,
                { beschreibung: "", menge: 1, einzelpreis: 0, betrag: 0 },
              ])
            }
          >
            <Plus className="h-3 w-3 mr-1" /> Position hinzufügen
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div>
            <Label>Fälligkeitsdatum</Label>
            <Input
              type="date"
              value={faellig}
              onChange={(e) => setFaellig(e.target.value)}
              className="mt-1"
              data-testid="input-faellig"
            />
          </div>
          <div className="text-right md:pt-6">
            <div className="text-xs text-muted-foreground">Gesamtbetrag</div>
            <div
              className="text-xl font-bold tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatCHF(total, auftrag.waehrung)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Label>Notiz</Label>
          <Textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            rows={2}
            className="mt-1"
            data-testid="input-notiz-rechnung"
          />
        </div>

        <div className="flex justify-end mt-4">
          <Button
            data-testid="button-create-rechnung"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || total <= 0}
            className="bg-secondary hover:bg-secondary/90 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Rechnung speichern
          </Button>
        </div>
      </Card>

      <div>
        <h3 className="font-semibold mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Gespeicherte Rechnungen
        </h3>
        {!rechnungen || rechnungen.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Noch keine Rechnungen für diesen Auftrag.
          </div>
        ) : (
          <div className="space-y-2">
            {rechnungen.map((r) => (
              <div
                key={r.id}
                className={`rounded border bg-card p-3 space-y-2 ${r.bezahlt_am ? "opacity-75" : ""}`}
                data-testid={`rechnung-${r.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{r.nr}</span>
                      {rechnungZahlungsBadge(r)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(r.erstellt)}
                      {r.faellig_datum && ` · fällig ${formatDate(r.faellig_datum)}`} ·{" "}
                      {Array.isArray(r.positionen) ? r.positionen.length : 0} Pos.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold tabular-nums ${r.bezahlt_am ? "text-green-700 line-through" : ""}`}>
                      {formatCHF(r.betrag, r.waehrung)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`button-pdf-${r.id}`}
                    onClick={() => downloadPdf(r.id, r.nr)}
                    className="h-7 text-xs"
                  >
                    <Printer className="h-3 w-3 mr-1" />
                    PDF
                  </Button>
                  {r.bezahlt_am ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => bezahltMut.mutate({ rid: r.id, bezahlt_am: null })}
                      disabled={bezahltMut.isPending}
                      data-testid={`button-unbezahlt-${r.id}`}
                    >
                      Als offen markieren
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => bezahltMut.mutate({ rid: r.id, bezahlt_am: new Date().toISOString().slice(0,10) })}
                      disabled={bezahltMut.isPending}
                      data-testid={`button-bezahlt-${r.id}`}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Als bezahlt markieren
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Zeiterfassung Tab ───────────────────────────────────────────────────────

// ─── Offerten Tab ──────────────────────────────────────────────────────────────
function OffertenTab({ id, auftrag }: { id: string; auftrag: Auftrag }) {
  const { toast } = useToast();
  const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

  // Form state
  const [ansprechpartner, setAnsprechpartner] = useState(auftrag.verantwortlicher || "");
  const [telefon, setTelefon] = useState(auftrag.kunde_telefon || "");
  const [email, setEmail] = useState(auftrag.kunde_email || "");
  const [anrede, setAnrede] = useState("Herr");
  const [empfaengerName, setEmpfaengerName] = useState(auftrag.kunde || "");
  // Adresse aufsplitten: Strasse / PLZ Ort
  const _initAdr = (() => {
    const raw = auftrag.kunde_adresse || "";
    if (!raw) return { str: "", plz: "" };
    const lines = raw.split(/\n|\r/).map((l: string) => l.trim()).filter(Boolean);
    if (lines.length >= 2) return { str: lines.slice(0, -1).join(", "), plz: lines[lines.length - 1] };
    const m = raw.match(/^(.+?)\s+(\d{4,5}\s+.+)$/);
    if (m) return { str: m[1].trim(), plz: m[2].trim() };
    return { str: raw, plz: "" };
  })();
  const [empfaengerStr, setEmpfaengerStr] = useState(_initAdr.str);
  const [empfaengerPlz, setEmpfaengerPlz] = useState(_initAdr.plz);
  const [projektBeschr, setProjektBeschr] = useState(auftrag.titel || "");
  const [introText, setIntroText] = useState("Wir danken für Ihre Anfrage und erlauben uns, Ihnen für die beschriebenen Arbeiten folgende Offerte zu unterbreiten.");
  const [liefertermin, setLiefertermin] = useState("nach Absprache");
  const [zahlungsbed, setZahlungsbed] = useState("30 Tage netto");
  const [gueltigkeit, setGueltigkeit] = useState("60 Tage");
  const [schlussText, setSchlussText] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [rabatt, setRabatt] = useState(0);
  const [positionen, setPositionen] = useState<OffertePosition[]>([
    { nr: 1, titel: "", beschreibung: "", menge: 1, einheit: "Stk.", einzelpreis: 0, total: 0 },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const { data: offerten = [], isLoading } = useQuery<Offerte[]>({
    queryKey: ["/api/auftraege", id, "offerten"],
    queryFn: () => apiRequest("GET", `/api/auftraege/${id}/offerten`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/auftraege/${id}/offerten`, {
      ansprechpartner, telefon, email, anrede,
      empfaenger_name: empfaengerName,
      empfaenger_strasse: empfaengerStr,
      empfaenger_plz_ort: empfaengerPlz,
      projekt_beschreibung: projektBeschr,
      intro_text: introText,
      positionen,
      rabatt_prozent: rabatt,
      mwst_prozent: 8.1,
      liefertermin, zahlungsbedingungen: zahlungsbed,
      gueltigkeit, schluss_text: schlussText, datum,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "offerten"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offerten"] });
      setShowForm(false);
      toast({ title: "Offerte erstellt ✓" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (oid: string) => apiRequest("DELETE", `/api/offerten/${oid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "offerten"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offerten"] });
      toast({ title: "Offerte gelöscht" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ oid, status }: { oid: string; status: string }) =>
      apiRequest("PATCH", `/api/offerten/${oid}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "offerten"] }),
  });

  const [converting, setConverting] = useState<string | null>(null);
  const zuRechnungMutation = useMutation({
    mutationFn: (oid: string) => apiRequest("POST", `/api/offerten/${oid}/zu-rechnung`),
    onSuccess: (_, oid) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "offerten"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "rechnungen"] });
      setConverting(null);
      toast({ title: "Rechnung erstellt ✓", description: "Offerte wurde als Rechnung übernommen. Sichtbar im Rechnung-Tab." });
    },
    onError: (e: any) => {
      setConverting(null);
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const handlePdf = async (oid: string, nr: string) => {
    setPdfLoading(oid);
    try {
      const r = await fetch(`${API_BASE}/api/offerten/${oid}/pdf`, { method: "POST" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "PDF erstellt", description: `Offerte ${nr} — im Browser-Tab geöffnet` });
    } catch (e: any) {
      toast({ title: "PDF Fehler", description: e.message, variant: "destructive" });
    } finally { setPdfLoading(null); }
  };

  const updatePos = (i: number, field: keyof OffertePosition, value: any) => {
    setPositionen(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === "menge" || field === "einzelpreis") {
        next[i].total = Number(next[i].menge) * Number(next[i].einzelpreis);
      }
      return next;
    });
  };

  const addPos = () => setPositionen(prev => [
    ...prev,
    { nr: prev.length + 1, titel: "", beschreibung: "", menge: 1, einheit: "Stk.", einzelpreis: 0, total: 0 },
  ]);

  const removePos = (i: number) => setPositionen(prev => prev.filter((_, idx) => idx !== i));

  const zwischentotal = positionen.reduce((s, p) => s + Number(p.total || 0), 0);
  const rabattBetrag  = zwischentotal * (rabatt / 100);
  const totalExkl     = zwischentotal - rabattBetrag;
  const mwstBetrag    = totalExkl * 0.081;
  const totalInkl     = totalExkl + mwstBetrag;
  const fmtCHF        = (v: number) => `CHF ${v.toFixed(2)}`;

  const STATUS_COLORS: Record<string, string> = {
    offen:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    angenommen: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    abgelehnt:  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    abgelaufen: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Offerten ({offerten.length})</p>
        <Button size="sm" onClick={() => setShowForm(!showForm)}
          className="bg-[#6b4c2a] hover:bg-[#5a3e22] text-white">
          <Plus className="w-4 h-4 mr-1" /> Neue Offerte
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-4 border-2 border-[#6b4c2a]/30">
          <p className="text-sm font-bold text-[#6b4c2a]">Neue Offerte erstellen</p>

          {/* Empfänger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Anrede</Label>
              <Select value={anrede} onValueChange={setAnrede}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Herr">Herr</SelectItem>
                  <SelectItem value="Frau">Frau</SelectItem>
                  <SelectItem value="Firma">Firma</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Empfänger Name</Label>
              <Input value={empfaengerName} onChange={e => setEmpfaengerName(e.target.value)} placeholder="Max Mustermann" />
            </div>
            <div>
              <Label className="text-xs">Strasse</Label>
              <Input value={empfaengerStr} onChange={e => setEmpfaengerStr(e.target.value)} placeholder="Musterstrasse 1" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">PLZ Ort</Label>
              <Input value={empfaengerPlz} onChange={e => setEmpfaengerPlz(e.target.value)} placeholder="8000 Zürich" />
            </div>
            <div>
              <Label className="text-xs">Ansprechpartner</Label>
              <Input value={ansprechpartner} onChange={e => setAnsprechpartner(e.target.value)} placeholder="Philipp Schneggenburger" />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="078 907 53 14" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="info@kunde.ch" />
            </div>
            <div>
              <Label className="text-xs">Projektbezeichnung (Offerte-Titel)</Label>
              <Input value={projektBeschr} onChange={e => setProjektBeschr(e.target.value)} />
            </div>
          </div>

          {/* Positionen */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold">Positionen</Label>
              <Button size="sm" variant="outline" onClick={addPos}>
                <Plus className="w-3 h-3 mr-1" /> Position
              </Button>
            </div>
            <div className="space-y-2">
              {positionen.map((pos, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-2 bg-white dark:bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#6b4c2a]">Pos. {i + 1}</span>
                    {positionen.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => removePos(i)}>
                        <Trash className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Titel (fett im PDF)</Label>
                      <Input value={pos.titel} onChange={e => updatePos(i, "titel", e.target.value)} placeholder="z.B. Badmöbel Unterschrank" />
                    </div>
                    <div>
                      <Label className="text-xs">Einheit</Label>
                      <Select value={pos.einheit} onValueChange={v => updatePos(i, "einheit", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Stk.","m","m²","m³","Std.","Psch.","Set"].map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Beschreibung (Details)</Label>
                    <Textarea value={pos.beschreibung} onChange={e => updatePos(i, "beschreibung", e.target.value)}
                      placeholder={"Detaillierte Beschreibung...\nJede neue Zeile = Unterpunkt im PDF\nz.B.:\nWärme gedämmt\nEinbruchsklasse RC2"} rows={4} className="text-sm font-mono" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">↵ Enter = neue Zeile wird als Unterpunkt im PDF dargestellt</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Menge</Label>
                      <Input type="number" value={pos.menge} min={0} step="0.01"
                        onChange={e => updatePos(i, "menge", Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-xs">Einzelpreis CHF</Label>
                      <Input type="number" value={pos.einzelpreis} min={0} step="0.01"
                        onChange={e => updatePos(i, "einzelpreis", Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-xs">Total CHF</Label>
                      <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm font-semibold">
                        {pos.total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Zusammenfassung */}
          <div className="border rounded-lg p-3 bg-muted/30 space-y-1 text-sm">
            <div className="flex justify-between"><span>Zwischentotal</span><span>{fmtCHF(zwischentotal)}</span></div>
            <div className="flex justify-between items-center gap-2">
              <span>Rabatt %</span>
              <Input type="number" value={rabatt} min={0} max={100} step="0.5"
                onChange={e => setRabatt(Number(e.target.value))}
                className="w-20 h-7 text-right text-sm" />
            </div>
            {rabatt > 0 && <div className="flex justify-between text-red-600"><span>Rabatt {rabatt}%</span><span>- {fmtCHF(zwischentotal * rabatt / 100)}</span></div>}
            <div className="flex justify-between font-semibold"><span>Total exkl. MwSt.</span><span>{fmtCHF(totalExkl)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>MwSt. 8.1%</span><span>{fmtCHF(mwstBetrag)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total inkl. MwSt.</span><span>{fmtCHF(totalInkl)}</span></div>
          </div>

          {/* Einleitungs- und Schlusstext */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-[#6b4c2a]">Einleitungstext (erscheint im PDF vor den Positionen)</Label>
              <Textarea
                value={introText}
                onChange={e => setIntroText(e.target.value)}
                rows={3}
                className="text-sm mt-1"
                placeholder="Wir bedanken uns für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-[#6b4c2a]">Schlusstext (erscheint im PDF nach dem Fuhrwerk-Bild)</Label>
              <Textarea
                value={schlussText}
                onChange={e => setSchlussText(e.target.value)}
                rows={3}
                className="text-sm mt-1"
                placeholder="Wir würden uns freuen, wenn Sie sich für unser Angebot entscheiden und stehen Ihnen für Rückfragen gerne zur Verfügung."
              />
            </div>
          </div>

          {/* Bedingungen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Liefertermin</Label>
              <Input value={liefertermin} onChange={e => setLiefertermin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Zahlungsbedingungen</Label>
              <Input value={zahlungsbed} onChange={e => setZahlungsbed(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Gültigkeit</Label>
              <Input value={gueltigkeit} onChange={e => setGueltigkeit(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}
              className="bg-[#6b4c2a] hover:bg-[#5a3e22] text-white">
              {createMutation.isPending ? "Speichern..." : "Offerte speichern"}
            </Button>
          </div>
        </Card>
      )}

      {/* Offerten Liste */}
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : offerten.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          Noch keine Offerten für diesen Auftrag.
        </div>
      ) : (
        <div className="space-y-3">
          {offerten.map(o => {
            const pos: OffertePosition[] = Array.isArray(o.positionen) ? o.positionen as OffertePosition[] : [];
            const total = pos.reduce((s, p) => s + Number(p.total || 0), 0);
            const mwst  = (total - total * (Number(o.rabatt_prozent) / 100)) * 0.081;
            const inkl  = (total - total * (Number(o.rabatt_prozent) / 100)) * (1 + 0.081);
            return (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-[#6b4c2a]">Offerte {o.nr}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] || STATUS_COLORS.offen}`}>
                        {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">{o.datum}</span>
                    </div>
                    {o.projekt_beschreibung && (
                      <p className="text-sm font-medium truncate">{o.projekt_beschreibung}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{o.empfaenger_name} · {o.empfaenger_plz_ort}</p>
                    <p className="text-sm font-semibold mt-1">
                      Total inkl. MwSt.: <span className="text-[#6b4c2a]">{fmtCHF(inkl)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline"
                      onClick={() => handlePdf(o.id, o.nr)}
                      disabled={pdfLoading === o.id}>
                      {pdfLoading === o.id ? "PDF..." : <><Eye className="w-3.5 h-3.5 mr-1" /> PDF</>}
                    </Button>
                    <Button size="sm" variant="outline"
                      className="text-green-700 border-green-300 hover:bg-green-50"
                      disabled={converting === o.id || o.status === "abgelehnt"}
                      onClick={() => {
                        if (confirm(`Offerte ${o.nr} in eine Rechnung umwandeln?`)) {
                          setConverting(o.id);
                          zuRechnungMutation.mutate(o.id);
                        }
                      }}>
                      {converting === o.id
                        ? "..."
                        : <><ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Rechnung</>}
                    </Button>
                    <Select value={o.status} onValueChange={s => statusMutation.mutate({ oid: o.id, status: s })}>
                      <SelectTrigger className="h-8 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offen">Offen</SelectItem>
                        <SelectItem value="angenommen">Angenommen</SelectItem>
                        <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                        <SelectItem value="abgelaufen">Abgelaufen</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost"
                      className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => { if (confirm("Offerte löschen?")) deleteMutation.mutate(o.id); }}>
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
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

// ─── Ort/Maschinenpark Select (inline) ───────────────────────────────────────
const ORT_OPTIONS_D = ["Avor", "Werkstatt", "Montage"] as const;
const MASCHINEN_OPTIONS_D = ["Kleine Maschinen", "Mittlere Maschinen", "Grosse Maschinen"] as const;

function ortLabelD(ort?: string | null, maschine?: string | null): string {
  if (!ort) return "—";
  if (ort === "Werkstatt" && maschine) return `Werkstatt · ${maschine}`;
  return ort;
}

interface StundensatzD { id: string; ort: string; maschinenpark: string | null; satz: number; bezeichnung: string | null; }
interface MitarbeiterD { id: string; vorname: string; nachname: string; stundensatz: number; position?: string; }

// BUG-FIX v27: Satz kommt NUR aus stundensaetze-Tabelle (Einstellungen), NICHT aus Mitarbeiterakte
// Gibt den fixen Stundensatz für Ort/Maschine aus den Einstellungen zurück
function getOrtSatz(saetze: StundensatzD[], ort: string | null | undefined, maschine: string | null | undefined): number {
  if (!ort) return 0;
  const match = saetze.find((s) => {
    if (ort === "Werkstatt") {
      return s.ort === "Werkstatt" && s.maschinenpark === maschine;
    }
    return s.ort === ort && !s.maschinenpark;
  });
  return match ? Number(match.satz) : 0;
}

// Gesamtsatz = NUR fixer Satz aus Einstellungen (stundensaetze.satz)
// mitarbeiterListe wird nur für das Dropdown gebraucht, NICHT für Kosten
function getGesamtSatz(
  saetze: StundensatzD[],
  _mitarbeiterName: string,
  _mitarbeiterListe: MitarbeiterD[],
  ort: string | null | undefined,
  maschine: string | null | undefined
): number {
  return getOrtSatz(saetze, ort, maschine);
}

function ZeiterfassungTab({ id, offerteBetrag }: { id: string; offerteBetrag?: number }) {
  const { toast } = useToast();
  const [mitarbeiter, setMitarbeiter] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [startZeit, setStartZeit] = useState("");
  const [endZeit, setEndZeit] = useState("");
  const [ort, setOrt] = useState<string>("");
  const [maschine, setMaschine] = useState<string>("");

  // Mitarbeiter aus der Mitarbeiterakte laden (inkl. stundensatz für Nachkalkulation)
  const { data: mitarbeiterListe = [] } = useQuery<MitarbeiterD[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const { data: stundensaetze = [] } = useQuery<StundensatzD[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: () => apiRequest("GET", "/api/stundensaetze").then((r) => r.json()),
  });

  // VK-Stunden für Stundenbudget-Warnung
  const { data: vkConfig } = useQuery<any>({
    queryKey: ["/api/vorkalkulation", id, "config"],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${id}/config`).then(r => r.ok ? r.json() : null),
    enabled: !!id,
  });
  const { data: vkStunden = [] } = useQuery<any[]>({
    queryKey: ["/api/vorkalkulation", id, "stunden"],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${id}/stunden`).then(r => r.ok ? r.json() : []),
    enabled: !!id,
  });

  // Manuelle NK-Stunden für die NK-Sektion im AuftragDetail
  const { data: nkManuelleStunden = [] } = useQuery<any[]>({
    queryKey: ["/api/nk-stunden-manuell", id],
    queryFn: async () => {
      if (!id) return [];
      const r = await apiRequest("GET", `/api/kalkulation/${id}/nk-stunden-manuell`);
      return r.json();
    },
    enabled: !!id,
  });

  const { data: eintraege = [], isLoading } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/auftraege", id, "zeit"],
    queryFn: () => apiRequest("GET", `/api/auftraege/${id}/zeit`).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/auftraege/${id}/zeit`, {
      mitarbeiter, beschreibung, datum, start_zeit: startZeit, end_zeit: endZeit,
      ort: ort || null,
      maschinenpark: (ort === "Werkstatt" && maschine) ? maschine : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "zeit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege/monatsauswertung"] });
      setMitarbeiter(""); setBeschreibung(""); setStartZeit(""); setEndZeit(""); setOrt(""); setMaschine("");
      toast({ title: "Zeit erfasst ✓" });
    },
  });

  const delMutation = useMutation({
    mutationFn: (zid: string) => apiRequest("DELETE", `/api/auftraege/${id}/zeit/${zid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "zeit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege/monatsauswertung"] });
    },
  });

  // Gesamtstunden berechnen
  const totalMin = eintraege.reduce((s, e) => s + (e.dauer_minuten || 0), 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;

  // Dauer-Vorschau
  let dauerVorschau = "";
  if (startZeit && endZeit) {
    const [sh, sm] = startZeit.split(":").map(Number);
    const [eh, em] = endZeit.split(":").map(Number);
    const min = (eh * 60 + em) - (sh * 60 + sm);
    if (min > 0) dauerVorschau = `${Math.floor(min / 60)}h ${min % 60}min`;
  }

  const canSave = !!startZeit && !!endZeit && !!mitarbeiter && !!ort && (ort !== "Werkstatt" || !!maschine);

  // ── Nachkalkulation ──────────────────────────────────────────────────────────
  // Kosten pro Ort/Maschine
  type NachkKey = string;
  const byOrt: Record<NachkKey, { label: string; minuten: number; kosten: number }> = {};
  const byMa: Record<string, { name: string; minuten: number; kosten: number }> = {};

  // Zeiterfassung-Einträge
  for (const e of eintraege) {
    const gesamtSatz = getGesamtSatz(stundensaetze, e.mitarbeiter || "", mitarbeiterListe, e.ort, e.maschinenpark);
    const kosten = ((e.dauer_minuten || 0) / 60) * gesamtSatz;
    const key = ortLabelD(e.ort, e.maschinenpark);
    if (!byOrt[key]) byOrt[key] = { label: key, minuten: 0, kosten: 0 };
    byOrt[key].minuten += e.dauer_minuten || 0;
    byOrt[key].kosten += kosten;

    const maKey = e.mitarbeiter || "—";
    if (!byMa[maKey]) byMa[maKey] = { name: maKey, minuten: 0, kosten: 0 };
    byMa[maKey].minuten += e.dauer_minuten || 0;
    byMa[maKey].kosten += kosten;
  }

  // Manuelle NK-Stunden hinzurechnen
  for (const nk of nkManuelleStunden) {
    const std = Number(nk.ist_stunden) || 0;
    const satz = Number(nk.stundensatz) || 0;
    const kosten = std * satz;
    const bereich = nk.bereich || "Manuell";
    if (!byOrt[bereich]) byOrt[bereich] = { label: bereich, minuten: 0, kosten: 0 };
    byOrt[bereich].minuten += Math.round(std * 60);
    byOrt[bereich].kosten += kosten;

    const maKey = nk.mitarbeiter_name || "—";
    if (!byMa[maKey]) byMa[maKey] = { name: maKey, minuten: 0, kosten: 0 };
    byMa[maKey].minuten += Math.round(std * 60);
    byMa[maKey].kosten += kosten;
  }

  const totalKosten = Object.values(byOrt).reduce((s, v) => s + v.kosten, 0);
  const offerte = offerteBetrag || 0;
  const differenz = offerte > 0 ? offerte - totalKosten : null;
  const diffPct = offerte > 0 ? ((differenz! / offerte) * 100) : null;

  // Stundenbudget-Warnung
  const vkSollStunden = vkStunden.reduce((s: number, r: any) => s + (Number(r.soll_stunden) || 0), 0);
  const istStundenTotal = totalMin / 60;
  const budgetProzent = vkSollStunden > 0 ? (istStundenTotal / vkSollStunden) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Stundenbudget-Warnung */}
      {vkSollStunden > 0 && budgetProzent !== null && (
        <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
          budgetProzent >= 100
            ? "border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            : budgetProzent >= 80
            ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
            : "border-green-300 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
        }`}>
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                Stundenbudget: {istStundenTotal.toFixed(1)}h / {vkSollStunden.toFixed(1)}h ({budgetProzent.toFixed(0)}%)
              </span>
              <span className="text-xs">
                {budgetProzent >= 100 ? "⛔ Überschritten" : budgetProzent >= 80 ? "⚠️ Fast ausgeschöpft" : "✅ Im Budget"}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetProzent >= 100 ? "bg-red-500" : budgetProzent >= 80 ? "bg-amber-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(100, budgetProzent)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {/* Formular */}
      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold">Neue Zeit erfassen</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">1. Mitarbeiter</Label>
            <Select value={mitarbeiter} onValueChange={setMitarbeiter}>
              <SelectTrigger className="mt-1" data-testid="zeit-mitarbeiter">
                <SelectValue placeholder="Mitarbeiter wählen…" />
              </SelectTrigger>
              <SelectContent>
                {mitarbeiterListe.map((m: any) => (
                  <SelectItem key={m.id} value={`${m.vorname} ${m.nachname}`}>
                    {m.vorname} {m.nachname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Datum</Label>
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="mt-1" data-testid="zeit-datum" />
          </div>
        </div>

        {/* 2. Ort + 3. Maschinenpark */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />2. Wo</Label>
            <Select value={ort} onValueChange={(v) => { setOrt(v); setMaschine(""); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Ort auswählen…" /></SelectTrigger>
              <SelectContent>
                {ORT_OPTIONS_D.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {ort === "Werkstatt" && (
            <div>
              <Label className="text-xs flex items-center gap-1"><Cpu className="h-3 w-3" />3. Maschinenpark</Label>
              <Select value={maschine} onValueChange={setMaschine}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Maschinen…" /></SelectTrigger>
                <SelectContent>
                  {MASCHINEN_OPTIONS_D.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Start</Label>
            <Input type="time" value={startZeit} onChange={e => setStartZeit(e.target.value)} className="mt-1" data-testid="zeit-start" />
          </div>
          <div>
            <Label className="text-xs">Ende</Label>
            <Input type="time" value={endZeit} onChange={e => setEndZeit(e.target.value)} className="mt-1" data-testid="zeit-ende" />
          </div>
          <div>
            <Label className="text-xs">Dauer</Label>
            <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm text-muted-foreground mt-1">
              {dauerVorschau || "—"}
            </div>
          </div>
        </div>
        <div>
          <Label className="text-xs">Beschreibung (optional)</Label>
          <Input value={beschreibung} onChange={e => setBeschreibung(e.target.value)} placeholder="Was wurde gemacht?" className="mt-1" data-testid="zeit-beschreibung" />
        </div>
        <Button
          onClick={() => addMutation.mutate()}
          disabled={!canSave || addMutation.isPending}
          className="w-full bg-[#e8620a] hover:bg-[#cf5509] text-white"
          data-testid="zeit-speichern"
        >
          <Plus className="w-4 h-4 mr-1" /> Zeit speichern
        </Button>
        {!canSave && mitarbeiter && startZeit && endZeit && (
          <p className="text-xs text-amber-600 text-center">⚠ {!ort ? "Ort fehlt" : "Maschinenpark fehlt"}</p>
        )}
      </Card>

      {/* ── Nachkalkulation ─────────────────────────────────────────────────── */}
      {eintraege.length > 0 && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--primary))" }} />
            <p className="text-sm font-semibold">Nachkalkulation</p>
          </div>

          {/* Stunden pro Ort/Maschine */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Stunden &amp; Kosten nach Ort</p>
            <div className="space-y-1.5">
              {Object.values(byOrt).map((v) => (
                <div key={v.label} className="flex items-center justify-between gap-2 text-sm rounded-md bg-muted/40 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />{v.label}
                  </span>
                  <span className="font-mono text-xs" style={{ color: "hsl(var(--primary))" }}>
                    {Math.floor(v.minuten / 60)}h {v.minuten % 60}min
                  </span>
                  <span className="text-xs font-semibold">
                    {v.kosten > 0 ? `CHF ${v.kosten.toFixed(2)}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Stunden + Kosten pro Mitarbeiter */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Stunden nach Mitarbeiter</p>
            <div className="space-y-1.5">
              {Object.values(byMa).map((v) => (
                <div key={v.name} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{v.name}</span>
                    <span className="font-mono text-xs font-semibold" style={{ color: "hsl(var(--primary))" }}>
                      {Math.floor(v.minuten / 60)}h {v.minuten % 60}min
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-muted-foreground">Kosten nach Ort-Satz (Einstellungen)</span>
                    <span className="text-xs text-muted-foreground">
                      {v.kosten > 0 ? `CHF ${v.kosten.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total + Soll-Ist-Vergleich */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total Istkosten</span>
              <span style={{ color: "hsl(var(--primary))" }}>CHF {totalKosten.toFixed(2)}</span>
            </div>
            {offerte > 0 && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Offerten-Betrag (Soll)</span>
                  <span>CHF {offerte.toFixed(2)}</span>
                </div>
                <div className={`flex items-center justify-between text-sm font-semibold rounded-md px-3 py-2 ${
                  differenz! >= 0
                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                    : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                }`}>
                  <span className="flex items-center gap-1.5">
                    {differenz! >= 0
                      ? <TrendingUp className="h-4 w-4" />
                      : <TrendingDown className="h-4 w-4" />}
                    {differenz! >= 0 ? "Marge" : "Überschreitung"}
                  </span>
                  <span>
                    CHF {Math.abs(differenz!).toFixed(2)}
                    {diffPct !== null && (
                      <span className="text-xs ml-1">({Math.abs(diffPct).toFixed(1)}%)</span>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Gesamt-Header */}
      {eintraege.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-medium">Erfasste Einträge ({eintraege.length})</p>
          <p className="text-sm font-semibold text-[#e8620a]">
            Gesamt: {totalH}h {totalM}min
          </p>
        </div>
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : eintraege.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Noch keine Zeiteinträge.</p>
      ) : (
        <div className="space-y-2">
          {eintraege.map(e => (
            <Card key={e.id} className="p-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{e.mitarbeiter}</span>
                  <span className="text-xs text-muted-foreground">{e.datum}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {e.start_zeit} – {e.end_zeit}
                  </span>
                  {e.dauer_minuten > 0 && (
                    <span className="text-xs font-semibold text-[#e8620a]">
                      {Math.floor(e.dauer_minuten / 60)}h {e.dauer_minuten % 60}min
                    </span>
                  )}
                  {(e as any).ort && (
                    <span className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                      <MapPin className="h-3 w-3 inline mr-0.5" />{ortLabelD((e as any).ort, (e as any).maschinenpark)}
                    </span>
                  )}
                </div>
                {e.beschreibung && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">{e.beschreibung}</p>
                )}
              </div>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => delMutation.mutate(e.id)}
              >
                <Trash className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Kommentare Tab ─────────────────────────────────────────────────────────
function KommentareTab({ id }: { id: string }) {
  const { toast } = useToast();
  const [autor, setAutor] = useState("");
  const [text, setText] = useState("");

  const { data: kommentare = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/auftraege", id, "kommentare"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/auftraege/${id}/kommentare`);
      return r.json();
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/auftraege/${id}/kommentare`, { autor, text });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "kommentare"] });
      setAutor("");
      setText("");
      toast({ title: "Kommentar hinzugefügt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async (kid: string) => {
      await apiRequest("DELETE", `/api/kommentare/${kid}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id, "kommentare"] });
    },
  });

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : kommentare.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Noch keine Kommentare.</p>
      ) : (
        <div className="space-y-3">
          {kommentare.map((k: any) => (
            <div key={k.id} className="flex gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">{k.autor}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(k.erstellt).toLocaleString("de-CH")}
                  </span>
                </div>
                <p className="text-sm">{k.text}</p>
              </div>
              <button
                onClick={() => delMut.mutate(k.id)}
                className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t pt-3 space-y-2">
        <Input
          placeholder="Ihr Name"
          value={autor}
          onChange={(e) => setAutor(e.target.value)}
          className="text-sm"
        />
        <Textarea
          placeholder="Kommentar eingeben…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <Button
          onClick={() => addMut.mutate()}
          disabled={!autor || !text || addMut.isPending}
          size="sm"
          style={{ background: "#e8620a" }}
          className="text-white"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Kommentar hinzufügen
        </Button>
      </div>
    </div>
  );
}

// ── Garantien Tab ───────────────────────────────────────────────────────────
function GarantienTab({ id, auftrag }: { id: string; auftrag: any }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ beschreibung: "", ablauf_datum: "", status: "aktiv", notiz: "" });

  const { data: garantien = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/garantien", id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/garantien?auftrag_id=${id}`);
      return r.json();
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/garantien", { ...form, auftrag_id: id });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/garantien", id] });
      setDialogOpen(false);
      setForm({ beschreibung: "", ablauf_datum: "", status: "aktiv", notiz: "" });
      toast({ title: "Garantie hinzugefügt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: async (gid: string) => apiRequest("DELETE", `/api/garantien/${gid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/garantien", id] }),
  });

  const generateAbnahme = async () => {
    try {
      const r = await apiRequest("POST", `/api/auftraege/${id}/abnahme-pdf`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">Garantien ({garantien.length})</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={generateAbnahme}>
            <FileText className="h-3.5 w-3.5 mr-1" /> Abnahmeprotokoll PDF
          </Button>
          <Button size="sm" style={{ background: "#e8620a" }} className="text-white" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Neue Garantie
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : garantien.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Keine Garantien für diesen Auftrag.</p>
      ) : (
        <div className="space-y-2">
          {garantien.map((g: any) => {
            const daysLeft = g.ablauf_datum
              ? Math.ceil((new Date(g.ablauf_datum).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;
            const isWarning = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;
            return (
              <div key={g.id} className={cn("rounded border p-3 flex items-start gap-3", isWarning && "border-orange-300 bg-orange-50")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{g.status}</Badge>
                    {isWarning && <span className="text-xs text-orange-700 font-medium">{daysLeft} Tage verbleibend</span>}
                  </div>
                  <p className="text-sm font-medium mt-1">{g.beschreibung}</p>
                  {g.ablauf_datum && <p className="text-xs text-muted-foreground">Ablauf: {g.ablauf_datum}</p>}
                  {g.notiz && <p className="text-xs text-muted-foreground italic">{g.notiz}</p>}
                </div>
                <button onClick={() => delMut.mutate(g.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen && (
        <div className="border rounded-lg p-4 mt-2 bg-muted/20 space-y-3">
          <p className="text-sm font-semibold">Neue Garantie</p>
          <div>
            <Label className="text-xs">Beschreibung *</Label>
            <Input value={form.beschreibung} onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))} placeholder="Garantiebeschreibung" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Ablaufdatum</Label>
              <Input type="date" value={form.ablauf_datum} onChange={(e) => setForm((f) => ({ ...f, ablauf_datum: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="abgelaufen">Abgelaufen</SelectItem>
                  <SelectItem value="abgewickelt">Abgewickelt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Notiz</Label>
            <Input value={form.notiz} onChange={(e) => setForm((f) => ({ ...f, notiz: e.target.value }))} placeholder="Bemerkung…" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addMut.mutate()} disabled={!form.beschreibung || addMut.isPending} style={{ background: "#e8620a" }} className="text-white">
              Speichern
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Liefertermine Tab ───────────────────────────────────────────────────────
function LiefertermineTab({ id }: { id: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ bezeichnung: "", lieferant: "", erwartet_am: "", notiz: "" });
  const [adding, setAdding] = useState(false);

  const { data: termine = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/liefertermine", id],
    queryFn: () => apiRequest("GET", `/api/liefertermine?auftrag_id=${id}`).then(r => r.json()),
  });

  const addMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/liefertermine", { ...d, auftrag_id: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liefertermine", id] });
      toast({ title: "Liefertermin gespeichert" });
      setForm({ bezeichnung: "", lieferant: "", erwartet_am: "", notiz: "" });
      setAdding(false);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ tid, status, geliefert_am }: any) => apiRequest("PUT", `/api/liefertermine/${tid}`, { status, geliefert_am }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/liefertermine", id] }),
  });

  const delMut = useMutation({
    mutationFn: (tid: string) => apiRequest("DELETE", `/api/liefertermine/${tid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/liefertermine", id] }),
  });

  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    ausstehend: { label: "Ausstehend", color: "bg-blue-100 text-blue-700" },
    verzoegert:  { label: "Verzögert",  color: "bg-red-100 text-red-700" },
    geliefert:   { label: "Geliefert",  color: "bg-green-100 text-green-700" },
  };

  return (
    <div className="space-y-3">
      {isLoading ? <div className="text-sm text-muted-foreground py-4 text-center">Laden...</div> : (
        <>
          {termine.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-4">Noch keine Liefertermine erfasst</p>
          )}
          {termine.map(t => {
            const cfg = STATUS_CFG[t.status] || STATUS_CFG.ausstehend;
            return (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/10">
                <Package className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.bezeichnung}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {t.lieferant && <p className="text-xs text-muted-foreground">{t.lieferant}</p>}
                  {t.erwartet_am && <p className="text-xs text-muted-foreground">Erwartet: {t.erwartet_am}</p>}
                  {t.geliefert_am && <p className="text-xs text-green-600">Geliefert: {t.geliefert_am}</p>}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {t.status !== "geliefert" && (
                      <Button size="sm" variant="outline" className="h-6 text-xs text-green-600"
                        onClick={() => statusMut.mutate({ tid: t.id, status: "geliefert", geliefert_am: new Date().toISOString().slice(0,10) })}>
                        <CheckCircle2 className="h-3 w-3 mr-1" />Geliefert
                      </Button>
                    )}
                    {t.status === "ausstehend" && (
                      <Button size="sm" variant="outline" className="h-6 text-xs text-red-600"
                        onClick={() => statusMut.mutate({ tid: t.id, status: "verzoegert", geliefert_am: null })}>
                        Verzögert
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                      onClick={() => { if (confirm("Löschen?")) delMut.mutate(t.id); }}>Löschen</Button>
                  </div>
                </div>
              </div>
            );
          })}
          {adding ? (
            <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
              <Input placeholder="Bezeichnung (z.B. Aluprofil 60x40)" value={form.bezeichnung} onChange={e => setForm(f => ({ ...f, bezeichnung: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Lieferant" value={form.lieferant} onChange={e => setForm(f => ({ ...f, lieferant: e.target.value }))} />
                <Input type="date" value={form.erwartet_am} onChange={e => setForm(f => ({ ...f, erwartet_am: e.target.value }))} />
              </div>
              <Input placeholder="Notiz" value={form.notiz} onChange={e => setForm(f => ({ ...f, notiz: e.target.value }))} />
              <div className="flex gap-2">
                <Button size="sm" style={{ background: "#e8620a" }} className="text-white" disabled={!form.bezeichnung || addMut.isPending}
                  onClick={() => addMut.mutate(form)}>Speichern</Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Abbrechen</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Liefertermin hinzufügen
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default function AuftragDetail({ id }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [delOpen, setDelOpen] = useState(false);

  const { data, isLoading } = useQuery<DetailData>({
    queryKey: ["/api/auftraege", id],
  });

  // Offerten für Nachkalkulation laden
  const { data: auftragOfferten = [] } = useQuery<Offerte[]>({
    queryKey: ["/api/auftraege", id, "offerten"],
    queryFn: () => apiRequest("GET", `/api/auftraege/${id}/offerten`).then(r => r.json()),
    enabled: !!id,
  });

  // Letzten / akzeptierten Offerte-Bruttobetrag für Nachkalkulation
  const offerteBetragNK = (() => {
    const sorted = [...auftragOfferten].sort((a, b) => b.datum.localeCompare(a.datum));
    const best = sorted.find(o => o.status === "akzeptiert") || sorted[0];
    if (!best) return undefined;
    const netto = (best.positionen || []).reduce((s, p) => s + Number(p.total || 0), 0);
    const rabatt = Number(best.rabatt_prozent || 0);
    const mwst = Number(best.mwst_prozent || 8.1);
    const total = netto * (1 - rabatt / 100) * (1 + mwst / 100);
    return total;
  })();

  const statusMut = useMutation({
    mutationFn: async (status: Status) => {
      const r = await apiRequest("PATCH", `/api/auftraege/${id}/status`, { status });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const delMut = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/auftraege/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Auftrag gelöscht" });
      setLocation("/auftraege");
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-muted-foreground">Auftrag nicht gefunden.</p>
        <Link href="/auftraege">
          <a className="text-primary text-sm">Zurück zur Liste</a>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href="/auftraege">
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
            <ArrowLeft className="h-3 w-3" />
            Zurück zur Liste
          </a>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">{data.nr}</span>
              <Badge variant="outline" className={cn(STATUS_BADGE[data.status])}>
                {STATUS_LABEL[data.status]}
              </Badge>
              <Badge variant="outline" className={cn(PRIO_BADGE[data.prioritaet])}>
                {data.prioritaet}
              </Badge>
            </div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {data.titel}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{data.kunde}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await apiRequest("POST", `/api/auftraege/${id}/lieferschein-pdf`);
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                } catch (e: any) {
                  toast({ title: "Fehler", description: e.message, variant: "destructive" });
                }
              }}
            >
              <Truck className="h-4 w-4 mr-1" />
              Lieferschein
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await apiRequest("POST", `/api/auftraege/${id}/auftragsbestaetigung-pdf`);
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                } catch (e: any) {
                  toast({ title: "Fehler", description: e.message, variant: "destructive" });
                }
              }}
            >
              <FileCheck className="h-4 w-4 mr-1" />
              Auftragsbestätigung
            </Button>
            <Link href={`/vorkalkulation/${id}`}>
              <a>
                <Button variant="outline" data-testid="button-vorkalkulation" style={{ color: "#1a3a6b" }}>
                  <Calculator className="h-4 w-4 mr-1" />
                  Vorkalkulation
                </Button>
              </a>
            </Link>
            <Link href={`/nachkalkulation/${id}`}>
              <a>
                <Button variant="outline" data-testid="button-nachkalkulation" style={{ color: "#e8620a" }}>
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Nachkalkulation
                </Button>
              </a>
            </Link>
            <Link href={`/auftraege/${id}/bearbeiten`}>
              <a>
                <Button variant="outline" data-testid="button-edit">
                  <Pencil className="h-4 w-4 mr-1" />
                  Bearbeiten
                </Button>
              </a>
            </Link>
            <Button
              variant="outline"
              data-testid="button-delete"
              onClick={() => setDelOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Löschen
            </Button>
            {/* Projektstatus-Link */}
            {data.public_token ? (
              <div className="flex gap-1">
                <Button variant="outline" size="icon" title="Link kopieren"
                  onClick={() => {
                    const url = `${window.location.origin}/#/projekt/${data.public_token}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Link kopiert!", description: "Kundenstatus-Link in Zwischenablage" });
                  }}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" title="Link deaktivieren" className="text-red-600"
                  onClick={async () => {
                    await apiRequest("DELETE", `/api/auftraege/${id}/generate-token`);
                    queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
                    toast({ title: "Link deaktiviert" });
                  }}>
                  <Link2Off className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" title="Kundenstatus-Link generieren"
                onClick={async () => {
                  const r = await apiRequest("POST", `/api/auftraege/${id}/generate-token`);
                  const d = await r.json();
                  queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
                  const url = `${window.location.origin}/#/projekt/${d.token}`;
                  navigator.clipboard.writeText(url);
                  toast({ title: "Kunden-Link generiert!", description: "Link in Zwischenablage kopiert" });
                }}>
                <Link2 className="h-4 w-4 mr-1" /> Kundenlink
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="p-5 mb-6 bg-card">
        <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
          Status-Pipeline
        </h2>
        <StatusPipeline
          current={data.status}
          onChange={(s) => statusMut.mutate(s)}
          disabled={statusMut.isPending}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="space-y-4">
          <Card className="p-5 bg-card">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
              Kunde
            </h3>
            <div className="text-sm space-y-2">
              <div className="font-medium">{data.kunde}</div>
              {data.kunde_adresse && (
                <div className="text-muted-foreground whitespace-pre-wrap">
                  {data.kunde_adresse}
                </div>
              )}
              {data.kunde_email && (
                <div>
                  <a href={`mailto:${data.kunde_email}`} className="text-primary hover:underline">
                    {data.kunde_email}
                  </a>
                </div>
              )}
              {data.kunde_telefon && (
                <div className="text-muted-foreground">{data.kunde_telefon}</div>
              )}
            </div>
          </Card>

          <Card className="p-5 bg-card">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
              Details
            </h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Kategorie</dt>
                <dd className="font-medium">{data.kategorie || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Verantwortlich</dt>
                <dd className="font-medium">{data.verantwortlicher || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Start</dt>
                <dd className="font-medium">{formatDate(data.start_datum)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Ende</dt>
                <dd className="font-medium">{formatDate(data.end_datum)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Erstellt</dt>
                <dd className="font-medium">{formatDate(data.erstellt)}</dd>
              </div>
            </dl>
            {data.beschreibung && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Beschreibung
                </div>
                <p className="text-sm whitespace-pre-wrap">{data.beschreibung}</p>
              </div>
            )}
          </Card>

          <Card className="p-5 bg-card">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
              Finanzen
            </h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Angebot</dt>
                <dd className="font-semibold tabular-nums">
                  {formatCHF(data.angebots_betrag, data.waehrung)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Rechnung</dt>
                <dd className="font-semibold tabular-nums">
                  {formatCHF(data.rechnungs_betrag, data.waehrung)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Währung</dt>
                <dd className="font-medium">{data.waehrung}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5 bg-card">
            <Tabs defaultValue="verlauf">
              <TabsList className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1 h-auto p-1 w-full">
                <TabsTrigger value="verlauf" data-testid="tab-verlauf" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  Verlauf
                </TabsTrigger>
                <TabsTrigger value="notizen" data-testid="tab-notizen" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  Notizen
                </TabsTrigger>
                <TabsTrigger value="dokumente" data-testid="tab-dokumente" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  <span className="hidden sm:inline">Pläne &amp; Dokumente</span>
                  <span className="sm:hidden">Dokumente</span>
                </TabsTrigger>
                <TabsTrigger value="rechnung" data-testid="tab-rechnung" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  Rechnung
                </TabsTrigger>
                <TabsTrigger value="zeit" data-testid="tab-zeit" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Zeiterfassung</span>
                  <span className="sm:hidden">Zeit</span>
                </TabsTrigger>
                <TabsTrigger value="offerte" data-testid="tab-offerte" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  Offerte
                </TabsTrigger>
                <TabsTrigger value="kommentare" data-testid="tab-kommentare" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Kommentare</span>
                  <span className="sm:hidden">Chat</span>
                </TabsTrigger>
                <TabsTrigger value="garantien" data-testid="tab-garantien" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Garantien</span>
                  <span className="sm:hidden">Garantie</span>
                </TabsTrigger>
                <TabsTrigger value="liefertermine" data-testid="tab-liefertermine" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Liefertermine</span>
                  <span className="sm:hidden">Lieferung</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="verlauf" className="mt-4">
                {data.verlauf.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Noch kein Verlauf.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.verlauf.map((v) => (
                      <div key={v.id} className="flex gap-3" data-testid={`verlauf-${v.id}`}>
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cn(STATUS_BADGE[v.status])}>
                              {STATUS_LABEL[v.status]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(v.datum)}
                            </span>
                            {v.von && (
                              <span className="text-xs text-muted-foreground">· {v.von}</span>
                            )}
                          </div>
                          {v.kommentar && (
                            <p className="text-sm mt-1 text-muted-foreground">{v.kommentar}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notizen" className="mt-4">
                <NotizenTab id={id} notizen={data.notizen} />
              </TabsContent>

              <TabsContent value="dokumente" className="mt-4">
                <DokumenteTab id={id} dokumente={data.dokumente} />
              </TabsContent>

              <TabsContent value="rechnung" className="mt-4">
                <RechnungenTab id={id} auftrag={data} />
              </TabsContent>

              <TabsContent value="zeit" className="mt-4">
                <ZeiterfassungTab id={id} offerteBetrag={offerteBetragNK} />
              </TabsContent>

              <TabsContent value="offerte" className="mt-4">
                <OffertenTab id={id} auftrag={data} />
              </TabsContent>
              <TabsContent value="kommentare" className="mt-4">
                <KommentareTab id={id} />
              </TabsContent>
              <TabsContent value="garantien" className="mt-4">
                <GarantienTab id={id} auftrag={data} />
              </TabsContent>
              <TabsContent value="liefertermine" className="mt-4">
                <LiefertermineTab id={id} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auftrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.nr} — {data.titel}. Alle zugehörigen Notizen, Dokumente und Rechnungen werden
              ebenfalls gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              onClick={() => delMut.mutate()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
