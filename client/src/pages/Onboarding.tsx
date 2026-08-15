import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Building2, CheckCircle2, Landmark, Loader2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ApiRequestError, apiRequest, queryClient } from "@/lib/queryClient";

type EinstellungenRow = { schluessel: string; wert: string | null };

type OnboardingForm = {
  firmenname: string;
  adresse: string;
  plz_ort: string;
  telefon: string;
  email: string;
  mwst_satz: string;
  wochenstunden: string;
  uid_nummer: string;
  iban: string;
  bankname: string;
  firmenlogo: string;
};

const emptyForm: OnboardingForm = {
  firmenname: "",
  adresse: "",
  plz_ort: "",
  telefon: "",
  email: "",
  mwst_satz: "8.1",
  wochenstunden: "41",
  uid_nummer: "",
  iban: "",
  bankname: "",
  firmenlogo: "",
};

function inputClassName() {
  return "mt-1.5";
}

export default function Onboarding() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<OnboardingForm>(emptyForm);

  const { data: settings = [], isLoading: settingsLoading } = useQuery<EinstellungenRow[]>({
    queryKey: ["/api/einstellungen"],
    queryFn: () => apiRequest("GET", "/api/einstellungen").then((response) => response.json()),
  });

  useEffect(() => {
    if (settings.length === 0) return;
    const map = Object.fromEntries(settings.map((setting) => [setting.schluessel, setting.wert || ""]));
    setForm({
      firmenname: map.firmenname || "",
      adresse: map.adresse || "",
      plz_ort: map.plz_ort || "",
      telefon: map.telefon || "",
      email: map.email || "",
      mwst_satz: map.mwst_satz || "8.1",
      wochenstunden: map.wochenstunden || "41",
      uid_nummer: map.uid_nummer || "",
      iban: map.bank_iban || "",
      bankname: map.bank_name || "",
      firmenlogo: map.firmenlogo || "",
    });
  }, [settings]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/onboarding/complete", form);
      return response.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/einstellungen"] });
      toast({
        title: "Grundeinstellungen gespeichert",
        description: "Alles ist bereit. Sie können AuftragPro jetzt vollständig nutzen.",
      });
      setLocation("/");
    },
    onError: (error) => {
      const message = error instanceof ApiRequestError
        ? error.body?.message || "Bitte prüfen Sie die markierten Angaben."
        : "Die Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es nochmals.";
      toast({ title: "Bitte Angaben prüfen", description: message, variant: "destructive" });
    },
  });

  function setField(field: keyof OnboardingForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Bitte wählen Sie eine Bilddatei aus.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Das Logo darf maximal 5 MB gross sein.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setField("firmenlogo", typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => toast({ title: "Das Logo konnte nicht gelesen werden.", variant: "destructive" });
    reader.readAsDataURL(file);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    completeMutation.mutate();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">Willkommen bei AuftragPro!</CardTitle>
              <CardDescription className="max-w-2xl leading-6">
                Bitte füllen Sie diese Daten aus, damit Ihre Rechnungen und Angebote korrekt erstellt werden können. Alle Angaben können später in den Einstellungen geändert werden.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-7">
          {settingsLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Ihre vorhandenen Angaben werden geladen …
            </div>
          ) : (
            <form className="space-y-8" onSubmit={submit}>
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Firma</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="onboarding-firmenname">Firmenname</Label>
                    <Input id="onboarding-firmenname" className={inputClassName()} value={form.firmenname} onChange={(event) => setField("firmenname", event.target.value)} placeholder="Meine Firma AG" required />
                  </div>
                  <div>
                    <Label htmlFor="onboarding-adresse">Adresse</Label>
                    <Input id="onboarding-adresse" className={inputClassName()} value={form.adresse} onChange={(event) => setField("adresse", event.target.value)} placeholder="Musterstrasse 12" required />
                  </div>
                  <div>
                    <Label htmlFor="onboarding-plz-ort">PLZ / Ort</Label>
                    <Input id="onboarding-plz-ort" className={inputClassName()} value={form.plz_ort} onChange={(event) => setField("plz_ort", event.target.value)} placeholder="8000 Zürich" required />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t pt-7">
                <h2 className="font-semibold">Kontakt</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="onboarding-telefon">Telefon</Label>
                    <Input id="onboarding-telefon" className={inputClassName()} value={form.telefon} onChange={(event) => setField("telefon", event.target.value)} placeholder="044 123 45 67" required />
                  </div>
                  <div>
                    <Label htmlFor="onboarding-email">E-Mail</Label>
                    <Input id="onboarding-email" className={inputClassName()} type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="info@meinefirma.ch" required />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t pt-7">
                <h2 className="font-semibold">Finanzen</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="onboarding-mwst">MWST-Satz (%)</Label>
                    <Input id="onboarding-mwst" className={inputClassName()} type="number" min="0" step="0.1" value={form.mwst_satz} onChange={(event) => setField("mwst_satz", event.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="onboarding-wochenstunden">Wochenstunden</Label>
                    <Input id="onboarding-wochenstunden" className={inputClassName()} type="number" min="1" step="0.25" value={form.wochenstunden} onChange={(event) => setField("wochenstunden", event.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="onboarding-uid">UID-Nummer</Label>
                    <Input id="onboarding-uid" className={inputClassName()} value={form.uid_nummer} onChange={(event) => setField("uid_nummer", event.target.value)} placeholder="CHE-123.456.789 MWST" required />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t pt-7">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Bank</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="onboarding-iban">IBAN</Label>
                    <Input id="onboarding-iban" className={inputClassName()} value={form.iban} onChange={(event) => setField("iban", event.target.value)} placeholder="CH93 0076 2011 6238 5295 7" required />
                  </div>
                  <div>
                    <Label htmlFor="onboarding-bank">Bankname</Label>
                    <Input id="onboarding-bank" className={inputClassName()} value={form.bankname} onChange={(event) => setField("bankname", event.target.value)} placeholder="Meine Bank" required />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t pt-7">
                <h2 className="font-semibold">Logo</h2>
                <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                    {form.firmenlogo ? <img src={form.firmenlogo} alt="Vorschau Firmenlogo" className="h-full w-full object-contain" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Laden Sie Ihr Firmenlogo als PNG, JPEG oder WebP hoch (max. 5 MB).</p>
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleLogoFile(event.target.files?.[0])} />
                    <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" /> Logo auswählen
                    </Button>
                  </div>
                </div>
              </section>

              <div className="flex justify-end border-t pt-6">
                <Button type="submit" size="lg" disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {completeMutation.isPending ? "Wird gespeichert …" : "Grundeinstellungen abschliessen"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
