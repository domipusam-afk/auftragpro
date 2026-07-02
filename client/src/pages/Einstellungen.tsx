import React, { useRef, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { lsGet, lsSet, lsRemove } from "@/lib/storage";
import {
  Upload, Download, Trash, FileText, CheckCircle2, AlertTriangle, Info,
  Lock, Eye, EyeOff, DollarSign, Clock, Save, Building2, Mail, Phone,
  Shield, ShieldCheck, Smartphone, Copy, Check, Server, Percent, Image,
  GripVertical, Plus, Pencil, X, GitBranch,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import PdfVorlagenTab from "./PdfVorlagenTab";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stundensatz {
  id: string;
  ort: string;
  maschinenpark: string | null;
  satz: number;
  grundsatz: number | null;
  bezeichnung: string | null;
}

type EinstellungMap = Record<string, string>;

// ─── Helper: useEinstellung ────────────────────────────────────────────────────

function useEinstellungen() {
  return useQuery<{ schluessel: string; wert: string }[]>({
    queryKey: ["/api/einstellungen"],
    queryFn: () => apiRequest("GET", "/api/einstellungen").then((r) => r.json()),
  });
}

function useSaveEinstellung() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ key, wert }: { key: string; wert: string }) =>
      apiRequest("PUT", `/api/einstellungen/${key}`, { wert }),
    onSuccess: (_data, variables) => {
      // Sync localStorage so background shows instantly on next page load
      if (variables.key === "login_hintergrund") {
        if (variables.wert) lsSet("ap_login_bg", variables.wert);
        else lsRemove("ap_login_bg");
      }
      if (variables.key === "app_hintergrund") {
        if (variables.wert) lsSet("ap_app_bg", variables.wert);
        else lsRemove("ap_app_bg");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen"] });
      toast({ title: "Einstellung gespeichert ✓" });
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });
}

// ─── Tab: Allgemein (Firmendaten) ──────────────────────────────────────────────

function AllgemeinTab({ settings }: { settings: EinstellungMap }) {
  const { toast } = useToast();
  const save = useSaveEinstellung();

  const [felder, setFelder] = useState({
    firmenname:   settings.firmenname   || "Schneggenburger GmbH",
    adresse:      settings.adresse      || "Hefenhoferstrasse 7",
    plz_ort:      settings.plz_ort      || "8580 Sommeri",
    telefon:      settings.telefon      || "071 411 16 87",
    email:        settings.email        || "info@schneggenburger.ch",
    mwst_satz:    settings.mwst_satz    || "8.1",
    uid_nummer:   settings.uid_nummer   || "",
    bank_iban:    settings.bank_iban    || "",
    bank_name:    settings.bank_name    || "",
  });

  function handleChange(field: keyof typeof felder, val: string) {
    setFelder((p) => ({ ...p, [field]: val }));
  }

  async function saveAll() {
    const entries = Object.entries(felder) as [string, string][];
    for (const [key, wert] of entries) {
      await apiRequest("PUT", `/api/einstellungen/${key}`, { wert });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/einstellungen"] });
    toast({ title: "✅ Firmendaten gespeichert", description: "Alle Angaben wurden aktualisiert." });
  }

  const field = (label: string, key: keyof typeof felder, placeholder: string, type = "text", icon?: any) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-2.5 text-muted-foreground">{icon}</span>}
        <Input
          type={type}
          value={felder[key]}
          onChange={(e) => handleChange(key, e.target.value)}
          placeholder={placeholder}
          className={icon ? "pl-9" : ""}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Firmendaten</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field("Firmenname", "firmenname", "Musterfirma GmbH")}
          {field("Adresse", "adresse", "Musterstrasse 1")}
          {field("PLZ / Ort", "plz_ort", "8000 Zürich")}
          {field("Telefon", "telefon", "071 000 00 00", "tel", <Phone className="h-4 w-4" />)}
          {field("E-Mail", "email", "info@firma.ch", "email", <Mail className="h-4 w-4" />)}
          {field("MWST-Satz (%)", "mwst_satz", "8.1", "number", <Percent className="h-4 w-4" />)}
          {field("UID-Nummer", "uid_nummer", "CHE-123.456.789 MWST")}
          {field("Bank / IBAN", "bank_iban", "CH93 0076 2011 6238 5295 7")}
          {field("Bank Name", "bank_name", "Raiffeisenbank")}
        </div>
        <div className="mt-4 pt-4 border-t">
          <Button
            onClick={saveAll}
            disabled={save.isPending}
            className="text-white"
            style={{ background: "#e8620a" }}
            data-testid="button-save-firmendaten"
          >
            <Save className="h-4 w-4 mr-2" />
            Alle Firmendaten speichern
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Diese Daten erscheinen auf Rechnungen, Offerten und PDF-Dokumenten.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Arbeitszeit ──────────────────────────────────────────────────────────

function ArbeitszeitTab({ settings }: { settings: EinstellungMap }) {
  const { toast } = useToast();
  const wochenstundenWert = settings.wochenstunden || "41";
  const ferienanspruchWert = settings.ferienanspruch || "20";
  const [wochenstundenInput, setWochenstundenInput] = useState(wochenstundenWert);
  const [ferienanspruchInput, setFerienanspruchInput] = useState(ferienanspruchWert);

  const saveMut = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/einstellungen/wochenstunden", { wert: wochenstundenInput });
      await apiRequest("PUT", "/api/einstellungen/ferienanspruch", { wert: ferienanspruchInput });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen"] });
      toast({ title: "Arbeitszeit-Einstellungen gespeichert ✓" });
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });

  return (
    <Card className="p-6 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
        <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Arbeitszeit-Einstellungen</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Wird für die Stundenauswertung (Soll-Stunden) verwendet.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Wochenstunden pro Mitarbeiter</Label>
          <Input
            type="number"
            min="1" max="60" step="0.5"
            value={wochenstundenInput}
            onChange={(e) => setWochenstundenInput(e.target.value)}
            data-testid="input-wochenstunden"
          />
          <p className="text-xs text-muted-foreground">Aktuell: <strong>{wochenstundenWert} h/Woche</strong></p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ferienanspruch (Tage/Jahr)</Label>
          <Input
            type="number"
            min="0" max="60" step="1"
            value={ferienanspruchInput}
            onChange={(e) => setFerienanspruchInput(e.target.value)}
            data-testid="input-ferienanspruch"
          />
          <p className="text-xs text-muted-foreground">Aktuell: <strong>{ferienanspruchWert} Tage/Jahr</strong></p>
        </div>
      </div>
      <div className="mt-4">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="text-white"
          style={{ background: "#e8620a" }}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMut.isPending ? "Speichert…" : "Speichern"}
        </Button>
      </div>
    </Card>
  );
}

