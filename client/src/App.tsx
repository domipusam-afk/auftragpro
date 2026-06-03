import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useState } from "react";
import { useIdleTimer } from "@/hooks/use-idle-timer";
import { IdleWarningDialog } from "@/components/IdleWarningDialog";
import Login from "@/pages/Login";
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
import Vorkalkulation from "@/pages/Vorkalkulation";
import Eingangsrechnungen from "@/pages/Eingangsrechnungen";
import Nachkalkulation from "@/pages/Nachkalkulation";
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
import KalkulationsUebersicht from "@/pages/KalkulationsUebersicht";
import VorkalkulationDetail from "@/pages/VorkalkulationDetail";
import NachkalkulationDetail from "@/pages/NachkalkulationDetail";
import VorkalkulationUebersicht from "@/pages/VorkalkulationUebersicht";
import NachkalkulationUebersicht from "@/pages/NachkalkulationUebersicht";

import Lagerverwaltung from "@/pages/Lagerverwaltung";

import ProjektStatus from "@/pages/ProjektStatus";
import ZugriffGesperrt from "@/components/ZugriffGesperrt";

function Geschuetzt({ modul, children, label }: { modul: import('@/lib/permissions').ModulKey; children: React.ReactNode; label?: string }) {
  const { hatZugriff } = useAuth();
  if (!hatZugriff(modul)) return <ZugriffGesperrt modul={label} />;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
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
      <Route path="/benutzerverwaltung">{() => <Geschuetzt modul="benutzerverwaltung" label="Benutzerverwaltung"><Benutzerverwaltung /></Geschuetzt>}</Route>
      <Route path="/2fa" component={ZweiFA} />
      <Route path="/mahnwesen">{() => <Geschuetzt modul="finanzmanagement" label="Mahnwesen"><Mahnwesen /></Geschuetzt>}</Route>
      <Route path="/mwst">{() => <Geschuetzt modul="finanzmanagement" label="MWST-Auswertung"><MwstAuswertung /></Geschuetzt>}</Route>
      <Route path="/vorkalkulation">{() => <Geschuetzt modul="kalkulation" label="Vorkalkulation"><Vorkalkulation /></Geschuetzt>}</Route>
      <Route path="/auftraege/:id/kalkulation">{() => <Geschuetzt modul="kalkulation" label="Kalkulation"><Vorkalkulation /></Geschuetzt>}</Route>
      <Route path="/eingangsrechnungen">{() => <Geschuetzt modul="finanzmanagement" label="Eingangsrechnungen"><Eingangsrechnungen /></Geschuetzt>}</Route>
      <Route path="/nachkalkulation">{() => <Geschuetzt modul="kalkulation" label="Nachkalkulation"><NachkalkulationUebersicht /></Geschuetzt>}</Route>
      <Route path="/vorkalkulation/:id">{(p) => <Geschuetzt modul="kalkulation" label="Vorkalkulation"><VorkalkulationDetail {...p} /></Geschuetzt>}</Route>
      <Route path="/nachkalkulation/:id">{(p) => <Geschuetzt modul="kalkulation" label="Nachkalkulation"><NachkalkulationDetail {...p} /></Geschuetzt>}</Route>
      <Route path="/mitarbeiter">{() => <Geschuetzt modul="ressourcen" label="Mitarbeiterakte"><Mitarbeiterakte /></Geschuetzt>}</Route>
      <Route path="/termine" component={Termine} />
      <Route path="/kalender" component={Kalender} />
      <Route path="/plantafel" component={Plantafel} />
      <Route path="/fotodokumentation" component={Fotodokumentation} />
      <Route path="/formulare" component={Formulare} />
      <Route path="/chat" component={ChatHistorie} />
      <Route path="/kundendatencenter" component={Kundendatencenter} />
      <Route path="/dokumente">{() => <Geschuetzt modul="dokumente" label="Dokumente"><DokumenteUebersicht /></Geschuetzt>}</Route>
      <Route path="/offerten">{() => <Geschuetzt modul="offerten" label="Offerten"><Offerten /></Geschuetzt>}</Route>
      <Route path="/lohnabrechnung">{() => <Geschuetzt modul="ressourcen" label="Lohnabrechnung"><Lohnabrechnung /></Geschuetzt>}</Route>
      <Route path="/ferienplanung">{() => <Geschuetzt modul="ressourcen" label="Ferienplanung"><Ferienplanung /></Geschuetzt>}</Route>
      <Route path="/stundenauswertung">{() => <Geschuetzt modul="ressourcen" label="Stundenauswertung"><Stundenauswertung /></Geschuetzt>}</Route>
      <Route path="/lieferanten">{() => <Geschuetzt modul="einkauf" label="Lieferanten"><Lieferanten /></Geschuetzt>}</Route>
      <Route path="/garantien" component={GarantieUebersicht} />
      <Route path="/vorkalkulation-uebersicht">{() => <Geschuetzt modul="kalkulation" label="Vorkalkulation"><VorkalkulationUebersicht /></Geschuetzt>}</Route>
      <Route path="/nachkalkulation-uebersicht">{() => <Geschuetzt modul="kalkulation" label="Nachkalkulation"><NachkalkulationUebersicht /></Geschuetzt>}</Route>
      <Route path="/kalkulations-uebersicht">{() => <Geschuetzt modul="kalkulation" label="Kalkulation"><KalkulationsUebersicht /></Geschuetzt>}</Route>

      <Route path="/lager">{() => <Geschuetzt modul="einkauf" label="Lagerverwaltung"><Lagerverwaltung /></Geschuetzt>}</Route>

      <Route path="/projekt/:token">{(params) => <ProjektStatus token={params.token} />}</Route>
      <Route component={NotFound} />
    </Switch>
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

  if (!isLoggedIn) return <Login />;
  return (
    <Router hook={useHashLocation}>
      <IdleWarningDialog
        open={warnOpen}
        secondsLeft={secondsLeft}
        onContinue={() => setWarnOpen(false)}
      />
      <Layout>
        <AppRouter />
      </Layout>
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AuthGuard />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
