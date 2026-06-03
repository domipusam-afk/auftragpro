import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, AlertTriangle, Hammer, Briefcase, Circle, CircleDot, MessageSquare, CalendarOff } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  anfrage:        { label: "Anfrage eingegangen",  color: "bg-blue-100 text-blue-700",     icon: Clock },
  angebot:        { label: "Angebot erstellt",      color: "bg-blue-100 text-blue-700",     icon: Briefcase },
  bestaetigt:     { label: "Auftrag bestätigt",     color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
  in_arbeit:      { label: "In Arbeit",             color: "bg-amber-100 text-amber-700",   icon: Hammer },
  in_bearbeitung: { label: "In Bearbeitung",        color: "bg-amber-100 text-amber-700",   icon: Hammer },
  qualitaet:      { label: "Qualitätsprüfung",      color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
  rechnung:       { label: "Rechnung gestellt",     color: "bg-indigo-100 text-indigo-700", icon: Briefcase },
  abgeschlossen:  { label: "Abgeschlossen",         color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
  storniert:      { label: "Storniert",             color: "bg-red-100 text-red-700",       icon: AlertTriangle },
};

const SCHRITT_CFG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  offen:    { icon: Circle,        color: "text-gray-400",   bg: "bg-gray-100",   label: "Ausstehend" },
  aktiv:    { icon: CircleDot,     color: "text-amber-500",  bg: "bg-amber-50",   label: "In Arbeit" },
  erledigt: { icon: CheckCircle2,  color: "text-green-500",  bg: "bg-green-50",   label: "Erledigt" },
};

function normalizeNr(nr: string): string {
  const m = nr.match(/^([A-Z])-(\d{4})-(\d+)$/);
  if (m) {
    const yy = m[2].slice(2);
    return m[1] + yy + m[3].padStart(4, "0");
  }
  return nr;
}

function formatDate(d: string): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function ProjektStatus({ token }: { token: string }) {
  const { data, isLoading, isError, error } = useQuery<any, any>({
    queryKey: ["/api/public/auftrag", token],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/public/auftrag/${token}`);
      if (r.status === 410) {
        const body = await r.json();
        const err: any = new Error("abgelaufen");
        err.status = 410;
        err.end_datum = body.end_datum;
        throw err;
      }
      if (!r.ok) throw new Error("Nicht gefunden");
      return r.json();
    },
    retry: false,
  });

  const isAbgelaufen = isError && (error as any)?.status === 410;
  const abgelaufenDatum = isAbgelaufen ? (error as any)?.end_datum : null;

  const statusCfg = data ? (STATUS_MAP[data.status] || { label: data.status, color: "bg-gray-100 text-gray-600", icon: Clock }) : null;
  const schritte: any[] = data?.schritte || [];
  const total = schritte.length;
  const erledigt = schritte.filter((s: any) => s.status === "erledigt").length;
  const fortschritt = total > 0 ? Math.round((erledigt / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f0e8] to-[#e8e0d0] flex items-start justify-center p-4 py-8">
      <div className="w-full max-w-lg">
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
          ) : isAbgelaufen ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <CalendarOff className="h-8 w-8 text-amber-600" />
              </div>
              <p className="font-bold text-base text-amber-800">Dieser Link ist abgelaufen</p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Der Projektstatus-Link war bis zum Abschluss des Auftrags gültig
                {abgelaufenDatum ? <> (<span className="font-medium">{formatDate(abgelaufenDatum)}</span>)</> : ""}.
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Bei Fragen wenden Sie sich bitte direkt an Schneggenburger GmbH.<br />
                Tel: 071 411 16 87
              </p>
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
              {/* Auftragsnummer + Titel */}
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

              {/* Aktueller Status */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Aktueller Status</p>
                {statusCfg && (() => {
                  const Icon = statusCfg.icon;
                  return (
                    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${statusCfg.color}`}>
                      <Icon className="h-6 w-6 shrink-0" />
                      <p className="font-semibold">{statusCfg.label}</p>
                    </div>
                  );
                })()}
              </div>

              {/* Fortschrittsbalken (nur wenn Schritte vorhanden) */}
              {total > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Fortschritt</p>
                    <span className="text-sm font-semibold text-[#6b4c2a]">{fortschritt}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${fortschritt}%`, background: "linear-gradient(90deg, #8b6234, #6b4c2a)" }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{erledigt} von {total} Schritten abgeschlossen</p>
                </div>
              )}

              {/* Arbeitsschritte-Timeline */}
              {schritte.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Arbeitsschritte</p>
                  <div className="relative">
                    {/* Vertikale Linie */}
                    <div className="absolute left-[18px] top-3 bottom-3 w-px bg-gray-200" />
                    <div className="space-y-2">
                      {schritte.map((s: any, idx: number) => {
                        const cfg = SCHRITT_CFG[s.status] || SCHRITT_CFG.offen;
                        const Icon = cfg.icon;
                        return (
                          <div key={s.id || idx} className="flex items-start gap-3 relative">
                            <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center z-10 mt-0.5 ${cfg.bg} border-2 ${s.status === "erledigt" ? "border-green-300" : s.status === "aktiv" ? "border-amber-300" : "border-gray-200"}`}>
                              <Icon className={`h-4 w-4 ${cfg.color}`} />
                            </div>
                            <div className={`flex-1 rounded-lg px-3 py-2 ${s.status === "aktiv" ? "bg-amber-50 border border-amber-200" : s.status === "erledigt" ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-medium ${s.status === "erledigt" ? "line-through text-gray-400" : s.status === "aktiv" ? "text-amber-800" : "text-gray-600"}`}>
                                  {s.titel}
                                </span>
                                <div className="text-right shrink-0">
                                  <span className={`text-[11px] font-medium ${s.status === "erledigt" ? "text-green-600" : s.status === "aktiv" ? "text-amber-600" : "text-gray-400"}`}>
                                    {cfg.label}
                                  </span>
                                  {s.erledigt_am && (
                                    <div className="text-[10px] text-green-500">{formatDate(s.erledigt_am)}</div>
                                  )}
                                </div>
                              </div>
                              {/* Fotos */}
                              {s.fotos && s.fotos.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {s.fotos.map((f: any) => (
                                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={f.url}
                                        alt={f.dateiname || "Foto"}
                                        className="w-16 h-16 object-cover rounded-md border border-gray-200 hover:opacity-90 transition-opacity"
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Kunden-Nachricht */}
              {data.kunden_nachricht && (
                <div className="bg-[#6b4c2a]/8 border border-[#6b4c2a]/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-[#6b4c2a]" />
                    <p className="text-xs font-semibold text-[#6b4c2a] uppercase tracking-wider">Mitteilung</p>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{data.kunden_nachricht}</p>
                </div>
              )}

              {/* Daten */}
              {(data.start_datum || data.end_datum) && (
                <div className="grid grid-cols-2 gap-3">
                  {data.start_datum && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Beginn</p>
                      <p className="text-sm font-medium">{formatDate(data.start_datum)}</p>
                    </div>
                  )}
                  {data.end_datum && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Voraussichtliche Fertigstellung</p>
                      <p className="text-sm font-semibold text-[#6b4c2a]">{formatDate(data.end_datum)}</p>
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
