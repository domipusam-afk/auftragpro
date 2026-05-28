import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Garantie {
  id: string;
  auftrag_id: string;
  auftrag?: { id: string; nr: string; titel: string };
  beschreibung: string;
  ablauf_datum?: string;
  ablaufdatum?: string;
  status: string;
  notiz?: string;
  erstellt: string;
}

const STATUS_COLORS: Record<string, string> = {
  aktiv: "bg-green-100 text-green-800 border-green-200",
  abgelaufen: "bg-red-100 text-red-800 border-red-200",
  abgewickelt: "bg-gray-100 text-gray-600 border-gray-200",
};

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Returns the ablaufdatum field from a garantie (handles both field name variants)
function getAblaufdatum(g: Garantie): string | null | undefined {
  return g.ablaufdatum ?? g.ablauf_datum;
}

function getGarantieFristStatus(ablaufdatum: string | null | undefined) {
  if (!ablaufdatum) return "none";
  const heute = new Date();
  const ablauf = new Date(ablaufdatum);
  const diffDays = Math.ceil((ablauf.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "abgelaufen";
  if (diffDays <= 30) return "kritisch";
  if (diffDays <= 90) return "bald";
  return "ok";
}

function getFristBadge(status: string, ablaufdatum: string) {
  const ablauf = new Date(ablaufdatum).toLocaleDateString("de-CH");
  if (status === "abgelaufen")
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 border border-red-300 rounded px-2 py-0.5">
        ⚠️ Abgelaufen ({ablauf})
      </span>
    );
  if (status === "kritisch")
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-300 rounded px-2 py-0.5">
        ⏰ {ablauf} — &lt;30 Tage!
      </span>
    );
  if (status === "bald")
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded px-2 py-0.5">
        📅 {ablauf}
      </span>
    );
  return <span className="text-xs text-muted-foreground">{ablauf}</span>;
}

export default function GarantieUebersicht() {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("alle");

  const { data: garantien = [], isLoading } = useQuery<Garantie[]>({
    queryKey: ["/api/garantien"],
    queryFn: () => apiRequest("GET", "/api/garantien").then((r) => r.json()),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/garantien/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/garantien"] });
      toast({ title: "Status aktualisiert" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/garantien/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/garantien"] });
      toast({ title: "Garantie gelöscht" });
    },
  });

  const filtered = filterStatus === "alle"
    ? garantien
    : garantien.filter((g) => g.status === filterStatus);

  // Sort: abgelaufen + kritisch first
  const fristOrder = { abgelaufen: 0, kritisch: 1, bald: 2, ok: 3, none: 4 } as Record<string, number>;
  const sorted = [...filtered].sort((a, b) => {
    return (fristOrder[getGarantieFristStatus(getAblaufdatum(a))] ?? 4)
      - (fristOrder[getGarantieFristStatus(getAblaufdatum(b))] ?? 4);
  });

  // Stats
  const aktiv = garantien.filter((g) => g.status === "aktiv").length;
  const bald = garantien.filter((g) => {
    const abl = getAblaufdatum(g);
    if (!abl || g.status !== "aktiv") return false;
    return getDaysUntil(abl) <= 30;
  }).length;
  const abgelaufen = garantien.filter((g) => g.status === "abgelaufen").length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Garantieübersicht
          </h1>
          <p className="text-sm text-muted-foreground">Alle Garantien aus allen Aufträgen</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="text-xs text-muted-foreground">Aktive Garantien</p>
          </div>
          <p className="text-3xl font-bold mt-1 text-green-700">{aktiv}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <p className="text-xs text-muted-foreground">Läuft bald ab (≤30 Tage)</p>
          </div>
          <p className="text-3xl font-bold mt-1 text-orange-600">{bald}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-red-600" />
            <p className="text-xs text-muted-foreground">Abgelaufen</p>
          </div>
          <p className="text-3xl font-bold mt-1 text-red-600">{abgelaufen}</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["alle", "aktiv", "abgelaufen", "abgewickelt"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-2 min-h-[44px] rounded-full text-xs font-medium border transition-colors",
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
      <Card className="p-5">
        <p className="text-sm font-semibold mb-3">Garantien ({sorted.length})</p>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Keine Garantien vorhanden. Garantien werden in der Auftragsdetail-Seite erfasst.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((g) => {
              const abl = getAblaufdatum(g);
              const fristStatus = getGarantieFristStatus(abl);

              return (
                <div
                  key={g.id}
                  className={cn(
                    "rounded-lg border p-3 flex flex-col sm:flex-row items-start gap-3",
                    fristStatus === "kritisch" && "border-orange-300 bg-orange-50",
                    fristStatus === "abgelaufen" && "border-red-200 bg-red-50/50"
                  )}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[g.status] || "")}>
                        {g.status}
                      </Badge>
                      {g.auftrag && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {g.auftrag.nr}
                        </span>
                      )}
                      {abl && getFristBadge(fristStatus, abl)}
                    </div>
                    <p className="text-sm font-medium">{g.beschreibung}</p>
                    {g.auftrag && (
                      <p className="text-xs text-muted-foreground truncate">{g.auftrag.titel}</p>
                    )}
                    {!abl && (
                      <p className="text-xs text-muted-foreground">
                        Kein Ablaufdatum{g.notiz && ` · ${g.notiz}`}
                      </p>
                    )}
                    {g.notiz && abl && (
                      <p className="text-xs text-muted-foreground">{g.notiz}</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {g.status === "aktiv" && (
                      <button
                        onClick={() => updateMut.mutate({ id: g.id, status: "abgewickelt" })}
                        className="px-2 py-2 min-h-[44px] text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        Abgewickelt
                      </button>
                    )}
                    <button
                      onClick={() => delMut.mutate(g.id)}
                      className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                    >
                      ✕
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
