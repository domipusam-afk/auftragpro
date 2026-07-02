import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Plus, Trash2, Calculator, Package, Wrench, FileDown,
  Receipt, BarChart3, Clock, ChevronRight, Save, RefreshCw,
  Layers, FileText, TrendingUp, TrendingDown, Minus, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const openPdfInTab = (url: string, filename = "dokument.pdf") => { downloadPdf(url, filename); };

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function downloadKalkulationPdf(auftragId: string, typ: "vorkalkulation" | "nachkalkulation", toast: (t: any) => void) {
  try {
    const r = await fetch(`${API_BASE}/api/auftraege/${auftragId}/kalkulation-pdf?typ=${typ}`, { method: "POST" });
    if (!r.ok) { const err = await r.json().catch(() => ({ message: "PDF Fehler" })); toast({ title: "PDF Fehler", description: err.message, variant: "destructive" }); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    openPdfInTab(url, "Vorkalkulation.pdf");
    toast({ title: "PDF heruntergeladen ✓", description: "Wird im Browser geöffnet" });
  } catch (e: any) { toast({ title: "Fehler", description: e.message, variant: "destructive" }); }
}

// ─── Helper ──────────────────────────────────────────────────────────────────
const chf = (v: number) => `CHF ${v.toFixed(2)}`;
const num = (v: any) => parseFloat(v) || 0;

// ─── Stunden Kategorien (wie Excel) ──────────────────────────────────────────
const STUNDEN_BEREICHE = {
  "Planung/AVOR": ["Ausmass", "Vorbereitung", "Planung", "Begleitung", "Abrechnung"],
  "Werkstatt": ["Vorbereitung", "Zuschnitt", "Fertigung"],
  "Montage": ["Vorbereitung", "Reisen", "Baustelle einrichten", "Rohmontage", "Gläser einsetzen", "Beschläge einstellen", "Übergabe"],
};

const WERKSTOFF_OPTIONEN = ["Stahl", "CNS / Edelstahl", "Aluminium", "Glas", "Sonstiges"];
const HILFSMATERIAL_KATEGORIEN = ["Gläser", "Schweissmaterial", "Befestigungsmittel", "Normteile", "Beschläge", "Sonstiges"];
const FREMD_KATEGORIEN = ["Gläser", "Abkantarbeit", "Oberflächenbehandlung", "Transport", "Autokran", "Feuerverzinken", "Lackieren/Eloxieren", "Sonstiges"];
const SOEK_KATEGORIEN = ["Distanz km", "Verpflegung", "Unterkunft", "PW km", "Firmenbus km", "LKW km", "Parkgebühren", "Werkzeug-Sonderkauf", "Sonstiges"];
const EINHEITEN = ["Stk", "m", "m²", "kg", "L", "Psch", "h"];

// ─── Typen ───────────────────────────────────────────────────────────────────
interface Stundensatz { id: string; ort: string; maschinenpark: string | null; satz: number; grundsatz: number | null; }
interface VkConfig { id?: string; auftrag_id: string; risiko_gewinn_prozent: number; rabatt_prozent: number; skonto_prozent: number; mwst_prozent: number; notiz?: string; gesamt_m2?: number; gesamt_m1?: number; gesamt_kg?: number; gesamt_stueck?: number; }
interface VkStunde { id?: string; auftrag_id: string; ort: string; maschinenpark?: string | null; bereich?: string; unterkategorie?: string; bezeichnung?: string; soll_stunden: number; stundensatz: number; }
interface HauptmatProfil { id?: string; auftrag_id: string; pos: number; profil: string; bemerkung: string; stueck: number; laenge_mm: number | null; kg_pro_m: number | null; total_kg: number | null; werkstoff: string; preis_pro_einheit: number; total_chf: number; }
interface HauptmatFlaeche { id?: string; auftrag_id: string; pos: number; bezeichnung: string; stueck: number; breite_mm: number; hoehe_mm: number; m2: number; dicke_mm: number; kg_pro_m2: number; total_kg: number; werkstoff: string; preis_pro_kg: number; total_chf: number; bemerkung: string; }
interface Hilfsmaterial { id?: string; auftrag_id: string; pos: number; kategorie: string; bezeichnung: string; stueck: number; einheit: string; preis_pro_einheit: number; total_chf: number; lieferant: string; bemerkung: string; }
interface Fremdleistung { id?: string; auftrag_id: string; bezeichnung: string; anzahl: number; einheit: string; preis_pro_einheit: number; total_chf: number; }
interface Soek { id?: string; auftrag_id: string; bezeichnung: string; anzahl: number; einheit: string; preis_pro_einheit: number; total_chf: number; }

// ─── Stunden-Bereich Block ────────────────────────────────────────────────────
function StundenBereichBlock({ auftragId, bereich, saetze }: { auftragId: string; bereich: string; saetze: Stundensatz[] }) {
  const { toast } = useToast();
  const unterkategorien = (STUNDEN_BEREICHE as any)[bereich] || [];

  const getOrte = () => {
    if (bereich === "Planung/AVOR") return [{ label: "AVOR", ort: "Avor", maschine: null }];
    if (bereich === "Montage") return [{ label: "Montage", ort: "Montage", maschine: null }];
    return [
      { label: "Werkstatt · Kleine Maschinen", ort: "Werkstatt", maschine: "Kleine Maschinen" },
      { label: "Werkstatt · Mittlere Maschinen", ort: "Werkstatt", maschine: "Mittlere Maschinen" },
      { label: "Werkstatt · Grosse Maschinen", ort: "Werkstatt", maschine: "Grosse Maschinen" },
    ];
  };

  const getSatz = (ort: string, maschine: string | null) => {
    const s = saetze.find(s => {
      if (ort === "Werkstatt") return s.ort === "Werkstatt" && s.maschinenpark === maschine;
      return s.ort === ort;
    });
    if (!s) return 0;
    return ort === "Werkstatt" && s.grundsatz ? s.grundsatz + s.satz : s.satz;
  };

  const { data: rows = [], isLoading } = useQuery<VkStunde[]>({
    queryKey: ["/api/vk-stunden", auftragId, bereich],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/stunden`);
      const all = await r.json();
      return all.filter((s: VkStunde) => (s.bereich || s.ort) === bereich || 
        (bereich === "Planung/AVOR" && s.ort === "Avor") ||
        (bereich === "Werkstatt" && s.ort === "Werkstatt") ||
        (bereich === "Montage" && s.ort === "Montage")
      );
    },
  });

  const orte = getOrte();
  const [newRow, setNewRow] = useState({ unterkategorie: unterkategorien[0] || "", ort: orte[0]?.ort || "", maschine: orte[0]?.maschine || null, bezeichnung: "", soll_stunden: "" });

  const addMutation = useMutation({
    mutationFn: async () => {
      const satz = getSatz(newRow.ort, newRow.maschine);
      return apiRequest("POST", `/api/vorkalkulation/${auftragId}/stunden`, {
        ort: newRow.ort,
        maschinenpark: newRow.maschine,
        bereich,
        unterkategorie: newRow.unterkategorie,
        bezeichnung: newRow.bezeichnung,
        soll_stunden: num(newRow.soll_stunden),
        stundensatz: satz,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vk-stunden", auftragId, bereich] });
      queryClient.invalidateQueries({ queryKey: ["/api/vk-stunden-all", auftragId] });
      setNewRow(p => ({ ...p, soll_stunden: "" }));
      toast({ title: "Zeile hinzugefügt" });
    },
    onError: (e: any) => {
      toast({ title: "Fehler beim Speichern", description: e?.message || String(e), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vorkalkulation/stunden/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vk-stunden", auftragId, bereich] });
      queryClient.invalidateQueries({ queryKey: ["/api/vk-stunden-all", auftragId] });
    },
  });

  const totalStunden = rows.reduce((s, r) => s + num(r.soll_stunden), 0);
  const totalChf = rows.reduce((s, r) => s + num(r.soll_stunden) * num(r.stundensatz), 0);

  const bereichColor: Record<string, string> = {
    "Planung/AVOR": "#1a3a6b",
    "Werkstatt": "#6b4c2a",
    "Montage": "#e8620a",
  };

  return (
    <div>
      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ backgroundColor: bereichColor[bereich] + "15" }}>
              <th className="text-left px-2 py-2 font-medium text-xs">Unterkategorie</th>
              <th className="text-left px-2 py-2 font-medium text-xs">Bezeichnung</th>
              <th className="text-left px-2 py-2 font-medium text-xs">Ort</th>
              <th className="text-right px-2 py-2 font-medium text-xs">Soll Std.</th>
              <th className="text-right px-2 py-2 font-medium text-xs">Fr./h</th>
              <th className="text-right px-2 py-2 font-medium text-xs">Total CHF</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-4 text-muted-foreground text-xs">Laden...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-4 text-muted-foreground text-xs">Noch keine Einträge</td></tr>
            ) : rows.map((r, i) => {
              const ortLabel = r.maschinenpark ? `Werkstatt · ${r.maschinenpark}` : r.ort;
              return (
                <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="px-2 py-1 text-xs">{r.unterkategorie || r.ort}</td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">{(r as any).bezeichnung || ""}</td>
                  <td className="px-2 py-1 text-xs">{ortLabel}</td>
                  <td className="px-2 py-1 text-xs text-right font-mono">{num(r.soll_stunden).toFixed(2)}</td>
                  <td className="px-2 py-1 text-xs text-right font-mono text-muted-foreground">{num(r.stundensatz).toFixed(2)}</td>
                  <td className="px-2 py-1 text-xs text-right font-mono font-medium">{chf(num(r.soll_stunden) * num(r.stundensatz))}</td>
                  <td className="px-2 py-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {/* Neue Zeile */}
            <tr className="border-t-2" style={{ borderColor: bereichColor[bereich] + "40" }}>
              <td className="px-1 py-2">
                <Select value={newRow.unterkategorie} onValueChange={v => setNewRow(p => ({ ...p, unterkategorie: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{unterkategorien.map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-2">
                <Input className="h-7 text-xs" placeholder="Beschreibung (opt.)" value={newRow.bezeichnung} onChange={e => setNewRow(p => ({ ...p, bezeichnung: e.target.value }))} />
              </td>
              <td className="px-1 py-2">
                <Select value={`${newRow.ort}::${newRow.maschine || ""}`} onValueChange={v => {
                  const [ort, maschine] = v.split("::");
                  setNewRow(p => ({ ...p, ort, maschine: maschine || null }));
                }}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {orte.map(o => <SelectItem key={o.label} value={`${o.ort}::${o.maschine || ""}`}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-1 py-2">
                <Input type="number" className="h-7 text-xs text-right" placeholder="Std." value={newRow.soll_stunden} onChange={e => setNewRow(p => ({ ...p, soll_stunden: e.target.value }))} />
              </td>
              <td className="px-2 py-2 text-xs text-right text-muted-foreground font-mono">{getSatz(newRow.ort, newRow.maschine).toFixed(2)}</td>
              <td className="px-2 py-2 text-xs text-right font-mono">{chf(num(newRow.soll_stunden) * getSatz(newRow.ort, newRow.maschine))}</td>
              <td className="px-1 py-2">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.soll_stunden}>
                  <Plus className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: bereichColor[bereich] + "20" }}>
              <td colSpan={3} className="px-2 py-2 text-xs font-semibold">Total {bereich}</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{totalStunden.toFixed(2)} h</td>
              <td></td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(totalChf)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Hauptmaterial Profil Block ───────────────────────────────────────────────
function HauptmatProfilBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const emptyRow = { pos: 0, profil: "", bemerkung: "", stueck: "", laenge_mm: "", kg_pro_m: "", werkstoff: "Stahl", preis_pro_einheit: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<HauptmatProfil[]>({
    queryKey: ["/api/vk-hauptmaterial", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/material`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const stueck = num(newRow.stueck), laenge = num(newRow.laenge_mm), kgm = num(newRow.kg_pro_m);
      const totalKg = stueck * (laenge / 1000) * kgm;
      const preis = num(newRow.preis_pro_einheit);
      const totalChf = totalKg > 0 ? totalKg * preis : stueck * preis;
      return apiRequest("POST", `/api/vorkalkulation/${auftragId}/material`, {
        pos: rows.length + 1, profil: newRow.profil, bemerkung: newRow.bemerkung,
        stueck, laenge_mm: laenge || null, kg_pro_m: kgm || null,
        total_kg: totalKg || null, werkstoff: newRow.werkstoff,
        preis_pro_einheit: preis, total_chf: totalChf,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vk-hauptmaterial", auftragId] }); setNewRow(emptyRow); toast({ title: "Material hinzugefügt" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vorkalkulation/material/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vk-hauptmaterial", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.total_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Profilbezogen: Stück × Länge × kg/m (Sheet 1)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Pos</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Profil/Bezeichnung</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Werkstoff</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Stück</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Länge mm</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">kg/m</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Tot. kg</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./Einh.</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Total CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1 text-xs">{r.pos}</td>
                <td className="px-2 py-1 text-xs font-medium">{r.profil} <span className="text-muted-foreground font-normal">{r.bemerkung}</span></td>
                <td className="px-2 py-1"><Badge variant="outline" className="text-xs">{r.werkstoff}</Badge></td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.stueck}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.laenge_mm ?? "—"}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.kg_pro_m ?? "—"}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.total_kg ? r.total_kg.toFixed(2) : "—"}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.preis_pro_einheit.toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.total_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            {/* Neue Zeile */}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1 text-xs text-muted-foreground">{rows.length + 1}</td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Profil" value={newRow.profil} onChange={e => setNewRow(p => ({ ...p, profil: e.target.value }))} /></td>
              <td className="px-1 py-1">
                <Select value={newRow.werkstoff} onValueChange={v => setNewRow(p => ({ ...p, werkstoff: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{WERKSTOFF_OPTIONEN.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Stk" value={newRow.stueck} onChange={e => setNewRow(p => ({ ...p, stueck: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="mm" value={newRow.laenge_mm} onChange={e => setNewRow(p => ({ ...p, laenge_mm: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="kg/m" value={newRow.kg_pro_m} onChange={e => setNewRow(p => ({ ...p, kg_pro_m: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono text-muted-foreground">{(num(newRow.stueck) * (num(newRow.laenge_mm) / 1000) * num(newRow.kg_pro_m)).toFixed(2)}</td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Fr./kg" value={newRow.preis_pro_einheit} onChange={e => setNewRow(p => ({ ...p, preis_pro_einheit: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">
                {chf((() => { const kg = num(newRow.stueck) * (num(newRow.laenge_mm) / 1000) * num(newRow.kg_pro_m); return kg > 0 ? kg * num(newRow.preis_pro_einheit) : num(newRow.stueck) * num(newRow.preis_pro_einheit); })())}
              </td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.profil}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={8} className="px-2 py-2 text-xs font-semibold">Total Hauptmaterial (Profil)</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Hauptmaterial Fläche Block ───────────────────────────────────────────────
function HauptmatFlaecheBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const emptyRow = { pos: 0, bezeichnung: "", stueck: "", breite_mm: "", hoehe_mm: "", dicke_mm: "", kg_pro_m2: "", werkstoff: "Stahl", preis_pro_kg: "", bemerkung: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<HauptmatFlaeche[]>({
    queryKey: ["/api/vk-hauptmat-flaeche", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/hauptmaterial-flaeche`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const stueck = num(newRow.stueck);
      const breite = num(newRow.breite_mm), hoehe = num(newRow.hoehe_mm);
      const m2 = stueck * (breite / 1000) * (hoehe / 1000);
      const kgm2 = num(newRow.kg_pro_m2);
      const totalKg = m2 * kgm2;
      const preis = num(newRow.preis_pro_kg);
      return apiRequest("POST", `/api/kalkulation/${auftragId}/hauptmaterial-flaeche`, {
        pos: rows.length + 1, bezeichnung: newRow.bezeichnung, stueck,
        breite_mm: breite, hoehe_mm: hoehe, m2,
        dicke_mm: num(newRow.dicke_mm), kg_pro_m2: kgm2, total_kg: totalKg,
        werkstoff: newRow.werkstoff, preis_pro_kg: preis, total_chf: totalKg * preis,
        bemerkung: newRow.bemerkung,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vk-hauptmat-flaeche", auftragId] }); setNewRow(emptyRow); toast({ title: "Material hinzugefügt" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kalkulation/hauptmaterial-flaeche/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vk-hauptmat-flaeche", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.total_chf), 0);
  const m2Input = num(newRow.stueck) * (num(newRow.breite_mm) / 1000) * (num(newRow.hoehe_mm) / 1000);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Flächenbezogen: Stück × Breite × Höhe → m² × kg/m² (Sheet 1.1)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Pos</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Werkstoff</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Stück</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">B mm</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">H mm</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">m²</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">kg/m²</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Tot. kg</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./kg</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Total CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1 text-xs">{r.pos}</td>
                <td className="px-2 py-1 text-xs font-medium">{r.bezeichnung}</td>
                <td className="px-2 py-1"><Badge variant="outline" className="text-xs">{r.werkstoff}</Badge></td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.stueck}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.breite_mm}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.hoehe_mm}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{num(r.m2).toFixed(3)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.kg_pro_m2}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{num(r.total_kg).toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.preis_pro_kg}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.total_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1 text-xs text-muted-foreground">{rows.length + 1}</td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Bezeichnung" value={newRow.bezeichnung} onChange={e => setNewRow(p => ({ ...p, bezeichnung: e.target.value }))} /></td>
              <td className="px-1 py-1">
                <Select value={newRow.werkstoff} onValueChange={v => setNewRow(p => ({ ...p, werkstoff: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{WERKSTOFF_OPTIONEN.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Stk" value={newRow.stueck} onChange={e => setNewRow(p => ({ ...p, stueck: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="mm" value={newRow.breite_mm} onChange={e => setNewRow(p => ({ ...p, breite_mm: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="mm" value={newRow.hoehe_mm} onChange={e => setNewRow(p => ({ ...p, hoehe_mm: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono text-muted-foreground">{m2Input.toFixed(3)}</td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="kg/m²" value={newRow.kg_pro_m2} onChange={e => setNewRow(p => ({ ...p, kg_pro_m2: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono text-muted-foreground">{(m2Input * num(newRow.kg_pro_m2)).toFixed(2)}</td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Fr./kg" value={newRow.preis_pro_kg} onChange={e => setNewRow(p => ({ ...p, preis_pro_kg: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">{chf(m2Input * num(newRow.kg_pro_m2) * num(newRow.preis_pro_kg))}</td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.bezeichnung}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={10} className="px-2 py-2 text-xs font-semibold">Total Hauptmaterial (Fläche)</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Hilfsmaterial Block ──────────────────────────────────────────────────────
function HilfsmaterialBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const emptyRow = { kategorie: "Normteile", bezeichnung: "", stueck: "", einheit: "Stk", preis_pro_einheit: "", lieferant: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<Hilfsmaterial[]>({
    queryKey: ["/api/vk-hilfsmaterial", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/hilfsmaterial`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const stueck = num(newRow.stueck), preis = num(newRow.preis_pro_einheit);
      // Bezeichnung: Fallback auf Kategorie wenn leer
      const bezeichnung = newRow.bezeichnung.trim() || newRow.kategorie;
      return apiRequest("POST", `/api/kalkulation/${auftragId}/hilfsmaterial`, {
        pos: rows.length + 1, kategorie: newRow.kategorie, bezeichnung,
        stueck, einheit: newRow.einheit, preis_pro_einheit: preis, total_chf: stueck * preis,
        lieferant: newRow.lieferant,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vk-hilfsmaterial", auftragId] }); setNewRow(emptyRow); toast({ title: "Hilfsmaterial hinzugefügt" }); },
    onError: (e: any) => toast({ title: "Fehler beim Speichern", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kalkulation/hilfsmaterial/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vk-hilfsmaterial", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.total_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Gläser, Schweissmaterial, Befestigungsmittel, Normteile, Beschläge (Sheet 2)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Kategorie</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Lieferant</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Menge</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Einheit</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./Einh.</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Total CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1"><Badge variant="secondary" className="text-xs">{r.kategorie}</Badge></td>
                <td className="px-2 py-1 text-xs font-medium">{r.bezeichnung}</td>
                <td className="px-2 py-1 text-xs text-muted-foreground">{r.lieferant}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.stueck}</td>
                <td className="px-2 py-1 text-xs">{r.einheit}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{num(r.preis_pro_einheit).toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.total_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1">
                <Select value={newRow.kategorie} onValueChange={v => setNewRow(p => ({ ...p, kategorie: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{HILFSMATERIAL_KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Bezeichnung" value={newRow.bezeichnung} onChange={e => setNewRow(p => ({ ...p, bezeichnung: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Lieferant" value={newRow.lieferant} onChange={e => setNewRow(p => ({ ...p, lieferant: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Menge" value={newRow.stueck} onChange={e => setNewRow(p => ({ ...p, stueck: e.target.value }))} /></td>
              <td className="px-1 py-1">
                <Select value={newRow.einheit} onValueChange={v => setNewRow(p => ({ ...p, einheit: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Fr." value={newRow.preis_pro_einheit} onChange={e => setNewRow(p => ({ ...p, preis_pro_einheit: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">{chf(num(newRow.stueck) * num(newRow.preis_pro_einheit))}</td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={6} className="px-2 py-2 text-xs font-semibold">Total Hilfsmaterial</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Fremdleistungen Block ────────────────────────────────────────────────────
function FremdBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const emptyRow = { bezeichnung: "", kategorie: "Sonstiges", anzahl: "", einheit: "Psch", preis_pro_einheit: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<Fremdleistung[]>({
    queryKey: ["/api/vk-fremd", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/fremdleistungen`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const anzahl = num(newRow.anzahl), preis = num(newRow.preis_pro_einheit);
      return apiRequest("POST", `/api/vorkalkulation/${auftragId}/fremdleistungen`, {
        bezeichnung: newRow.bezeichnung, anzahl, einheit: newRow.einheit,
        preis_pro_einheit: preis, total_chf: anzahl * preis,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vk-fremd", auftragId] }); setNewRow(emptyRow); toast({ title: "Fremdleistung hinzugefügt" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vorkalkulation/fremdleistungen/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vk-fremd", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.total_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Gläser, Abkantarbeit, Oberflächenbehandlung, Transport, Autokran, Feuerverzinken usw. (Sheet 3)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Anzahl</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Einheit</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./Einh.</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Total CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1 text-xs font-medium">{r.bezeichnung}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.anzahl}</td>
                <td className="px-2 py-1 text-xs">{r.einheit}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{num(r.preis_pro_einheit).toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.total_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1">
                <Select value={newRow.bezeichnung || newRow.kategorie} onValueChange={v => setNewRow(p => ({ ...p, bezeichnung: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Kategorie wählen..." /></SelectTrigger>
                  <SelectContent>{FREMD_KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Anz." value={newRow.anzahl} onChange={e => setNewRow(p => ({ ...p, anzahl: e.target.value }))} /></td>
              <td className="px-1 py-1">
                <Select value={newRow.einheit} onValueChange={v => setNewRow(p => ({ ...p, einheit: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Fr." value={newRow.preis_pro_einheit} onChange={e => setNewRow(p => ({ ...p, preis_pro_einheit: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">{chf(num(newRow.anzahl) * num(newRow.preis_pro_einheit))}</td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.bezeichnung || !newRow.anzahl}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={4} className="px-2 py-2 text-xs font-semibold">Total Fremdleistungen</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── SOEK Block ───────────────────────────────────────────────────────────────
function SoekBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const emptyRow = { bezeichnung: "Verpflegung", anzahl: "", einheit: "Psch", preis_pro_einheit: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<Soek[]>({
    queryKey: ["/api/vk-soek", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/soek`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const anzahl = num(newRow.anzahl), preis = num(newRow.preis_pro_einheit);
      return apiRequest("POST", `/api/vorkalkulation/${auftragId}/soek`, {
        bezeichnung: newRow.bezeichnung, anzahl, einheit: newRow.einheit,
        preis_pro_einheit: preis, total_chf: anzahl * preis,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vk-soek", auftragId] }); setNewRow(emptyRow); toast({ title: "SOEK hinzugefügt" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vorkalkulation/soek/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/vk-soek", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.total_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Distanz, Verpflegung, Unterkunft, PW km, Firmenbus km, LKW (Sheet 9)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Anzahl</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Einheit</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./Einh.</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Total CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1 text-xs font-medium">{r.bezeichnung}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{r.anzahl}</td>
                <td className="px-2 py-1 text-xs">{r.einheit}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{num(r.preis_pro_einheit).toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.total_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1">
                <Select value={newRow.bezeichnung} onValueChange={v => setNewRow(p => ({ ...p, bezeichnung: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{SOEK_KATEGORIEN.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Anz." value={newRow.anzahl} onChange={e => setNewRow(p => ({ ...p, anzahl: e.target.value }))} /></td>
              <td className="px-1 py-1">
                <Select value={newRow.einheit} onValueChange={v => setNewRow(p => ({ ...p, einheit: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="Fr." value={newRow.preis_pro_einheit} onChange={e => setNewRow(p => ({ ...p, preis_pro_einheit: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">{chf(num(newRow.anzahl) * num(newRow.preis_pro_einheit))}</td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.anzahl}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={4} className="px-2 py-2 text-xs font-semibold">Total SOEK / Spesen</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Offertpreis Block (Sheet 10) ─────────────────────────────────────────────
function OffertpreisBlock({ auftragId, saetze }: { auftragId: string; saetze: Stundensatz[] }) {
  const { toast } = useToast();

  const { data: cfg, refetch } = useQuery<VkConfig>({
    queryKey: ["/api/vk-config", auftragId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/config`);
      const d = await r.json();
      return d || { auftrag_id: auftragId, risiko_gewinn_prozent: 10, rabatt_prozent: 0, skonto_prozent: 2, mwst_prozent: 8.1, gesamt_m2: 0, gesamt_m1: 0, gesamt_kg: 0, gesamt_stueck: 0 };
    },
  });

  const [localCfg, setLocalCfg] = useState<Partial<VkConfig>>({});
  const merged = { ...cfg, ...localCfg };

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/vorkalkulation/${auftragId}/config`, merged),
    onSuccess: () => { refetch(); setLocalCfg({}); toast({ title: "Offertpreis gespeichert" }); },
  });

  // Alle Kosten laden
  const { data: stunden = [] } = useQuery<VkStunde[]>({ queryKey: ["/api/vk-stunden-all", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/stunden`); return r.json(); } });
  const { data: material = [] } = useQuery<HauptmatProfil[]>({ queryKey: ["/api/vk-hauptmaterial", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/material`); return r.json(); } });
  const { data: materialF = [] } = useQuery<HauptmatFlaeche[]>({ queryKey: ["/api/vk-hauptmat-flaeche", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/hauptmaterial-flaeche`); return r.json(); } });
  const { data: hilfsMat = [] } = useQuery<Hilfsmaterial[]>({ queryKey: ["/api/vk-hilfsmaterial", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/hilfsmaterial`); return r.json(); } });
  const { data: fremd = [] } = useQuery<Fremdleistung[]>({ queryKey: ["/api/vk-fremd", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/fremdleistungen`); return r.json(); } });
  const { data: soek = [] } = useQuery<Soek[]>({ queryKey: ["/api/vk-soek", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/soek`); return r.json(); } });

  const totalStd = stunden.reduce((s, r) => s + num(r.soll_stunden), 0);
  const totalLohn = stunden.reduce((s, r) => s + num(r.soll_stunden) * num(r.stundensatz), 0);
  const totalMat = material.reduce((s, r) => s + num(r.total_chf), 0) + materialF.reduce((s, r) => s + num(r.total_chf), 0) + hilfsMat.reduce((s, r) => s + num(r.total_chf), 0);
  const totalFremd = fremd.reduce((s, r) => s + num(r.total_chf), 0);
  const totalSoek = soek.reduce((s, r) => s + num(r.total_chf), 0);

  const selbstkosten = totalLohn + totalMat + totalFremd + totalSoek;
  const risikoGewinn = num(merged.risiko_gewinn_prozent) / 100;
  const rabatt = num(merged.rabatt_prozent) / 100;
  const skonto = num(merged.skonto_prozent) / 100;
  const mwst = num(merged.mwst_prozent) / 100;

  const nettoOhneRabatt = selbstkosten * (1 + risikoGewinn);
  const nettoNachRabatt = nettoOhneRabatt * (1 - rabatt);
  const nettoNachSkonto = nettoNachRabatt * (1 - skonto);
  const bruttoTotal = nettoNachSkonto * (1 + mwst);

  // Kennzahlen (Sheet 10)
  const gesM2 = num(merged.gesamt_m2);
  const gesM1 = num(merged.gesamt_m1);
  const gesKg = num(merged.gesamt_kg);
  const gesStueck = num(merged.gesamt_stueck);

  const Row = ({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) => (
    <div className={`flex justify-between py-1 ${bold ? "font-semibold" : ""} ${indent ? "pl-4 text-muted-foreground text-xs" : "text-sm"}`}>
      <span>{label}</span><span className="font-mono">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Kostenübersicht */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Kostenstruktur (Pos. 1–9)</h3>
        <div className="space-y-1">
          <Row label="Pos. 1 — Lohneinzelkosten (Stunden)" value={chf(totalLohn)} />
          <Row label={`  ${totalStd.toFixed(2)} h gesamt`} value="" indent />
          <Row label="Pos. 2–4 — Hauptmaterial + Hilfsmaterial" value={chf(totalMat)} />
          <Row label="Pos. 5 — Fremdleistungen" value={chf(totalFremd)} />
          <Row label="Pos. 6 — SOEK / Spesen" value={chf(totalSoek)} />
          <Separator />
          <Row label="Selbstkosten" value={chf(selbstkosten)} bold />
        </div>
      </Card>

      {/* Preisberechnung */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Calculator className="h-4 w-4" />Preisberechnung (Sheet 10)</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">Risiko / Gewinn %</label>
            <Input type="number" className="h-8 text-sm mt-1" value={merged.risiko_gewinn_prozent ?? 10}
              onChange={e => setLocalCfg(p => ({ ...p, risiko_gewinn_prozent: num(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Rabatt %</label>
            <Input type="number" className="h-8 text-sm mt-1" value={merged.rabatt_prozent ?? 0}
              onChange={e => setLocalCfg(p => ({ ...p, rabatt_prozent: num(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Skonto %</label>
            <Input type="number" className="h-8 text-sm mt-1" value={merged.skonto_prozent ?? 2}
              onChange={e => setLocalCfg(p => ({ ...p, skonto_prozent: num(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">MWST %</label>
            <Input type="number" className="h-8 text-sm mt-1" value={merged.mwst_prozent ?? 8.1}
              onChange={e => setLocalCfg(p => ({ ...p, mwst_prozent: num(e.target.value) }))} />
          </div>
        </div>
        <div className="space-y-1 border-t pt-3">
          <Row label="Selbstkosten" value={chf(selbstkosten)} />
          <Row label={`+ Risiko/Gewinn ${merged.risiko_gewinn_prozent ?? 10}%`} value={chf(selbstkosten * risikoGewinn)} />
          <Row label="= Netto exkl. Rabatt" value={chf(nettoOhneRabatt)} />
          {rabatt > 0 && <Row label={`− Rabatt ${merged.rabatt_prozent}%`} value={`− ${chf(nettoOhneRabatt * rabatt)}`} />}
          {skonto > 0 && <Row label={`− Skonto ${merged.skonto_prozent}%`} value={`− ${chf(nettoNachRabatt * skonto)}`} />}
          <Row label="= Netto exkl. MWST" value={chf(nettoNachSkonto)} />
          <Row label={`+ MWST ${merged.mwst_prozent ?? 8.1}%`} value={chf(nettoNachSkonto * mwst)} />
          <Separator />
          <div className="flex justify-between py-2 text-base font-bold">
            <span>Bruttooffertpreis</span>
            <span className="font-mono" style={{ color: "#1a3a6b" }}>{chf(bruttoTotal)}</span>
          </div>
        </div>
        <Button className="mt-3 w-full sm:w-auto" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />Speichern
        </Button>
      </Card>

      {/* Kennzahlen */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" />Kennzahlen (Sheet 10)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">Gesamt m²</label>
            <Input type="number" className="h-8 text-sm mt-1" placeholder="0" value={merged.gesamt_m2 ?? ""}
              onChange={e => setLocalCfg(p => ({ ...p, gesamt_m2: num(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Gesamt m1 (lfm)</label>
            <Input type="number" className="h-8 text-sm mt-1" placeholder="0" value={merged.gesamt_m1 ?? ""}
              onChange={e => setLocalCfg(p => ({ ...p, gesamt_m1: num(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Gesamt kg</label>
            <Input type="number" className="h-8 text-sm mt-1" placeholder="0" value={merged.gesamt_kg ?? ""}
              onChange={e => setLocalCfg(p => ({ ...p, gesamt_kg: num(e.target.value) }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Gesamt Stück</label>
            <Input type="number" className="h-8 text-sm mt-1" placeholder="0" value={merged.gesamt_stueck ?? ""}
              onChange={e => setLocalCfg(p => ({ ...p, gesamt_stueck: num(e.target.value) }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-muted/20 rounded-lg">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fr./h</div>
            <div className="font-mono font-semibold">{totalStd > 0 ? (nettoNachSkonto / totalStd).toFixed(2) : "—"}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fr./m²</div>
            <div className="font-mono font-semibold">{gesM2 > 0 ? (nettoNachSkonto / gesM2).toFixed(2) : "—"}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fr./m1</div>
            <div className="font-mono font-semibold">{gesM1 > 0 ? (nettoNachSkonto / gesM1).toFixed(2) : "—"}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fr./kg</div>
            <div className="font-mono font-semibold">{gesKg > 0 ? (nettoNachSkonto / gesKg).toFixed(2) : "—"}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fr./Stück</div>
            <div className="font-mono font-semibold">{gesStueck > 0 ? (nettoNachSkonto / gesStueck).toFixed(2) : "—"}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function VorkalkulationDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: auftrag } = useQuery<any>({
    queryKey: ["/api/auftraege", id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/auftraege/${id}`); return r.json(); },
  });

  const { data: saetze = [] } = useQuery<Stundensatz[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: async () => { const r = await apiRequest("GET", `/api/stundensaetze`); return r.json(); },
  });

  const { toast } = useToast();
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePdfDownload = async () => {
    setPdfLoading(true);
    await downloadKalkulationPdf(id, "vorkalkulation", toast);
    setPdfLoading(false);
  };

  if (!id) return <div className="p-6 text-muted-foreground">Kein Auftrag angegeben.</div>;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Link href={`/auftraege/${id}`}>
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Zurück zum Auftrag</Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5" style={{ color: "#1a3a6b" }} />
            <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "#1a3a6b" }}>Vorkalkulation</h1>
            {auftrag && <Badge variant="outline" className="font-mono">{auftrag.auftragsnummer} · {auftrag.titel}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Vollständige Kalkulation nach Excel-Vorlage (Sheets 1–10)</p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePdfDownload} disabled={pdfLoading} style={{ borderColor: "#1a3a6b", color: "#1a3a6b" }}>
          <FileDown className="h-4 w-4 mr-1" />
          {pdfLoading ? "PDF..." : "PDF herunterladen"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="planung" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="h-auto flex flex-wrap gap-1 p-1 w-full sm:w-auto">
            <TabsTrigger value="planung" className="text-xs flex items-center gap-1">
              <FileText className="h-3 w-3" />Planung/AVOR
            </TabsTrigger>
            <TabsTrigger value="werkstatt" className="text-xs flex items-center gap-1">
              <Wrench className="h-3 w-3" />Werkstatt
            </TabsTrigger>
            <TabsTrigger value="montage" className="text-xs flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />Montage
            </TabsTrigger>
            <TabsTrigger value="hauptmat-profil" className="text-xs flex items-center gap-1">
              <Package className="h-3 w-3" />Hauptmat. Profil
            </TabsTrigger>
            <TabsTrigger value="hauptmat-flaeche" className="text-xs flex items-center gap-1">
              <Layers className="h-3 w-3" />Hauptmat. Fläche
            </TabsTrigger>
            <TabsTrigger value="hilfsmaterial" className="text-xs flex items-center gap-1">
              <Package className="h-3 w-3" />Hilfsmaterial
            </TabsTrigger>
            <TabsTrigger value="fremd" className="text-xs flex items-center gap-1">
              <Wrench className="h-3 w-3" />Fremdleistungen
            </TabsTrigger>
            <TabsTrigger value="soek" className="text-xs flex items-center gap-1">
              <Receipt className="h-3 w-3" />SOEK / Spesen
            </TabsTrigger>
            <TabsTrigger value="offertpreis" className="text-xs flex items-center gap-1">
              <Calculator className="h-3 w-3" />Offertpreis
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="planung" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#1a3a6b" }}></div>
              <h2 className="font-semibold text-sm">Planung / AVOR — Technisches Büro (Sheet 4)</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Kategorien: Ausmass, Vorbereitung, Planung, Begleitung, Abrechnung</p>
            <StundenBereichBlock auftragId={id} bereich="Planung/AVOR" saetze={saetze} />
          </Card>
        </TabsContent>

        <TabsContent value="werkstatt" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#6b4c2a" }}></div>
              <h2 className="font-semibold text-sm">Werkstatt (Sheet 5)</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Kategorien: Vorbereitung, Zuschnitt, Fertigung — Stundensatz je nach Maschinenpark</p>
            <StundenBereichBlock auftragId={id} bereich="Werkstatt" saetze={saetze} />
          </Card>
        </TabsContent>

        <TabsContent value="montage" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#e8620a" }}></div>
              <h2 className="font-semibold text-sm">Montage (Sheet 7)</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Kategorien: Vorbereitung, Reisen, Baustelle einrichten, Rohmontage, Gläser einsetzen, Beschläge einstellen, Übergabe</p>
            <StundenBereichBlock auftragId={id} bereich="Montage" saetze={saetze} />
          </Card>
        </TabsContent>

        <TabsContent value="hauptmat-profil" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm">Hauptmaterial — Profilbezogen (Sheet 1)</h2>
            </div>
            <HauptmatProfilBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="hauptmat-flaeche" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm">Hauptmaterial — Flächenbezogen (Sheet 1.1)</h2>
            </div>
            <HauptmatFlaecheBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="hilfsmaterial" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm">Hilfsmaterial (Sheet 2)</h2>
            </div>
            <HilfsmaterialBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="fremd" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm">Fremdleistungen (Sheet 3)</h2>
            </div>
            <FremdBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="soek" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />
              <h2 className="font-semibold text-sm">Sondereinzelkosten / Spesen (Sheet 9)</h2>
            </div>
            <SoekBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="offertpreis" className="mt-4">
          <OffertpreisBlock auftragId={id} saetze={saetze} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
