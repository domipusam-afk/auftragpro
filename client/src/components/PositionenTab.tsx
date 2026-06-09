import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Package,
  Clock,
  Truck,
  TrendingUp,
  Download,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Typen ───────────────────────────────────────────────────────────────────

export type Kategorie = "material" | "lohn" | "fremdleistung";

export interface Position {
  id: string;
  auftrag_id: string;
  position: number;
  bezeichnung: string;
  beschreibung: string | null;
  kategorie: Kategorie;
  menge: number;
  einheit: string;
  einzelpreis: number;
}

// ─── Konstanten ──────────────────────────────────────────────────────────────

const EINHEITEN = ["m", "m²", "m³", "Stk", "h", "kg", "t", "L", "pausch."];

const KAT_LABEL: Record<Kategorie, string> = {
  material: "Material",
  lohn: "Lohn",
  fremdleistung: "Fremdleistung",
};

const KAT_BADGE: Record<Kategorie, string> = {
  material: "bg-blue-100 text-blue-700 border-blue-200",
  lohn: "bg-green-100 text-green-700 border-green-200",
  fremdleistung: "bg-amber-100 text-amber-700 border-amber-200",
};

const KAT_ICON: Record<Kategorie, JSX.Element> = {
  material: <Package className="h-3 w-3" />,
  lohn: <Clock className="h-3 w-3" />,
  fremdleistung: <Truck className="h-3 w-3" />,
};