// ─── Tab: Stundensätze ─────────────────────────────────────────────────────────

function StundensaetzeTab() {
  const { toast } = useToast();
  const { data: saetze = [], isLoading } = useQuery<Stundensatz[]>({
    queryKey: ["/api/stundensaetze"],
    queryFn: () => apiRequest("GET", "/api/stundensaetze").then((r) => r.json()),
  });

  const [edits, setEdits] = useState<Record<string, { satz: string; bezeichnung: string; grundsatz: string }>>({}); 

  const updateMut = useMutation({
    mutationFn: ({ id, satz, bezeichnung, grundsatz }: { id: string; satz: number; bezeichnung: string; grundsatz?: number }) =>
      apiRequest("PATCH", `/api/stundensaetze/${id}`, { satz, bezeichnung, ...(grundsatz !== undefined ? { grundsatz } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stundensaetze"] });
      toast({ title: "Stundensatz gespeichert ✓" });
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });

  function getEdit(s: Stundensatz) {
    return edits[s.id] || { satz: String(s.satz), bezeichnung: s.bezeichnung || "", grundsatz: s.grundsatz != null ? String(s.grundsatz) : "" };
  }

  function setEdit(id: string, field: "satz" | "bezeichnung" | "grundsatz", value: string) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...getEdit(saetze.find((s) => s.id === id)!), [field]: value },
    }));
  }

  function save(s: Stundensatz) {
    const e = getEdit(s);
    updateMut.mutate({ id: s.id, satz: Number(e.satz), bezeichnung: e.bezeichnung, ...(e.grundsatz !== "" ? { grundsatz: Number(e.grundsatz) } : {}) });
  }

  const grouped: Record<string, Stundensatz[]> = {};
  for (const s of saetze) {
    if (!grouped[s.ort]) grouped[s.ort] = [];
    grouped[s.ort].push(s);
  }

  const ORT_ICONS: Record<string, string> = { Avor: "📋", Werkstatt: "🏭", Montage: "🔧" };

  return (
    <Card className="p-6 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
        <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Maschinen-Zuschläge</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Für <strong>Werkstatt</strong>: Grundsatz (Std.-Satz Werkstatt) + Maschinen-Zuschlag = Total verrechnet dem Kunden.
        Für <strong>Avor / Montage</strong>: Fixer Stundensatz ohne Zuschlag.
      </p>
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([ort, rows]) => (
            <div key={ort}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold">{ORT_ICONS[ort] || ""} {ort}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {rows.map((s) => {
                  const e = getEdit(s);
                  const label = s.maschinenpark ? s.maschinenpark : s.bezeichnung || ort;
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Input
                          value={e.bezeichnung}
                          onChange={(ev) => setEdit(s.id, "bezeichnung", ev.target.value)}
                          placeholder="Bezeichnung"
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      {s.maschinenpark && (
                        <div className="w-28 shrink-0">
                          <Label className="text-xs text-muted-foreground">Grundsatz CHF/h</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={e.grundsatz}
                            onChange={(ev) => setEdit(s.id, "grundsatz", ev.target.value)}
                            placeholder="z.B. 80"
                            className="mt-1 h-8 text-sm font-semibold"
                          />
                        </div>
                      )}
                      <div className="w-28 shrink-0">
                        <Label className="text-xs text-muted-foreground">{s.maschinenpark ? "Masch.-Zuschlag" : "CHF / Std"}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={e.satz}
                          onChange={(ev) => setEdit(s.id, "satz", ev.target.value)}
                          className="mt-1 h-8 text-sm font-semibold"
                        />
                      </div>
                      {s.maschinenpark && (
                        <div className="w-24 shrink-0">
                          <Label className="text-xs text-muted-foreground">Total CHF/h</Label>
                          <div className="mt-1 h-8 flex items-center px-2 rounded-md bg-orange-50 border border-orange-200 text-sm font-bold text-orange-700">
                            {e.grundsatz !== "" && e.satz !== "" ? Number(e.grundsatz) + Number(e.satz) : "—"}
                          </div>
                        </div>
                      )}
                      <div className="shrink-0 mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => save(s)}
                          disabled={updateMut.isPending}
                          className="h-8"
                        >
                          <Save className="h-3.5 w-3.5 mr-1" />Speichern
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Tab: SMTP ─────────────────────────────────────────────────────────────────

function SmtpTab({ settings }: { settings: EinstellungMap }) {
  const { toast } = useToast();
  const [felder, setFelder] = useState({
    smtp_host:     settings.smtp_host     || "",
    smtp_port:     settings.smtp_port     || "587",
    smtp_user:     settings.smtp_user     || "",
    smtp_passwort: settings.smtp_passwort || "",
    smtp_von:      settings.smtp_von      || settings.email || "info@schneggenburger.ch",
    smtp_ssl:      settings.smtp_ssl      || "starttls",
  });
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  function handleChange(field: keyof typeof felder, val: string) {
    setFelder((p) => ({ ...p, [field]: val }));
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      for (const [key, wert] of Object.entries(felder)) {
        await apiRequest("PUT", `/api/einstellungen/${key}`, { wert });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen"] });
      toast({ title: "✅ SMTP-Einstellungen gespeichert" });
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });

  const testMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/email/test", felder).then((r) => r.json()),
    onSuccess: (d) => toast({ title: d.ok ? "✅ Test-E-Mail gesendet" : "Fehler", description: d.message }),
    onError: () => toast({ title: "Test fehlgeschlagen", variant: "destructive" }),
  });

  return (
    <Card className="p-6 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <Server className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
        <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>SMTP E-Mail-Konfiguration</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Konfiguriere den E-Mail-Server für den Versand von Rechnungen, Offerten und Mahnungen.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">SMTP Host</Label>
          <Input
            placeholder="mail.schneggenburger.ch"
            value={felder.smtp_host}
            onChange={(e) => handleChange("smtp_host", e.target.value)}
            data-testid="input-smtp-host"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Port</Label>
          <Input
            type="number"
            placeholder="587"
            value={felder.smtp_port}
            onChange={(e) => handleChange("smtp_port", e.target.value)}
            data-testid="input-smtp-port"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Verschlüsselung</Label>
          <select
            value={felder.smtp_ssl}
            onChange={(e) => handleChange("smtp_ssl", e.target.value)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
            data-testid="select-smtp-ssl"
          >
            <option value="starttls">STARTTLS (Port 587)</option>
            <option value="ssl">SSL/TLS (Port 465)</option>
            <option value="none">Keine (Port 25)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Benutzername / E-Mail</Label>
          <Input
            placeholder="info@schneggenburger.ch"
            value={felder.smtp_user}
            onChange={(e) => handleChange("smtp_user", e.target.value)}
            data-testid="input-smtp-user"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Passwort</Label>
          <div className="relative">
            <Input
              type={showSmtpPass ? "text" : "password"}
              placeholder="••••••••"
              value={felder.smtp_passwort}
              onChange={(e) => handleChange("smtp_passwort", e.target.value)}
              data-testid="input-smtp-passwort"
            />
            <button type="button" onClick={() => setShowSmtpPass((v) => !v)} className="absolute right-3 top-2.5 text-muted-foreground">
              {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Absender-E-Mail (Von:)</Label>
          <Input
            placeholder="info@schneggenburger.ch"
            value={felder.smtp_von}
            onChange={(e) => handleChange("smtp_von", e.target.value)}
            data-testid="input-smtp-von"
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="text-white"
          style={{ background: "#e8620a" }}
          data-testid="button-save-smtp"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMut.isPending ? "Speichert…" : "SMTP speichern"}
        </Button>
        <Button
          variant="outline"
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending || !felder.smtp_host}
          data-testid="button-test-smtp"
        >
          <Mail className="h-4 w-4 mr-2" />
          {testMut.isPending ? "Sendet…" : "Test-E-Mail senden"}
        </Button>
      </div>
    </Card>
  );
}

