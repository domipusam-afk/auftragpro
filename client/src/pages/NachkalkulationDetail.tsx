import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Plus, Trash2, Clock, Package, Wrench,
  Receipt, BarChart3, RefreshCw, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, FileDown} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function downloadKalkulationPdf(auftragId: string, typ: "vorkalkulation" | "nachkalkulation", toast: (t: any) => void) {
  const r = await fetch(`${API_BASE}/api/auftraege/${auftragId}/kalkulation-pdf?typ=${typ}`, { method: "POST" });
  if (!r.ok) { const err = await r.json().catch(() => ({ message: "PDF Fehler" })); toast({ title: "PDF Fehler", description: err.message, variant: "destructive" }); return; }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `Nachkalkulation-${auftragId}.pdf`;
  a.click(); URL.revokeObjectURL(url);
  toast({ title: "PDF erstellt ✓" });
}
const chf = (v: number) => `CHF ${v.toFixed(2)}`;
const num = (v: any) => parseFloat(v) || 0;

const BEREICHE = ["Planung/AVOR", "Werkstatt", "Montage"];
const UNTERKATEGORIEN: Record<string, string[]> = {
  "Planung/AVOR": ["Ausmass", "Vorbereitung", "Planung", "Begleitung", "Abrechnung"],
  "Werkstatt": ["Vorbereitung", "Zuschnitt", "Fertigung"],
  "Montage": ["Vorbereitung", "Reisen", "Baustelle einrichten", "Rohmontage", "Gläser einsetzen", "Beschläge einstellen", "Übergabe"],
};
const EINHEITEN = ["Stk", "m", "m²", "kg", "L", "Psch", "h"];
const SOEK_KATEGORIEN = ["Distanz km", "Verpflegung", "Unterkunft", "PW km", "Firmenbus km", "LKW km", "Parkgebühren", "Werkzeug-Sonderkauf", "Sonstiges"];

interface NkStunde { id?: string; auftrag_id: string; bereich: string; unterkategorie?: string; mitarbeiter_name: string; datum: string; ist_stunden: number; stundensatz: number; total_chf: number; quelle: string; zeiterfassung_id?: string; bemerkung?: string; }
interface NkMaterial { id?: string; auftrag_id: string; bezeichnung: string; kategorie: string; lieferant: string; betrag_chf: number; datum: string; rechnung_nr: string; bemerkung: string; }
interface NkFremd { id?: string; auftrag_id: string; bezeichnung: string; lieferant: string; betrag_chf: number; datum: string; rechnung_nr: string; bemerkung: string; }
interface NkSoek { id?: string; auftrag_id: string; bezeichnung: string; anzahl: number; einheit: string; preis_pro_einheit: number; total_chf: number; datum: string; bemerkung: string; }
interface VkStunde { id?: string; ort: string; bereich?: string; soll_stunden: number; stundensatz: number; }
interface VkConfig { risiko_gewinn_prozent: number; rabatt_prozent: number; skonto_prozent: number; mwst_prozent: number; }

