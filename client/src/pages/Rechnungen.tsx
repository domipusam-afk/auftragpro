import { useState } from "react";
import { EmailModal } from "@/components/EmailModal";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Rechnung, Auftrag } from "@shared/schema";
import { formatCHF, formatDate } from "@/lib/format";
import { Download, FileSpreadsheet, FileText, AlertCircle, CheckCircle2, Clock, Mail, Banknote, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function statusBadge(r: Rechnung) {
  // Wenn bezahlt_am gesetzt → immer grünes "Bezahlt" Badge mit Datum
  if ((r as any).bezahlt_am) {
    const d = new Date((r as any).bezahlt_am);
    const dateStr = d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    return (
      <Badge className="text-xs gap-1 bg-green-100 text-green-800 border-green-300 hover:bg-green-100" title={`Bezahlt am ${dateStr}`}>
        <CheckCircle2 className="w-3 h-3" />
        Bezahlt {dateStr}
      </Badge>
    );
  }
  if (!r.faellig_datum) {
    return (
      <Badge variant="outline" className="text-xs">Offen</Badge>
    );
  }
  const faellig = new Date(r.faellig_datum);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  if (faellig < heute) {
    return (
      <Badge className="text-xs gap-1 bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
        <AlertCircle className="w-3 h-3" />
        Überfällig
      </Badge>
    );
  }
  const diffDays = Math.ceil((faellig.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return (
      <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
        <Clock className="w-3 h-3" />
        Fällig in {diffDays}d
      </Badge>
    );
  }
  return (
    <Badge className="text-xs gap-1 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
      <Clock className="w-3 h-3" />
      Offen
    </Badge>
  );
}

export default function Rechnungen() {
  const { toast } = useToast();
  const [exportZeitraum, setExportZeitraum] = useState("jahr");
  const [exportLoading, setExportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("alle");
  const [emailModal, setEmailModal] = useState<{ open: boolean; to: string; subject: string; body: string; refId: string } | null>(null);
  const [pdfDialog, setPdfDialog] = useState<{ open: boolean; rechnung: any; auftragId: string; intern: string; internEmail: string; internTelefon: string; extern: string } | null>(null);
  const [bezahltPending, setBezahltPending] = useState<string | null>(null);

  // Bezahlt / Offen markieren
  const deleteRechnungMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/rechnungen/${id}`);
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rechnungen"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      toast({ title: "Rechnung gelöscht" });
    },
    onError: () => toast({ title: "Fehler", description: "Löschen fehlgeschlagen.", variant: "destructive" }),
  });

  const bezahltMutation = useMutation({
    mutationFn: async ({ id, bezahlt }: { id: string; bezahlt: boolean }) => {
      setBezahltPending(id);
      const body = bezahlt
        ? { bezahlt_am: new Date().toISOString().slice(0, 10) }
        : { bezahlt_am: null };
      const res = await apiRequest("PATCH", `/api/rechnungen/${id}`, body);
      return res.json();
    },
    onSuccess: (_, vars) => {
      setBezahltPending(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rechnungen"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: vars.bezahlt ? "✓ Als bezahlt markiert" : "Zurück auf offen gesetzt",
        description: vars.bezahlt ? `Rechnung als bezahlt am ${new Date().toLocaleDateString("de-CH")} gespeichert.` : "Rechnung wurde wieder auf offen gesetzt.",
      });
    },
    onError: () => {
      setBezahltPending(null);
      toast({ title: "Fehler", description: "Status konnte nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const { data: rechnungen, isLoading } = useQuery<Rechnung[]>({
    queryKey: ["/api/rechnungen"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/rechnungen");
      return r.json();
    },
  });

  const { data: mitarbeiterListe = [] } = useQuery<any[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then(r => r.json()),
  });

  const { data: auftraege } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
  });
  const aMap = new Map((auftraege || []).map((a) => [a.id, a]));

  // Q3 / Banana Export
  const handleQ3Export = async () => {
    setExportLoading(true);
    try {
      const r = await apiRequest("GET", `/api/export/q3?zeitraum=${exportZeitraum}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Banana-Export_${exportZeitraum}_${new Date().getFullYear()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export erfolgreich", description: "CSV-Datei wurde heruntergeladen. In Banana: Datei → Zeilen importieren." });
    } catch {
      toast({ title: "Fehler", description: "Export fehlgeschlagen.", variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };

  // PDF Download — verwendet apiRequest (korrekte URL auch in deployed preview)
  const handlePdf = (r: Rechnung) => {
    const auftrag = aMap.get(r.auftrag_id);
    if (!auftrag) {
      toast({ title: "Fehler", description: "Auftrag nicht gefunden.", variant: "destructive" });
      return;
    }
    // Mitarbeiter-Daten für Auto-Befüllung suchen
    const verantwortlicher = auftrag.verantwortlicher || "";
    const ma = mitarbeiterListe.find((m: any) => {
      const full = `${m.vorname || ""} ${m.nachname || ""}`.trim();
      return full === verantwortlicher.trim();
    });
    setPdfDialog({
      open: true, rechnung: r, auftragId: auftrag.id,
      intern: verantwortlicher,
      internEmail: ma?.email_geschaeftlich || ma?.email || "",
      internTelefon: ma?.telefon_direkt || ma?.telefon || "",
      extern: ""
    });
  };

  const handlePdfDownload = async () => {
    if (!pdfDialog) return;
    const { rechnung, auftragId, intern, internEmail, internTelefon, extern } = pdfDialog;
    setPdfLoading(rechnung.id);
    try {
      const res = await apiRequest(
        "POST",
        `/api/auftraege/${auftragId}/rechnungen/${rechnung.id}/pdf`,
        { ansprechpersonIntern: intern, ansprechpersonInternEmail: internEmail, ansprechpersonInternTelefon: internTelefon, ansprechpersonExtern: extern }
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setPdfDialog(null);
      toast({ title: "PDF erstellt", description: `Rechnung ${rechnung.nr} — im Browser-Tab geöffnet` });
    } catch (e: any) {
      toast({ title: "Fehler", description: (e as any).message || "PDF konnte nicht generiert werden.", variant: "destructive" });
    } finally {
      setPdfLoading(null);
    }
  };

  const filteredRechnungen = (rechnungen || []).filter((r) => {
    if (filterStatus === "bezahlt") return !!(r as any).bezahlt_am;
    if (filterStatus === "offen") return !(r as any).bezahlt_am && !(r as any).storniert_am;
    if (filterStatus === "storniert") return !!(r as any).storniert_am;
    return true;
  });
  const total = filteredRechnungen.reduce((s, r) => s + (Number(r.betrag) || 0), 0);
  const ueberfaellig = (rechnungen || []).filter(r => {
    if ((r as any).bezahlt_am) return false; // bezahlte nicht als überfällig zählen
    if ((r as any).storniert_am) return false;
    if (!r.faellig_datum) return false;
    return new Date(r.faellig_datum) < new Date();
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header: Titel */}
      <div>
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Rechnungen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {filteredRechnungen.length} {filterStatus === "alle" ? "Rechnungen" : filterStatus === "bezahlt" ? "bezahlte Rechnungen" : filterStatus === "offen" ? "offene Rechnungen" : "stornierte Rechnungen"} · Gesamt {formatCHF(total, "CHF")}
          {ueberfaellig.length > 0 && (
            <span className="ml-2 text-red-600 font-medium">
              · {ueberfaellig.length} überfällig
            </span>
          )}
        </p>
      </div>

      {/* Export-Bereich: beide Cards nebeneinander, auf Mobile untereinander */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* FIBU-Export (Abacus/Banana/Bexio) */}
        <Card className="p-3 flex flex-col gap-2 bg-card flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium">FIBU-Export (Abacus / Banana / Bexio)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" style={{ borderColor: "#1a3a6b", color: "#1a3a6b" }}
              onClick={() => { window.open(`${API_BASE}/api/export/fibu?typ=ausgangsrechnungen`, "_blank"); }}>
              <Download className="w-3.5 h-3.5" /> Ausgangsrechnungen CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" style={{ borderColor: "#6b4c2a", color: "#6b4c2a" }}
              onClick={() => { window.open(`${API_BASE}/api/export/fibu?typ=eingangsrechnungen`, "_blank"); }}>
              <Download className="w-3.5 h-3.5" /> Eingangsrechnungen CSV
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" style={{ borderColor: "#e8620a", color: "#e8620a" }}
              onClick={() => { window.open(`${API_BASE}/api/export/fibu`, "_blank"); }}>
              <Download className="w-3.5 h-3.5" /> Alles exportieren
            </Button>
          </div>
        </Card>

        {/* Banana / Q3 Export */}
        <Card className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium whitespace-nowrap">Banana / Q3 Export</p>
              <p className="text-xs text-muted-foreground">CSV für Buchhaltung</p>
            </div>
          </div>
          <Select value={exportZeitraum} onValueChange={setExportZeitraum}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-36" data-testid="select-q3-zeitraum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monat">Aktueller Monat</SelectItem>
              <SelectItem value="quartal">Aktuelles Quartal</SelectItem>
              <SelectItem value="jahr">Aktuelles Jahr</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleQ3Export}
            disabled={exportLoading}
            data-testid="button-q3-export"
            className="h-8 text-xs gap-1.5 whitespace-nowrap"
            style={{ borderColor: "#6b4c2a", color: "#6b4c2a" }}
          >
            <Download className="w-3.5 h-3.5" />
            {exportLoading ? "Exportiere…" : "CSV herunterladen"}
          </Button>
        </Card>
      </div>

      {/* Desktop Tabelle */}
      <Card className="bg-card overflow-hidden hidden md:block">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !rechnungen || rechnungen.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Noch keine Rechnungen erstellt.<br />
            <span className="text-xs">Rechnungen werden im Auftrag unter dem Tab "Rechnung" erstellt.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nr.</th>
                  <th className="text-left px-4 py-3 font-medium">Auftrag</th>
                  <th className="text-left px-4 py-3 font-medium">Kunde</th>
                  <th className="text-right px-4 py-3 font-medium">Betrag CHF</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Fällig</th>
                  <th className="text-right px-4 py-3 font-medium">Erstellt</th>
                  <th className="text-right px-4 py-3 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRechnungen.map((r) => {
                  const a = aMap.get(r.auftrag_id);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-rechnung-${r.id}`}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{r.nr}</td>
                      <td className="px-4 py-3">
                        {a ? (
                          <Link href={`/auftraege/${a.id}`}>
                            <a className="font-medium hover:underline" style={{ color: "#6b4c2a" }}>
                              {a.nr} · {a.titel}
                            </a>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a?.kunde || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCHF(r.betrag, r.waehrung)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {statusBadge(r)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums">
                        {formatDate(r.faellig_datum)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums">
                        {formatDate(r.erstellt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Bezahlt / Offen Button */}
                          {(r as any).bezahlt_am ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-green-700 hover:text-orange-600 hover:bg-orange-50"
                              title={`Bezahlt am ${new Date((r as any).bezahlt_am).toLocaleDateString("de-CH")} — Klicken zum Zurücksetzen`}
                              disabled={bezahltPending === r.id}
                              onClick={() => bezahltMutation.mutate({ id: r.id, bezahlt: false })}
                            >
                              {bezahltPending === r.id
                                ? <span className="animate-pulse">…</span>
                                : <><CheckCircle2 className="w-3 h-3 mr-1" />Bezahlt</>}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-green-700 hover:bg-green-50"
                              title="Als bezahlt markieren"
                              disabled={bezahltPending === r.id}
                              onClick={() => bezahltMutation.mutate({ id: r.id, bezahlt: true })}
                            >
                              {bezahltPending === r.id
                                ? <span className="animate-pulse">…</span>
                                : <><Banknote className="w-3 h-3 mr-1" />Bezahlt</>}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={pdfLoading === r.id}
                            onClick={() => handlePdf(r)}
                            title="PDF herunterladen"
                            data-testid={`button-pdf-${r.id}`}
                          >
                            {pdfLoading === r.id
                              ? <span className="text-xs animate-pulse">…</span>
                              : <Download className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600"
                            title="E-Mail senden"
                            onClick={() => setEmailModal({
                              open: true,
                              to: (a as any)?.email || "",
                              subject: `Rechnung ${r.nr}`,
                              body: `Guten Tag,

erbeiliegend senden wir Ihnen Ihre Rechnung ${r.nr} über CHF ${r.betrag?.toFixed(2) || "—"}.

Freundliche Grüsse
Schneggenburger GmbH`,
                              refId: r.id,
                            })}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                            title="Rechnung löschen"
                            disabled={deleteRechnungMutation.isPending}
                            data-testid={`button-delete-rechnung-${r.id}`}
                            onClick={() => {
                              if (window.confirm(`Rechnung ${r.nr} wirklich löschen?`)) {
                                deleteRechnungMutation.mutate(r.id);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold">
                    Total ({filteredRechnungen.length} {filterStatus === "alle" ? "Rechnungen" : filterStatus})
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: "#6b4c2a" }}>
                    {formatCHF(total, "CHF")}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Filter-Tabs (Mobile + Desktop) */}
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

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <><Skeleton className="h-28" /><Skeleton className="h-28" /></>
        ) : !rechnungen || rechnungen.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Noch keine Rechnungen erstellt.
          </Card>
        ) : (
          filteredRechnungen.map((r) => {
            const a = aMap.get(r.auftrag_id);
            return (
              <Card key={r.id} className="p-4 space-y-2" data-testid={`card-rechnung-${r.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold">{r.nr}</span>
                    {a && (
                      <Link href={`/auftraege/${a.id}`}>
                        <a className="block text-sm font-medium mt-0.5 hover:underline" style={{ color: "#6b4c2a" }}>
                          {a.nr} · {a.titel}
                        </a>
                      </Link>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{a?.kunde || "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold tabular-nums text-base">{formatCHF(r.betrag, r.waehrung)}</p>
                    <div className="mt-1">{statusBadge(r)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t">
                  <div className="text-xs text-muted-foreground">
                    {formatDate(r.erstellt)}
                    {r.faellig_datum && <span className="ml-2">· Fällig {formatDate(r.faellig_datum)}</span>}
                  </div>
                  <div className="flex gap-1">
                    {/* Bezahlt Button Mobile */}
                    {(r as any).bezahlt_am ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 border-green-300 bg-green-50 text-green-700"
                        disabled={bezahltPending === r.id}
                        onClick={() => bezahltMutation.mutate({ id: r.id, bezahlt: false })}
                        title={`Bezahlt am ${new Date((r as any).bezahlt_am).toLocaleDateString("de-CH")} — Tippen zum Zurücksetzen`}
                      >
                        {bezahltPending === r.id
                          ? <span className="animate-pulse">…</span>
                          : <><CheckCircle2 className="w-3 h-3" />Bezahlt</>}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={bezahltPending === r.id}
                        onClick={() => bezahltMutation.mutate({ id: r.id, bezahlt: true })}
                      >
                        {bezahltPending === r.id
                          ? <span className="animate-pulse">…</span>
                          : <><Banknote className="w-3 h-3" />Bezahlt</>}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      disabled={pdfLoading === r.id}
                      onClick={() => handlePdf(r)}
                      data-testid={`button-mobile-pdf-${r.id}`}
                    >
                      <Download className="w-3 h-3" />
                      {pdfLoading === r.id ? "…" : "PDF"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0 text-red-500 border-red-200 hover:bg-red-50"
                      disabled={deleteRechnungMutation.isPending}
                      onClick={() => { if (window.confirm(`Rechnung ${r.nr} wirklich löschen?`)) deleteRechnungMutation.mutate(r.id); }}
                      title="Rechnung löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
      {/* PDF Ansprechperson Dialog */}
      {pdfDialog?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-base font-semibold mb-4" style={{ color: "#6b4c2a" }}>PDF erstellen – Ansprechperson</h2>
            <div className="space-y-3 mb-5">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Intern (Mitarbeiter / Verantwortlicher)</Label>
                <Select
                  value={pdfDialog.intern}
                  onValueChange={(v) => {
                    if (v === "__keiner__") {
                      setPdfDialog(d => d ? { ...d, intern: "", internEmail: "", internTelefon: "" } : d);
                    } else {
                      // Mitarbeiter aus Liste heraussuchen und Email/Telefon auto-befüllen
                      const ma = mitarbeiterListe.find((m: any) => [m.vorname, m.nachname].filter(Boolean).join(" ") === v);
                      setPdfDialog(d => d ? {
                        ...d,
                        intern: v,
                        internEmail: ma?.email_geschaeftlich || ma?.email || "",
                        internTelefon: ma?.telefon_direkt || ma?.telefon || "",
                      } : d);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Mitarbeiter wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__keiner__">– Keiner –</SelectItem>
                    {mitarbeiterListe.map((m: any) => {
                      const name = [m.vorname, m.nachname].filter(Boolean).join(" ") || m.name || String(m.id);
                      return <SelectItem key={m.id} value={name}>{name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Input
                  value={pdfDialog.intern}
                  onChange={(e) => setPdfDialog(d => d ? { ...d, intern: e.target.value } : d)}
                  placeholder="oder manuell eingeben..."
                  className="h-7 text-xs mt-1"
                />
                {/* Auto-befüllte Kontaktdaten */}
                {pdfDialog.internEmail && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">📧 {pdfDialog.internEmail}</p>
                )}
                {pdfDialog.internTelefon && (
                  <p className="text-[11px] text-muted-foreground">📞 {pdfDialog.internTelefon}</p>
                )}
                <div className="grid grid-cols-2 gap-1 mt-1">
                  <Input
                    value={pdfDialog.internEmail}
                    onChange={(e) => setPdfDialog(d => d ? { ...d, internEmail: e.target.value } : d)}
                    placeholder="E-Mail (optional)"
                    className="h-7 text-xs"
                  />
                  <Input
                    value={pdfDialog.internTelefon}
                    onChange={(e) => setPdfDialog(d => d ? { ...d, internTelefon: e.target.value } : d)}
                    placeholder="Tel. Direkt (optional)"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Extern (Ansprechperson beim Kunden)</Label>
                <Select
                  value={pdfDialog.extern}
                  onValueChange={(v) => setPdfDialog(d => d ? { ...d, extern: v === "__keiner__" ? "" : v } : d)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Kontakt wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__keiner__">– Keiner –</SelectItem>
                    {mitarbeiterListe.map((m: any) => {
                      const name = [m.vorname, m.nachname].filter(Boolean).join(" ") || m.name || String(m.id);
                      return <SelectItem key={m.id} value={name}>{name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Input
                  value={pdfDialog.extern}
                  onChange={(e) => setPdfDialog(d => d ? { ...d, extern: e.target.value } : d)}
                  placeholder="oder manuell eingeben..."
                  className="h-7 text-xs mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPdfDialog(null)}>Abbrechen</Button>
              <Button size="sm" style={{ background: "#6b4c2a", color: "white" }} onClick={handlePdfDownload}>
                PDF erstellen
              </Button>
            </div>
          </div>
        </div>
      )}

      {emailModal && (
        <EmailModal
          open={emailModal.open}
          onClose={() => setEmailModal(null)}
          to={emailModal.to}
          subject={emailModal.subject}
          body={emailModal.body}
          type="rechnung"
          refId={emailModal.refId}
        />
      )}
    </div>
  );
}