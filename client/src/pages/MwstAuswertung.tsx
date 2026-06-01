import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Receipt, TrendingUp, TrendingDown, AlertCircle, ChevronDown, ChevronUp, FileDown } from "lucide-react";

const CHF = (n: number) =>
  "CHF " + n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUARTAL_LABELS: Record<string, string> = {
  "1": "Q1 (Jan–Mär)",
  "2": "Q2 (Apr–Jun)",
  "3": "Q3 (Jul–Sep)",
  "4": "Q4 (Okt–Dez)",
};

export default function MwstAuswertung() {
  const currentYear = new Date().getFullYear();
  const currentQ = String(Math.floor(new Date().getMonth() / 3) + 1);

  const [jahr, setJahr] = useState(String(currentYear));
  const [quartal, setQuartal] = useState(currentQ);
  const [showAusgang, setShowAusgang] = useState(false);
  const [showEingang, setShowEingang] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/mwst/auswertung", jahr, quartal],
    queryFn: () =>
      apiRequest("GET", `/api/mwst/auswertung?jahr=${jahr}&quartal=${quartal}`).then((r) => r.json()),
  });

  const jahre = [String(currentYear), String(currentYear - 1), String(currentYear - 2)];

  const handlePdfExport = () => {
    if (!data) return;
    const lines = [
      `MWST-Abrechnung Schneggenburger GmbH`,
      `Quartal: ${QUARTAL_LABELS[quartal]} ${jahr}`,
      `Zeitraum: ${data.von} bis ${data.bis}`,
      `MWST-Satz: ${data.mwstSatz}%`,
      ``,
      `=== AUSGANGSLEISTUNGEN (bezahlte Rechnungen) ===`,
      `Umsatz exkl. MWST: ${data.ausgang.totalNetto.toFixed(2)}`,
      `MWST ${data.mwstSatz}%: ${data.ausgang.totalMwst.toFixed(2)}`,
      `Umsatz inkl. MWST: ${data.ausgang.totalBrutto.toFixed(2)}`,
      ``,
      `=== VORSTEUER (Eingangsrechnungen) ===`,
      `Aufwand exkl. MWST: ${data.eingang.totalNetto.toFixed(2)}`,
      `Vorsteuer ${data.mwstSatz}%: ${data.eingang.totalVorsteuer.toFixed(2)}`,
      `Aufwand inkl. MWST: ${data.eingang.totalBrutto.toFixed(2)}`,
      ``,
      `=== MWST-ZAHLLAST ===`,
      `Geschuldete MWST: ${data.ausgang.totalMwst.toFixed(2)}`,
      `Abzügl. Vorsteuer: ${data.eingang.totalVorsteuer.toFixed(2)}`,
      `MWST-Zahllast: ${data.zahllast.toFixed(2)}`,
      ``,
      `Exportiert am: ${new Date().toLocaleDateString("de-CH")}`,
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MWST-${quartal}-${jahr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
            <Receipt className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              MWST-Abrechnung
            </h1>
            <p className="text-sm text-muted-foreground">Vereinnahmte Entgelte — nur bezahlte Rechnungen</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handlePdfExport} disabled={!data} className="gap-2">
          <FileDown className="h-4 w-4" /> CSV exportieren
        </Button>
      </div>

      {/* Zeitraum-Auswahl */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1">
          {["1","2","3","4"].map((q) => (
            <Button
              key={q}
              size="sm"
              variant={quartal === q ? "default" : "outline"}
              style={quartal === q ? { background: "hsl(var(--primary))", color: "white" } : {}}
              onClick={() => setQuartal(q)}
            >
              Q{q}
            </Button>
          ))}
        </div>
        <Select value={jahr} onValueChange={setJahr}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {jahre.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {isError && (
        <Card className="p-6 flex items-center gap-3 border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Fehler beim Laden der MWST-Daten.</p>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          {/* Zeitraum-Info */}
          <p className="text-sm text-muted-foreground">
            {QUARTAL_LABELS[quartal]} {jahr} · {data.von} bis {data.bis} · MWST-Satz {data.mwstSatz}%
          </p>

          {/* Ausgangsleistungen */}
          <Card className="overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              onClick={() => setShowAusgang(!showAusgang)}
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
                <div className="text-left">
                  <p className="font-semibold text-sm">Ausgangsleistungen</p>
                  <p className="text-xs text-muted-foreground">Bezahlte Rechnungen · {data.ausgang.details.length} Positionen</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Umsatz exkl. MWST</p>
                  <p className="font-mono font-semibold text-sm">{CHF(data.ausgang.totalNetto)}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">MWST {data.mwstSatz}%</p>
                  <p className="font-mono font-semibold text-sm" style={{ color: "hsl(var(--primary))" }}>{CHF(data.ausgang.totalMwst)}</p>
                </div>
                {showAusgang ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {showAusgang && (
              <div className="border-t">
                {data.ausgang.details.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">Keine bezahlten Rechnungen in diesem Quartal.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nr.</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Kunde</TableHead>
                        <TableHead className="text-right">Brutto</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                        <TableHead className="text-right">MWST</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.ausgang.details.map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{r.nr}</TableCell>
                          <TableCell className="text-xs">{r.datum}</TableCell>
                          <TableCell className="text-xs">{r.kunde}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{CHF(r.brutto)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{CHF(r.netto)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{CHF(r.mwst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="flex justify-end gap-6 p-3 bg-muted/20 text-sm font-semibold border-t">
                  <span>Total Netto: {CHF(data.ausgang.totalNetto)}</span>
                  <span style={{ color: "hsl(var(--primary))" }}>MWST: {CHF(data.ausgang.totalMwst)}</span>
                  <span>Total Brutto: {CHF(data.ausgang.totalBrutto)}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Eingangsrechnungen / Vorsteuer */}
          <Card className="overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              onClick={() => setShowEingang(!showEingang)}
            >
              <div className="flex items-center gap-3">
                <TrendingDown className="h-5 w-5 text-orange-600" />
                <div className="text-left">
                  <p className="font-semibold text-sm">Vorsteuer (Eingangsrechnungen)</p>
                  <p className="text-xs text-muted-foreground">Alle Eingangsrechnungen im Quartal · {data.eingang.details.length} Positionen</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Aufwand exkl. MWST</p>
                  <p className="font-mono font-semibold text-sm">{CHF(data.eingang.totalNetto)}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Vorsteuer</p>
                  <p className="font-mono font-semibold text-sm text-orange-600">{CHF(data.eingang.totalVorsteuer)}</p>
                </div>
                {showEingang ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {showEingang && (
              <div className="border-t">
                {data.eingang.details.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">Keine Eingangsrechnungen in diesem Quartal.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nr.</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Lieferant</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Brutto</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                        <TableHead className="text-right">Vorsteuer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.eingang.details.map((e: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{e.nr}</TableCell>
                          <TableCell className="text-xs">{e.datum}</TableCell>
                          <TableCell className="text-xs">{e.lieferant}</TableCell>
                          <TableCell>
                            <Badge variant={e.status === "bezahlt" ? "default" : "secondary"} className="text-xs">
                              {e.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{CHF(e.brutto)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{CHF(e.netto)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-orange-600">{CHF(e.vorsteuer)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="flex justify-end gap-6 p-3 bg-muted/20 text-sm font-semibold border-t">
                  <span>Total Netto: {CHF(data.eingang.totalNetto)}</span>
                  <span className="text-orange-600">Vorsteuer: {CHF(data.eingang.totalVorsteuer)}</span>
                  <span>Total Brutto: {CHF(data.eingang.totalBrutto)}</span>
                </div>
              </div>
            )}
          </Card>

          {/* MWST-Zahllast */}
          <Card className={`p-5 border-2 ${data.zahllast > 0 ? "border-primary/60" : "border-green-500/60"}`} style={{ backgroundColor: "white" }}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="font-bold text-base">MWST-Zahllast {QUARTAL_LABELS[quartal]} {jahr}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Geschuldete MWST {CHF(data.ausgang.totalMwst)} − Vorsteuer {CHF(data.eingang.totalVorsteuer)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-mono font-bold" style={{ color: data.zahllast > 0 ? "hsl(var(--primary))" : "rgb(22 163 74)" }}>
                  {CHF(data.zahllast)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.zahllast > 0 ? "Zu bezahlen an ESTV" : "Rückerstattung von ESTV"}
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-background rounded p-2">
                <p className="text-xs text-muted-foreground">Umsatz netto</p>
                <p className="font-mono font-semibold">{CHF(data.ausgang.totalNetto)}</p>
              </div>
              <div className="bg-background rounded p-2">
                <p className="text-xs text-muted-foreground">Geschuldete MWST</p>
                <p className="font-mono font-semibold" style={{ color: "hsl(var(--primary))" }}>{CHF(data.ausgang.totalMwst)}</p>
              </div>
              <div className="bg-background rounded p-2">
                <p className="text-xs text-muted-foreground">Vorsteuer abzügl.</p>
                <p className="font-mono font-semibold text-orange-600">− {CHF(data.eingang.totalVorsteuer)}</p>
              </div>
              <div className="bg-background rounded p-2">
                <p className="text-xs text-muted-foreground">Zahllast</p>
                <p className="font-mono font-bold" style={{ color: data.zahllast > 0 ? "hsl(var(--primary))" : "rgb(22 163 74)" }}>{CHF(data.zahllast)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
