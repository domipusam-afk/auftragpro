import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Building2, Palette, ScrollText, ShieldCheck, UsersRound, KeyRound } from "lucide-react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ApiRequestError, queryClient } from "@/lib/queryClient";
import { clearAdminSessionToken, onAdminSessionExpired, superAdminApi } from "@/lib/super-admin-api";
import PasswordSetupForm from "./PasswordSetupForm";
import PasswordVerifyForm from "./PasswordVerifyForm";
import Uebersicht from "./Uebersicht";
import FirmenVerwaltung from "./FirmenVerwaltung";
import MitarbeiterVerwaltung from "./MitarbeiterVerwaltung";
import BrandingVerwaltung from "./BrandingVerwaltung";
import AuditLog from "./AuditLog";
import ChangePasswordForm from "./ChangePasswordForm";

type Section = "overview" | "tenants" | "users" | "branding" | "audit" | "security";

const sections: Array<{ id: Section; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Übersicht", icon: BarChart3 },
  { id: "tenants", label: "Firmen", icon: Building2 },
  { id: "users", label: "Mitarbeiter", icon: UsersRound },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "audit", label: "Audit-Log", icon: ScrollText },
  { id: "security", label: "Sicherheit", icon: KeyRound },
];

function LoadingState() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-8 w-60 animate-pulse rounded bg-muted" />
      <div className="h-11 w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-muted" />)}
      </div>
    </div>
  );
}

export default function SuperAdminIndex() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section>("overview");
  const [endingSession, setEndingSession] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["super-admin", "session-status"],
    queryFn: superAdminApi.status,
    enabled: user?.ist_super_admin === true,
    retry: false,
  });

  const refreshStatus = () => {
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "session-status"] });
  };

  const endAdminSession = async () => {
    setEndingSession(true);
    try {
      await superAdminApi.logout();
    } finally {
      clearAdminSessionToken();
      queryClient.setQueryData(["super-admin", "session-status"], (previous: unknown) => (
        previous && typeof previous === "object"
          ? { ...(previous as Record<string, unknown>), sessionAktiv: false, sessionAblaufIn: undefined }
          : previous
      ));
      setEndingSession(false);
    }
  };

  useEffect(() => {
    if (user && !user.ist_super_admin) setLocation("/");
  }, [setLocation, user]);

  useEffect(() => onAdminSessionExpired(() => {
    queryClient.setQueryData(["super-admin", "session-status"], (previous: unknown) => (
      previous && typeof previous === "object"
        ? { ...(previous as Record<string, unknown>), sessionAktiv: false, sessionAblaufIn: undefined }
        : previous
    ));
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "session-status"] });
  }), []);

  if (!user?.ist_super_admin) return null;
  if (statusQuery.isLoading) return <LoadingState />;

  if (statusQuery.error || !statusQuery.data) {
    const forbidden = statusQuery.error instanceof ApiRequestError && statusQuery.error.status === 403;
    return (
      <Card className="mx-auto max-w-lg p-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="mt-4 text-xl font-semibold">
          {forbidden ? "System-Verwaltung nicht verfügbar" : "Status konnte nicht geladen werden"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {forbidden
            ? "Deine Super-Admin-Berechtigung ist nicht mehr aktiv."
            : "Die Sicherheitsprüfung konnte nicht geladen werden. Bitte versuche es erneut."}
        </p>
        <Button className="mt-5" variant="outline" onClick={refreshStatus} data-testid="button-refresh-super-admin-status">
          Erneut versuchen
        </Button>
      </Card>
    );
  }

  if (!statusQuery.data.passwortGesetzt) {
    return <PasswordSetupForm onDone={refreshStatus} />;
  }

  if (!statusQuery.data.sessionAktiv) {
    return <PasswordVerifyForm onVerified={refreshStatus} />;
  }

  const content = {
    overview: <Uebersicht />,
    tenants: <FirmenVerwaltung />,
    users: <MitarbeiterVerwaltung />,
    branding: <BrandingVerwaltung />,
    audit: <AuditLog />,
    security: <div className="space-y-6"><div><h1 className="text-xl font-semibold">Sicherheit</h1><p className="mt-1 text-sm text-muted-foreground">Zusätzliches Passwort für die System-Verwaltung ändern.</p></div><ChangePasswordForm /></div>,
  } satisfies Record<Section, JSX.Element>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">Geschützter Bereich</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">System-Verwaltung</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mandantenübergreifende Verwaltung und revisionssichere Aktivitäten.
          </p>
        </div>
        {statusQuery.data.sessionAblaufIn !== undefined && (
          <div className="flex items-center gap-2">
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Admin-Freigabe aktiv
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void endAdminSession()}
              disabled={endingSession}
              data-testid="button-end-admin-session"
            >
              Freigabe beenden
            </Button>
          </div>
        )}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b pb-px" aria-label="System-Verwaltung">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              section === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            aria-current={section === id ? "page" : undefined}
            data-testid={`tab-super-admin-${id}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {content[section]}
    </div>
  );
}