function formatCHF(val: number): string {
  return val.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Leeres Formular ─────────────────────────────────────────────────────────

const LEER_FORM = {
  bezeichnung: "",
  beschreibung: "",
  kategorie: "material" as Kategorie,
  menge: "",
  einheit: "Stk",
  einzelpreis: "",
};

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function PositionenTab({ auftragId }: { auftragId: string }) {
  const { toast } = useToast();
  const [filterKat, setFilterKat] = useState<Kategorie | "alle">("alle");
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Position>>({});
  const [neuesFormular, setNeuesFormular] = useState(LEER_FORM);
  const [zeigeForm, setZeigeForm] = useState(false);
  const [loescheId, setLoescheId] = useState<string | null>(null);

  // ─── Daten laden ─────────────────────────────────────────────────────────

  const { data: positionen = [], isLoading } = useQuery<Position[]>({
    queryKey: ["/api/auftraege", auftragId, "positionen"],
    queryFn: () => apiRequest("GET", `/api/auftraege/${auftragId}/positionen`).then(r => r.json()),
  });

  // ─── Mutationen ──────────────────────────────────────────────────────────

  const inv = () => queryClient.invalidateQueries({
    queryKey: ["/api/auftraege", auftragId, "positionen"],
  });

  const erstelleMutation = useMutation({
    mutationFn: (body: typeof LEER_FORM) =>
      apiRequest("POST", `/api/auftraege/${auftragId}/positionen`, {
        ...body,
        menge: parseFloat(body.menge) || 0,
        einzelpreis: parseFloat(body.einzelpreis) || 0,
      }).then(r => r.json()),
    onSuccess: () => {
      inv();
      setNeuesFormular(LEER_FORM);
      setZeigeForm(false);
      toast({ title: "Position gespeichert" });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const bearbeiteMutation = useMutation({
    mutationFn: ({ pid, body }: { pid: string; body: Partial<Position> }) =>
      apiRequest("PATCH", `/api/auftraege/${auftragId}/positionen/${pid}`, body).then(r => r.json()),
    onSuccess: () => { inv(); setEditId(null); toast({ title: "Position aktualisiert" }); },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const loescheMutation = useMutation({
    mutationFn: (pid: string) =>
      apiRequest("DELETE", `/api/auftraege/${auftragId}/positionen/${pid}`).then(r => r.json()),
    onSuccess: () => { inv(); setLoescheId(null); toast({ title: "Position gelöscht" }); },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // ─── Berechnungen ────────────────────────────────────────────────────────

  const total = (p: Position) => p.menge * p.einzelpreis;

  const gefiltered = filterKat === "alle" ? positionen : positionen.filter(p => p.kategorie === filterKat);

  const sumMaterial = positionen.filter(p => p.kategorie === "material").reduce((s, p) => s + total(p), 0);
  const sumLohn = positionen.filter(p => p.kategorie === "lohn").reduce((s, p) => s + total(p), 0);
  const sumFremd = positionen.filter(p => p.kategorie === "fremdleistung").reduce((s, p) => s + total(p), 0);
  const sumExkl = sumMaterial + sumLohn + sumFremd;
  const mwst = sumExkl * 0.081;
  const sumInkl = sumExkl + mwst;

  const anzahl = (k: Kategorie) => positionen.filter(p => p.kategorie === k).length;

  // ─── Einkaufsliste CSV export ─────────────────────────────────────────────

  const exportEinkauf = () => {
    const material = positionen.filter(p => p.kategorie === "material");
    if (material.length === 0) {
      toast({ title: "Keine Material-Positionen vorhanden" });
      return;
    }
    const header = "Pos;Bezeichnung;Beschreibung;Menge;Einheit;Einzelpreis CHF;Total CHF";
    const rows = material.map((p, i) =>
      `${i + 1};"${p.bezeichnung}";"${p.beschreibung ?? ""}";"${p.menge}";"${p.einheit}";"${p.einzelpreis}";"${total(p).toFixed(2)}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Einkaufsliste_${auftragId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Inline-Bearbeitung starten ──────────────────────────────────────────

  const startEdit = (p: Position) => {
    setEditId(p.id);
    setEditData({
      bezeichnung: p.bezeichnung,
      beschreibung: p.beschreibung ?? "",
      kategorie: p.kategorie,
      menge: p.menge,
      einheit: p.einheit,
      einzelpreis: p.einzelpreis,
    });
  };

  const saveEdit = () => {
    if (!editId) return;
    bearbeiteMutation.mutate({ pid: editId, body: editData });
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Positionen werden geladen…
      </div>
    );
  }

  return (
    <div className="space-y-0">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Positionsliste</h3>
          <Badge variant="outline" className="text-xs font-medium">
            {positionen.length} {positionen.length === 1 ? "Position" : "Positionen"}
          </Badge>
        </div>
        <Button
          size="sm"
          onClick={() => { setZeigeForm(v => !v); setEditId(null); }}
          data-testid="btn-position-hinzufuegen"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Position hinzufügen
        </Button>
      </div>

      {/* Kategorie-Filter */}
      {positionen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(["alle", "material", "lohn", "fremdleistung"] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilterKat(k)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                filterKat === k
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
              )}
            >
              {k === "alle"
                ? `Alle (${positionen.length})`
                : `${KAT_LABEL[k]} (${anzahl(k)})`}
            </button>
          ))}
        </div>
      )}

      {/* Kalkulations-Hinweis */}
      {positionen.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mb-3">
          <Calculator className="h-3.5 w-3.5 shrink-0" />
          <span>Diese Positionen fliessen automatisch in die <strong>Vorkalkulation</strong> ein — kein doppeltes Erfassen.</span>
        </div>
      )}

      {/* Tabelle */}
      {gefiltered.length > 0 ? (
        <div className="rounded-md border border-border overflow-hidden mb-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-8">#</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Bezeichnung</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Kategorie</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Menge</th>
                <th className="text-left px-2 py-2 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Einh.</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Einzelpr.</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                <th className="px-2 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {gefiltered.map(p => (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    editId === p.id ? "bg-primary/5 outline outline-1 outline-primary/30" : "hover:bg-muted/30"
                  )}
                  data-testid={`pos-row-${p.id}`}
                >
                  {/* Pos-Nr */}
                  <td className="px-3 py-2.5 text-xs font-bold text-muted-foreground">{p.position}</td>

                  {/* Bezeichnung — normal oder im Editiermodus */}
                  <td className="px-3 py-2.5">
                    {editId === p.id ? (
                      <div className="space-y-1">
                        <Input
                          value={editData.bezeichnung ?? ""}
                          onChange={e => setEditData(d => ({ ...d, bezeichnung: e.target.value }))}
                          className="h-7 text-xs"
                          data-testid="input-edit-bezeichnung"
                        />
                        <Input
                          value={editData.beschreibung ?? ""}
                          onChange={e => setEditData(d => ({ ...d, beschreibung: e.target.value }))}
                          className="h-7 text-xs text-muted-foreground"
                          placeholder="Beschreibung (optional)"
                          data-testid="input-edit-beschreibung"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-xs">{p.bezeichnung}</div>
                        {p.beschreibung && (
                          <div className="text-xs text-muted-foreground mt-0.5">{p.beschreibung}</div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Kategorie */}
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {editId === p.id ? (
                      <Select
                        value={editData.kategorie}
                        onValueChange={v => setEditData(d => ({ ...d, kategorie: v as Kategorie }))}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="lohn">Lohn</SelectItem>
                          <SelectItem value="fremdleistung">Fremdleistung</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border", KAT_BADGE[p.kategorie])}>
                        {KAT_ICON[p.kategorie]}
                        {KAT_LABEL[p.kategorie]}
                      </span>
                    )}
                  </td>

                  {/* Menge */}
                  <td className="px-3 py-2.5 text-right">
                    {editId === p.id ? (
                      <Input
                        type="number"
                        value={editData.menge ?? ""}
                        onChange={e => setEditData(d => ({ ...d, menge: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs w-20 text-right ml-auto"
                        step="0.001"
                        min="0"
                        data-testid="input-edit-menge"
                      />
                    ) : (
                      <span className="text-xs font-medium tabular-nums">{p.menge.toLocaleString("de-CH")}</span>
                    )}
                  </td>

                  {/* Einheit */}
                  <td className="px-2 py-2.5 hidden sm:table-cell">
                    {editId === p.id ? (
                      <Select
                        value={editData.einheit}
                        onValueChange={v => setEditData(d => ({ ...d, einheit: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs bg-muted border border-border rounded px-1.5 py-0.5 font-medium text-muted-foreground">{p.einheit}</span>
                    )}
                  </td>

                  {/* Einzelpreis */}
                  <td className="px-3 py-2.5 text-right hidden md:table-cell">
                    {editId === p.id ? (
                      <Input
                        type="number"
                        value={editData.einzelpreis ?? ""}
                        onChange={e => setEditData(d => ({ ...d, einzelpreis: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-xs w-24 text-right ml-auto"
                        step="0.01"
                        min="0"
                        data-testid="input-edit-einzelpreis"
                      />
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">{formatCHF(p.einzelpreis)}</span>
                    )}
                  </td>

                  {/* Total */}
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs font-bold tabular-nums text-green-700">
                      {formatCHF(total(p))}
                    </span>
                  </td>

                  {/* Aktionen */}
                  <td className="px-2 py-2.5">
                    {editId === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={saveEdit}
                          disabled={bearbeiteMutation.isPending}
                          className="w-7 h-7 rounded flex items-center justify-center bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                          data-testid="btn-save-edit"
                          title="Speichern"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="w-7 h-7 rounded flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
                          title="Abbrechen"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(p)}
                          className="w-7 h-7 rounded flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          data-testid={`btn-edit-${p.id}`}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setLoescheId(p.id)}
                          className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                          data-testid={`btn-delete-${p.id}`}
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !zeigeForm && (
          <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-md mb-4">
            {filterKat === "alle"
              ? "Noch keine Positionen erfasst."
              : `Keine ${KAT_LABEL[filterKat]}-Positionen vorhanden.`}
          </div>
        )
      )}

      {/* Neue Position Formular */}
      {zeigeForm && (
        <div className="border border-dashed border-primary/40 rounded-md bg-primary/5 p-4 mt-3 space-y-3">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Neue Position
          </p>

          {/* Zeile 1: Bezeichnung + Beschreibung */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Bezeichnung *</label>
              <Input
                value={neuesFormular.bezeichnung}
                onChange={e => setNeuesFormular(f => ({ ...f, bezeichnung: e.target.value }))}
                placeholder="z.B. Vierkantrohr 40×40×3 mm"
                className="h-8 text-xs"
                data-testid="input-neu-bezeichnung"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Beschreibung (optional)</label>
              <Input
                value={neuesFormular.beschreibung}
                onChange={e => setNeuesFormular(f => ({ ...f, beschreibung: e.target.value }))}
                placeholder="z.B. S235JR verzinkt · Rahmenkonstruktion"
                className="h-8 text-xs"
                data-testid="input-neu-beschreibung"
              />
            </div>
          </div>

          {/* Zeile 2: Kategorie + Menge + Einheit + Preis */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Kategorie</label>
              <Select
                value={neuesFormular.kategorie}
                onValueChange={v => setNeuesFormular(f => ({ ...f, kategorie: v as Kategorie }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-neu-kategorie">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="lohn">Lohn</SelectItem>
                  <SelectItem value="fremdleistung">Fremdleistung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Menge</label>
              <Input
                type="number"
                value={neuesFormular.menge}
                onChange={e => setNeuesFormular(f => ({ ...f, menge: e.target.value }))}
                placeholder="0.00"
                className="h-8 text-xs text-right"
                step="0.001"
                min="0"
                data-testid="input-neu-menge"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Einheit</label>
              <Select
                value={neuesFormular.einheit}
                onValueChange={v => setNeuesFormular(f => ({ ...f, einheit: v }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-neu-einheit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium">Einzelpreis (CHF)</label>
              <Input
                type="number"
                value={neuesFormular.einzelpreis}
                onChange={e => setNeuesFormular(f => ({ ...f, einzelpreis: e.target.value }))}
                placeholder="0.00"
                className="h-8 text-xs text-right"
                step="0.01"
                min="0"
                data-testid="input-neu-einzelpreis"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => erstelleMutation.mutate(neuesFormular)}
              disabled={erstelleMutation.isPending || !neuesFormular.bezeichnung.trim()}
              data-testid="btn-pos-speichern"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {erstelleMutation.isPending ? "Speichern…" : "Speichern"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setZeigeForm(false); setNeuesFormular(LEER_FORM); }}
              data-testid="btn-pos-abbrechen"
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Totals — nur wenn Positionen vorhanden */}
      {positionen.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap gap-6 justify-between">

            {/* Aufschlüsselung */}
            <div className="space-y-1.5 min-w-48">
              <div className="flex justify-between gap-8 text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Package className="h-3 w-3 text-blue-600" /> Material
                </span>
                <span className="font-medium tabular-nums">CHF {formatCHF(sumMaterial)}</span>
              </div>
              <div className="flex justify-between gap-8 text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-green-600" /> Lohn
                </span>
                <span className="font-medium tabular-nums">CHF {formatCHF(sumLohn)}</span>
              </div>
              <div className="flex justify-between gap-8 text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-3 w-3 text-amber-600" /> Fremdleistung
                </span>
                <span className="font-medium tabular-nums">CHF {formatCHF(sumFremd)}</span>
              </div>
              <div className="border-t border-border pt-1.5 mt-1.5">
                <div className="flex justify-between gap-8 text-xs">
                  <span className="text-muted-foreground">Total exkl. MWST</span>
                  <span className="font-semibold tabular-nums">CHF {formatCHF(sumExkl)}</span>
                </div>
                <div className="flex justify-between gap-8 text-xs mt-1">
                  <span className="text-muted-foreground">MWST 8.1%</span>
                  <span className="tabular-nums text-muted-foreground">CHF {formatCHF(mwst)}</span>
                </div>
                <div className="flex justify-between gap-8 text-sm mt-1.5">
                  <span className="font-bold">Total inkl. MWST</span>
                  <span className="font-bold tabular-nums text-primary">CHF {formatCHF(sumInkl)}</span>
                </div>
              </div>
            </div>

            {/* Aktions-Buttons */}
            <div className="flex flex-col gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={exportEinkauf}
                data-testid="btn-export-einkauf"
                className="text-xs"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Einkaufsliste (CSV)
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="btn-kalkulation-link"
                className="text-xs"
                onClick={() => {
                  window.location.hash = `/auftraege/${auftragId}/kalkulation`;
                }}
              >
                <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                Zur Vorkalkulation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lösch-Dialog */}
      <AlertDialog open={!!loescheId} onOpenChange={o => !o && setLoescheId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Position löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Position wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => loescheId && loescheMutation.mutate(loescheId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