// ─── Tab: Sicherheit (Passwort + 2FA) ─────────────────────────────────────────

function SicherheitTab({ settings }: { settings: EinstellungMap }) {
  const { toast } = useToast();
  const { user } = useAuth();

  // App-Passwort (für Login ohne Benutzer)
  const appPasswortWert = settings.app_passwort || "HolzMetall8580";
  const [appPasswortInput, setAppPasswortInput] = useState(appPasswortWert);
  const [showAppPass, setShowAppPass] = useState(false);

  const appPasswortMut = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/einstellungen/app_passwort", { wert: appPasswortInput }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen"] });
      toast({ title: "✅ App-Passwort gespeichert" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  // Benutzer-Passwort ändern
  const [altesPasswort, setAltesPasswort] = useState("");
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [neuesPasswort2, setNeuesPasswort2] = useState("");
  const [showAlt, setShowAlt] = useState(false);
  const [showNeu, setShowNeu] = useState(false);

  const passwortMut = useMutation({
    mutationFn: async () => {
      if (neuesPasswort !== neuesPasswort2) throw new Error("Die neuen Passwörter stimmen nicht überein.");
      if (neuesPasswort.length < 4) throw new Error("Mindestens 4 Zeichen erforderlich.");
      const res = await apiRequest("POST", "/api/auth/passwort-aendern", { altesPasswort, neuesPasswort });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Fehler beim Ändern");
      return data;
    },
    onSuccess: () => {
      toast({ title: "✅ Passwort geändert" });
      setAltesPasswort(""); setNeuesPasswort(""); setNeuesPasswort2("");
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // 2FA
  const [step2fa, setStep2fa] = useState<"start" | "scan" | "confirm" | "done">("start");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code2fa, setCode2fa] = useState("");
  const [copied, setCopied] = useState(false);

  const setupMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/setup-2fa", { userId: user?.id });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: (d) => { setQrDataUrl(d.qrDataUrl); setBackupCodes(d.backupCodes); setStep2fa("scan"); },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/confirm-2fa", { userId: user?.id, code: code2fa });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Falscher Code");
      return d;
    },
    onSuccess: () => setStep2fa("done"),
    onError: (e: Error) => toast({ title: "Falscher Code", description: e.message, variant: "destructive" }),
  });

  const copyBackup = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* App-Passwort */}
      <Card className="p-6 bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>App-Passwort</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Das App-Passwort wird für den allgemeinen App-Zugang verwendet (nicht benutzergebunden).
        </p>
        <div className="flex items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <Input
              type={showAppPass ? "text" : "password"}
              value={appPasswortInput}
              onChange={(e) => setAppPasswortInput(e.target.value)}
              placeholder="App-Passwort"
              data-testid="input-app-passwort"
            />
            <button type="button" onClick={() => setShowAppPass((v) => !v)} className="absolute right-3 top-2.5 text-muted-foreground">
              {showAppPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            onClick={() => appPasswortMut.mutate()}
            disabled={appPasswortMut.isPending}
            className="text-white shrink-0"
            style={{ background: "#e8620a" }}
            data-testid="button-save-app-passwort"
          >
            <Save className="h-4 w-4 mr-1" /> Speichern
          </Button>
        </div>
      </Card>

      {/* Benutzer-Passwort ändern */}
      <Card className="p-6 bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>Zugangspasswort ändern</h2>
        </div>
        <div className="space-y-3 max-w-sm">
          <div className="relative">
            <Input
              type={showAlt ? "text" : "password"}
              placeholder="Aktuelles Passwort"
              value={altesPasswort}
              onChange={(e) => setAltesPasswort(e.target.value)}
              data-testid="input-altes-passwort"
            />
            <button type="button" onClick={() => setShowAlt((v) => !v)} className="absolute right-3 top-2.5 text-muted-foreground">
              {showAlt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Input
              type={showNeu ? "text" : "password"}
              placeholder="Neues Passwort"
              value={neuesPasswort}
              onChange={(e) => setNeuesPasswort(e.target.value)}
              data-testid="input-neues-passwort"
            />
            <button type="button" onClick={() => setShowNeu((v) => !v)} className="absolute right-3 top-2.5 text-muted-foreground">
              {showNeu ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Input
            type={showNeu ? "text" : "password"}
            placeholder="Neues Passwort wiederholen"
            value={neuesPasswort2}
            onChange={(e) => setNeuesPasswort2(e.target.value)}
            data-testid="input-neues-passwort2"
          />
          <Button
            onClick={() => passwortMut.mutate()}
            disabled={passwortMut.isPending || !altesPasswort || !neuesPasswort || !neuesPasswort2}
            data-testid="button-passwort-aendern"
          >
            {passwortMut.isPending ? "Wird gespeichert…" : "Passwort speichern"}
          </Button>
        </div>
      </Card>

      {/* 2FA */}
      <Card className="p-6 bg-card">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>2-Faktor Authentifizierung</h2>
        </div>

        {step2fa === "start" && (
          <div className="space-y-4 max-w-md">
            <div className="flex items-start gap-3">
              <Smartphone className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Was du brauchst</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Installiere <strong>Google Authenticator</strong> oder <strong>Authy</strong> auf deinem Handy.
                </p>
              </div>
            </div>
            <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
              Nach der Einrichtung brauchst du beim Login zusätzlich einen 6-stelligen Code aus der App.
            </div>
            <Button
              onClick={() => setupMut.mutate()}
              disabled={setupMut.isPending}
              data-testid="button-start-2fa"
            >
              {setupMut.isPending ? "Wird generiert…" : "2FA einrichten"}
            </Button>
          </div>
        )}

        {step2fa === "scan" && (
          <div className="space-y-6 max-w-md">
            <div>
              <p className="font-semibold mb-1">Schritt 1 — QR-Code scannen</p>
              <p className="text-sm text-muted-foreground mb-4">Öffne Google Authenticator → + → QR-Code scannen</p>
              {qrDataUrl && (
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg border" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">Schritt 2 — Backup-Codes sichern</p>
                <Button size="sm" variant="outline" onClick={copyBackup}>
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span className="ml-1">{copied ? "Kopiert" : "Kopieren"}</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Drucke diese Codes aus. Jeder Code kann einmal verwendet werden.</p>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((c) => (
                  <code key={c} className="bg-muted rounded px-2 py-1 text-sm font-mono text-center">{c}</code>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={() => setStep2fa("confirm")} data-testid="button-next-confirm">
              Weiter zur Bestätigung →
            </Button>
          </div>
        )}

        {step2fa === "confirm" && (
          <div className="space-y-4 max-w-md">
            <p className="font-semibold">Schritt 3 — Bestätigen</p>
            <p className="text-sm text-muted-foreground">Gib den aktuellen 6-stelligen Code aus der App ein.</p>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="000 000"
              value={code2fa}
              onChange={(e) => setCode2fa(e.target.value.replace(/\s/g, ""))}
              maxLength={6}
              className="h-14 text-center text-2xl tracking-widest font-mono"
              autoFocus
              data-testid="input-confirm-code"
            />
            <Button
              className="w-full"
              onClick={() => confirmMut.mutate()}
              disabled={confirmMut.isPending || code2fa.length < 6}
              data-testid="button-confirm-2fa"
            >
              {confirmMut.isPending ? "Wird geprüft…" : "2FA aktivieren"}
            </Button>
            <button className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep2fa("scan")}>
              ← Zurück zum QR-Code
            </button>
          </div>
        )}

        {step2fa === "done" && (
          <div className="text-center space-y-4 max-w-md">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h3 className="font-bold text-lg">2FA erfolgreich aktiviert!</h3>
            <p className="text-sm text-muted-foreground">Ab sofort brauchst du beim Login deinen Authenticator-Code.</p>
          </div>
        )}
      </Card>

      {/* Daten-Backup */}
      <Card className="p-5">
        <h2 className="font-semibold text-sm mb-1">Daten-Backup</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Exportiert alle Daten (Aufträge, Kunden, Rechnungen, Mitarbeiter, etc.) als JSON-Datei.
          Empfohlen: regelmässig herunterladen und sicher aufbewahren.
        </p>
        <BackupButton />
      </Card>
    </div>
  );
}

function BackupButton() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [letzterBackup, setLetzterBackup] = useState<string | null>(
    lsGet("ap_letzter_backup")
  );

  const handleBackup = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/backup");
      const blob = await res.blob();
      const now = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auftragspro-backup-${now}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const zeitstempel = new Date().toLocaleString("de-CH");
      lsSet("ap_letzter_backup", zeitstempel);
      setLetzterBackup(zeitstempel);
      toast({ title: "✅ Backup heruntergeladen", description: `auftragspro-backup-${now}.json` });
    } catch (e: any) {
      toast({ title: "Fehler beim Backup", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Button
        onClick={handleBackup}
        disabled={loading}
        style={{ background: "#6b4c2a", color: "white" }}
        size="sm"
      >
        <Download className="h-4 w-4 mr-2" />
        {loading ? "Wird erstellt..." : "Backup jetzt herunterladen"}
      </Button>
      {letzterBackup && (
        <p className="text-xs text-muted-foreground">
          Letzter Backup: {letzterBackup}
        </p>
      )}
    </div>
  );
}

// ─── Tab: Hintergrundbilder ──────────────────────────────────────────────────

function HintergrundTab({ settings }: { settings: EinstellungMap }) {
  const { toast } = useToast();
  const save = useSaveEinstellung();

  const [loginBg, setLoginBg] = useState<string>(settings.login_hintergrund || "");
  const [appBg, setAppBg] = useState<string>(settings.app_hintergrund || "");
  const loginInputRef = useRef<HTMLInputElement>(null);
  const appInputRef = useRef<HTMLInputElement>(null);

  // Kontrast: 0 = kein Overlay, 100 = fast komplett weiss. Standard = 88
  const [kontrast, setKontrast] = useState<number>(
    settings.hintergrund_kontrast ? Number(settings.hintergrund_kontrast) : 88
  );

  // Sofort-Vorschau im laufenden Layout anwenden
  useEffect(() => {
    const overlay = document.getElementById("ap-bg-overlay");
    if (overlay) overlay.style.backgroundColor = `rgba(255,255,255,${kontrast / 100})`;
  }, [kontrast]);

  function saveKontrast(val: number) {
    setKontrast(val);
    save.mutate({ key: "hintergrund_kontrast", wert: String(val) });
    // localStorage für sofortige Wirkung beim nächsten Laden
    lsSet("ap_bg_kontrast", String(val));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, target: "login" | "app") {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (target === "login") {
        setLoginBg(dataUrl);
        save.mutate({ key: "login_hintergrund", wert: dataUrl });
      } else {
        setAppBg(dataUrl);
        save.mutate({ key: "app_hintergrund", wert: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  }

  function removeBg(target: "login" | "app") {
    if (target === "login") {
      setLoginBg("");
      save.mutate({ key: "login_hintergrund", wert: "" });
    } else {
      setAppBg("");
      save.mutate({ key: "app_hintergrund", wert: "" });
    }
  }

  const UploadCard = ({
    label,
    description,
    value,
    inputRef,
    onChange,
    onRemove,
  }: {
    label: string;
    description: string;
    value: string;
    inputRef: React.RefObject<HTMLInputElement>;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
  }) => (
    <Card className="p-6 bg-card">
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-sm">{label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>

        {value ? (
          <div className="space-y-3">
            <div
              className="relative w-full h-40 rounded-lg overflow-hidden border"
              style={{
                backgroundImage: `url(${value})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-black/20 flex items-end p-2">
                <span className="text-white text-xs font-medium bg-black/40 px-2 py-1 rounded">
                  Vorschau
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                className="flex-1"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bild ersetzen
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onRemove}
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Bild hochladen</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP — max. 5 MB</p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChange}
        />
      </div>
    </Card>
  );

  // Labels für Kontrast-Stufen
  const kontrastLabel = kontrast <= 20
    ? "Kaum sichtbar"
    : kontrast <= 45
    ? "Transparent"
    : kontrast <= 65
    ? "Leicht getönt"
    : kontrast <= 80
    ? "Halbdeckend"
    : kontrast <= 92
    ? "Standard"
    : "Fast weiss";

  return (
    <div className="space-y-4">

      {/* Kontrast-Regler */}
      <Card className="p-6 bg-card">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Hintergrund-Kontrast</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Helligkeit des weissen Überlagerung über dem App-Hintergrundbild. Bei 0 % ist das Bild voll sichtbar, bei 100 % komplett weiss.
            </p>
          </div>

          {/* Schieberegler */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Overlay-Stärke</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: "#6b4c2a" }}>
                {kontrast} % — {kontrastLabel}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={98}
              step={1}
              value={kontrast}
              onChange={(e) => setKontrast(Number(e.target.value))}
              onMouseUp={(e) => saveKontrast(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => saveKontrast(Number((e.target as HTMLInputElement).value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6b4c2a ${kontrast}%, #e5e7eb ${kontrast}%)`,
                accentColor: "#6b4c2a",
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Bild sichtbar</span>
              <span>Standard (88 %)</span>
              <span>Weiss</span>
            </div>
          </div>

          {/* Vorschau-Streifen */}
          {appBg && (
            <div
              className="relative w-full h-16 rounded-lg overflow-hidden border"
              style={{ backgroundImage: `url(${appBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
            >
              <div
                className="absolute inset-0"
                style={{ backgroundColor: `rgba(255,255,255,${kontrast / 100})` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium px-2 py-1 rounded bg-black/20 text-white">Vorschau</span>
              </div>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => saveKontrast(88)}
          >
            Zurücksetzen (Standard 88 %)
          </Button>
        </div>
      </Card>

      <UploadCard
        label="Login-Hintergrund"
        description="Hintergrundbild für die Anmeldeseite"
        value={loginBg}
        inputRef={loginInputRef}
        onChange={(e) => handleFileChange(e, "login")}
        onRemove={() => removeBg("login")}
      />
      <UploadCard
        label="App-Hintergrund"
        description="Hintergrundbild für den Hauptbereich der App (nach dem Login)"
        value={appBg}
        inputRef={appInputRef}
        onChange={(e) => handleFileChange(e, "app")}
        onRemove={() => removeBg("app")}
      />
    </div>
  );
}

// ─── Main Einstellungen Component ──────────────────────────────────────────────

// ─── Status-Pipeline Tab ─────────────────────────────────────────────────────
interface PipelineStatus { id: string; label: string; reihenfolge: number; farbe: string; }

const FARB_OPTIONEN = [
  { value: "orange",  label: "Orange",   cls: "bg-orange-500" },
  { value: "blue",    label: "Blau",     cls: "bg-blue-500" },
  { value: "purple",  label: "Lila",     cls: "bg-purple-500" },
  { value: "yellow",  label: "Gelb",     cls: "bg-yellow-500" },
  { value: "indigo",  label: "Indigo",   cls: "bg-indigo-500" },
  { value: "green",   label: "Gr\u00fcn",    cls: "bg-green-500" },
  { value: "red",     label: "Rot",      cls: "bg-red-500" },
  { value: "gray",    label: "Grau",     cls: "bg-gray-500" },
  { value: "teal",    label: "T\u00fcrkis",   cls: "bg-teal-500" },
  { value: "pink",    label: "Pink",     cls: "bg-pink-500" },
];

function StatusPipelineTab() {
  const { toast } = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editFarbe, setEditFarbe] = useState("gray");
  const [newLabel, setNewLabel] = useState("");
  const [newFarbe, setNewFarbe] = useState("gray");
  const [dragging, setDragging] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<PipelineStatus[]>([]);

  const { data: pipeline = [], isLoading } = useQuery<PipelineStatus[]>({
    queryKey: ["/api/einstellungen/status-pipeline"],
    queryFn: () => apiRequest("GET", "/api/einstellungen/status-pipeline").then(r => r.json()),
  });

  useEffect(() => { setLocalOrder(pipeline); }, [pipeline]);

  const addMut = useMutation({
    mutationFn: (d: { label: string; reihenfolge: number; farbe: string }) =>
      apiRequest("POST", "/api/einstellungen/status-pipeline", d).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen/status-pipeline"] });
      setNewLabel(""); setNewFarbe("gray");
      toast({ title: "Status hinzugef\u00fcgt" });
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, label, farbe }: { id: string; label: string; farbe: string }) =>
      apiRequest("PATCH", `/api/einstellungen/status-pipeline/${id}`, { label, farbe }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen/status-pipeline"] });
      setEditId(null);
      toast({ title: "Status gespeichert" });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/einstellungen/status-pipeline/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen/status-pipeline"] });
      toast({ title: "Status gel\u00f6scht" });
    },
  });

  const reorderMut = useMutation({
    mutationFn: (order: { id: string; reihenfolge: number }[]) =>
      apiRequest("POST", "/api/einstellungen/status-pipeline/reorder", { order }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen/status-pipeline"] });
    },
  });

  const handleDragStart = (id: string) => setDragging(id);
  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragging || dragging === overId) return;
    const arr = [...localOrder];
    const fromIdx = arr.findIndex(s => s.id === dragging);
    const toIdx = arr.findIndex(s => s.id === overId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    setLocalOrder(arr);
  };
  const handleDrop = () => {
    setDragging(null);
    const order = localOrder.map((s, i) => ({ id: s.id, reihenfolge: i + 1 }));
    reorderMut.mutate(order);
  };

  const farbCls = (v: string) => FARB_OPTIONEN.find(f => f.value === v)?.cls ?? "bg-gray-500";

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-base mb-1">Status-Pipeline</h3>
        <p className="text-sm text-muted-foreground">Ziehe die Status in die gew\u00fcnschte Reihenfolge. \u201eStorniert\u201c ist fix und nicht \u00e4nderbar.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {localOrder.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => handleDragStart(s.id)}
              onDragOver={(e) => handleDragOver(e, s.id)}
              onDrop={handleDrop}
              className={`flex items-center gap-3 p-3 border rounded-lg bg-card cursor-grab active:cursor-grabbing transition-opacity ${
                dragging === s.id ? "opacity-40" : "opacity-100"
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className={`w-3 h-3 rounded-full shrink-0 ${farbCls(s.farbe)}`} />
              {editId === s.id ? (
                <>
                  <Input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    className="h-8 flex-1 text-sm"
                    onKeyDown={e => e.key === "Enter" && editMut.mutate({ id: s.id, label: editLabel, farbe: editFarbe })}
                    autoFocus
                  />
                  <select
                    value={editFarbe}
                    onChange={e => setEditFarbe(e.target.value)}
                    className="h-8 text-sm border rounded px-2 bg-background"
                  >
                    {FARB_OPTIONEN.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <Button size="sm" className="h-8 px-3" onClick={() => editMut.mutate({ id: s.id, label: editLabel, farbe: editFarbe })}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{s.label}</span>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setEditId(s.id); setEditLabel(s.label); setEditFarbe(s.farbe); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => {
                    if (localOrder.length <= 1) { toast({ title: "Mindestens 1 Status erforderlich", variant: "destructive" }); return; }
                    delMut.mutate(s.id);
                  }}>
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {/* Storniert fix */}
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/40 opacity-60">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="w-3 h-3 rounded-full shrink-0 bg-red-500" />
            <span className="flex-1 text-sm font-medium">Storniert</span>
            <span className="text-xs text-muted-foreground italic">Fix \u2014 nicht \u00e4nderbar</span>
          </div>
        </div>
      )}

      {/* Neuen Status hinzuf\u00fcgen */}
      <div className="border-t pt-4">
        <p className="text-sm font-medium mb-3">Neuen Status hinzuf\u00fcgen</p>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="z.B. Montage, Abnahme ..."
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="h-9 flex-1 min-w-[160px] text-sm"
            onKeyDown={e => {
              if (e.key === "Enter" && newLabel.trim()) {
                addMut.mutate({ label: newLabel.trim(), reihenfolge: localOrder.length + 1, farbe: newFarbe });
              }
            }}
          />
          <select
            value={newFarbe}
            onChange={e => setNewFarbe(e.target.value)}
            className="h-9 text-sm border rounded px-2 bg-background"
          >
            {FARB_OPTIONEN.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <Button
            className="h-9"
            disabled={!newLabel.trim() || addMut.isPending}
            onClick={() => addMut.mutate({ label: newLabel.trim(), reihenfolge: localOrder.length + 1, farbe: newFarbe })}
          >
            <Plus className="h-4 w-4 mr-1" /> Hinzuf\u00fcgen
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function Einstellungen() {
  const { data: einstellungenList = [] } = useEinstellungen();

  // Convert list to map for easy access
  const settings: EinstellungMap = {};
  for (const e of einstellungenList) {
    settings[e.schluessel] = e.wert;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Einstellungen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">App-Konfiguration und Systemeinstellungen</p>
      </div>

      <Tabs defaultValue="allgemein" className="space-y-4">
        <TabsList className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1 h-auto p-1 w-full">
          <TabsTrigger value="allgemein" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <Building2 className="h-4 w-4 shrink-0" />
            <span>Allgemein</span>
          </TabsTrigger>
          <TabsTrigger value="arbeitszeit" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Arbeitszeit</span>
          </TabsTrigger>
          <TabsTrigger value="stundensaetze" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <DollarSign className="h-4 w-4 shrink-0" />
            <span>Stundensätze</span>
          </TabsTrigger>
          <TabsTrigger value="pdf-vorlagen" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <FileText className="h-4 w-4 shrink-0" />
            <span>PDF-Vorlagen</span>
          </TabsTrigger>
          <TabsTrigger value="smtp" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <Server className="h-4 w-4 shrink-0" />
            <span>SMTP</span>
          </TabsTrigger>
          <TabsTrigger value="sicherheit" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Sicherheit</span>
          </TabsTrigger>
          <TabsTrigger value="hintergrund" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <Image className="h-4 w-4 shrink-0" />
            <span>Hintergrund</span>
          </TabsTrigger>
          <TabsTrigger value="status-pipeline" className="flex flex-col sm:flex-row items-center gap-1 text-xs p-2 sm:px-3 sm:py-1.5 h-auto">
            <GitBranch className="h-4 w-4 shrink-0" />
            <span>Status-Pipeline</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="allgemein">
          <AllgemeinTab settings={settings} />
        </TabsContent>

        <TabsContent value="arbeitszeit">
          <ArbeitszeitTab settings={settings} />
        </TabsContent>

        <TabsContent value="stundensaetze">
          <StundensaetzeTab />
        </TabsContent>


        <TabsContent value="pdf-vorlagen">
          <PdfVorlagenTab />
        </TabsContent>

        <TabsContent value="smtp">
          <SmtpTab settings={settings} />
        </TabsContent>

        <TabsContent value="sicherheit">
          <SicherheitTab settings={settings} />
        </TabsContent>

        <TabsContent value="hintergrund">
          <HintergrundTab settings={settings} />
        </TabsContent>
        <TabsContent value="status-pipeline">
          <StatusPipelineTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
