import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, AlertTriangle, Hammer, Briefcase } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  anfrage:        { label: "Anfrage eingegangen",  color: "bg-blue-100 text-blue-700",   icon: Clock },
  angebot:        { label: "Angebot erstellt",     color: "bg-blue-100 text-blue-700",   icon: Briefcase },
  bestaetigt:     { label: "Auftrag bestätigt",    color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  in_arbeit:      { label: "In Arbeit",            color: "bg-amber-100 text-amber-700", icon: Hammer },
  in_bearbeitung: { label: "In Bearbeitung",       color: "bg-amber-100 text-amber-700", icon: Hammer },
  qualitaet:      { label: "Qualitätsprüfung",     color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
  rechnung:       { label: "Rechnung gestellt",    color: "bg-indigo-100 text-indigo-700", icon: Briefcase },
  abgeschlossen:  { label: "Abgeschlossen",        color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  storniert:      { label: "Storniert",            color: "bg-red-100 text-red-700",     icon: AlertTriangle },
};

// Normalize Auftragsnummer: A-2026-0001 → A260001
function normalizeNr(nr: string): string {
  // Old format: A-2026-0001 or R-2026-0001 etc.
  const m = nr.match(/^([A-Z])-(\d{4})-(\d+)$/);
  if (m) {
    const yy = m[2].slice(2); // "2026" -> "26"
    return m[1] + yy + m[3].padStart(4, "0");
  }
  return nr;
}

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function ProjektStatus({ token }: { token: string }) {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/public/auftrag", token],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/public/auftrag/${token}`);
      if (!r.ok) throw new Error("Nicht gefunden");
      return r.json();
    },
    retry: false,
  });

  const statusCfg = data ? (STATUS_MAP[data.status] || { label: data.status, color: "bg-gray-100 text-gray-600", icon: Clock }) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f0e8] to-[#e8e0d0] dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-xl bg-[#6b4c2a] flex items-center justify-center">
              <Hammer className="h-7 w-7 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-[#6b4c2a]">Schneggenburger GmbH</h1>
          <p className="text-sm text-gray-500">Projektstatus-Übersicht</p>
        </div>

        <Card className="p-6 shadow-lg">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-10" />
              <Skeleton className="h-20" />
            </div>
          ) : isError || !data ? (
            <div className="text-center py-6">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-amber-500" />
              <p className="font-semibold">Link nicht gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Dieser Link ist ungültig oder wurde deaktiviert.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Auftragsnummer</p>
                <p className="font-mono font-bold text-lg text-[#6b4c2a]">{normalizeNr(data.nr || "")}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Projekt</p>
                <p className="font-semibold text-base">{data.titel}</p>
                {data.beschreibung && (
                  <p className="text-sm text-muted-foreground mt-1">{data.beschreibung}</p>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Aktueller Status</p>
                {statusCfg && (() => {
                  const Icon = statusCfg.icon;
                  return (
                    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${statusCfg.color}`}>
                      <Icon className="h-6 w-6 shrink-0" />
                      <div>
                        <p className="font-semibold">{statusCfg.label}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(data.start_datum || data.end_datum) && (
                <div className="grid grid-cols-2 gap-3">
                  {data.start_datum && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Beginn</p>
                      <p className="text-sm font-medium">{data.start_datum}</p>
                    </div>
                  )}
                  {data.end_datum && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Voraussichtliche Fertigstellung</p>
                      <p className="text-sm font-semibold text-[#6b4c2a]">{data.end_datum}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-center text-muted-foreground">
                  Schneggenburger GmbH · Hefenhoferstrasse 7 · 8580 Sommeri<br />
                  Tel: 071 411 16 87
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
