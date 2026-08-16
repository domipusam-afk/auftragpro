import { Redirect, Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { apiRequest, queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BrandingProvider } from "@/lib/branding";
import { useState } from "react";
import { useIdleTimer } from "@/hooks/use-idle-timer";
import { IdleWarningDialog } from "@/components/IdleWarningDialog";
import Login from "@/pages/Login";
import SupabaseLoginPreview from "@/pages/SupabaseLoginPreview";
import Benutzerverwaltung from "@/pages/Benutzerverwaltung";
import ZweiFA from "@/pages/ZweiFA";
import Dashboard from "@/pages/Dashboard";
import AuftragsListe from "@/pages/AuftragsListe";
import AuftragForm from "@/pages/AuftragForm";
import AuftragDetail from "@/pages/AuftragDetail";
import Rechnungen from "@/pages/Rechnungen";
import Einstellungen from "@/pages/Einstellungen";
import Zeiterfassung from "@/pages/Zeiterfassung";
import Mahnwesen from "@/pages/Mahnwesen";
import MwstAuswertung from "@/pages/MwstAuswertung";
import FinanzenUebersicht from "@/pages/FinanzenUebersicht";
import Vorkalkulation from "@/pages/Vorkalkulation";
import Eingangsrechnungen from "@/pages/Eingangsrechnungen";
import Mitarbeiterakte from "@/pages/Mitarbeiterakte";
import Termine from "@/pages/Termine";
import Kalender from "@/pages/Kalender";
import Plantafel from "@/pages/Plantafel";
import Fotodokumentation from "@/pages/Fotodokumentation";
import Formulare from "@/pages/Formulare";
import ChatHistorie from "@/pages/ChatHistorie";
import Kundendatencenter from "@/pages/Kundendatencenter";
import DokumenteUebersicht from "@/pages/DokumenteUebersicht";
import Offerten from "@/pages/Offerten";
import Lohnabrechnung from "@/pages/Lohnabrechnung";
import Ferienplanung from "@/pages/Ferienplanung";
import Stundenauswertung from "@/pages/Stundenauswertung";
import Lieferanten from "@/pages/Lieferanten";
import GarantieUebersicht from "@/pages/GarantieUebersicht";
import VorkalkulationDetail from "@/pages/VorkalkulationDetail";
import NachkalkulationDetail from "@/pages/NachkalkulationDetail";
import VorkalkulationUebersicht from "@/pages/VorkalkulationUebersicht";
import NachkalkulationUebersicht from "@/pages/NachkalkulationUebersicht";
import Aufgaben from "@/pages/Aufgaben";
import SuperAdminIndex from "@/pages/super-admin/SuperAdminIndex";
import Onboarding from "@/pages/Onboarding";

import Lagerverwaltung from "@/pages/Lagerverwaltung";

import ProjektStatus from "@/pages/ProjektStatus";
import PasswortZuruecksetzen from "@/pages/PasswortZuruecksetzen";
import ZugriffGesperrt from "@/components/ZugriffGesperrt";

function Geschuetzt({ modul, children, label }: { modul: import('@/lib/permissions').BerechtigungKey; children: React.ReactNode; label?: string }) {
  const { hatZugriff } = useAuth();
  if (!hatZugriff(modul)) return <ZugriffGesperrt modul={label} />;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/" component={Dashboard} />
      <Route path="/auftraege" component={AuftragsListe} />
      <Route path="/neu">{() => <AuftragForm />}</Route>
      <Route path="/auftraege/:id/bearbeiten">
        {(params) => <AuftragForm id={params.id} />}
      </Route>
      <Route path="/auftraege/:id">{(params) => <AuftragDetail id={params.id} />}</Route>
      <Route path="/rechnungen">{() => <Geschuetzt modul="rechnungen" label="Rechnungen"><Rechnungen /></Geschuetzt>}</Route>
      <Route path="/zeiterfassung">{() => <Geschuetzt modul="zeiterfassung" label="Zeiterfassung"><Zeiterfassung /></Geschuetzt>}</Route>
      <Route path="/einstellungen">{() => <Geschuetzt modul="einstellungen" label="Einstellungen"><Einstellungen /></Geschuetzt>}</Route>
      <Route path="/super-admin" component={SuperAdminIndex} />
      <Route path="/benutzerverwaltung">{() => <Geschuetzt modul="benutzerverwaltung" label="Benutzerverwaltung"><Benutzerverwaltung /></Geschuetzt>}</Route>
      <Route path="/2fa" component={ZweiFA} />
      <Route path="/mahnwesen">{() => <Geschuetzt modul="finanzmanagement_mahnwesen" label="Mahnwesen"><Mahnwesen /></Geschuetzt>}</Route>
      <Route path="/mwst">{() => <Geschuetzt modul="finanzmanagement_mwst" label="MWST-Auswertung"><MwstAuswertung /></Geschuetzt>}</Route>
      <Route path="/finanzen-uebersicht">{() => <Geschuetzt modul="finanzmanagement_finanzen_uebersicht" label="Finanzen-Übersicht"><FinanzenUebersicht /></Geschuetzt>}</Route>
      <Route path="/vorkalkulation">{() => <Geschuetzt modul="kalkulation_vorkalkulation" label="Vorkalkulation"><Vorkalkulation /></Geschuetzt>}</Route>
      <Route path="/auftraege/:id/kalkulation">{() => <Geschuetzt modul="kalkulation_vorkalkulation" label="Kalkulation"><Vorkalkulation /></Geschuetzt>}</Route>
      <Route path="/eingangsrechnungen">{() => <Geschuetzt modul="finanzmanagement_eingangsrechnungen" label="Eingangsrechnungen"><Eingangsrechnungen /></Geschuetzt>}</Route>
      <Route path="/nachkalkulation">{() => <Geschuetzt modul="kalkulation_nachkalkulation" label="Nachkalkulation"><NachkalkulationUebersicht /></Geschuetzt>}</Route>
      <Route path="/vorkalkulation/:id">{() => <Geschuetzt modul="kalkulation_vorkalkulation" label="Vorkalkulation"><VorkalkulationDetail /></Geschuetzt>}</Route>
      <Route path="/nachkalkulation/:id">{() => <Geschuetzt modul="kalkulation_nachkalkulation" label="Nachkalkulation"><NachkalkulationDetail /></Geschuetzt>}</Route>
      <Route path="/mitarbeiter">{() => <Geschuetzt modul="ressourcen_mitarbeiterakte" label="Mitarbeiterakte"><Mitarbeiterakte /></Geschuetzt>}</Route>
      <Route path="/termine">{() => <Geschuetzt modul="ressourcen_planung_termine" label="Planung & Termine"><Termine /></Geschuetzt>}</Route>
      <Route path="/kalender">{() => <Geschuetzt modul="ressourcen_kalender" label="Kalender"><Kalender /></Geschuetzt>}</Route>
      <Route path="/plantafel">{() => <Geschuetzt modul="ressourcen_plantafel" label="Plantafel"><Plantafel /></Geschuetzt>}</Route>
      <Route path="/aufgaben">{() => <Geschuetzt modul="ressourcen_aufgaben" label="Aufgaben"><Aufgaben /></Geschuetzt>}</Route>
      <Route path="/fotodokumentation">{() => <Geschuetzt modul="dokumente_fotodokumentation" label="Bild-/Fotodoku"><Fotodokumentation /></Geschuetzt>}</Route>
      <Route path="/formulare">{() => <Geschuetzt modul="dokumente_formulare" label="Formulare & Unterschriften"><Formulare /></Geschuetzt>}</Route>
      <Route path="/chat">{() => <Geschuetzt modul="dokumente_chat_historie" label="Chat & Historie"><ChatHistorie /></Geschuetzt>}</Route>
      <Route path="/kundendatencenter">{() => <Geschuetzt modul="dokumente_kundendatencenter" label="Kundendatencenter"><Kundendatencenter /></Geschuetzt>}</Route>
      <Route path="/dokumente">{() => <Geschuetzt modul="dokumente_uebersicht" label="Dokumente"><DokumenteUebersicht /></Geschuetzt>}</Route>
      <Route path="/offerten">{() => <Geschuetzt modul="offerten" label="Offerten"><Offerten /></Geschuetzt>}</Route>
      <Route path="/lohnabrechnung">{() => <Geschuetzt modul="ressourcen_lohnabrechnung" label="Lohnabrechnung"><Lohnabrechnung /></Geschuetzt>}</Route>
      <Route path="/ferienplanung">{() => <Geschuetzt modul="ressourcen_ferienplanung" label="Ferienplanung"><Ferienplanung /></Geschuetzt>}</Route>
      <Route path="/stundenauswertung">{() => <Geschuetzt modul="ressourcen_stundenauswertung" label="Stundenauswertung"><Stundenauswertung /></Geschuetzt>}</Route>
      <Route path="/lieferanten">{() => <Geschuetzt modul="einkauf_lieferanten_material" label="Lieferanten & Material"><Lieferanten /></Geschuetzt>}</Route>
      <Route path="/garantien">{() => <Geschuetzt modul="finanzmanagement_garantien" label="Garantieübersicht"><GarantieUebersicht /></Geschuetzt>}</Route>
      <Route path="/vorkalkulation-uebersicht">{() => <Geschuetzt modul="kalkulation_vorkalkulation" label="Vorkalkulation"><VorkalkulationUebersicht /></Geschuetzt>}</Route>
      <Route path="/nachkalkulation-uebersicht">{() => <Geschuetzt modul="kalkulation_nachkalkulation" label="Nachkalkulation"><NachkalkulationUebersicht /></Geschuetzt>}</Route>

      <Route path="/lager">{() => <Geschuetzt modul="einkauf_lagerverwaltung" label="Lagerverwaltung"><Lagerverwaltung /></Geschuetzt>}</Route>

      <Route path="/projekt/:token">{(params) => <ProjektStatus token={params.token} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

type OnboardingStatus = {
  abgeschlossen: boolean;
  pflichtfelder: Record<string, boolean>;
};

function MitarbeiterOnboardingHinweis() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-4 py-8">
      <div className="w-full rounded-xl border bg-card p-7 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Grundeinstellungen fehlen noch</h1>
        <p className="mt-3 text-muted-foreground">
          Ihr Firmen-Admin muss zuerst die Grundeinstellungen ausfüllen. Bitte kontaktieren Sie ihn.
        </p>
      </div>
    </main>
  );
}

function OnboardingGate() {
  const { user, isAdmin } = useAuth();
  const [location] = useLocation();
  const { data: onboarding } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/onboarding/status");
      return response.json();
    },
    enabled: !!user,
  });

  const onboardingOffen = onboarding?.abgeschlossen === false && user?.ist_super_admin !== true;
  if (onboardingOffen && !isAdmin) {
    return <Layout><MitarbeiterOnboardingHinweis /></Layout>;
  }
  if (onboardingOffen && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  return (
    <Layout>
      <AppRouter />
    </Layout>
  );
}

