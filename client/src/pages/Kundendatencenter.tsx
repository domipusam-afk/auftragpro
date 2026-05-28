import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2, Plus, Pencil, Trash2, Phone, Mail, MapPin,
  Briefcase, TrendingUp, Clock, ChevronRight, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Auftrag } from "@shared/schema";
import { STATUS_LABEL } from "@shared/schema";
import { STATUS_BADGE } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Kunde {
  id: string;
  nr: string;
  firma: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  adresse: string;
  plz: string;
  ort: string;
  notiz: string;
}

const emptyForm = {
  nr: "", firma: "", vorname: "", nachname: "", email: "",
  telefon: "", adresse: "", plz: "", ort: "", notiz: "",
};

function getKundeName(k: Kunde) {
  if (k.firma) return k.firma;
  return [k.vorname, k.nachname].filter(Boolean).join(" ") || "—";
}

// Aufträge einem Kunden zuordnen (matching auf Name/Firma)
function matchAuftraege(k: Kunde, auftraege: Auftrag[]): Auftrag[] {
  const name = `${k.vorname} ${k.nachname}`.toLowerCase().trim();
  const firma = k.firma.toLowerCase().trim();
  return auftraege.filter((a) => {
    const kn = (a.kunde || "").toLowerCase().trim();
    return kn && (
      kn === name ||
      kn === firma ||
      (firma && kn.includes(firma)) ||
      (name && kn.includes(name))
    );
  });
}

// ─── Statistik-Box je Kunde ───────────────────────────────────────────────────
function KundeStatistik({ auftraege }: { auftraege: Auftrag[] }) {
  const gesamt = auftraege.length;
  if (gesamt === 0) return null;

  const offen = auftraege.filter((a) =>
    ["anfrage", "angebot", "bestaetigt", "in_arbeit", "qualitaet"].includes(a.status)
  ).length;
  const abgeschlossen = auftraege.filter((a) => a.status === "abgeschlossen").length;
  const umsatz = auftraege.reduce((s, a) => s + (Number(a.rechnungs_betrag) || Number(a.angebots_betrag) || 0), 0);
  const letzter = auftraege.sort((a, b) =>
    new Date(b.erstellt || 0).getTime() - new Date(a.erstellt || 0).getTime()
  )[0];

  return (
    <div className="border-t pt-3 mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5 text-xs">
        <Briefcase className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Aufträge:</span>
        <span className="font-semibold">{gesamt}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Offen:</span>
        <span className={cn("font-semibold", offen > 0 ? "text-amber-600 dark:text-amber-400" : "")}>
          {offen}
        </span>
      </div>
      {umsatz > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingUp className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Umsatz:</span>
          <span className="font-semibold">CHF {umsatz.toFixed(0)}</span>
        </div>
      )}
      {abgeschlossen > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Abgeschl.:</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{abgeschlossen}</span>
        </div>
      )}
      {letzter && (
        <div className="col-span-2 text-[10px] text-muted-foreground pt-1 border-t">
          Letzte Aktivität: {letzter.nr} — {letzter.titel?.slice(0, 30)}
        </div>
      )}
    </div>
  );
}

