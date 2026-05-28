import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Receipt, Plus, Trash2, CheckCircle2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCHF, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Eingangsrechnung {
  id: string;
  auftrag_id?: string;
  lieferant: string;
  betrag: number;
  waehrung: string;
  datum: string;
  faellig_datum?: string;
  status: string;
  beschreibung?: string;
  datei_name?: string;
  erstellt: string;
}

const STATUS_COLOR: Record<string, string> = {
  offen: "bg-yellow-100 text-yellow-800 border-yellow-200",
  bezahlt: "bg-green-100 text-green-800 border-green-200",
  storniert: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function Eingangsrechnungen() {
  const { toast } = useToast();
  const [lieferant, setLieferant] = useState("");
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [faelligDatum, setFaelligDatum] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [selectedAuftrag, setSelectedAuftrag] = useState("none");
  const [filterStatus, setFilterStatus] = useState("alle");

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: rechnungen = [], isLoading } = useQuery<Eingangsrechnung[]>({
    queryKey: ["/api/eingangsrechnungen"],
    queryFn: () => apiRequest("GET", "/api/eingangsrechnungen").then((r) => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/eingangsrechnungen", {
        lieferant,
        betrag: parseFloat(betrag.replace(",", ".")),
        datum,
        faellig_datum: faelligDatum || null,
        beschreibung,
        auftrag_id: selectedAuftrag === "none" ? null : selectedAuftrag,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eingangsrechnungen"] });
      setLieferant(""); setBetrag(""); setFaelligDatum(""); setBeschreibung(""); setSelectedAuftrag("none");
      toast({ title: "Eingangsrechnung erfasst" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/eingangsrechnungen/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eingangsrechnungen"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/eingangsrechnungen/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/eingangsrechnungen"] }),
  });

  const getAuftragTitel = (id?: string) => {
    if (!id) return null;
    const a = auftraege.find((a) => a.id === id);
    return a ? `${a.nr} — ${a.titel}` : null;
  };

  const filtered = filterStatus === "alle" ? rechnungen : rechnungen.filter((r) => r.status === filterStatus);

  const totalOffen = rechnungen.filter(r => r.status === "offen").reduce((s, r) => s + r.betrag, 0);
  const totalBezahlt = rechnungen.filter(r => r.status === "bezahlt").reduce((s, r) => s + r.betrag, 0);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <Receipt className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Eingangsrechnungen
          </h1>
          <p className="text-sm text-muted-foreground">Lieferantenrechnungen auf Projekte buchen</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Offene Lieferantenrechnungen</p>
          <p className="text-xl font-bold text-red-600">{formatCHF(totalOffen)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Bezahlt (gesamt)</p>
          <p className="text-xl font-bold text-green-600">{formatCHF(totalBezahlt)}</p>
        </Card>
      </div>

      {/* Neue Eingangsrechnung */}
      <Card className="p-5 space-y-3">
        <p className="text-sm font-semibold">Neue Eingangsrechnung erfassen</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Lieferant</Label>
            <Input value={lieferant} onChange={(e) => setLieferant(e.target.value)} placeholder="Firmenname" />
          </div>
          <div>
            <Label className="text-xs">Betrag (CHF)</Label>
            <Input value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label className="text-xs">Rechnungsdatum</Label>
            <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Fällig bis (optional)</Label>
            <Input type="date" value={faelligDatum} onChange={(e) => setFaelligDatum(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Auf Auftrag buchen (optional)</Label>
            <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
              <SelectTrigger><SelectValue placeholder="Kein Auftrag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Kein Auftrag —</SelectItem>
                {auftraege.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Beschreibung (optional)</Label>
            <Input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Was wurde geliefert?" />
          </div>
        </div>
        <Button
          onClick={() => addMutation.mutate()}
          disabled={!lieferant || !betrag || !datum || addMutation.isPending}
          className="w-full text-white"
          style={{ background: "#e8620a" }}
        >
          <Plus className="w-4 h-4 mr-2" /> Eingangsrechnung erfassen
        </Button>
      </Card>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["alle", "offen", "bezahlt", "storniert"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              filterStatus === s
                ? "bg-[#1a3a6b] text-white border-[#1a3a6b]"
                : "text-muted-foreground border-border hover:border-[#1a3a6b]"
            )}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Liste */}
      <Card className="p-5 space-y-3">
        <p className="text-sm font-semibold">Eingangsrechnungen ({filtered.length})</p>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Keine Eingangsrechnungen vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const auftragTitel = getAuftragTitel(r.auftrag_id);
              return (
                <div key={r.id} className="rounded-lg border p-3 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{r.lieferant}</span>
                      <Badge variant="outline" className={cn(STATUS_COLOR[r.status] || "")}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </Badge>
                      <span className="text-sm font-bold" style={{ color: "#e8620a" }}>
                        {formatCHF(r.betrag)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.datum)}
                      {r.faellig_datum && ` · Fällig: ${formatDate(r.faellig_datum)}`}
                    </p>
                    {auftragTitel && (
                      <p className="text-xs text-blue-600 font-medium">{auftragTitel}</p>
                    )}
                    {r.beschreibung && <p className="text-xs text-muted-foreground">{r.beschreibung}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {r.status === "offen" && (
                      <button
                        onClick={() => updateMutation.mutate({ id: r.id, status: "bezahlt" })}
                        className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors"
                        title="Als bezahlt markieren"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => delMutation.mutate(r.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
