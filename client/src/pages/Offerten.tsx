import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { EmailModal } from "@/components/EmailModal";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, Trash, Mail, FileDown, ArrowRight, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Offerte, OffertePosition, Auftrag } from "@shared/schema";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

const STATUS_COLORS: Record<string, string> = {
  offen:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  angenommen: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  abgelehnt:  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  abgelaufen: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function Offerten() {
  const { toast } = useToast();
  const [emailModal, setEmailModal] = useState<{ open: boolean; to: string; subject: string; body: string; refId: string } | null>(null);
  const [pdfDialog, setPdfDialog] = useState<{ open: boolean; oid: string; nr: string; intern: string; extern: string } | null>(null);

  const { data: offerten = [], isLoading } = useQuery<Offerte[]>({
    queryKey: ["/api/offerten"],
    queryFn: () => apiRequest("GET", "/api/offerten").then(r => r.json()),
  });

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
  });
  const aMap = new Map(auftraege.map(a => [a.id, a]));

  const { data: mitarbeiterListe = [] } = useQuery<any[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/offerten/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offerten"] });
      toast({ title: "Offerte gelöscht" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/offerten/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/offerten"] }),
  });

  const auftragErstellen = useMutation({
    mutationFn: (offerteId: string) => apiRequest("POST", `/api/offerten/${offerteId}/zu-auftrag`),
    onSuccess: async (res) => {
      const d = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offerten"] });
      toast({ title: "Auftrag erstellt!", description: `Auftrag ${d.nr} aus Offerte erstellt` });
    },
    onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const handlePdf = (oid: string, nr: string, auftragVerantwortlicher?: string | null) => {
    setPdfDialog({ open: true, oid, nr, intern: auftragVerantwortlicher || "", extern: "" });
  };

  const handlePdfDownload = async () => {
    if (!pdfDialog) return;
    const { oid, nr, intern, extern } = pdfDialog;
    try {
      const r = await fetch(`${API_BASE}/api/offerten/${oid}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ansprechpersonIntern: intern, ansprechpersonExtern: extern }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Offerte-${nr}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setPdfDialog(null);
      toast({ title: "PDF erstellt", description: `Offerte ${nr}` });
    } catch (e: any) {
      toast({ title: "PDF Fehler", description: (e as any).message, variant: "destructive" });
    }
  };

  const totalOffen     = offerten.filter(o => o.status === "offen").length;
  const totalAngenommen = offerten.filter(o => o.status === "angenommen").length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Offerten
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Offerten im Überblick
        </p>
      </div>

      {/* Statistiken */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Gesamt", value: offerten.length, color: "text-foreground" },
          { label: "Offen", value: totalOffen, color: "text-blue-600" },
          { label: "Angenommen", value: totalAngenommen, color: "text-green-600" },
          { label: "Abgelehnt", value: offerten.filter(o => o.status === "abgelehnt").length, color: "text-red-600" },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
          </div>
        ) : offerten.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <p className="mb-2">Noch keine Offerten erstellt.</p>
            <p className="text-xs">Öffne einen Auftrag → Tab "Offerte"</p>
          </div>
        ) : (
          <div className="divide-y">
            {offerten.map(o => {
              const auftrag = aMap.get(o.auftrag_id);
              const pos: OffertePosition[] = Array.isArray(o.positionen) ? o.positionen as OffertePosition[] : [];
              const zwischentotal = pos.reduce((s, p) => s + Number(p.total || 0), 0);
              const rabattBetrag  = zwischentotal * (Number(o.rabatt_prozent) / 100);
              const totalExkl     = zwischentotal - rabattBetrag;
              const totalInkl     = totalExkl * 1.081;

              return (
                <div key={o.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-[#6b4c2a] text-sm">Offerte {o.nr}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] || STATUS_COLORS.offen}`}>
                          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">{o.datum}</span>
                      </div>
                      {o.projekt_beschreibung && (
                        <p className="text-sm font-medium truncate max-w-xs">{o.projekt_beschreibung}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        {o.empfaenger_name && (
                          <p className="text-xs text-muted-foreground">{o.empfaenger_name}</p>
                        )}
                        {auftrag && (
                          <Link href={`/auftraege/${auftrag.id}`}>
                            <a className="text-xs text-primary hover:underline">
                              {auftrag.nr} · {auftrag.titel}
                            </a>
                          </Link>
                        )}
                      </div>
                      <p className="text-sm font-semibold mt-1">
                        CHF {totalInkl.toFixed(2)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">inkl. MwSt.</span>
                      </p>
                    </div>

                    {/* Aktionen */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Select value={o.status}
                        onValueChange={s => statusMutation.mutate({ id: o.id, status: s })}>
                        <SelectTrigger className="h-8 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="offen">Offen</SelectItem>
                          <SelectItem value="angenommen">Angenommen</SelectItem>
                          <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                          <SelectItem value="abgelaufen">Abgelaufen</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button size="sm" variant="outline" onClick={() => handlePdf(o.id, o.nr, aMap.get(o.auftrag_id)?.verantwortlicher)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> PDF
                      </Button>

                      <Button size="sm" variant="outline" title="PDF direkt herunterladen" className="min-h-[36px] min-w-[36px]" onClick={() => handlePdf(o.id, o.nr, aMap.get(o.auftrag_id)?.verantwortlicher)}>
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-muted-foreground hover:text-blue-600"
                        onClick={() => {
                          const auftrag = aMap.get(o.auftrag_id);
                          setEmailModal({
                            open: true,
                            to: (auftrag as any)?.email || "",
                            subject: `Offerte ${o.nr}`,
                            body: `Guten Tag,

erbeiliegend senden wir Ihnen unsere Offerte ${o.nr}.

Freundliche Grüsse
Schneggenburger GmbH`,
                            refId: o.id,
                          });
                        }}
                      >
                        <Mail className="w-3.5 h-3.5 mr-1" /> E-Mail
                      </Button>

                      {/* Auftrag erstellen (nur bei angenommenen Offerten ohne bestehenden Auftrag-Link) */}
                      {o.status === "angenommen" && !aMap.has(o.auftrag_id) && (
                        <Button size="sm" className="gap-1.5 text-xs" style={{ backgroundColor: "#16a34a" }}
                          disabled={auftragErstellen.isPending}
                          onClick={() => auftragErstellen.mutate(o.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {auftragErstellen.isPending ? "..." : "Auftrag erstellen"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => { if (confirm("Offerte wirklich löschen?")) deleteMutation.mutate(o.id); }}>
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
                  onValueChange={(v) => setPdfDialog(d => d ? { ...d, intern: v === "__keiner__" ? "" : v } : d)}
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
          type="offerte"
          refId={emailModal.refId}
        />
      )}
    </div>
  );
}
