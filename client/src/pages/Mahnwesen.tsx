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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Plus, CheckCircle2, Clock, Trash2, AlertCircle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCHF, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Mahnung {
  id: string;
  auftrag_id: string;
  mahnstufe: number;
  betrag: number;
  faellig_datum: string;
  gesendet_datum?: string;
  bezahlt_datum?: string;
  status: string;
  notiz?: string;
  erstellt: string;
}

const MAHNSTUFE_LABEL: Record<number, string> = {
  1: "1. Mahnung",
  2: "2. Mahnung",
  3: "Letzte Mahnung",
};

const STATUS_COLOR: Record<string, string> = {
  offen: "bg-yellow-100 text-yellow-800 border-yellow-200",
  gesendet: "bg-blue-100 text-blue-800 border-blue-200",
  bezahlt: "bg-green-100 text-green-800 border-green-200",
  abgeschrieben: "bg-gray-100 text-gray-600 border-gray-200",
};

const OPEN_STATUSES = ["anfrage", "angebot", "bestaetigt", "in_arbeit", "qualitaet", "rechnung"];

export default function Mahnwesen() {
  const { toast } = useToast();
  const [selectedAuftrag, setSelectedAuftrag] = useState("");
  const [betrag, setBetrag] = useState("");
  const [faelligDatum, setFaelligDatum] = useState("");
  const [mahnstufe, setMahnstufe] = useState("1");
  const [notiz, setNotiz] = useState("");
  const [filterStatus, setFilterStatus] = useState("alle");

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: mahnungen = [], isLoading } = useQuery<Mahnung[]>({
    queryKey: ["/api/mahnungen"],
    queryFn: () => apiRequest("GET", "/api/mahnungen").then((r) => r.json()),
  });

  const offeneAuftraege = auftraege.filter((a) => OPEN_STATUSES.includes(a.status));

  const addMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/mahnungen", {
        auftrag_id: selectedAuftrag,
        mahnstufe: parseInt(mahnstufe),
        betrag: parseFloat(betrag.replace(",", ".")),
        faellig_datum: faelligDatum,
        notiz,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mahnungen"] });
      setBetrag(""); setFaelligDatum(""); setNotiz(""); setMahnstufe("1");
      toast({ title: "Mahnung erstellt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/mahnungen/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mahnungen"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/mahnungen/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mahnungen"] }),
  });

  const getAuftragTitel = (id: string) => {
    const a = auftraege.find((a) => a.id === id);
    return a ? `${a.nr} — ${a.titel}` : id;
  };

  const filtered = filterStatus === "alle"
    ? mahnungen
    : mahnungen.filter((m) => m.status === filterStatus);

  const offenePosten = mahnungen
    .filter((m) => m.status !== "bezahlt" && m.status !== "abgeschrieben")
    .reduce((s, m) => s + m.betrag, 0);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <AlertTriangle className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Mahnwesen & Offene Posten
          </h1>
          <p className="text-sm text-muted-foreground">Mahnungen erstellen und verwalten</p>
        </div>
        {offenePosten > 0 && (
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Offene Posten</p>
            <p className="text-xl font-bold text-red-600">{formatCHF(offenePosten)}</p>
          </div>
        )}
      </div>

      {/* Neue Mahnung */}
      <Card className="p-5 space-y-4">
        <p className="text-sm font-semibold">Neue Mahnung erstellen</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Auftrag</Label>
            <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
              <SelectTrigger><SelectValue placeholder="Auftrag wählen…" /></SelectTrigger>
              <SelectContent>
                {offeneAuftraege.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mahnstufe</Label>
            <Select value={mahnstufe} onValueChange={setMahnstufe}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1. Mahnung</SelectItem>
                <SelectItem value="2">2. Mahnung</SelectItem>
                <SelectItem value="3">Letzte Mahnung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Betrag (CHF)</Label>
            <Input value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label className="text-xs">Fällig bis</Label>
            <Input type="date" value={faelligDatum} onChange={(e) => setFaelligDatum(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Notiz (optional)</Label>
          <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Bemerkung…" />
        </div>
        <Button
          onClick={() => addMutation.mutate()}
          disabled={!selectedAuftrag || !betrag || !faelligDatum || addMutation.isPending}
          className="w-full text-white"
          style={{ background: "#e8620a" }}
        >
          <Plus className="w-4 h-4 mr-2" /> Mahnung erstellen
        </Button>
      </Card>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["alle", "offen", "gesendet", "bezahlt", "abgeschrieben"].map((s) => (
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
        <p className="text-sm font-semibold">Mahnungen ({filtered.length})</p>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Keine Mahnungen vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <div key={m.id} className="rounded-lg border p-3 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn(STATUS_COLOR[m.status] || "")}>
                      {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                    </Badge>
                    <span className="text-xs font-medium bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                      {MAHNSTUFE_LABEL[m.mahnstufe] || `Stufe ${m.mahnstufe}`}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#e8620a" }}>
                      {formatCHF(m.betrag)}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">{getAuftragTitel(m.auftrag_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    Fällig: {formatDate(m.faellig_datum)}
                    {m.notiz && ` · ${m.notiz}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {m.status === "offen" && (
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, status: "gesendet" })}
                      className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                      title="Als gesendet markieren"
                    >
                      <Clock className="h-4 w-4" />
                    </button>
                  )}
                  {m.status !== "bezahlt" && (
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, status: "bezahlt" })}
                      className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors"
                      title="Als bezahlt markieren"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        const API_BASE = (window as any).__PORT_5000__ || "";
                        const r = await fetch(`${API_BASE}/api/mahnungen/${m.id}/pdf`, { method: "POST" });
                        if (!r.ok) throw new Error(await r.text());
                        const blob = await r.blob();
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank");
                      } catch (e: any) {
                        toast({ title: "Fehler beim PDF", description: e.message, variant: "destructive" });
                      }
                    }}
                    className="p-1.5 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
                    title="PDF erstellen"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => delMutation.mutate(m.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                    title="Löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
