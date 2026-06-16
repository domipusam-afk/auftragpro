import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calculator,
  Package,
  Wrench,
  Receipt,
  FileDown,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCHF } from "@/lib/format";
import type { Auftrag } from "@shared/schema";

const openPdfInTab = (url: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
};

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Stundensatz {
  id: string;
  ort: string;
  maschinenpark: string | null;
  satz: number;       // Maschinen-Zuschlag (Werkstatt) ODER fixer Satz (Avor/Montage)
  grundsatz: number | null; // Basis-Stundensatz (nur Werkstatt)
  bezeichnung: string | null;
}

interface VkStunde {
  id?: string;
  auftrag_id: string;
  ort: string;
  maschinenpark?: string | null;
  soll_stunden: number;
  stundensatz: number;
}

interface VkMaterial {
  id?: string;
  auftrag_id: string;
  pos: number;
  profil: string;
  bemerkung: string;
  stueck: number;
  laenge_mm: number | null;
  kg_pro_m: number | null;
  total_kg: number | null;
  preis_pro_einheit: number;
  total_chf: number;
}

interface VkFremd {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  anzahl: number;
  einheit: string;
  preis_pro_einheit: number;
  total_chf: number;
}

interface VkSoek {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  anzahl: number;
  einheit: string;
  preis_pro_einheit: number;
  total_chf: number;
}

interface VkConfig {
  id?: string;
  auftrag_id: string;
  risiko_gewinn_prozent: number;
  rabatt_prozent: number;
  mwst_prozent: number;
  notiz: string;
}

interface NakaZeiteintrag {
  id: string;
  mitarbeiter: string;
  datum: string;
  dauer_minuten: number;
  ort?: string | null;
  maschinenpark?: string | null;
}

interface NakaMaterial {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  lieferant: string;
  betrag_chf: number;
  datum: string;
  notiz: string;
}

interface NakaFremd {
  id?: string;
  auftrag_id: string;
  bezeichnung: string;
  lieferant: string;
  betrag_chf: number;
  datum: string;
  notiz: string;
}

// ─── ORT-Konfiguration (muss mit stundensaetze-Tabelle übereinstimmen) ─────────

const ORT_CONFIGS = [
  { ort: "Avor", maschinenpark: null, label: "AVOR (Techn. Büro)" },
  { ort: "Werkstatt", maschinenpark: "Kleine Maschinen", label: "Werkstatt · Kleine Maschinen" },
  { ort: "Werkstatt", maschinenpark: "Mittlere Maschinen", label: "Werkstatt · Mittlere Maschinen" },
  { ort: "Werkstatt", maschinenpark: "Grosse Maschinen", label: "Werkstatt · Grosse Maschinen" },
  { ort: "Montage", maschinenpark: null, label: "Montage" },
];

function getOrtSatz(saetze: Stundensatz[], ort: string, maschine: string | null): number {
  const match = saetze.find((s) => {
    if (ort === "Werkstatt") return s.ort === "Werkstatt" && s.maschinenpark === maschine;
    return s.ort === ort && !s.maschinenpark;
  });
  if (!match) return 0;
  // Werkstatt: Grundsatz + Maschinen-Zuschlag = Total
  if (ort === "Werkstatt" && match.grundsatz) {
    return Number(match.grundsatz) + Number(match.satz);
  }
  // Avor / Montage: fixer Satz
  return Number(match.satz);
}

function ortKey(ort: string, maschine: string | null): string {
  return maschine ? `${ort}::${maschine}` : ort;
}

// ─── PDF Export ────────────────────────────────────────────────────────────────

async function downloadKalkulationPdf(
  auftragId: string,
  typ: "vorkalkulation" | "nachkalkulation",
  toast: (t: any) => void
) {
  try {
    const r = await fetch(`${API_BASE}/api/auftraege/${auftragId}/kalkulation-pdf?typ=${typ}`, {
      method: "POST",
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: "PDF Fehler" }));
      toast({ title: "PDF Fehler", description: err.message, variant: "destructive" });
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    openPdfInTab(url);
    toast({ title: "PDF erstellt ✓ — im Browser-Tab geöffnet" });
  } catch (e: any) {
    toast({ title: "Fehler", description: e.message, variant: "destructive" });
  }
}

// ─── Block A: Stunden-Soll ──────────────────────────────────────────────────────

