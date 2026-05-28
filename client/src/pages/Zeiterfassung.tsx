import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock, LogIn, LogOut, Plus, Trash2, Timer, Users, CalendarDays, ChevronLeft, ChevronRight, Briefcase, MapPin, Cpu
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Auftrag } from "@shared/schema";
import { STATUS_LABEL } from "@shared/schema";
import { STATUS_BADGE } from "@/lib/format";
import { cn } from "@/lib/utils";

const OPEN_STATUSES = ["anfrage", "angebot", "bestaetigt", "in_arbeit", "qualitaet", "rechnung"];

// Ort-Optionen
const ORT_OPTIONS = ["Avor", "Werkstatt", "Montage"] as const;
type OrtType = typeof ORT_OPTIONS[number];
const MASCHINEN_OPTIONS = ["Kleine Maschinen", "Mittlere Maschinen", "Grosse Maschinen"] as const;

interface Zeiteintrag {
  id: string;
  auftrag_id: string | null;
  mitarbeiter_id: string;
  mitarbeiter: string;
  beschreibung: string;
  datum: string;
  start_zeit: string;
  end_zeit: string | null;
  dauer_minuten: number;
  ort?: string | null;
  maschinenpark?: string | null;
}

interface Mitarbeiter {
  id: string;
  vorname: string;
  nachname: string;
  position: string;
  stundensatz: number;
}

interface Stundensatz {
  id: string;
  ort: string;
  maschinenpark: string | null;
  satz: number;
  grundsatz: number | null;
  bezeichnung: string | null;
}

