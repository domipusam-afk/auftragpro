import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowLeft, Save, ChevronsUpDown, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Auftrag, Status, Prioritaet } from "@shared/schema";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  PRIORITAETEN,
  KATEGORIEN,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface Props {
  id?: string;
}

interface Kunde {
  id: string;
  firma: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  adresse: string;
  plz: string;
  ort: string;
}

const empty = {
  titel: "",
  kunde: "",
  kunde_adresse: "",
  kunde_email: "",
  kunde_telefon: "",
  beschreibung: "",
  status: "anfrage" as Status,
  prioritaet: "normal" as Prioritaet,
  kategorie: "",
  start_datum: "",
  end_datum: "",
  angebots_betrag: "",
  rechnungs_betrag: "",
  waehrung: "CHF",
  verantwortlicher: "",
};

export default function AuftragForm({ id }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const editing = !!id;
  const [form, setForm] = useState({ ...empty });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [kundePopoverOpen, setKundePopoverOpen] = useState(false);

  const { data: existing, isLoading } = useQuery<Auftrag>({
    queryKey: ["/api/auftraege", id],
    enabled: editing,
  });

  const { data: kunden = [] } = useQuery<Kunde[]>({
    queryKey: ["/api/kunden"],
    queryFn: () => apiRequest("GET", "/api/kunden").then((r) => r.json()),
  });

  useEffect(() => {
    if (existing) {
      setForm({
        titel: existing.titel || "",
        kunde: existing.kunde || "",
        kunde_adresse: existing.kunde_adresse || "",
        kunde_email: existing.kunde_email || "",
        kunde_telefon: existing.kunde_telefon || "",
        beschreibung: existing.beschreibung || "",
        status: existing.status,
        prioritaet: existing.prioritaet,
        kategorie: existing.kategorie || "",
        start_datum: existing.start_datum?.slice(0, 10) || "",
        end_datum: existing.end_datum?.slice(0, 10) || "",
        angebots_betrag: existing.angebots_betrag != null ? String(existing.angebots_betrag) : "",
        rechnungs_betrag:
          existing.rechnungs_betrag != null ? String(existing.rechnungs_betrag) : "",
        waehrung: existing.waehrung || "CHF",
        verantwortlicher: existing.verantwortlicher || "",
      });
    }
  }, [existing]);

  // Bestehenden Kunden auswählen → Felder befüllen
  const selectKunde = (k: Kunde) => {
    const adressteile = [k.adresse, k.plz && k.ort ? `${k.plz} ${k.ort}` : k.ort].filter(Boolean);
    setForm((f) => ({
      ...f,
      kunde: k.firma
        ? k.firma
        : [k.vorname, k.nachname].filter(Boolean).join(" "),
      kunde_adresse: adressteile.join("\n"),
      kunde_email: k.email || f.kunde_email,
      kunde_telefon: k.telefon || f.kunde_telefon,
    }));
    setKundePopoverOpen(false);
  };

  const mut = useMutation({
    mutationFn: async () => {
      const errs: Record<string, string> = {};
      if (!form.titel.trim()) errs.titel = "Titel ist erforderlich";
      if (!form.kunde.trim()) errs.kunde = "Kunde ist erforderlich";
      setErrors(errs);
      if (Object.keys(errs).length) throw new Error("Bitte Pflichtfelder ausfüllen");

      const res = editing
        ? await apiRequest("PATCH", `/api/auftraege/${id}`, form)
        : await apiRequest("POST", "/api/auftraege", form);
      const data = await res.json();

      // Auto-Sync: Kunde im Kundenzentrum anlegen/aktualisieren
      if (form.kunde.trim()) {
        apiRequest("POST", "/api/kunden/sync-from-auftrag", {
          kunde: form.kunde,
          kunde_adresse: form.kunde_adresse,
          kunde_email: form.kunde_email,
          kunde_telefon: form.kunde_telefon,
        }).catch(() => {}); // Nicht blockieren falls Sync fehlschlägt
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auftraege"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kunden"] });
      if (editing) queryClient.invalidateQueries({ queryKey: ["/api/auftraege", id] });
      toast({ title: editing ? "Auftrag aktualisiert" : "Auftrag erstellt" });
      setLocation(`/auftraege/${data.id || id}`);
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  if (editing && isLoading) {
    return <div className="p-8">Lädt…</div>;
  }

  const setField = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href={editing ? `/auftraege/${id}` : "/auftraege"}>
          <a>
            <Button size="icon" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </a>
        </Link>
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {editing ? "Auftrag bearbeiten" : "Neuer Auftrag"}
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="space-y-6"
      >
        {/* Auftragsdaten */}
        <Card className="p-6 bg-card">
          <h2 className="font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
            Auftragsdaten
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="titel">Titel *</Label>
              <Input
                id="titel"
                data-testid="input-titel"
                value={form.titel}
                onChange={(e) => setField("titel", e.target.value)}
                className="mt-1"
              />
              {errors.titel && <p className="text-sm text-destructive mt-1">{errors.titel}</p>}
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                <SelectTrigger data-testid="select-status" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.concat(["storniert"] as Status[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorität</Label>
              <Select value={form.prioritaet} onValueChange={(v) => setField("prioritaet", v)}>
                <SelectTrigger data-testid="select-prio" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITAETEN.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategorie</Label>
              <Select
                value={form.kategorie || "none"}
                onValueChange={(v) => setField("kategorie", v === "none" ? "" : v)}
              >
                <SelectTrigger data-testid="select-kategorie" className="mt-1">
                  <SelectValue placeholder="Wählen…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {KATEGORIEN.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Verantwortlicher</Label>
              <MitarbeiterSelect
                value={form.verantwortlicher}
                onChange={(v) => setField("verantwortlicher", v)}
              />
            </div>
            <div>
              <Label htmlFor="start_datum">Startdatum</Label>
              <Input id="start_datum" type="date" data-testid="input-start-datum" value={form.start_datum} onChange={(e) => setField("start_datum", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="end_datum">Enddatum</Label>
              <Input id="end_datum" type="date" data-testid="input-end-datum" value={form.end_datum} onChange={(e) => setField("end_datum", e.target.value)} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="beschreibung">Beschreibung</Label>
              <Textarea id="beschreibung" data-testid="input-beschreibung" value={form.beschreibung} onChange={(e) => setField("beschreibung", e.target.value)} rows={4} className="mt-1" />
            </div>
          </div>
        </Card>

        {/* Kundendaten */}
        <Card className="p-6 bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Kundendaten
            </h2>
            {/* Bestehenden Kunden auswählen */}
            {kunden.length > 0 && (
              <Popover open={kundePopoverOpen} onOpenChange={setKundePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs">
                    <UserPlus className="h-3.5 w-3.5" />
                    Bestehenden Kunden wählen
                    <ChevronsUpDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Suche nach Name, Firma…" />
                    <CommandEmpty>Kein Kunde gefunden.</CommandEmpty>
                    <CommandGroup className="max-h-60 overflow-y-auto">
                      {kunden.map((k) => {
                        const label = k.firma
                          ? `${k.firma} (${k.vorname} ${k.nachname})`
                          : `${k.vorname} ${k.nachname}`.trim();
                        return (
                          <CommandItem
                            key={k.id}
                            value={label}
                            onSelect={() => selectKunde(k)}
                            className="cursor-pointer"
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", form.kunde === label ? "opacity-100" : "opacity-0")} />
                            <div>
                              <p className="text-sm font-medium">{label}</p>
                              {k.email && <p className="text-xs text-muted-foreground">{k.email}</p>}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="kunde">Name / Firma *</Label>
              <Input
                id="kunde"
                data-testid="input-kunde"
                value={form.kunde}
                onChange={(e) => setField("kunde", e.target.value)}
                className="mt-1"
                placeholder="z.B. Müller AG oder Hans Müller"
              />
              {errors.kunde && <p className="text-sm text-destructive mt-1">{errors.kunde}</p>}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="kunde_adresse">Adresse</Label>
              <Textarea
                id="kunde_adresse"
                data-testid="input-kunde-adresse"
                value={form.kunde_adresse}
                onChange={(e) => setField("kunde_adresse", e.target.value)}
                rows={3}
                className="mt-1"
                placeholder={"Musterstrasse 1\n8000 Zürich"}
              />
            </div>
            <div>
              <Label htmlFor="kunde_email">E-Mail</Label>
              <Input id="kunde_email" type="email" data-testid="input-kunde-email" value={form.kunde_email} onChange={(e) => setField("kunde_email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="kunde_telefon">Telefon</Label>
              <Input id="kunde_telefon" data-testid="input-kunde-telefon" value={form.kunde_telefon} onChange={(e) => setField("kunde_telefon", e.target.value)} className="mt-1" />
            </div>
          </div>
        </Card>

        {/* Finanzen */}
        <Card className="p-6 bg-card">
          <h2 className="font-semibold mb-4" style={{ fontFamily: "var(--font-display)" }}>
            Finanzen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="angebots_betrag">Angebotsbetrag</Label>
              <Input id="angebots_betrag" type="number" step="0.01" data-testid="input-angebots-betrag" value={form.angebots_betrag} onChange={(e) => setField("angebots_betrag", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="rechnungs_betrag">Rechnungsbetrag</Label>
              <Input id="rechnungs_betrag" type="number" step="0.01" data-testid="input-rechnungs-betrag" value={form.rechnungs_betrag} onChange={(e) => setField("rechnungs_betrag", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Währung</Label>
              <Select value={form.waehrung} onValueChange={(v) => setField("waehrung", v)}>
                <SelectTrigger data-testid="select-waehrung" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={editing ? `/auftraege/${id}` : "/auftraege"}>
            <a><Button type="button" variant="outline">Abbrechen</Button></a>
          </Link>
          <Button
            type="submit"
            data-testid="button-save"
            disabled={mut.isPending}
            className="text-white"
            style={{ background: "hsl(var(--primary))" }}
          >
            <Save className="h-4 w-4 mr-2" />
            {mut.isPending ? "Speichert…" : editing ? "Änderungen speichern" : "Erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Mitarbeiter Dropdown (synchron aus Mitarbeiter-Akte) ──────────────────────
function MitarbeiterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: mitarbeiter = [] } = useQuery<{ id: string; vorname: string; nachname: string; status: string }[]>({
    queryKey: ["/api/mitarbeiter"],
    queryFn: () => apiRequest("GET", "/api/mitarbeiter").then(r => r.json()),
    staleTime: 30_000,
  });

  const aktive = mitarbeiter.filter(m => m.status === "aktiv" || !m.status);

  return (
    <Select
      value={value || "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
    >
      <SelectTrigger className="mt-1" data-testid="select-verantwortlicher">
        <SelectValue placeholder="Mitarbeiter wählen…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— kein Verantwortlicher</SelectItem>
        {aktive.map(m => (
          <SelectItem key={m.id} value={`${m.vorname} ${m.nachname}`}>
            {m.vorname} {m.nachname}
          </SelectItem>
        ))}
        {mitarbeiter.filter(m => m.status !== "aktiv" && m.status).map(m => (
          <SelectItem key={m.id} value={`${m.vorname} ${m.nachname}`} className="text-muted-foreground">
            {m.vorname} {m.nachname} (inaktiv)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