// ─── IST-Stunden Block ────────────────────────────────────────────────────────
function NkStundenBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const emptyRow = { bereich: "Montage", unterkategorie: "Baustelle einrichten", mitarbeiter_name: "", datum: today, ist_stunden: "", stundensatz: "", bemerkung: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: saetze = [] } = useQuery<any[]>({ queryKey: ["/api/stundensaetze"], queryFn: async () => { const r = await apiRequest("GET", "/api/stundensaetze"); return r.json(); } });
  const { data: mitarbeiter = [] } = useQuery<any[]>({ queryKey: ["/api/mitarbeiter"], queryFn: async () => { const r = await apiRequest("GET", "/api/mitarbeiter"); return r.json(); } });

  // LIVE: kombiniert Zeiterfassung + manuelle Einträge aus Backend
  const { data: rows = [], isLoading } = useQuery<NkStunde[]>({
    queryKey: ["/api/nk-stunden", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-stunden`); return r.json(); },
    refetchInterval: 30000, // Alle 30s automatisch neu laden
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const stunden = num(newRow.ist_stunden), satz = num(newRow.stundensatz);
      return apiRequest("POST", `/api/kalkulation/${auftragId}/nk-stunden`, {
        ...newRow, ist_stunden: stunden, stundensatz: satz, total_chf: stunden * satz,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nk-stunden", auftragId] }); setNewRow(emptyRow); toast({ title: "IST-Stunden manuell erfasst ✓" }); },
  });

  // DELETE — löscht Zeiterfassung-Einträge aus zeiteintraege, manuelle aus nachkalkulation_stunden
  const deleteMutation = useMutation({
    mutationFn: async (row: NkStunde) => {
      if (row.quelle === "zeiterfassung" && row.zeiterfassung_id) {
        // Zeiterfassung-Eintrag löschen (auch aus zeiteintraege)
        return apiRequest("DELETE", `/api/kalkulation/nk-zeiterfassung/${row.zeiterfassung_id}`);
      }
      return apiRequest("DELETE", `/api/kalkulation/nk-stunden/${row.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nk-stunden", auftragId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      toast({ title: "Eintrag gelöscht ✓" });
    },
  });

  const totalIst = rows.reduce((s, r) => s + num(r.ist_stunden), 0);
  const totalChf = rows.reduce((s, r) => s + num(r.total_chf), 0);
  const zeiterfassungRows = rows.filter(r => r.quelle === "zeiterfassung");
  const manuelleRows = rows.filter(r => r.quelle !== "zeiterfassung");

  const bereichColor: Record<string, string> = { "Planung/AVOR": "#1a3a6b", "Werkstatt": "#6b4c2a", "Montage": "#e8620a" };

  return (
    <div className="space-y-4">
      {/* Live-Info */}
      <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">Live-Synchronisation aktiv</p>
          <p className="text-xs text-green-600">
            {zeiterfassungRows.length} aus Zeiterfassung (live) · {manuelleRows.length} manuell erfasst
          </p>
        </div>
        <Button size="sm" variant="ghost" className="text-xs text-green-700"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/nk-stunden", auftragId] })}>
          <RefreshCw className="h-3 w-3 mr-1" />Aktualisieren
        </Button>
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bereich</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Beschreibung</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Mitarbeiter</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Datum</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">IST Std.</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./h</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Total CHF</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Quelle</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-4 text-muted-foreground text-xs">Laden...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-muted-foreground text-xs">
                Noch keine IST-Stunden. Zeiterfassung im Auftrag erfassen oder manuell hinzufügen.
              </td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id || `${r.zeiterfassung_id}-${i}`} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1">
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: (bereichColor[r.bereich] || "#888") + "20", color: bereichColor[r.bereich] || "#888" }}>{r.bereich}</span>
                </td>
                <td className="px-2 py-1 text-xs text-muted-foreground">{r.bemerkung || r.unterkategorie || "—"}</td>
                <td className="px-2 py-1 text-xs">{r.mitarbeiter_name || "—"}</td>
                <td className="px-2 py-1 text-xs font-mono">{r.datum}</td>
                <td className="px-2 py-1 text-xs text-right font-mono">{num(r.ist_stunden).toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono text-muted-foreground">{num(r.stundensatz).toFixed(2)}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.total_chf)}</td>
                <td className="px-2 py-1">
                  <Badge variant={r.quelle === "zeiterfassung" ? "default" : "secondary"} className="text-xs">
                    {r.quelle === "zeiterfassung" ? "⏱ Zeiterfassung" : "✏ Manuell"}
                  </Badge>
                </td>
                <td className="px-1 py-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6"
                    title={r.quelle === "zeiterfassung" ? "Zeiterfassung-Eintrag löschen" : "Manuellen Eintrag löschen"}
                    onClick={() => deleteMutation.mutate(r)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {/* Neue manuelle Zeile */}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1">
                <Select value={newRow.bereich} onValueChange={v => setNewRow(p => ({ ...p, bereich: v, unterkategorie: UNTERKATEGORIEN[v]?.[0] || "" }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{BEREICHE.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1">
                <Select value={newRow.unterkategorie} onValueChange={v => setNewRow(p => ({ ...p, unterkategorie: v }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(UNTERKATEGORIEN[newRow.bereich] || []).map((u: string) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1">
                <Select value={newRow.mitarbeiter_name} onValueChange={v => {
                  const satz = saetze.find((s: any) => s.ort === (newRow.bereich === "Planung/AVOR" ? "Avor" : newRow.bereich) && !s.maschinenpark);
                  setNewRow(p => ({ ...p, mitarbeiter_name: v, stundensatz: satz?.satz || p.stundensatz }));
                }}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Mitarbeiter…" /></SelectTrigger>
                  <SelectContent>{mitarbeiter.map((m: any) => <SelectItem key={m.id} value={`${m.vorname} ${m.nachname}`}>{m.vorname} {m.nachname}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-1 py-1"><Input type="date" className="h-7 text-xs" value={newRow.datum} onChange={e => setNewRow(p => ({ ...p, datum: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" step="0.25" className="h-7 text-xs text-right" placeholder="Std." value={newRow.ist_stunden} onChange={e => setNewRow(p => ({ ...p, ist_stunden: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" step="0.50" className="h-7 text-xs text-right" placeholder="Fr./h" value={newRow.stundensatz} onChange={e => setNewRow(p => ({ ...p, stundensatz: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">{chf(num(newRow.ist_stunden) * num(newRow.stundensatz))}</td>
              <td className="px-1 py-1"><Badge variant="secondary" className="text-xs">Manuell</Badge></td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.ist_stunden}><Plus className="h-3 w-3" /></Button></td>
            </tr>
            {/* Total */}
            {rows.length > 0 && (
              <tr className="bg-muted/30 font-semibold border-t">
                <td colSpan={4} className="px-2 py-2 text-xs font-semibold">Total IST-Stunden</td>
                <td className="px-2 py-2 text-xs text-right font-mono">{totalIst.toFixed(2)} h</td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 text-xs text-right font-mono">{chf(totalChf)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function NkMaterialBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const emptyRow = { bezeichnung: "", kategorie: "Material", lieferant: "", betrag_chf: "", datum: today, rechnung_nr: "", bemerkung: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<NkMaterial[]>({
    queryKey: ["/api/nk-material", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-material`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/kalkulation/${auftragId}/nk-material`, { ...newRow, betrag_chf: num(newRow.betrag_chf) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nk-material", auftragId] }); setNewRow(emptyRow); toast({ title: "IST-Material erfasst" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kalkulation/nk-material/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nk-material", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.betrag_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Effektiv eingekaufte Materialien — mit Belegnummer und Lieferant</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Lieferant</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Rechnungs-Nr.</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Datum</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Betrag CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1 text-xs font-medium">{r.bezeichnung}</td>
                <td className="px-2 py-1 text-xs text-muted-foreground">{r.lieferant}</td>
                <td className="px-2 py-1 text-xs font-mono text-muted-foreground">{r.rechnung_nr}</td>
                <td className="px-2 py-1 text-xs font-mono">{r.datum}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.betrag_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Bezeichnung" value={newRow.bezeichnung} onChange={e => setNewRow(p => ({ ...p, bezeichnung: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Lieferant" value={newRow.lieferant} onChange={e => setNewRow(p => ({ ...p, lieferant: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Rg.-Nr." value={newRow.rechnung_nr} onChange={e => setNewRow(p => ({ ...p, rechnung_nr: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="date" className="h-7 text-xs" value={newRow.datum} onChange={e => setNewRow(p => ({ ...p, datum: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="CHF" value={newRow.betrag_chf} onChange={e => setNewRow(p => ({ ...p, betrag_chf: e.target.value }))} /></td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.bezeichnung || !newRow.betrag_chf}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={4} className="px-2 py-2 text-xs font-semibold">Total IST-Material</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── IST-Fremdleistungen Block ────────────────────────────────────────────────
function NkFremdBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const emptyRow = { bezeichnung: "", lieferant: "", betrag_chf: "", datum: today, rechnung_nr: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<NkFremd[]>({
    queryKey: ["/api/nk-fremd", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-fremd`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/kalkulation/${auftragId}/nk-fremd`, { ...newRow, betrag_chf: num(newRow.betrag_chf) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nk-fremd", auftragId] }); setNewRow(emptyRow); toast({ title: "IST-Fremdleistung erfasst" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kalkulation/nk-fremd/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nk-fremd", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.betrag_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Effektiv bezahlte Fremdleistungen (Glaslieferant, Lackierer, Transport usw.)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Lieferant</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Rechnungs-Nr.</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Datum</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Betrag CHF</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                <td className="px-2 py-1 text-xs font-medium">{r.bezeichnung}</td>
                <td className="px-2 py-1 text-xs text-muted-foreground">{r.lieferant}</td>
                <td className="px-2 py-1 text-xs font-mono text-muted-foreground">{r.rechnung_nr}</td>
                <td className="px-2 py-1 text-xs font-mono">{r.datum}</td>
                <td className="px-2 py-1 text-xs text-right font-mono font-semibold">{chf(r.betrag_chf)}</td>
                <td className="px-1 py-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => r.id && deleteMutation.mutate(r.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></td>
              </tr>
            ))}
            <tr className="border-t-2 border-dashed">
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Bezeichnung" value={newRow.bezeichnung} onChange={e => setNewRow(p => ({ ...p, bezeichnung: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Lieferant" value={newRow.lieferant} onChange={e => setNewRow(p => ({ ...p, lieferant: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input className="h-7 text-xs" placeholder="Rg.-Nr." value={newRow.rechnung_nr} onChange={e => setNewRow(p => ({ ...p, rechnung_nr: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="date" className="h-7 text-xs" value={newRow.datum} onChange={e => setNewRow(p => ({ ...p, datum: e.target.value }))} /></td>
              <td className="px-1 py-1"><Input type="number" className="h-7 text-xs text-right" placeholder="CHF" value={newRow.betrag_chf} onChange={e => setNewRow(p => ({ ...p, betrag_chf: e.target.value }))} /></td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.bezeichnung || !newRow.betrag_chf}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={4} className="px-2 py-2 text-xs font-semibold">Total IST-Fremdleistungen</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── IST-SOEK Block ───────────────────────────────────────────────────────────
function NkSoekBlock({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const emptyRow = { bezeichnung: "Verpflegung", anzahl: "", einheit: "Psch", preis_pro_einheit: "", datum: today };
  const [newRow, setNewRow] = useState(emptyRow);

  const { data: rows = [] } = useQuery<NkSoek[]>({
    queryKey: ["/api/nk-soek", auftragId],
    queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-soek`); return r.json(); },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const anzahl = num(newRow.anzahl), preis = num(newRow.preis_pro_einheit);
      return apiRequest("POST", `/api/kalkulation/${auftragId}/nk-soek`, { ...newRow, anzahl, preis_pro_einheit: preis, total_chf: anzahl * preis });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/nk-soek", auftragId] }); setNewRow(emptyRow); toast({ title: "IST-SOEK erfasst" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kalkulation/nk-soek/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/nk-soek", auftragId] }),
  });

  const total = rows.reduce((s, r) => s + num(r.total_chf), 0);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">Effektiv angefallene Spesen und Sonderkosten</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left px-2 py-1.5 text-xs font-medium">Bezeichnung</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Anzahl</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Einheit</th>
              <th className="text-right px-2 py-1.5 text-xs font-medium">Fr./Einh.</th>
              <th className="text-left px-2 py-1.5 text-xs font-medium">Datum</th>
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
                <td className="px-2 py-1 text-xs font-mono">{r.datum}</td>
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
              <td className="px-1 py-1"><Input type="date" className="h-7 text-xs" value={newRow.datum} onChange={e => setNewRow(p => ({ ...p, datum: e.target.value }))} /></td>
              <td className="px-2 py-1 text-xs text-right font-mono">{chf(num(newRow.anzahl) * num(newRow.preis_pro_einheit))}</td>
              <td className="px-1 py-1"><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => addMutation.mutate()} disabled={!newRow.anzahl}><Plus className="h-3 w-3" /></Button></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-muted/20">
              <td colSpan={5} className="px-2 py-2 text-xs font-semibold">Total IST-SOEK</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-semibold">{chf(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── SOLL/IST Vergleich ───────────────────────────────────────────────────────
function SollIstVergleich({ auftragId }: { auftragId: string }) {
  const { data: vkStunden = [] } = useQuery<VkStunde[]>({ queryKey: ["/api/vk-stunden-all", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/stunden`); return r.json(); } });
  const { data: vkMat = [] } = useQuery<any[]>({ queryKey: ["/api/vk-hauptmaterial", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/material`); return r.json(); } });
  const { data: vkMatF = [] } = useQuery<any[]>({ queryKey: ["/api/vk-hauptmat-flaeche", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/hauptmaterial-flaeche`); return r.json(); } });
  const { data: vkHilf = [] } = useQuery<any[]>({ queryKey: ["/api/vk-hilfsmaterial", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/hilfsmaterial`); return r.json(); } });
  const { data: vkFremd = [] } = useQuery<any[]>({ queryKey: ["/api/vk-fremd", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/fremdleistungen`); return r.json(); } });
  const { data: vkSoek = [] } = useQuery<any[]>({ queryKey: ["/api/vk-soek", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/soek`); return r.json(); } });
  const { data: vkCfg } = useQuery<VkConfig>({ queryKey: ["/api/vk-config", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/vorkalkulation/${auftragId}/config`); return r.json(); } });

  const { data: nkStunden = [] } = useQuery<NkStunde[]>({ queryKey: ["/api/nk-stunden", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-stunden`); return r.json(); } });
  const { data: nkMat = [] } = useQuery<NkMaterial[]>({ queryKey: ["/api/nk-material", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-material`); return r.json(); } });
  const { data: nkFremd = [] } = useQuery<NkFremd[]>({ queryKey: ["/api/nk-fremd", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-fremd`); return r.json(); } });
  const { data: nkSoek = [] } = useQuery<NkSoek[]>({ queryKey: ["/api/nk-soek", auftragId], queryFn: async () => { const r = await apiRequest("GET", `/api/kalkulation/${auftragId}/nk-soek`); return r.json(); } });

  // SOLL
  const sollStunden = vkStunden.reduce((s, r) => s + num(r.soll_stunden), 0);
  const sollLohn = vkStunden.reduce((s, r) => s + num(r.soll_stunden) * num(r.stundensatz), 0);
  const sollMat = vkMat.reduce((s, r) => s + num(r.total_chf), 0) + vkMatF.reduce((s, r) => s + num(r.total_chf), 0) + vkHilf.reduce((s, r) => s + num(r.total_chf), 0);
  const sollFremd = vkFremd.reduce((s, r) => s + num(r.total_chf), 0);
  const sollSoek = vkSoek.reduce((s, r) => s + num(r.total_chf), 0);
  const sollSelbstkosten = sollLohn + sollMat + sollFremd + sollSoek;
  const rg = num(vkCfg?.risiko_gewinn_prozent) / 100 || 0.1;
  const rb = num(vkCfg?.rabatt_prozent) / 100;
  const sk = num(vkCfg?.skonto_prozent) / 100;
  const mwst = num(vkCfg?.mwst_prozent) / 100 || 0.081;
  const sollNetto = sollSelbstkosten * (1 + rg) * (1 - rb) * (1 - sk);
  const sollBrutto = sollNetto * (1 + mwst);

  // IST
  const istStunden = nkStunden.reduce((s, r) => s + num(r.ist_stunden), 0);
  const istLohn = nkStunden.reduce((s, r) => s + num(r.total_chf), 0);
  const istMat = nkMat.reduce((s, r) => s + num(r.betrag_chf), 0);
  const istFremd = nkFremd.reduce((s, r) => s + num(r.betrag_chf), 0);
  const istSoek = nkSoek.reduce((s, r) => s + num(r.total_chf), 0);
  const istSelbstkosten = istLohn + istMat + istFremd + istSoek;
  const gewinnVerlust = sollNetto - istSelbstkosten;

  const Row = ({ label, soll, ist, unit = "CHF" }: { label: string; soll: number; ist: number; unit?: string }) => {
    const diff = ist - soll;
    const isOver = diff > 0;
    return (
      <div className="grid grid-cols-4 gap-2 py-2 border-b border-muted last:border-0 items-center">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-xs text-right font-mono">{unit === "h" ? soll.toFixed(2) + " h" : chf(soll)}</div>
        <div className="text-xs text-right font-mono">{unit === "h" ? ist.toFixed(2) + " h" : chf(ist)}</div>
        <div className={`text-xs text-right font-mono flex items-center justify-end gap-1 ${isOver ? "text-red-600" : "text-green-600"}`}>
          {isOver ? <TrendingUp className="h-3 w-3" /> : ist === 0 ? <Minus className="h-3 w-3 text-muted-foreground" /> : <TrendingDown className="h-3 w-3" />}
          {unit === "h" ? Math.abs(diff).toFixed(2) + " h" : chf(Math.abs(diff))}
          {diff !== 0 && <span className="text-xs">({isOver ? "+" : "-"})</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stunden-Vergleich nach Bereich */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="h-4 w-4" />Stunden SOLL/IST nach Bereich</h3>
        {BEREICHE.map(bereich => {
          const sollH = vkStunden.filter(r => r.bereich === bereich || r.ort === (bereich === "Planung/AVOR" ? "Avor" : bereich)).reduce((s, r) => s + num(r.soll_stunden), 0);
          const istH = nkStunden.filter(r => r.bereich === bereich).reduce((s, r) => s + num(r.ist_stunden), 0);
          const diff = istH - sollH;
          const bereichColor: Record<string, string> = { "Planung/AVOR": "#1a3a6b", "Werkstatt": "#6b4c2a", "Montage": "#e8620a" };
          return (
            <div key={bereich} className="flex items-center gap-3 py-2 border-b border-muted last:border-0">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bereichColor[bereich] }}></div>
              <div className="flex-1 text-xs font-medium">{bereich}</div>
              <div className="text-xs font-mono text-muted-foreground">SOLL: {sollH.toFixed(2)} h</div>
              <div className="text-xs font-mono">IST: {istH.toFixed(2)} h</div>
              <div className={`text-xs font-mono font-semibold ${diff > 0 ? "text-red-600" : "text-green-600"}`}>
                {diff > 0 ? "+" : ""}{diff.toFixed(2)} h
              </div>
            </div>
          );
        })}
      </Card>

      {/* Kosten-Vergleich */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Kosten SOLL/IST</h3>
        <div className="grid grid-cols-4 gap-2 pb-2 border-b border-muted mb-1">
          <div className="text-xs text-muted-foreground font-medium">Position</div>
          <div className="text-xs text-muted-foreground text-right font-medium">SOLL (VK)</div>
          <div className="text-xs text-muted-foreground text-right font-medium">IST (NK)</div>
          <div className="text-xs text-muted-foreground text-right font-medium">Differenz</div>
        </div>
        <Row label="Lohneinzelkosten (Stunden)" soll={sollLohn} ist={istLohn} />
        <Row label="Stunden" soll={sollStunden} ist={istStunden} unit="h" />
        <Row label="Material (Haupt + Hilfs)" soll={sollMat} ist={istMat} />
        <Row label="Fremdleistungen" soll={sollFremd} ist={istFremd} />
        <Row label="SOEK / Spesen" soll={sollSoek} ist={istSoek} />
        <div className="grid grid-cols-4 gap-2 pt-3 mt-1">
          <div className="text-xs font-bold">Selbstkosten</div>
          <div className="text-xs text-right font-mono font-bold">{chf(sollSelbstkosten)}</div>
          <div className="text-xs text-right font-mono font-bold">{chf(istSelbstkosten)}</div>
          <div className={`text-xs text-right font-mono font-bold ${istSelbstkosten > sollSelbstkosten ? "text-red-600" : "text-green-600"}`}>
            {chf(Math.abs(istSelbstkosten - sollSelbstkosten))}
          </div>
        </div>
      </Card>

      {/* Gewinn/Verlust */}
      <Card className="p-4" style={{ borderColor: gewinnVerlust >= 0 ? "#16a34a" : "#dc2626", borderWidth: 2 }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {gewinnVerlust >= 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
              {gewinnVerlust >= 0 ? "Gewinn" : "Verlust"} — Prognose
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Netto-Offertpreis (SOLL) − IST-Selbstkosten</p>
          </div>
          <div className={`text-2xl font-bold font-mono ${gewinnVerlust >= 0 ? "text-green-700" : "text-red-700"}`}>
            {gewinnVerlust >= 0 ? "+" : ""}{chf(gewinnVerlust)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Offertpreis netto SOLL</div>
            <div className="font-mono font-semibold text-sm">{chf(sollNetto)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">IST Selbstkosten</div>
            <div className="font-mono font-semibold text-sm">{chf(istSelbstkosten)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Marge %</div>
            <div className={`font-mono font-semibold text-sm ${gewinnVerlust >= 0 ? "text-green-700" : "text-red-700"}`}>
              {sollNetto > 0 ? ((gewinnVerlust / sollNetto) * 100).toFixed(1) + " %" : "—"}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function NachkalkulationDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePdfDownload = async () => {
    if (!id) return;
    setPdfLoading(true);
    await downloadKalkulationPdf(id, "nachkalkulation", toast);
    setPdfLoading(false);
  };

  const { data: auftrag } = useQuery<any>({
    queryKey: ["/api/auftraege", id],
    queryFn: async () => { const r = await apiRequest("GET", `/api/auftraege/${id}`); return r.json(); },
  });

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
            <BarChart3 className="h-5 w-5" style={{ color: "#e8620a" }} />
            <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)", color: "#e8620a" }}>Nachkalkulation</h1>
            {auftrag && <Badge variant="outline" className="font-mono">{auftrag.auftragsnummer} · {auftrag.titel}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">IST-Werte erfassen und mit der Vorkalkulation vergleichen</p>
        </div>
        <Link href={`/vorkalkulation/${id}`}>
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Zur Vorkalkulation</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={handlePdfDownload} disabled={pdfLoading} style={{ borderColor: "#e8620a", color: "#e8620a" }}>
          <FileDown className="h-4 w-4 mr-1" />
          {pdfLoading ? "PDF..." : "PDF herunterladen"}
        </Button>
      </div>

      <Tabs defaultValue="vergleich" className="w-full">
        <TabsList className="flex flex-wrap gap-1 p-1 h-auto">
          <TabsTrigger value="vergleich" className="text-xs flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />SOLL/IST Vergleich
          </TabsTrigger>
          <TabsTrigger value="stunden" className="text-xs flex items-center gap-1">
            <Clock className="h-3 w-3" />IST-Stunden
          </TabsTrigger>
          <TabsTrigger value="material" className="text-xs flex items-center gap-1">
            <Package className="h-3 w-3" />IST-Material
          </TabsTrigger>
          <TabsTrigger value="fremd" className="text-xs flex items-center gap-1">
            <Wrench className="h-3 w-3" />IST-Fremdleistungen
          </TabsTrigger>
          <TabsTrigger value="soek" className="text-xs flex items-center gap-1">
            <Receipt className="h-3 w-3" />IST-SOEK
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vergleich" className="mt-4">
          <SollIstVergleich auftragId={id} />
        </TabsContent>

        <TabsContent value="stunden" className="mt-4">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="h-4 w-4" style={{ color: "#e8620a" }} />IST-Stunden (Zeiterfassung + Manuell)</h2>
            <NkStundenBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="material" className="mt-4">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Package className="h-4 w-4" style={{ color: "#e8620a" }} />IST-Material (effektiv eingekauft)</h2>
            <NkMaterialBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="fremd" className="mt-4">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Wrench className="h-4 w-4" style={{ color: "#e8620a" }} />IST-Fremdleistungen (effektiv bezahlt)</h2>
            <NkFremdBlock auftragId={id} />
          </Card>
        </TabsContent>

        <TabsContent value="soek" className="mt-4">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Receipt className="h-4 w-4" style={{ color: "#e8620a" }} />IST-SOEK / Spesen (effektiv angefallen)</h2>
            <NkSoekBlock auftragId={id} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
