/**
 * NachkalkulationUebersicht — Auftrag wählen und zur Nachkalkulation navigieren
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Search, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { formatCHF } from "@/lib/format";
import type { Auftrag } from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  anfrage: "Anfrage", angebot: "Angebot", bestaetigt: "Bestätigt",
  in_arbeit: "In Arbeit", qualitaet: "Qualitätsprüfung", rechnung: "Rechnung",
  abgeschlossen: "Abgeschlossen", storniert: "Storniert",
};
const STATUS_COLORS: Record<string, string> = {
  anfrage: "bg-gray-100 text-gray-700", angebot: "bg-blue-100 text-blue-700",
  bestaetigt: "bg-indigo-100 text-indigo-700", in_arbeit: "bg-orange-100 text-orange-700",
  qualitaet: "bg-purple-100 text-purple-700", rechnung: "bg-teal-100 text-teal-700",
  abgeschlossen: "bg-green-100 text-green-700", storniert: "bg-red-100 text-red-700",
};

export default function NachkalkulationUebersicht() {
  const [search, setSearch] = useState("");

  const { data: auftraege = [], isLoading } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then(r => r.json()),
  });

  const filtered = auftraege.filter(a =>
    !search ||
    a.nr?.toLowerCase().includes(search.toLowerCase()) ||
    a.titel?.toLowerCase().includes(search.toLowerCase()) ||
    a.kunde?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#e8620a" }}>
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "#e8620a" }}>
            Nachkalkulation
          </h1>
          <p className="text-sm text-muted-foreground">Auftrag wählen und IST-Werte erfassen / vergleichen</p>
        </div>
      </div>

      {/* Info */}
      <Card className="p-4 border-l-4" style={{ borderLeftColor: "#e8620a" }}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Die <strong>Nachkalkulation</strong> wird pro Auftrag geführt und erfasst alle IST-Werte:
          effektive Stunden (aus Zeiterfassung + manuell), IST-Material, IST-Fremdleistungen und IST-SOEK.
          Der SOLL/IST-Vergleich zeigt die Abweichung zur Vorkalkulation.
        </p>
      </Card>

      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Auftrag suchen (Nr., Titel, Kunde)…"
          className="pl-9"
        />
      </div>

      {/* Auftrags-Liste */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {search ? "Keine Aufträge gefunden." : "Noch keine Aufträge vorhanden."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(auftrag => (
            <Link key={auftrag.id} href={`/nachkalkulation/${auftrag.id}`}>
              <a className="block">
                <Card className="p-3 hover:shadow-md transition-all cursor-pointer group" style={{ borderColor: "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#e8620a44")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-orange-50">
                        <BarChart3 className="h-4 w-4" style={{ color: "#e8620a" }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-medium text-muted-foreground">{auftrag.nr}</span>
                          <span className="font-medium text-sm truncate">{auftrag.titel}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {auftrag.kunde && (
                            <span className="text-xs text-muted-foreground truncate">{auftrag.kunde}</span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] border-0 px-1.5 py-0 ${STATUS_COLORS[auftrag.status] || "bg-gray-100 text-gray-700"}`}
                          >
                            {STATUS_LABELS[auftrag.status] || auftrag.status}
                          </Badge>
                          {auftrag.angebots_betrag && Number(auftrag.angebots_betrag) > 0 && (
                            <span className="text-xs font-medium text-muted-foreground">
                              {formatCHF(Number(auftrag.angebots_betrag))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" asChild
                      style={{ color: "#e8620a" }}>
                      <span className="flex items-center gap-1 text-xs">
                        Nachkalkulation öffnen
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </Button>
                  </div>
                </Card>
              </a>
            </Link>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {!isLoading && auftraege.length > 0 && (
        <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {auftraege.filter(a => ["anfrage", "angebot", "bestaetigt", "in_arbeit"].includes(a.status)).length} aktive Aufträge
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {auftraege.filter(a => a.status === "abgeschlossen").length} abgeschlossen
          </span>
          <span>{auftraege.length} total</span>
        </div>
      )}
    </div>
  );
}