function StundenBlock({
  auftragId,
  saetze,
}: {
  auftragId: string;
  saetze: Stundensatz[];
}) {
  const { toast } = useToast();

  const { data: stunden = [], isLoading } = useQuery<VkStunde[]>({
    queryKey: ["/api/vorkalkulation/stunden", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/stunden`).then((r) => r.json()),
  });

  const saveMut = useMutation({
    mutationFn: (rows: VkStunde[]) =>
      apiRequest("PUT", `/api/vorkalkulation/${auftragId}/stunden`, rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/stunden", auftragId] });
      toast({ title: "Stunden gespeichert ✓" });
    },
    onError: (e: any) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // Build rows from ORT_CONFIGS — fill with existing data
  const rows = ORT_CONFIGS.map((cfg) => {
    const satz = getOrtSatz(saetze, cfg.ort, cfg.maschinenpark);
    // Match by ort + maschinenpark (maschinenpark is now a real column)
    const found = stunden.find((s) => {
      const sMs = (s as any).maschinenpark ?? null;
      if (cfg.maschinenpark) {
        return s.ort === cfg.ort && sMs === cfg.maschinenpark;
      }
      return s.ort === cfg.ort && !sMs;
    });
    return {
      ort: cfg.ort,
      maschinenpark: cfg.maschinenpark,
      label: cfg.label,
      soll_stunden: found ? Number(found.soll_stunden) : 0,
      stundensatz: satz,
    };
  });

  const [localRows, setLocalRows] = useState<typeof rows | null>(null);
  const displayRows = localRows ?? rows;

  // Sync from server when loaded
  const [synced, setSynced] = useState(false);
  if (!isLoading && !synced && stunden !== undefined) {
    setLocalRows(rows);
    setSynced(true);
  }

  const update = (idx: number, val: number) => {
    setLocalRows((prev) => {
      const next = [...(prev ?? rows)];
      next[idx] = { ...next[idx], soll_stunden: val };
      return next;
    });
  };

  const handleSave = () => {
    const payload = (localRows ?? rows).map((r) => ({
      auftrag_id: auftragId,
      ort: r.ort,
      maschinenpark: r.maschinenpark ?? null,
      soll_stunden: r.soll_stunden,
      stundensatz: r.stundensatz,
    }));
    saveMut.mutate(payload);
  };

  const totalStunden = displayRows.reduce((s, r) => s + r.soll_stunden, 0);
  const totalKosten = displayRows.reduce((s, r) => s + r.soll_stunden * r.stundensatz, 0);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Stundensätze kommen aus den <strong>Einstellungen → Stundensätze</strong>.
        Hier nur die geplanten Stunden eingeben.
      </p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/50">
              <th className="text-left p-3">Bereich</th>
              <th className="text-right p-3 w-24">CHF/h</th>
              <th className="text-right p-3 w-28">Soll-Std.</th>
              <th className="text-right p-3 w-32">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                <td className="p-3 font-medium">
                  <MapPin className="h-3 w-3 inline mr-1.5 text-muted-foreground" />
                  {r.label}
                </td>
                <td className="p-3 text-right text-muted-foreground tabular-nums">
                  {r.stundensatz > 0 ? `${r.stundensatz.toFixed(0)}` : (
                    <span className="text-amber-500 text-xs">⚠ nicht gesetzt</span>
                  )}
                </td>
                <td className="p-3">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={r.soll_stunden || ""}
                    onChange={(e) => update(i, Number(e.target.value) || 0)}
                    className="text-right h-8 w-full"
                    placeholder="0"
                  />
                </td>
                <td className="p-3 text-right font-semibold tabular-nums">
                  {r.soll_stunden > 0
                    ? `CHF ${(r.soll_stunden * r.stundensatz).toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
            <tr className="font-bold bg-primary/5">
              <td className="p-3" colSpan={2}>Total Stunden</td>
              <td className="p-3 text-right tabular-nums" style={{ color: "hsl(var(--primary))" }}>
                {totalStunden > 0 ? `${totalStunden.toFixed(1)} h` : "—"}
              </td>
              <td className="p-3 text-right tabular-nums" style={{ color: "hsl(var(--primary))" }}>
                {totalKosten > 0 ? `CHF ${totalKosten.toFixed(2)}` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="bg-[#6b4c2a] hover:bg-[#5a3e22] text-white"
        >
          Stunden speichern
        </Button>
      </div>
    </div>
  );
}

// ─── Block B: Material Stückliste ───────────────────────────────────────────────

function MaterialBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<VkMaterial[]>({
    queryKey: ["/api/vorkalkulation/material", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/material`).then((r) => r.json()),
  });

  const addMut = useMutation({
    mutationFn: (item: Omit<VkMaterial, "id">) =>
      apiRequest("POST", `/api/vorkalkulation/${auftragId}/material`, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/material", auftragId] });
      toast({ title: "Position hinzugefügt ✓" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/vorkalkulation/${auftragId}/material/${id}`).then(r => r.json()),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/vorkalkulation/material", auftragId], (old: any[]) =>
        (old || []).filter(i => i.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/material", auftragId] });
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", description: "Position konnte nicht gelöscht werden.", variant: "destructive" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VkMaterial> }) =>
      apiRequest("PATCH", `/api/vorkalkulation/${auftragId}/material/${id}`, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/material", auftragId] }),
  });

  const [newRow, setNewRow] = useState<Partial<VkMaterial>>({
    profil: "",
    bemerkung: "",
    stueck: 1,
    laenge_mm: null,
    kg_pro_m: null,
    total_kg: null,
    preis_pro_einheit: 0,
    total_chf: 0,
  });

  const calcTotalChf = (r: Partial<VkMaterial>): number => {
    if (r.total_kg && r.preis_pro_einheit) return Number(r.total_kg) * Number(r.preis_pro_einheit);
    if (r.preis_pro_einheit && r.stueck) return Number(r.preis_pro_einheit) * Number(r.stueck);
    return 0;
  };

  const calcTotalKg = (r: Partial<VkMaterial>): number | null => {
    if (r.stueck && r.laenge_mm && r.kg_pro_m) {
      return Number(r.stueck) * (Number(r.laenge_mm) / 1000) * Number(r.kg_pro_m);
    }
    return null;
  };

  const handleAdd = () => {
    const totalKg = calcTotalKg(newRow);
    const totalChf = calcTotalChf({ ...newRow, total_kg: totalKg ?? newRow.total_kg ?? null });
    addMut.mutate({
      auftrag_id: auftragId,
      pos: (items.length ?? 0) + 1,
      profil: newRow.profil || "",
      bemerkung: newRow.bemerkung || "",
      stueck: Number(newRow.stueck) || 1,
      laenge_mm: newRow.laenge_mm ? Number(newRow.laenge_mm) : null,
      kg_pro_m: newRow.kg_pro_m ? Number(newRow.kg_pro_m) : null,
      total_kg: totalKg,
      preis_pro_einheit: Number(newRow.preis_pro_einheit) || 0,
      total_chf: totalChf,
    });
    setNewRow({ profil: "", bemerkung: "", stueck: 1, laenge_mm: null, kg_pro_m: null, total_kg: null, preis_pro_einheit: 0, total_chf: 0 });
  };

  const totalKg = items.reduce((s, i) => s + (Number(i.total_kg) || 0), 0);
  const totalChf = items.reduce((s, i) => s + (Number(i.total_chf) || 0), 0);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Stückliste nach Profilen. Total kg × Fr./kg = Betrag. Oder direkt Fr./Stk. × Stück.
      </p>

      {/* Eingabe-Zeile */}
      <Card className="p-3 border-2 border-dashed border-[#6b4c2a]/30 bg-[#6b4c2a]/5">
        <p className="text-xs font-semibold text-[#6b4c2a] mb-2">Neue Position</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Profil / Material</Label>
            <Input
              value={newRow.profil || ""}
              onChange={(e) => setNewRow((p) => ({ ...p, profil: e.target.value }))}
              placeholder="z.B. RHS 60×40×3, Flachstahl 60×6"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Bemerkung</Label>
            <Input
              value={newRow.bemerkung || ""}
              onChange={(e) => setNewRow((p) => ({ ...p, bemerkung: e.target.value }))}
              placeholder="optional"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Stück</Label>
            <Input
              type="number"
              min={1}
              value={newRow.stueck || ""}
              onChange={(e) => setNewRow((p) => ({ ...p, stueck: Number(e.target.value) || 1 }))}
              className="mt-0.5 h-8"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">Länge (mm)</Label>
            <Input
              type="number"
              min={0}
              value={newRow.laenge_mm || ""}
              onChange={(e) => setNewRow((p) => ({ ...p, laenge_mm: Number(e.target.value) || null }))}
              placeholder="optional"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">kg/m</Label>
            <Input
              type="number"
              min={0}
              step="0.001"
              value={newRow.kg_pro_m || ""}
              onChange={(e) => setNewRow((p) => ({ ...p, kg_pro_m: Number(e.target.value) || null }))}
              placeholder="optional"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Fr./kg oder Fr./Stk.</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={newRow.preis_pro_einheit || ""}
              onChange={(e) => setNewRow((p) => ({ ...p, preis_pro_einheit: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleAdd}
              disabled={!newRow.profil || addMut.isPending}
              className="w-full h-8 bg-[#6b4c2a] hover:bg-[#5a3e22] text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Hinzufügen
            </Button>
          </div>
        </div>
      </Card>

      {/* Liste */}
      {items.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Noch keine Materialien erfasst.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground uppercase">
                <th className="text-left p-2">Pos.</th>
                <th className="text-left p-2">Profil</th>
                <th className="text-right p-2">Stk.</th>
                <th className="text-right p-2">Länge</th>
                <th className="text-right p-2">kg/m</th>
                <th className="text-right p-2">Total kg</th>
                <th className="text-right p-2">Fr./Einh.</th>
                <th className="text-right p-2">Total CHF</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-2 text-muted-foreground">{i + 1}</td>
                  <td className="p-2 font-medium">
                    {item.profil}
                    {item.bemerkung && (
                      <span className="text-muted-foreground ml-1">({item.bemerkung})</span>
                    )}
                  </td>
                  <td className="p-2 text-right">{item.stueck}</td>
                  <td className="p-2 text-right text-muted-foreground">
                    {item.laenge_mm ? `${item.laenge_mm} mm` : "—"}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">
                    {item.kg_pro_m ? `${Number(item.kg_pro_m).toFixed(3)}` : "—"}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {item.total_kg ? `${Number(item.total_kg).toFixed(2)} kg` : "—"}
                  </td>
                  <td className="p-2 text-right">{Number(item.preis_pro_einheit).toFixed(2)}</td>
                  <td className="p-2 text-right font-semibold" style={{ color: "hsl(var(--primary))" }}>
                    {Number(item.total_chf).toFixed(2)}
                  </td>
                  <td className="p-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => item.id && delMut.mutate(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="font-bold bg-primary/5">
                <td className="p-2" colSpan={5}>Total</td>
                <td className="p-2 text-right font-mono">
                  {totalKg > 0 ? `${totalKg.toFixed(2)} kg` : "—"}
                </td>
                <td className="p-2"></td>
                <td className="p-2 text-right" style={{ color: "hsl(var(--primary))" }}>
                  CHF {totalChf.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Block C: Fremdleistungen ───────────────────────────────────────────────────

function FremdleistungenBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const EINHEITEN = ["Psch.", "Stk.", "m", "m²", "kg", "h", "km"];

  const { data: items = [], isLoading } = useQuery<VkFremd[]>({
    queryKey: ["/api/vorkalkulation/fremd", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/fremdleistungen`).then((r) => r.json()),
  });

  const addMut = useMutation({
    mutationFn: (item: Omit<VkFremd, "id">) =>
      apiRequest("POST", `/api/vorkalkulation/${auftragId}/fremdleistungen`, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/fremd", auftragId] });
      toast({ title: "Fremdleistung hinzugefügt ✓" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/vorkalkulation/${auftragId}/fremdleistungen/${id}`).then(r => r.json()),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/vorkalkulation/fremd", auftragId], (old: any[]) =>
        (old || []).filter(i => i.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/fremd", auftragId] });
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", description: "Position konnte nicht gelöscht werden.", variant: "destructive" });
    },
  });

  const [nr, setNr] = useState({ bezeichnung: "", anzahl: 1, einheit: "Psch.", preis: 0 });

  const handleAdd = () => {
    addMut.mutate({
      auftrag_id: auftragId,
      bezeichnung: nr.bezeichnung,
      anzahl: nr.anzahl,
      einheit: nr.einheit,
      preis_pro_einheit: nr.preis,
      total_chf: nr.anzahl * nr.preis,
    });
    setNr({ bezeichnung: "", anzahl: 1, einheit: "Psch.", preis: 0 });
  };

  const total = items.reduce((s, i) => s + Number(i.total_chf), 0);

  // Suggested items
  const VORSCHLAEGE = [
    "Autokran", "Abkantarbeit", "Feuerverzinken", "Laserschneiden",
    "Fremd-Transport", "Oberflächenbehandlung / Lackierung",
    "Glaslieferant", "Rohstoff-Transport",
  ];

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Fremdleistungen: Zukauf, Lohnarbeiten, Transporte usw.
      </p>

      {/* Schnell-Vorschläge */}
      <div className="flex flex-wrap gap-1.5">
        {VORSCHLAEGE.map((v) => (
          <button
            key={v}
            onClick={() => setNr((p) => ({ ...p, bezeichnung: v }))}
            className="text-xs px-2 py-1 rounded-full border border-[#6b4c2a]/30 hover:bg-[#6b4c2a]/10 text-[#6b4c2a] transition-colors"
          >
            + {v}
          </button>
        ))}
      </div>

      <Card className="p-3 border-2 border-dashed border-[#6b4c2a]/30 bg-[#6b4c2a]/5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <Label className="text-xs">Bezeichnung</Label>
            <Input
              value={nr.bezeichnung}
              onChange={(e) => setNr((p) => ({ ...p, bezeichnung: e.target.value }))}
              placeholder="z.B. Autokran, Feuerverzinken…"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Anzahl</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={nr.anzahl}
              onChange={(e) => setNr((p) => ({ ...p, anzahl: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Einheit</Label>
            <Select value={nr.einheit} onValueChange={(v) => setNr((p) => ({ ...p, einheit: v }))}>
              <SelectTrigger className="mt-0.5 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EINHEITEN.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fr. / Einheit</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={nr.preis || ""}
              onChange={(e) => setNr((p) => ({ ...p, preis: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Total</Label>
            <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-sm font-semibold mt-0.5">
              CHF {(nr.anzahl * nr.preis).toFixed(2)}
            </div>
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button
              onClick={handleAdd}
              disabled={!nr.bezeichnung || addMut.isPending}
              className="w-full h-8 bg-[#6b4c2a] hover:bg-[#5a3e22] text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Hinzufügen
            </Button>
          </div>
        </div>
      </Card>

      {items.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="text-left p-2">Bezeichnung</th>
                <th className="text-right p-2">Anz.</th>
                <th className="text-right p-2">Einh.</th>
                <th className="text-right p-2">Fr./E.</th>
                <th className="text-right p-2">Total CHF</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-2 font-medium">{item.bezeichnung}</td>
                  <td className="p-2 text-right">{item.anzahl}</td>
                  <td className="p-2 text-right text-muted-foreground">{item.einheit}</td>
                  <td className="p-2 text-right">{Number(item.preis_pro_einheit).toFixed(2)}</td>
                  <td className="p-2 text-right font-semibold" style={{ color: "hsl(var(--primary))" }}>
                    {Number(item.total_chf).toFixed(2)}
                  </td>
                  <td className="p-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => item.id && delMut.mutate(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="font-bold bg-primary/5">
                <td className="p-2" colSpan={4}>Total Fremdleistungen</td>
                <td className="p-2 text-right" style={{ color: "hsl(var(--primary))" }}>
                  CHF {total.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Block D: SOEK / Spesen ─────────────────────────────────────────────────────

function SoekBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const EINHEITEN = ["Stk.", "Tage", "km", "Nächte", "h", "Psch."];

  const { data: items = [], isLoading } = useQuery<VkSoek[]>({
    queryKey: ["/api/vorkalkulation/soek", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/soek`).then((r) => r.json()),
  });

  const addMut = useMutation({
    mutationFn: (item: Omit<VkSoek, "id">) =>
      apiRequest("POST", `/api/vorkalkulation/${auftragId}/soek`, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/soek", auftragId] });
      toast({ title: "SOEK hinzugefügt ✓" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/vorkalkulation/${auftragId}/soek/${id}`).then(r => r.json()),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["/api/vorkalkulation/soek", auftragId], (old: any[]) =>
        (old || []).filter(i => i.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ["/api/vorkalkulation/soek", auftragId] });
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", description: "Position konnte nicht gelöscht werden.", variant: "destructive" });
    },
  });

  const [nr, setNr] = useState({ bezeichnung: "", anzahl: 1, einheit: "Stk.", preis: 0 });

  const handleAdd = () => {
    addMut.mutate({
      auftrag_id: auftragId,
      bezeichnung: nr.bezeichnung,
      anzahl: nr.anzahl,
      einheit: nr.einheit,
      preis_pro_einheit: nr.preis,
      total_chf: nr.anzahl * nr.preis,
    });
    setNr({ bezeichnung: "", anzahl: 1, einheit: "Stk.", preis: 0 });
  };

  const total = items.reduce((s, i) => s + Number(i.total_chf), 0);

  const VORSCHLAEGE = [
    "Verpflegung", "Unterkunft", "Reise PW (km)", "Transport Firmenbus (km)",
    "LKW", "Parkgebühren", "Werkzeug-Sonderkauf",
  ];

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Sondereinzelkosten: Spesen, Reisen, Unterkunft, Transport.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {VORSCHLAEGE.map((v) => (
          <button
            key={v}
            onClick={() => setNr((p) => ({ ...p, bezeichnung: v }))}
            className="text-xs px-2 py-1 rounded-full border border-[#6b4c2a]/30 hover:bg-[#6b4c2a]/10 text-[#6b4c2a] transition-colors"
          >
            + {v}
          </button>
        ))}
      </div>

      <Card className="p-3 border-2 border-dashed border-[#6b4c2a]/30 bg-[#6b4c2a]/5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <Label className="text-xs">Bezeichnung</Label>
            <Input
              value={nr.bezeichnung}
              onChange={(e) => setNr((p) => ({ ...p, bezeichnung: e.target.value }))}
              placeholder="z.B. Verpflegung, km…"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Anzahl</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={nr.anzahl}
              onChange={(e) => setNr((p) => ({ ...p, anzahl: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Einheit</Label>
            <Select value={nr.einheit} onValueChange={(v) => setNr((p) => ({ ...p, einheit: v }))}>
              <SelectTrigger className="mt-0.5 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EINHEITEN.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fr. / Einheit</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={nr.preis || ""}
              onChange={(e) => setNr((p) => ({ ...p, preis: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div className="flex items-end sm:col-span-3">
            <Button
              onClick={handleAdd}
              disabled={!nr.bezeichnung || addMut.isPending}
              className="w-full h-8 bg-[#6b4c2a] hover:bg-[#5a3e22] text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Hinzufügen
            </Button>
          </div>
        </div>
      </Card>

      {items.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="text-left p-2">Bezeichnung</th>
                <th className="text-right p-2">Anz.</th>
                <th className="text-right p-2">Einh.</th>
                <th className="text-right p-2">Fr./E.</th>
                <th className="text-right p-2">Total CHF</th>
                <th className="p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-2 font-medium">{item.bezeichnung}</td>
                  <td className="p-2 text-right">{item.anzahl}</td>
                  <td className="p-2 text-right text-muted-foreground">{item.einheit}</td>
                  <td className="p-2 text-right">{Number(item.preis_pro_einheit).toFixed(2)}</td>
                  <td className="p-2 text-right font-semibold" style={{ color: "hsl(var(--primary))" }}>
                    {Number(item.total_chf).toFixed(2)}
                  </td>
                  <td className="p-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => item.id && delMut.mutate(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="font-bold bg-primary/5">
                <td className="p-2" colSpan={4}>Total SOEK</td>
                <td className="p-2 text-right" style={{ color: "hsl(var(--primary))" }}>
                  CHF {total.toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Offertpreis Zusammenfassung ────────────────────────────────────────────────

function ZusammenfassungBlock({
  auftragId,
  saetze,
}: {
  auftragId: string;
  saetze: Stundensatz[];
}) {
  const { toast } = useToast();

  const { data: stunden = [] } = useQuery<VkStunde[]>({
    queryKey: ["/api/vorkalkulation/stunden", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/stunden`).then((r) => r.json()),
  });

  const { data: material = [] } = useQuery<VkMaterial[]>({
    queryKey: ["/api/vorkalkulation/material", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/material`).then((r) => r.json()),
  });

  const { data: fremd = [] } = useQuery<VkFremd[]>({
    queryKey: ["/api/vorkalkulation/fremd", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/fremdleistungen`).then((r) => r.json()),
  });

  const { data: soek = [] } = useQuery<VkSoek[]>({
    queryKey: ["/api/vorkalkulation/soek", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/soek`).then((r) => r.json()),
  });

  const { data: config, refetch: refetchConfig } = useQuery<VkConfig>({
    queryKey: ["/api/vorkalkulation/config", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/config`).then((r) => r.json()),
  });

  const [cfg, setCfg] = useState<Partial<VkConfig>>({
    risiko_gewinn_prozent: 15,
    rabatt_prozent: 0,
    mwst_prozent: 8.1,
    notiz: "",
  });

  // Sync config from server
  const [cfgSynced, setCfgSynced] = useState(false);
  if (config && !cfgSynced) {
    setCfg({
      risiko_gewinn_prozent: Number(config.risiko_gewinn_prozent),
      rabatt_prozent: Number(config.rabatt_prozent),
      mwst_prozent: Number(config.mwst_prozent),
      notiz: config.notiz || "",
    });
    setCfgSynced(true);
  }

  const saveCfgMut = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/vorkalkulation/${auftragId}/config`, cfg),
    onSuccess: () => {
      refetchConfig();
      toast({ title: "Kalkulation gespeichert ✓" });
    },
    onError: (e: any) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // Berechnungen
  const totalStundenKosten = stunden.reduce(
    (s, r) => s + Number(r.soll_stunden) * Number(r.stundensatz),
    0
  );
  const totalMaterial = material.reduce((s, m) => s + Number(m.total_chf), 0);
  const totalFremd = fremd.reduce((s, f) => s + Number(f.total_chf), 0);
  const totalSoek = soek.reduce((s, s2) => s + Number(s2.total_chf), 0);
  const selbstkosten = totalStundenKosten + totalMaterial + totalFremd + totalSoek;

  const risikoGewinn = selbstkosten * ((cfg.risiko_gewinn_prozent || 0) / 100);
  const nettoOhneRabatt = selbstkosten + risikoGewinn;
  const rabattBetrag = nettoOhneRabatt * ((cfg.rabatt_prozent || 0) / 100);
  const netto = nettoOhneRabatt - rabattBetrag;
  const mwstBetrag = netto * ((cfg.mwst_prozent || 8.1) / 100);
  const brutto = netto + mwstBetrag;

  const Row = ({ label, value, sub, bold, color }: { label: string; value: string; sub?: string; bold?: boolean; color?: string }) => (
    <div className={`flex justify-between items-start py-1.5 border-b last:border-0 ${bold ? "font-bold" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}{sub && <span className="text-xs ml-1 opacity-60">{sub}</span>}</span>
      <span className={`text-sm tabular-nums ${bold ? "" : ""}`} style={color ? { color } : undefined}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Zusammenfassung */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-sm" style={{ fontFamily: "var(--font-display)" }}>
          Offertpreis-Berechnung
        </h3>
        <div className="space-y-0.5">
          <Row label="Lohneinzelkosten (Stunden)" value={`CHF ${totalStundenKosten.toFixed(2)}`} />
          <Row label="Material (Stückliste)" value={`CHF ${totalMaterial.toFixed(2)}`} />
          <Row label="Fremdleistungen" value={`CHF ${totalFremd.toFixed(2)}`} />
          <Row label="SOEK / Spesen" value={`CHF ${totalSoek.toFixed(2)}`} />
          <div className="border-t mt-2 pt-2">
            <Row label="Selbstkosten" value={`CHF ${selbstkosten.toFixed(2)}`} bold />
          </div>
        </div>
      </Card>

      {/* Einstellungen Risiko / MwSt */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
          Zuschläge & Preisberechnung
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Risiko & Gewinn %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={cfg.risiko_gewinn_prozent ?? 15}
              onChange={(e) => setCfg((p) => ({ ...p, risiko_gewinn_prozent: Number(e.target.value) }))}
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Rabatt %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={cfg.rabatt_prozent ?? 0}
              onChange={(e) => setCfg((p) => ({ ...p, rabatt_prozent: Number(e.target.value) }))}
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">MwSt. %</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={cfg.mwst_prozent ?? 8.1}
              onChange={(e) => setCfg((p) => ({ ...p, mwst_prozent: Number(e.target.value) }))}
              className="mt-1 h-8"
            />
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-1.5 bg-muted/20">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Selbstkosten</span>
            <span className="font-semibold">CHF {selbstkosten.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">+ Risiko/Gewinn {cfg.risiko_gewinn_prozent}%</span>
            <span>CHF {risikoGewinn.toFixed(2)}</span>
          </div>
          {(cfg.rabatt_prozent ?? 0) > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>- Rabatt {cfg.rabatt_prozent}%</span>
              <span>- CHF {rabattBetrag.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t pt-1.5">
            <span className="text-muted-foreground">Netto exkl. MwSt.</span>
            <span className="font-semibold">CHF {netto.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>MwSt. {cfg.mwst_prozent}%</span>
            <span>CHF {mwstBetrag.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t pt-2" style={{ color: "hsl(var(--primary))" }}>
            <span>Bruttooffertpreis</span>
            <span>CHF {brutto.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <Label className="text-xs">Interne Notiz zur Kalkulation</Label>
          <Textarea
            value={cfg.notiz || ""}
            onChange={(e) => setCfg((p) => ({ ...p, notiz: e.target.value }))}
            rows={2}
            className="mt-1 text-sm"
            placeholder="z.B. Risikozuschlag für komplexe Bauform…"
          />
        </div>

        <Button
          onClick={() => saveCfgMut.mutate()}
          disabled={saveCfgMut.isPending}
          className="bg-[#6b4c2a] hover:bg-[#5a3e22] text-white"
        >
          Kalkulation speichern
        </Button>
      </Card>
    </div>
  );
}

// ─── Nachkalkulation (Soll-Ist-Vergleich) ──────────────────────────────────────

interface VkConfigNaka {
  risiko_gewinn_prozent: number;
  rabatt_prozent: number;
  mwst_prozent: number;
}

function NachkalkulationBlock({
  auftragId,
  saetze,
}: {
  auftragId: string;
  saetze: Stundensatz[];
}) {
  const { toast } = useToast();

  // VK Daten
  const { data: vkStunden = [] } = useQuery<VkStunde[]>({
    queryKey: ["/api/vorkalkulation/stunden", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/stunden`).then((r) => r.json()),
  });
  const { data: vkMaterial = [] } = useQuery<VkMaterial[]>({
    queryKey: ["/api/vorkalkulation/material", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/material`).then((r) => r.json()),
  });
  const { data: vkFremd = [] } = useQuery<VkFremd[]>({
    queryKey: ["/api/vorkalkulation/fremd", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/fremdleistungen`).then((r) => r.json()),
  });
  const { data: vkSoek = [] } = useQuery<VkSoek[]>({
    queryKey: ["/api/vorkalkulation/soek", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/vorkalkulation/${auftragId}/soek`).then((r) => r.json()),
  });

  // IST: Zeiteinträge
  const { data: zeiteintraege = [] } = useQuery<NakaZeiteintrag[]>({
    queryKey: ["/api/auftraege", auftragId, "zeit"],
    queryFn: () =>
      apiRequest("GET", `/api/auftraege/${auftragId}/zeit`).then((r) => r.json()),
  });

  // IST: Material (manuell)
  const { data: nakaMaterial = [], isLoading: nakaMaterialLoading } = useQuery<NakaMaterial[]>({
    queryKey: ["/api/nachkalkulation/material", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/nachkalkulation/${auftragId}/material`).then((r) => r.json()),
  });

  const { data: nakaFremd = [] } = useQuery<NakaFremd[]>({
    queryKey: ["/api/nachkalkulation/fremd", auftragId],
    queryFn: () =>
      apiRequest("GET", `/api/nachkalkulation/${auftragId}/fremdleistungen`).then((r) => r.json()),
  });

  const { data: auftragData } = useQuery<Auftrag>({
    queryKey: ["/api/auftraege", auftragId],
    queryFn: () => apiRequest("GET", `/api/auftraege/${auftragId}`).then((r) => r.json()),
  });

  const { data: vkConfigNaka } = useQuery<VkConfigNaka>({
    queryKey: ["/api/vorkalkulation/config", auftragId],
    queryFn: () => apiRequest("GET", `/api/vorkalkulation/${auftragId}/config`).then((r) => r.json()),
  });

  const addNakaMaterial = useMutation({
    mutationFn: (item: Omit<NakaMaterial, "id">) =>
      apiRequest("POST", `/api/nachkalkulation/${auftragId}/material`, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nachkalkulation/material", auftragId] });
      toast({ title: "Ist-Material erfasst ✓" });
    },
  });

  const delNakaMaterial = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/nachkalkulation/${auftragId}/material/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/nachkalkulation/material", auftragId] }),
  });

  const addNakaFremd = useMutation({
    mutationFn: (item: Omit<NakaFremd, "id">) =>
      apiRequest("POST", `/api/nachkalkulation/${auftragId}/fremdleistungen`, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nachkalkulation/fremd", auftragId] });
      toast({ title: "Ist-Fremdleistung erfasst ✓" });
    },
  });

  const delNakaFremd = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/nachkalkulation/${auftragId}/fremdleistungen/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/nachkalkulation/fremd", auftragId] }),
  });

  const [newMat, setNewMat] = useState({ bezeichnung: "", lieferant: "", betrag_chf: 0, datum: new Date().toISOString().slice(0, 10), notiz: "" });
  const [newFrmd, setNewFrmd] = useState({ bezeichnung: "", lieferant: "", betrag_chf: 0, datum: new Date().toISOString().slice(0, 10), notiz: "" });

  // ── Berechnungen ──────────────────────────────────────────────────────────────

  // IST Stunden nach Ort/Maschine aggregieren
  const istByOrt: Record<string, { label: string; minuten: number; kosten: number }> = {};
  for (const e of zeiteintraege) {
    const key = e.ort === "Werkstatt"
      ? `Werkstatt::${e.maschinenpark || ""}`
      : (e.ort || "Unbekannt");
    const label = e.ort === "Werkstatt" && e.maschinenpark
      ? `Werkstatt · ${e.maschinenpark}`
      : (e.ort || "Unbekannt");
    const satz = getOrtSatz(saetze, e.ort || "", e.maschinenpark || null);
    if (!istByOrt[key]) istByOrt[key] = { label, minuten: 0, kosten: 0 };
    istByOrt[key].minuten += e.dauer_minuten || 0;
    istByOrt[key].kosten += ((e.dauer_minuten || 0) / 60) * satz;
  }

  // SOLL aggregieren (von VK)
  const sollByOrt: Record<string, { label: string; stunden: number; kosten: number }> = {};
  for (const s of vkStunden) {
    const key = (s as any)._maschinenpark
      ? `${s.ort}::${(s as any)._maschinenpark}`
      : s.ort;
    const label = ORT_CONFIGS.find(c => ortKey(c.ort, c.maschinenpark) === key)?.label || key;
    if (!sollByOrt[key]) sollByOrt[key] = { label, stunden: 0, kosten: 0 };
    sollByOrt[key].stunden += Number(s.soll_stunden);
    sollByOrt[key].kosten += Number(s.soll_stunden) * Number(s.stundensatz);
  }

  // Totale
  const vkTotalStunden = Object.values(sollByOrt).reduce((s, v) => s + v.stunden, 0);
  const vkTotalStundenKosten = Object.values(sollByOrt).reduce((s, v) => s + v.kosten, 0);
  const istTotalMinuten = Object.values(istByOrt).reduce((s, v) => s + v.minuten, 0);
  const istTotalStunden = istTotalMinuten / 60;
  const istTotalStundenKosten = Object.values(istByOrt).reduce((s, v) => s + v.kosten, 0);

  const vkTotalMaterial = vkMaterial.reduce((s, m) => s + Number(m.total_chf), 0);
  const istTotalMaterial = nakaMaterial.reduce((s, m) => s + Number(m.betrag_chf), 0);

  const vkTotalFremd = vkFremd.reduce((s, f) => s + Number(f.total_chf), 0);
  const istTotalFremd = nakaFremd.reduce((s, f) => s + Number(f.betrag_chf), 0);

  const vkTotalSoek = vkSoek.reduce((s, s2) => s + Number(s2.total_chf), 0);

  const vkSelbstkosten = vkTotalStundenKosten + vkTotalMaterial + vkTotalFremd + vkTotalSoek;
  const istSelbstkosten = istTotalStundenKosten + istTotalMaterial + istTotalFremd;

  // VK-Offertpreis aus Konfiguration
  const risikoGewinnPctNaka = vkConfigNaka?.risiko_gewinn_prozent ?? 15;
  const rabattPctNaka = vkConfigNaka?.rabatt_prozent ?? 0;
  const mwstPctNaka = vkConfigNaka?.mwst_prozent ?? 8.1;
  const vkRisikoGewinnNaka = vkSelbstkosten * (risikoGewinnPctNaka / 100);
  const vkNettoOhneRabattNaka = vkSelbstkosten + vkRisikoGewinnNaka;
  const vkRabattNaka = vkNettoOhneRabattNaka * (rabattPctNaka / 100);
  const vkNettoNaka = vkNettoOhneRabattNaka - vkRabattNaka;
  const vkMwstNaka = vkNettoNaka * (mwstPctNaka / 100);
  const vkBruttoNaka = vkNettoNaka + vkMwstNaka;
  const gewinnVsVkNaka = vkNettoNaka - istSelbstkosten;
  const auftragswert = auftragData?.angebots_betrag || 0;
  const gewinnVsAuftragNaka = auftragswert > 0 ? auftragswert - istSelbstkosten : null;

  function DiffRow({
    label,
    soll,
    ist,
    unit = "CHF",
    isStunden = false,
  }: {
    label: string;
    soll: number;
    ist: number;
    unit?: string;
    isStunden?: boolean;
  }) {
    const diff = soll - ist;
    const diffPct = soll > 0 ? (diff / soll) * 100 : 0;
    const positive = diff >= 0; // positive = unter Budget / gut
    return (
      <tr className="border-b last:border-0 hover:bg-muted/10">
        <td className="p-3 text-sm font-medium">{label}</td>
        <td className="p-3 text-right tabular-nums text-sm">
          {isStunden ? `${soll.toFixed(1)} h` : `CHF ${soll.toFixed(2)}`}
        </td>
        <td className="p-3 text-right tabular-nums text-sm">
          {ist > 0
            ? isStunden ? `${ist.toFixed(1)} h` : `CHF ${ist.toFixed(2)}`
            : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="p-3 text-right tabular-nums text-sm">
          {ist > 0 || soll > 0 ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              positive
                ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
            }`}>
              {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isStunden ? `${Math.abs(diff).toFixed(1)} h` : `CHF ${Math.abs(diff).toFixed(2)}`}
            </span>
          ) : "—"}
        </td>
        <td className="p-3 text-right text-xs text-muted-foreground">
          {soll > 0 && ist > 0 ? `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%` : "—"}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-5">
      {/* Soll-Ist Vergleich Tabelle */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <BarChart3 className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
            Soll-Ist-Vergleich
          </h3>
          <span className="text-xs text-muted-foreground">+ = unter Budget (gut)</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/50">
              <th className="text-left p-3">Position</th>
              <th className="text-right p-3">Soll (VK)</th>
              <th className="text-right p-3">Ist (NAKA)</th>
              <th className="text-right p-3">Differenz</th>
              <th className="text-right p-3">%</th>
            </tr>
          </thead>
          <tbody>
            <DiffRow label="Stunden Total" soll={vkTotalStunden} ist={istTotalStunden} isStunden />
            <DiffRow label="Stundenkosten Total" soll={vkTotalStundenKosten} ist={istTotalStundenKosten} />
            <DiffRow label="Material" soll={vkTotalMaterial} ist={istTotalMaterial} />
            <DiffRow label="Fremdleistungen" soll={vkTotalFremd} ist={istTotalFremd} />
            <tr className="font-bold bg-primary/5 border-t-2">
              <td className="p-3">Selbstkosten</td>
              <td className="p-3 text-right tabular-nums">CHF {vkSelbstkosten.toFixed(2)}</td>
              <td className="p-3 text-right tabular-nums">
                {istSelbstkosten > 0 ? `CHF ${istSelbstkosten.toFixed(2)}` : "—"}
              </td>
              <td className="p-3 text-right">
                {istSelbstkosten > 0 && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    vkSelbstkosten >= istSelbstkosten
                      ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                      : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                  }`}>
                    {vkSelbstkosten >= istSelbstkosten
                      ? <CheckCircle2 className="h-3 w-3" />
                      : <AlertTriangle className="h-3 w-3" />}
                    CHF {Math.abs(vkSelbstkosten - istSelbstkosten).toFixed(2)}
                  </span>
                )}
              </td>
              <td className="p-3 text-right text-xs text-muted-foreground">
                {vkSelbstkosten > 0 && istSelbstkosten > 0
                  ? `${(((vkSelbstkosten - istSelbstkosten) / vkSelbstkosten) * 100).toFixed(1)}%`
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Detaillierter Stundenvergleich pro Ort */}
      {(Object.keys(sollByOrt).length > 0 || Object.keys(istByOrt).length > 0) && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
              <Clock className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              Stunden-Detail nach Ort
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground bg-muted/50">
                <th className="text-left p-3">Bereich</th>
                <th className="text-right p-3">Soll-Std.</th>
                <th className="text-right p-3">Ist-Std.</th>
                <th className="text-right p-3">Diff. Std.</th>
                <th className="text-right p-3">Ist-Kosten</th>
              </tr>
            </thead>
            <tbody>
              {ORT_CONFIGS.map((cfg) => {
                const key = ortKey(cfg.ort, cfg.maschinenpark);
                const soll = sollByOrt[key];
                const ist = istByOrt[key];
                if (!soll && !ist) return null;
                const sollH = soll?.stunden ?? 0;
                const istH = (ist?.minuten ?? 0) / 60;
                const diff = sollH - istH;
                return (
                  <tr key={key} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">
                      <MapPin className="h-3 w-3 inline mr-1.5 text-muted-foreground" />
                      {cfg.label}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {sollH > 0 ? `${sollH.toFixed(1)} h` : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums" style={{ color: "hsl(var(--primary))" }}>
                      {istH > 0 ? `${istH.toFixed(1)} h` : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {(sollH > 0 || istH > 0) && (
                        <span className={`text-xs font-semibold ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {diff >= 0 ? "+" : ""}{diff.toFixed(1)} h
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold">
                      {ist?.kosten ? `CHF ${ist.kosten.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Gewinnprognose Kalkulations-Übersicht */}
      {vkNettoNaka > 0 && istSelbstkosten > 0 && (
        <div className="space-y-3">
          {/* VK-Offertpreis kompakt */}
          <Card className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">VK-Offertpreis</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Selbstkosten</p>
                <p className="font-semibold tabular-nums">{formatCHF(vkSelbstkosten)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Nettooffertpreis</p>
                <p className="font-semibold tabular-nums">{formatCHF(vkNettoNaka)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MWST {mwstPctNaka}%</p>
                <p className="font-semibold tabular-nums">+{formatCHF(vkMwstNaka)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bruttooffertpreis</p>
                <p className="font-bold tabular-nums" style={{ color: "hsl(var(--primary))" }}>{formatCHF(vkBruttoNaka)}</p>
              </div>
            </div>
            {auftragswert > 0 && (
              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex justify-between">
                <span>Eingetragener Auftragswert</span>
                <span className="tabular-nums font-mono">{formatCHF(auftragswert)}</span>
              </div>
            )}
          </Card>

          {/* Gewinn vs. VK-Nettooffertpreis */}
          <Card className={`p-4 flex items-center justify-between ${gewinnVsVkNaka >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2">
              {gewinnVsVkNaka >= 0
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <AlertTriangle className="h-5 w-5 text-red-600" />
              }
              <div>
                <p className="text-sm font-semibold">Gewinn vs. VK-Offertpreis</p>
                <p className="text-xs text-muted-foreground">
                  Netto {formatCHF(vkNettoNaka)} − IST-Kosten {formatCHF(istSelbstkosten)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${gewinnVsVkNaka >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCHF(gewinnVsVkNaka)}
              </p>
              <p className={`text-xs font-medium ${gewinnVsVkNaka >= 0 ? "text-green-600" : "text-red-600"}`}>
                {vkNettoNaka > 0 ? ((gewinnVsVkNaka / vkNettoNaka) * 100).toFixed(1) : "0"}% Marge
              </p>
            </div>
          </Card>

          {/* Gewinn vs. Auftragswert */}
          {gewinnVsAuftragNaka !== null && (
            <Card className={`p-4 flex items-center justify-between border-dashed ${gewinnVsAuftragNaka >= 0 ? "border-green-200 bg-green-50/50" : "border-orange-200 bg-orange-50/50"}`}>
              <div className="flex items-center gap-2">
                {gewinnVsAuftragNaka >= 0
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <AlertCircle className="h-4 w-4 text-orange-600" />
                }
                <div>
                  <p className="text-sm font-medium">Gewinn vs. Auftragswert</p>
                  <p className="text-xs text-muted-foreground">
                    Auftrag {formatCHF(auftragswert)} − IST-Kosten {formatCHF(istSelbstkosten)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${gewinnVsAuftragNaka >= 0 ? "text-green-700" : "text-orange-700"}`}>
                  {formatCHF(gewinnVsAuftragNaka)}
                </p>
                <p className={`text-xs font-medium ${gewinnVsAuftragNaka >= 0 ? "text-green-600" : "text-orange-600"}`}>
                  {auftragswert > 0 ? ((gewinnVsAuftragNaka / auftragswert) * 100).toFixed(1) : "0"}% Marge
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* IST-Material Erfassung */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
          Ist-Material (effektive Kosten)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <Label className="text-xs">Bezeichnung</Label>
            <Input
              value={newMat.bezeichnung}
              onChange={(e) => setNewMat((p) => ({ ...p, bezeichnung: e.target.value }))}
              placeholder="z.B. Stahlprofile, Befestigungsmaterial…"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Lieferant</Label>
            <Input
              value={newMat.lieferant}
              onChange={(e) => setNewMat((p) => ({ ...p, lieferant: e.target.value }))}
              placeholder="optional"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Betrag CHF</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={newMat.betrag_chf || ""}
              onChange={(e) => setNewMat((p) => ({ ...p, betrag_chf: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Datum</Label>
            <Input
              type="date"
              value={newMat.datum}
              onChange={(e) => setNewMat((p) => ({ ...p, datum: e.target.value }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div className="flex items-end sm:col-span-3">
            <Button
              onClick={() => {
                addNakaMaterial.mutate({
                  auftrag_id: auftragId,
                  ...newMat,
                });
                setNewMat({ bezeichnung: "", lieferant: "", betrag_chf: 0, datum: new Date().toISOString().slice(0, 10), notiz: "" });
              }}
              disabled={!newMat.bezeichnung || addNakaMaterial.isPending}
              className="w-full h-8 bg-[#e8620a] hover:bg-[#cf5509] text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Ist-Material erfassen
            </Button>
          </div>
        </div>
        {nakaMaterial.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {nakaMaterial.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{m.bezeichnung}</span>
                  {m.lieferant && <span className="text-muted-foreground ml-2 text-xs">({m.lieferant})</span>}
                </div>
                <span className="font-semibold tabular-nums text-sm" style={{ color: "hsl(var(--primary))" }}>
                  CHF {Number(m.betrag_chf).toFixed(2)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => m.id && delNakaMaterial.mutate(m.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between px-3 py-1.5 font-bold text-sm border-t">
              <span>Total Ist-Material</span>
              <span style={{ color: "hsl(var(--primary))" }}>CHF {istTotalMaterial.toFixed(2)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* IST-Fremdleistungen */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
          Ist-Fremdleistungen (effektive Rechnungen)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <Label className="text-xs">Bezeichnung</Label>
            <Input
              value={newFrmd.bezeichnung}
              onChange={(e) => setNewFrmd((p) => ({ ...p, bezeichnung: e.target.value }))}
              placeholder="z.B. Autokran-Rechnung…"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Lieferant</Label>
            <Input
              value={newFrmd.lieferant}
              onChange={(e) => setNewFrmd((p) => ({ ...p, lieferant: e.target.value }))}
              placeholder="optional"
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Betrag CHF</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={newFrmd.betrag_chf || ""}
              onChange={(e) => setNewFrmd((p) => ({ ...p, betrag_chf: Number(e.target.value) || 0 }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Datum</Label>
            <Input
              type="date"
              value={newFrmd.datum}
              onChange={(e) => setNewFrmd((p) => ({ ...p, datum: e.target.value }))}
              className="mt-0.5 h-8"
            />
          </div>
          <div className="flex items-end sm:col-span-3">
            <Button
              onClick={() => {
                addNakaFremd.mutate({ auftrag_id: auftragId, ...newFrmd });
                setNewFrmd({ bezeichnung: "", lieferant: "", betrag_chf: 0, datum: new Date().toISOString().slice(0, 10), notiz: "" });
              }}
              disabled={!newFrmd.bezeichnung || addNakaFremd.isPending}
              className="w-full h-8 bg-[#e8620a] hover:bg-[#cf5509] text-white text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Ist-Fremdleistung erfassen
            </Button>
          </div>
        </div>
        {nakaFremd.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {nakaFremd.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{f.bezeichnung}</span>
                  {f.lieferant && <span className="text-muted-foreground ml-2 text-xs">({f.lieferant})</span>}
                </div>
                <span className="font-semibold tabular-nums" style={{ color: "hsl(var(--primary))" }}>
                  CHF {Number(f.betrag_chf).toFixed(2)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => f.id && delNakaFremd.mutate(f.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between px-3 py-1.5 font-bold text-sm border-t">
              <span>Total Ist-Fremdleistungen</span>
              <span style={{ color: "hsl(var(--primary))" }}>CHF {istTotalFremd.toFixed(2)}</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Hauptseite ─────────────────────────────────────────────────────────────────

export default function VorkalkulationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const { data: auftrag, isLoading } = useQuery<Auftrag>({
    queryKey: ["/api/auftraege", id],
    queryFn: () => apiRequest("GET", `/api/auftraege/${id}`).then((r) => r.json()),
  });

  const { data: saetze = [] } = useQuery<Stundensatz[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: () => apiRequest("GET", "/api/stundensaetze").then((r) => r.json()),
  });

  const handlePdf = async (typ: "vorkalkulation" | "nachkalkulation") => {
    setPdfLoading(typ);
    await downloadKalkulationPdf(id, typ, toast);
    setPdfLoading(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!auftrag) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-muted-foreground">Auftrag nicht gefunden.</p>
        <Link href="/auftraege"><a className="text-primary text-sm">Zurück</a></Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href={`/auftraege/${id}`}>
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
            <ArrowLeft className="h-3 w-3" />
            Zurück zum Auftrag
          </a>
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                Kalkulation
              </h1>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{auftrag.nr}</span> · {auftrag.titel}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePdf("vorkalkulation")}
              disabled={pdfLoading === "vorkalkulation"}
            >
              <FileDown className="h-3.5 w-3.5 mr-1" />
              {pdfLoading === "vorkalkulation" ? "PDF..." : "VK PDF"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePdf("nachkalkulation")}
              disabled={pdfLoading === "nachkalkulation"}
            >
              <FileDown className="h-3.5 w-3.5 mr-1" />
              {pdfLoading === "nachkalkulation" ? "PDF..." : "NAKA PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="vorkalkulation">
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-5 h-auto p-1 gap-1">
          <TabsTrigger value="vorkalkulation" className="text-xs sm:col-span-1">
            <Calculator className="h-3.5 w-3.5 mr-1" />Übersicht VK
          </TabsTrigger>
          <TabsTrigger value="stunden" className="text-xs">
            <Clock className="h-3.5 w-3.5 mr-1" />Stunden
          </TabsTrigger>
          <TabsTrigger value="material" className="text-xs">
            <Package className="h-3.5 w-3.5 mr-1" />Material
          </TabsTrigger>
          <TabsTrigger value="fremd" className="text-xs">
            <Wrench className="h-3.5 w-3.5 mr-1" />Fremdlstg.
          </TabsTrigger>
          <TabsTrigger value="soek" className="text-xs">
            <Receipt className="h-3.5 w-3.5 mr-1" />SOEK
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vorkalkulation" className="mt-4 space-y-4">
          {/* Zusammenfassung + Offertpreis */}
          <ZusammenfassungBlock auftragId={id} saetze={saetze} />
          {/* Soll-Ist-Vergleich */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-bold text-base" style={{ fontFamily: "var(--font-display)" }}>
                Nachkalkulation / Soll-Ist-Vergleich
              </h2>
            </div>
            <NachkalkulationBlock auftragId={id} saetze={saetze} />
          </div>
        </TabsContent>

        <TabsContent value="stunden" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                Geplante Stunden (Vorkalkulation)
              </h2>
            </div>
            <StundenBlock auftragId={id} saetze={saetze} />
          </Card>
        </TabsContent>

        <TabsContent value="material" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                Material Stückliste (Vorkalkulation)
              </h2>
            </div>
            <MaterialBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="fremd" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                Fremdleistungen (Vorkalkulation)
              </h2>
            </div>
            <FremdleistungenBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="soek" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>
                Sondereinzelkosten / Spesen (Vorkalkulation)
              </h2>
            </div>
            <SoekBlock auftragId={id} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
