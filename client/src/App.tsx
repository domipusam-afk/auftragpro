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
      <Route path="/rechnungen" component={Rechnungen} />
      <Route path="/zeiterfassung" component={Zeiterfassung} />
      <Route path="/einstellungen" component={Einstellungen} />
      <Route path="/benutzerverwaltung" component={Benutzerverwaltung} />
      <Route path="/2fa" component={ZweiFA} />
      <Route path="/mahnwesen" component={Mahnwesen} />
      <Route path="/vorkalkulation" component={Vorkalkulation} />
      <Route path="/auftraege/:id/kalkulation" component={Vorkalkulation} />
      <Route path="/eingangsrechnungen" component={Eingangsrechnungen} />
      <Route path="/nachkalkulation" component={NachkalkulationUebersicht} />
      <Route path="/vorkalkulation/:id" component={VorkalkulationDetail} />
      <Route path="/nachkalkulation/:id" component={NachkalkulationDetail} />
      <Route path="/mitarbeiter" component={Mitarbeiterakte} />
      <Route path="/termine" component={Termine} />
      <Route path="/kalender" component={Kalender} />
      <Route path="/plantafel" component={Plantafel} />
      <Route path="/fotodokumentation" component={Fotodokumentation} />
      <Route path="/formulare" component={Formulare} />
      <Route path="/chat" component={ChatHistorie} />
      <Route path="/kundendatencenter" component={Kundendatencenter} />
      <Route path="/dokumente" component={DokumenteUebersicht} />
      <Route path="/offerten" component={Offerten} />
      <Route path="/lohnabrechnung" component={Lohnabrechnung} />
      <Route path="/ferienplanung" component={Ferienplanung} />
      <Route path="/stundenauswertung" component={Stundenauswertung} />
      <Route path="/lieferanten" component={Lieferanten} />
      <Route path="/garantien" component={GarantieUebersicht} />
      <Route path="/vorkalkulation-uebersicht" component={VorkalkulationUebersicht} />
      <Route path="/nachkalkulation-uebersicht" component={NachkalkulationUebersicht} />
      <Route path="/kalkulations-uebersicht" component={KalkulationsUebersicht} />

      <Route path="/lager" component={Lagerverwaltung} />

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