function AuthGuard() {
  const { isLoggedIn, logout } = useAuth();
  const [warnOpen, setWarnOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useIdleTimer({
    onIdle: () => {
      setWarnOpen(false);
      logout();
    },
    onWarn: (secs) => {
      setWarnOpen(true);
      setSecondsLeft(secs);
    },
    onActivity: () => {
      setWarnOpen(false);
    },
  });

  // Public routes — kein Login nötig
  const hash = window.location.hash;
  if (hash.startsWith("#/projekt/")) {
    const token = hash.split("#/projekt/")[1];
    return <Router hook={useHashLocation}><ProjektStatus token={token} /></Router>;
  }
  if (hash.startsWith("#/passwort-zuruecksetzen")) {
    return <PasswortZuruecksetzen />;
  }

  // Intentionally unlinked Stage-6 technical preview. This does not use or
  // replace the legacy app_benutzer auth context.
  if (hash === "#/auth-preview" || window.location.pathname === "/auth-preview") {
    return <SupabaseLoginPreview />;
  }

  if (!isLoggedIn) return <Login />;
  return (
    <Router hook={useHashLocation}>
      <IdleWarningDialog
        open={warnOpen}
        secondsLeft={secondsLeft}
        onContinue={() => setWarnOpen(false)}
      />
      <OnboardingGate />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrandingProvider>
            <TooltipProvider>
              <Toaster />
              <AuthGuard />
            </TooltipProvider>
          </BrandingProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