function formatDauer(min: number) {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatHours(min: number) {
  const h = (min / 60).toFixed(2);
  return `${h}h`;
}

// Stundensatz-Logik v38:
// - Avor / Montage: fixer Ort-Satz aus stundensaetze (kein Personen-Satz)
// - Werkstatt + Maschine: Grundsatz (stundensaetze.grundsatz) + Maschinen-Zuschlag (stundensaetze.satz)
// - Werkstatt ohne Maschine: nur Grundsatz aus stundensaetze (Werkstatt-Satz ohne Maschine)
function getWerkstattGrundsatz(saetze: Stundensatz[], maschine: string | null | undefined): number {
  // Grundsatz ist auf allen Werkstatt-Maschinen-Einträgen hinterlegt (gleich für alle)
  // Nimm den ersten Werkstatt-Eintrag mit passendem maschinenpark, oder den ersten Werkstatt-Eintrag überhaupt
  if (maschine) {
    const match = saetze.find((s) => s.ort === "Werkstatt" && s.maschinenpark === maschine);
    if (match && match.grundsatz != null) return Number(match.grundsatz);
  }
  // Fallback: erster Werkstatt-Eintrag mit grundsatz
  const anyWerkstatt = saetze.find((s) => s.ort === "Werkstatt" && s.grundsatz != null);
  return anyWerkstatt ? Number(anyWerkstatt.grundsatz) : 0;
}

function getMaschinenZuschlag(saetze: Stundensatz[], maschine: string | null | undefined): number {
  if (!maschine) return 0;
  const match = saetze.find((s) => s.ort === "Werkstatt" && s.maschinenpark === maschine);
  return match ? Number(match.satz) : 0;
}

function getOrtFixSatz(saetze: Stundensatz[], ort: string | null | undefined): number {
  if (!ort || ort === "Werkstatt") return 0;
  const match = saetze.find((s) => s.ort === ort && !s.maschinenpark);
  return match ? Number(match.satz) : 0;
}

// Gesamtsatz berechnen:
// Avor/Montage: fixer Ort-Satz
// Werkstatt: Grundsatz (aus stundensaetze) + Maschinen-Zuschlag
function getGesamtSatz(
  saetze: Stundensatz[],
  maName: string,
  mitarbeiterListe: Mitarbeiter[],
  ort: string | null | undefined,
  maschine: string | null | undefined
): number {
  if (!ort) return 0;
  if (ort === "Werkstatt") {
    const grundsatz = getWerkstattGrundsatz(saetze, maschine);
    const maschinenZuschlag = getMaschinenZuschlag(saetze, maschine);
    return grundsatz + maschinenZuschlag;
  }
  // Avor / Montage: fixer Ort-Satz
  return getOrtFixSatz(saetze, ort);
}

// Satz-Label für Anzeige (z.B. "CHF 80/h + CHF 20/h (Maschine) = CHF 100/h")
function getSatzLabel(
  saetze: Stundensatz[],
  maName: string,
  mitarbeiterListe: Mitarbeiter[],
  ort: string | null | undefined,
  maschine: string | null | undefined
): string {
  if (!ort) return "";
  if (ort === "Werkstatt") {
    const gs = getWerkstattGrundsatz(saetze, maschine);
    const mz = getMaschinenZuschlag(saetze, maschine);
    if (mz > 0) return `CHF ${gs}/h + CHF ${mz}/h (Maschine) = CHF ${gs + mz}/h`;
    return gs > 0 ? `CHF ${gs}/h` : "";
  }
  const fix = getOrtFixSatz(saetze, ort);
  return fix > 0 ? `CHF ${fix}/h` : "";
}

// Hilfsfunktion: Ort-Label mit Maschine
function ortLabel(ort?: string | null, maschine?: string | null): string {
  if (!ort) return "—";
  if (ort === "Werkstatt" && maschine) return `Werkstatt · ${maschine}`;
  return ort;
}

// Hilfsfunktion: Stempelzeit korrekt als lokale Zeit parsen (kein UTC-Bug)
function parseStempelStart(datum: string, start_zeit: string): Date {
  const timeStr = start_zeit.split(":").length === 3 ? start_zeit : `${start_zeit}:00`;
  return new Date(`${datum}T${timeStr}`);
}

// ─── Ort/Maschinenpark Auswahl-Widget ─────────────────────────────────────────
function OrtSelect({
  ort, setOrt, maschine, setMaschine, disabled
}: {
  ort: string; setOrt: (v: string) => void;
  maschine: string; setMaschine: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs flex items-center gap-1">
          <MapPin className="h-3 w-3" />Wo
        </Label>
        <Select value={ort} onValueChange={(v) => { setOrt(v); setMaschine(""); }} disabled={disabled}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Ort auswählen…" />
          </SelectTrigger>
          <SelectContent>
            {ORT_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {ort === "Werkstatt" && (
        <div>
          <Label className="text-xs flex items-center gap-1">
            <Cpu className="h-3 w-3" />Maschinenpark
          </Label>
          <Select value={maschine} onValueChange={setMaschine} disabled={disabled}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Maschinen auswählen…" />
            </SelectTrigger>
            <SelectContent>
              {MASCHINEN_OPTIONS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ─── Stempeluhr-Widget ────────────────────────────────────────────────────────
function StempeluhrWidget({ mitarbeiter, auftraege, stundensaetze }: { mitarbeiter: Mitarbeiter[], auftraege: Auftrag[], stundensaetze: Stundensatz[] }) {
  const { toast } = useToast();
  const [selectedMaId, setSelectedMaId] = useState<string>("");
  const [selectedAuftragId, setSelectedAuftragId] = useState<string>("none");
  const [freierText, setFreierText] = useState<string>("");
  const [ort, setOrt] = useState<string>("");
  const [maschine, setMaschine] = useState<string>("");
  const [elapsed, setElapsed] = useState<string>("00:00:00");

  const selectedMa = mitarbeiter.find((m) => m.id === selectedMaId);
  const maName = selectedMa ? `${selectedMa.vorname} ${selectedMa.nachname}` : "";

  // Aktiver Stempel laden
  const { data: aktiverStempel, refetch: refetchStempel } = useQuery<Zeiteintrag | null>({
    queryKey: ["/api/stempel/aktiv", maName],
    queryFn: () =>
      maName
        ? apiRequest("GET", `/api/stempel/aktiv?mitarbeiter_name=${encodeURIComponent(maName)}`).then((r) => r.json())
        : Promise.resolve(null),
    enabled: !!maName,
    refetchInterval: 60000,
  });

  const einMutation = useMutation({
    mutationFn: () => {
      const beschreibung = selectedAuftragId === "free"
        ? (freierText.trim() || "Freie Tätigkeit")
        : "Tagesarbeitszeit";
      return apiRequest("POST", "/api/stempel/ein", {
        mitarbeiter_name: maName,
        auftrag_id: (selectedAuftragId !== "none" && selectedAuftragId !== "free")
          ? selectedAuftragId
          : null,
        beschreibung,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschine) ? maschine : null,
      });
    },
    onSuccess: () => {
      refetchStempel();
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege"] });
      if (selectedAuftragId && selectedAuftragId !== "none" && selectedAuftragId !== "free") {
        queryClient.invalidateQueries({ queryKey: ["/api/auftraege", selectedAuftragId, "zeit"] });
      }
      toast({ title: "Eingestempelt ✓", description: `${maName} — ${new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} Uhr` });
    },
    onError: () => toast({ title: "Fehler beim Einstempeln", variant: "destructive" }),
  });

  const ausMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/stempel/aus", { eintrag_id: aktiverStempel!.id }),
    onSuccess: () => {
      refetchStempel();
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege/monatsauswertung"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      toast({ title: "Ausgestempelt ✓", description: "Arbeitszeit wurde gespeichert." });
    },
    onError: () => toast({ title: "Fehler beim Ausstempeln", variant: "destructive" }),
  });

  // Timer: korrekte lokale Zeitberechnung
  useEffect(() => {
    if (!aktiverStempel?.start_zeit || aktiverStempel.end_zeit) {
      setElapsed("00:00:00");
      return;
    }
    const startDate = parseStempelStart(aktiverStempel.datum, aktiverStempel.start_zeit);
    const tick = () => {
      const diff = Date.now() - startDate.getTime();
      if (diff < 0) { setElapsed("00:00:00"); return; }
      const hh = Math.floor(diff / 3600000);
      const mm = Math.floor((diff % 3600000) / 60000);
      const ss = Math.floor((diff % 60000) / 1000);
      setElapsed(
        `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [aktiverStempel]);

  const eingestempelt = !!aktiverStempel && !aktiverStempel.end_zeit;
  const gekoppelterAuftrag = eingestempelt && aktiverStempel?.auftrag_id
    ? auftraege.find((a) => a.id === aktiverStempel.auftrag_id)
    : null;

  // Validierung: Ort muss gewählt sein, bei Werkstatt auch Maschine
  const canEinstempeln = !!selectedMaId && !!ort && (ort !== "Werkstatt" || !!maschine);

  return (
    <Card className="p-5 space-y-4">
      {/* Header mit Timer */}
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 shrink-0" style={{ color: "hsl(var(--primary))" }} />
        <h2 className="font-semibold text-base" style={{ fontFamily: "var(--font-display)" }}>
          Stempeluhr
        </h2>
        {eingestempelt && (
          <span className="ml-auto text-2xl font-mono font-bold tabular-nums" style={{ color: "hsl(var(--primary))" }}>
            {elapsed}
          </span>
        )}
      </div>

      {/* 1. Mitarbeiter */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Mitarbeiter</Label>
        <Select value={selectedMaId} onValueChange={(v) => setSelectedMaId(v)} disabled={eingestempelt}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Mitarbeiter auswählen…" />
          </SelectTrigger>
          <SelectContent>
            {mitarbeiter.filter((m) => m.id).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.vorname} {m.nachname}
                {m.position && <span className="text-muted-foreground text-xs ml-1">· {m.position}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 2. Auftrag */}
      {!eingestempelt && selectedMaId && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Auftrag</Label>
          <Select value={selectedAuftragId} onValueChange={setSelectedAuftragId}>
            <SelectTrigger>
              <SelectValue placeholder="Allgemeine Arbeitszeit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Allgemeine Arbeitszeit —</SelectItem>
              <SelectItem value="free">✏ Freie Tätigkeit eingeben…</SelectItem>
              {auftraege
                .filter((a) => OPEN_STATUSES.includes(a.status))
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-1">{a.nr}</span>
                    {a.titel}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedAuftragId === "free" && (
            <input
              type="text"
              value={freierText}
              onChange={(e) => setFreierText(e.target.value)}
              placeholder="z.B. Aufräumarbeiten, Fahrt, Besprechung…"
              className="w-full mt-1 px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          )}
        </div>
      )}

      {/* 3. Wo + 4. Maschinenpark */}
      {!eingestempelt && selectedMaId && (
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            3. Ort &amp; 4. Maschinenpark
          </Label>
          <OrtSelect
            ort={ort} setOrt={setOrt}
            maschine={maschine} setMaschine={setMaschine}
            disabled={eingestempelt}
          />
          {/* Satz-Vorschau */}
          {ort && (ort !== "Werkstatt" || maschine) && (() => {
            const label = getSatzLabel(stundensaetze, maName, mitarbeiter, ort, maschine);
            return label ? (
              <div className="mt-2 flex items-center gap-2 text-xs rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2">
                <span className="text-blue-600 dark:text-blue-400 font-mono font-semibold">{label}</span>
                <span className="text-blue-500 dark:text-blue-500">— wird verrechnet</span>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Status-Anzeige wenn eingestempelt */}
      {eingestempelt && aktiverStempel && (
        <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="font-semibold text-green-700 dark:text-green-300 text-sm">
              {maName} — aktiv seit {aktiverStempel.start_zeit.split(":").slice(0, 2).join(":")} Uhr
            </p>
          </div>
          {gekoppelterAuftrag && (
            <p className="text-xs text-green-600 dark:text-green-400 ml-4">
              Auftrag: {gekoppelterAuftrag.nr} — {gekoppelterAuftrag.titel}
            </p>
          )}
          {aktiverStempel.ort && (
            <p className="text-xs text-green-600 dark:text-green-400 ml-4">
              <MapPin className="h-3 w-3 inline mr-1" />
              {ortLabel(aktiverStempel.ort, aktiverStempel.maschinenpark)}
            </p>
          )}
          {!aktiverStempel.auftrag_id && aktiverStempel.beschreibung && aktiverStempel.beschreibung !== "Tagesarbeitszeit" && (
            <p className="text-xs text-green-600 dark:text-green-400 ml-4">
              Tätigkeit: {aktiverStempel.beschreibung}
            </p>
          )}
        </div>
      )}

      {/* Buttons */}
      {selectedMaId && (
        <div className="flex gap-2">
          {!eingestempelt ? (
            <Button
              className="flex-1 text-white font-semibold"
              style={{ background: "hsl(var(--primary))" }}
              onClick={() => einMutation.mutate()}
              disabled={!canEinstempeln || einMutation.isPending}
              data-testid="button-einstempeln"
              title={!ort ? "Bitte zuerst Ort auswählen" : (ort === "Werkstatt" && !maschine) ? "Bitte Maschinenpark auswählen" : ""}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Einstempeln
            </Button>
          ) : (
            <Button
              className="flex-1 text-white font-semibold"
              style={{ background: "#c0392b" }}
              onClick={() => ausMutation.mutate()}
              disabled={ausMutation.isPending}
              data-testid="button-ausstempeln"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Ausstempeln
            </Button>
          )}
        </div>
      )}
      {selectedMaId && !eingestempelt && !canEinstempeln && (
        <p className="text-xs text-amber-600 text-center">
          {!ort ? "⚠ Bitte Ort auswählen" : "⚠ Bitte Maschinenpark auswählen"}
        </p>
      )}
    </Card>
  );
}

// ─── Manuelle Zeiterfassung ───────────────────────────────────────────────────
function ManuelleErfassung({ auftraege, mitarbeiter }: { auftraege: Auftrag[], mitarbeiter: Mitarbeiter[] }) {
  const { toast } = useToast();
  const [selectedAuftragId, setSelectedAuftragId] = useState<string>("");
  const [selectedMaId, setSelectedMaId] = useState<string>("");
  const [beschreibung, setBeschreibung] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [startZeit, setStartZeit] = useState("");
  const [endZeit, setEndZeit] = useState("");
  const [ort, setOrt] = useState<string>("");
  const [maschine, setMaschine] = useState<string>("");

  let dauerVorschau = "";
  if (startZeit && endZeit) {
    const [sh, sm] = startZeit.split(":").map(Number);
    const [eh, em] = endZeit.split(":").map(Number);
    const min = eh * 60 + em - (sh * 60 + sm);
    if (min > 0) dauerVorschau = formatDauer(min);
  }

  const selectedMa = mitarbeiter.find((m) => m.id === selectedMaId);

  const addMutation = useMutation({
    mutationFn: () => {
      const maName = selectedMa ? `${selectedMa.vorname} ${selectedMa.nachname}` : "";
      const payload = {
        mitarbeiter: maName,
        beschreibung,
        datum,
        start_zeit: startZeit,
        end_zeit: endZeit,
        ort: ort || null,
        maschinenpark: (ort === "Werkstatt" && maschine) ? maschine : null,
      };
      if (selectedAuftragId && selectedAuftragId !== "none") {
        return apiRequest("POST", `/api/auftraege/${selectedAuftragId}/zeit`, payload);
      }
      return apiRequest("POST", "/api/zeiteintraege", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", selectedAuftragId, "zeit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege/monatsauswertung"] });
      setStartZeit(""); setEndZeit(""); setBeschreibung(""); setOrt(""); setMaschine("");
      toast({ title: "Zeit erfasst ✓" });
    },
    onError: (err: any) => toast({ title: "Fehler beim Speichern", description: err?.message || "", variant: "destructive" }),
  });

  const { data: eintraege = [] } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/auftraege", selectedAuftragId, "zeit"],
    queryFn: () =>
      apiRequest("GET", `/api/auftraege/${selectedAuftragId}/zeit`).then((r) => r.json()),
    enabled: !!selectedAuftragId && selectedAuftragId !== "none",
  });

  const delMutation = useMutation({
    mutationFn: (zid: string) =>
      apiRequest("DELETE", `/api/auftraege/${selectedAuftragId}/zeit/${zid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege", selectedAuftragId, "zeit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zeiteintraege/monatsauswertung"] });
    },
  });

  const totalMin = eintraege.reduce((s, e) => s + (e.dauer_minuten || 0), 0);
  const canSave = !!selectedMaId && !!startZeit && !!endZeit && !!dauerVorschau && !!ort && (ort !== "Werkstatt" || !!maschine);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <p className="text-sm font-semibold">Zeit manuell buchen</p>

        {/* 1. Mitarbeiter + 2. Auftrag */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Mitarbeiter</Label>
            <Select value={selectedMaId} onValueChange={setSelectedMaId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Auswählen…" /></SelectTrigger>
              <SelectContent>
                {mitarbeiter.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Auftrag <span className="normal-case font-normal">(optional)</span></Label>
            <Select value={selectedAuftragId} onValueChange={setSelectedAuftragId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="— Freie Tätigkeit —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Freie Tätigkeit —</SelectItem>
                {auftraege.filter((a) => OPEN_STATUSES.includes(a.status)).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-1">{a.nr}</span>{a.titel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 3. Ort + 4. Maschinenpark */}
        <div>
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">3. Ort &amp; 4. Maschinenpark</Label>
          <OrtSelect ort={ort} setOrt={setOrt} maschine={maschine} setMaschine={setMaschine} />
        </div>

        {/* Datum + Beschreibung */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Datum</Label>
            <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Was wurde gemacht?" className="mt-1" />
          </div>
        </div>

        {/* Start / Ende / Dauer */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Start</Label>
            <Input type="time" value={startZeit} onChange={(e) => setStartZeit(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Ende</Label>
            <Input type="time" value={endZeit} onChange={(e) => setEndZeit(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Dauer</Label>
            <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm font-semibold mt-1">
              {dauerVorschau || "—"}
            </div>
          </div>
        </div>

        <Button
          onClick={() => addMutation.mutate()}
          disabled={!canSave || addMutation.isPending}
          className="w-full text-white"
          style={{ background: "hsl(var(--primary))" }}
        >
          <Plus className="w-4 h-4 mr-2" />Zeit speichern
        </Button>
        {!canSave && selectedMaId && startZeit && endZeit && (
          <p className="text-xs text-amber-600 text-center">
            {!ort ? "⚠ Ort fehlt" : "⚠ Maschinenpark fehlt"}
          </p>
        )}
      </Card>

      {/* Einträge des gewählten Auftrags */}
      {selectedAuftragId && selectedAuftragId !== "none" && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Zeiten für diesen Auftrag</p>
            {totalMin > 0 && (
              <span className="text-sm font-bold" style={{ color: "hsl(var(--primary))" }}>
                <Timer className="h-4 w-4 inline mr-1" />Gesamt: {formatDauer(totalMin)}
              </span>
            )}
          </div>
          {eintraege.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Noch keine Zeiteinträge.</p>
          ) : (
            <div className="space-y-2">
              {eintraege.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{e.mitarbeiter || "—"}</span>
                      <span className="text-xs text-muted-foreground">{e.datum}</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{e.start_zeit} – {e.end_zeit || "läuft"}</span>
                      {e.dauer_minuten > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.1)" }}>
                          {formatDauer(e.dauer_minuten)}
                        </span>
                      )}
                      {e.ort && (
                        <span className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                          <MapPin className="h-3 w-3 inline mr-0.5" />{ortLabel(e.ort, e.maschinenpark)}
                        </span>
                      )}
                    </div>
                    {e.beschreibung && e.beschreibung !== "Tagesarbeitszeit" && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{e.beschreibung}</p>
                    )}
                  </div>
                  <button onClick={() => delMutation.mutate(e.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Monatsauswertung ─────────────────────────────────────────────────────────
function Monatsauswertung({ mitarbeiter, stundensaetze }: { mitarbeiter: Mitarbeiter[], stundensaetze: Stundensatz[] }) {
  const now = new Date();
  const [jahr, setJahr] = useState(now.getFullYear());
  const [monat, setMonat] = useState(now.getMonth() + 1);
  const [selectedMaId, setSelectedMaId] = useState<string>("alle");

  const monatName = new Date(jahr, monat - 1, 1).toLocaleString("de-CH", { month: "long" });

  const { data: eintraege = [], isLoading } = useQuery<Zeiteintrag[]>({
    queryKey: ["/api/zeiteintraege/monatsauswertung", jahr, monat, selectedMaId],
    queryFn: () => {
      const params = new URLSearchParams({ jahr: String(jahr), monat: String(monat) });
      if (selectedMaId !== "alle") {
        const ma = mitarbeiter.find(m => m.id === selectedMaId);
        if (ma) params.set("mitarbeiter_id", `${ma.vorname} ${ma.nachname}`);
      }
      return apiRequest("GET", `/api/zeiteintraege/monatsauswertung?${params}`).then((r) => r.json());
    },
  });

  const prevMonth = () => { if (monat === 1) { setJahr(j => j - 1); setMonat(12); } else setMonat(m => m - 1); };
  const nextMonth = () => { if (monat === 12) { setJahr(j => j + 1); setMonat(1); } else setMonat(m => m + 1); };

  // Stunden je Mitarbeiter aggregieren
  const byMa: Record<string, { name: string; tage: Set<string>; minuten: number; kosten: number; eintraege: Zeiteintrag[] }> = {};
  for (const e of eintraege) {
    const key = e.mitarbeiter || "unbekannt";
    // Gesamtsatz = Mitarbeiter-Grundsatz + Maschinen-Zuschlag
    const gesamtSatz = getGesamtSatz(stundensaetze, key, mitarbeiter, e.ort, e.maschinenpark);
    if (!byMa[key]) byMa[key] = { name: key, tage: new Set(), minuten: 0, kosten: 0, eintraege: [] };
    byMa[key].minuten += e.dauer_minuten || 0;
    byMa[key].tage.add(e.datum);
    byMa[key].kosten += ((e.dauer_minuten || 0) / 60) * gesamtSatz;
    byMa[key].eintraege.push(e);
  }

  const rows = Object.entries(byMa).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const totalMin = rows.reduce((s, [, v]) => s + v.minuten, 0);
  const totalKosten = rows.reduce((s, [, v]) => s + v.kosten, 0);

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-semibold text-base w-40 text-center">{monatName} {jahr}</span>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Filter:</Label>
            <Select value={selectedMaId} onValueChange={setSelectedMaId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Mitarbeiter</SelectItem>
                {mitarbeiter.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabelle */}
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm">
          Keine Zeiteinträge für {monatName} {jahr}.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground" style={{ background: "hsl(var(--sidebar))", color: "hsl(var(--sidebar-foreground))" }}>
                <th className="text-left p-3 font-medium">Mitarbeiter</th>
                <th className="text-center p-3 font-medium">Arbeitstage</th>
                <th className="text-right p-3 font-medium">Stunden</th>
                <th className="text-right p-3 font-medium">Kosten (Ort-Satz)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, v], i) => {
                const h = Math.floor(v.minuten / 60);
                const m = v.minuten % 60;
                return (
                  <tr key={key} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-muted/30" : "")}>
                    <td className="p-3 font-medium">{v.name}</td>
                    <td className="p-3 text-center text-muted-foreground">{v.tage.size} Tage</td>
                    <td className="p-3 text-right font-mono font-semibold" style={{ color: "hsl(var(--primary))" }}>
                      {h}h {m}min
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {v.kosten > 0 ? `CHF ${v.kosten.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t font-bold" style={{ background: "hsl(var(--primary) / 0.08)" }}>
                <td className="p-3">Total</td>
                <td className="p-3 text-center">—</td>
                <td className="p-3 text-right font-mono" style={{ color: "hsl(var(--primary))" }}>
                  {Math.floor(totalMin / 60)}h {totalMin % 60}min
                </td>
                <td className="p-3 text-right">
                  {totalKosten > 0 ? `CHF ${totalKosten.toFixed(2)}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}

      {/* Detailliste */}
      {rows.length > 0 && (
        <Card className="p-5 space-y-3">
          <p className="text-sm font-semibold">Einzel-Einträge {monatName} {jahr}</p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {eintraege.map((e) => {
              const gesamtSatzE = getGesamtSatz(stundensaetze, e.mitarbeiter || "", mitarbeiter, e.ort, e.maschinenpark);
              const satzLabel = getSatzLabel(stundensaetze, e.mitarbeiter || "", mitarbeiter, e.ort, e.maschinenpark);
              const kosten = ((e.dauer_minuten || 0) / 60) * gesamtSatzE;
              return (
                <div key={e.id} className="rounded-lg border bg-card p-2.5 text-xs space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold shrink-0">{e.mitarbeiter || "—"}</span>
                    <span className="text-muted-foreground shrink-0">{e.datum}</span>
                    <span className="bg-muted px-2 py-0.5 rounded shrink-0">{e.start_zeit} – {e.end_zeit || "läuft"}</span>
                    {e.dauer_minuten > 0 && (
                      <span className="font-bold shrink-0" style={{ color: "hsl(var(--primary))" }}>{formatDauer(e.dauer_minuten)}</span>
                    )}
                    {e.ort && (
                      <span className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 shrink-0">
                        {ortLabel(e.ort, e.maschinenpark)}
                      </span>
                    )}
                    {kosten > 0 && (
                      <span className="ml-auto font-semibold" style={{ color: "hsl(var(--primary))" }}>CHF {kosten.toFixed(2)}</span>
                    )}
                  </div>
                  {satzLabel && (
                    <div className="text-muted-foreground pl-0.5 font-mono">{satzLabel}</div>
                  )}
                  {e.beschreibung && (
                    <div className="text-muted-foreground truncate pl-0.5">{e.beschreibung}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Zeiterfassung() {
  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: mitarbeiter = [], isLoading: maLoading } = useQuery<Mitarbeiter[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then((r) => r.json()),
  });

  const { data: stundensaetze = [] } = useQuery<Stundensatz[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: () => apiRequest("GET", "/api/stundensaetze").then((r) => r.json()),
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
          <Clock className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Zeiterfassung</h1>
          <p className="text-sm text-muted-foreground">Ein-/Ausstempeln &amp; Stundenauswertung</p>
        </div>
      </div>

      {maLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : mitarbeiter.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Zuerst Mitarbeiter in der <strong>Mitarbeiterakte</strong> erfassen.
        </Card>
      ) : (
        <Tabs defaultValue="stempeluhr">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="stempeluhr" className="flex items-center gap-1.5">
              <LogIn className="h-3.5 w-3.5" />Stempeluhr
            </TabsTrigger>
            <TabsTrigger value="manuell" className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />Manuell buchen
            </TabsTrigger>
            <TabsTrigger value="auswertung" className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />Monatsauswertung
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stempeluhr" className="mt-4">
            <StempeluhrWidget mitarbeiter={mitarbeiter} auftraege={auftraege} stundensaetze={stundensaetze} />
          </TabsContent>

          <TabsContent value="manuell" className="mt-4">
            <ManuelleErfassung auftraege={auftraege} mitarbeiter={mitarbeiter} />
          </TabsContent>

          <TabsContent value="auswertung" className="mt-4">
            <Monatsauswertung mitarbeiter={mitarbeiter} stundensaetze={stundensaetze} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