// ─── Kundenkarte ──────────────────────────────────────────────────────────────
function KundeCard({
  k,
  auftraege,
  onEdit,
  onDelete,
}: {
  k: Kunde;
  auftraege: Auftrag[];
  onEdit: (k: Kunde) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const kundenAuftraege = matchAuftraege(k, auftraege);
  const offen = kundenAuftraege.filter((a) =>
    ["anfrage", "angebot", "bestaetigt", "in_arbeit", "qualitaet"].includes(a.status)
  ).length;

  return (
    <Card className="p-4 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {k.firma && <p className="text-[11px] text-muted-foreground leading-none mb-0.5">{k.firma}</p>}
          <p className="font-semibold text-base leading-tight">
            {k.vorname} {k.nachname}
          </p>
          {k.nr && (
            <p className="font-mono text-[11px] text-primary/70 font-medium leading-none mt-0.5">{k.nr}</p>
          )}
          {offen > 0 && (
            <Badge variant="outline" className="text-[10px] mt-1 border-amber-400 text-amber-700 dark:text-amber-300">
              {offen} offen
            </Badge>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(k)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(k.id)}
            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {k.email && (
          <a href={`mailto:${k.email}`} className="flex items-center gap-1.5 hover:text-foreground truncate">
            <Mail className="h-3 w-3 shrink-0" />{k.email}
          </a>
        )}
        {k.telefon && (
          <a href={`tel:${k.telefon}`} className="flex items-center gap-1.5 hover:text-foreground">
            <Phone className="h-3 w-3 shrink-0" />{k.telefon}
          </a>
        )}
        {(k.adresse || k.ort) && (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" />
            {[k.adresse, k.plz, k.ort].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      {/* Statistiken */}
      <KundeStatistik auftraege={kundenAuftraege} />

      {/* Auftrags-Liste ausklappbar */}
      {kundenAuftraege.length > 0 && (
        <div className="border-t pt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground w-full"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
            Aufträge ({kundenAuftraege.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {kundenAuftraege.map((a) => (
                <Link key={a.id} href={`/auftraege/${a.id}`}>
                  <a className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 hover:bg-muted transition-colors">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] text-muted-foreground mr-1">{a.nr}</span>
                      <span className="text-xs font-medium truncate">{a.titel}</span>
                    </div>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium", STATUS_BADGE[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {k.notiz && (
        <p className="text-[11px] text-muted-foreground border-t pt-2 italic">{k.notiz}</p>
      )}
    </Card>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function Kundendatencenter() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  // Nächste Kundennummer vom Backend laden
  const { data: nextNrData } = useQuery<{ nr: string }>({
    queryKey: ["/api/kunden/next-nr"],
    queryFn: () => apiRequest("GET", "/api/kunden/next-nr").then((r) => r.json()),
    staleTime: 0,
  });

  // Bei neuem Kunden-Dialog: nr vorausfüllen
  useEffect(() => {
    if (open && !editId && nextNrData?.nr) {
      setForm((f) => ({ ...f, nr: nextNrData.nr }));
    }
  }, [open, editId, nextNrData]);

  const { data: kunden = [], isLoading } = useQuery<Kunde[]>({
    queryKey: ["/api/kunden"],
    queryFn: () => apiRequest("GET", "/api/kunden").then((r) => r.json()),
  });

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (editId) return apiRequest("PATCH", `/api/kunden/${editId}`, form);
      return apiRequest("POST", "/api/kunden", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kunden"] });
      setOpen(false); setEditId(null); setForm(emptyForm);
      toast({ title: editId ? "Kunde aktualisiert" : "Kunde hinzugefügt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kunden/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kunden"] }),
  });

  const openEdit = (k: Kunde) => {
    setEditId(k.id); setForm({ ...k }); setOpen(true);
  };

  const filtered = kunden.filter((k) => {
    const q = search.toLowerCase();
    return (
      k.nachname.toLowerCase().includes(q) ||
      k.vorname.toLowerCase().includes(q) ||
      k.firma.toLowerCase().includes(q) ||
      k.email.toLowerCase().includes(q) ||
      k.ort.toLowerCase().includes(q)
    );
  });

  // Statistiken für Header
  const totalAuftraege = auftraege.length;
  const uniqueKunden = kunden.length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
              Kundenzentrum
            </h1>
            <p className="text-sm text-muted-foreground">
              {uniqueKunden} Kunden · {totalAuftraege} Aufträge total
            </p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditId(null); setForm(emptyForm); }}}>
          <Button className="text-white gap-1.5" style={{ background: "hsl(var(--primary))" }} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Neuer Kunde
            </Button>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Kunde bearbeiten" : "Neuer Kunde"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs font-semibold text-primary">Kundennummer</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    value={form.nr}
                    onChange={(e) => setForm({ ...form, nr: e.target.value })}
                    placeholder="K-2026-0001"
                    className="font-mono"
                  />
                  {!editId && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">auto-generiert</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">Firma (optional)</Label>
                <Input value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} placeholder="Firmenname" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Vorname</Label>
                  <Input value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Nachname *</Label>
                  <Input value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">E-Mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Telefon</Label>
                  <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Adresse</Label>
                <Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="Strasse Nr." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">PLZ</Label>
                  <Input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Ort</Label>
                  <Input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notiz</Label>
                <Input value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="Bemerkungen…" />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.nachname || saveMutation.isPending}
                className="w-full text-white"
                style={{ background: "hsl(var(--primary))" }}
              >
                {editId ? "Speichern" : "Hinzufügen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Suche */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Suche nach Name, Firma, Ort, E-Mail…"
        className="max-w-sm"
      />

      {/* Liste */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            {search ? "Keine Kunden gefunden." : "Noch keine Kunden erfasst. Erstelle einen Auftrag — Kunden werden automatisch synchronisiert."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((k) => (
            <KundeCard
              key={k.id}
              k={k}
              auftraege={auftraege}
              onEdit={openEdit}
              onDelete={(id) => delMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
