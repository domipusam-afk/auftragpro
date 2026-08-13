import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";

// Eigenständige Seite, die über den Link aus der Passwort-Reset-E-Mail
// aufgerufen wird: /#/passwort-zuruecksetzen?token=<raw-token>
export default function PasswortZuruecksetzen() {
  const [token, setToken] = useState("");
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [bestaetigung, setBestaetigung] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Token steht im Query-String nach dem Hash-Fragment, z.B.
    // #/passwort-zuruecksetzen?token=abc123
    const hash = window.location.hash || "";
    const queryIndex = hash.indexOf("?");
    const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : "");
    setToken(params.get("token") || "");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Der Link ist ungültig. Bitte fordere einen neuen Reset-Link an.");
      return;
    }
    if (neuesPasswort.length < 12) {
      setError("Passwort muss mindestens 12 Zeichen haben.");
      return;
    }
    if (neuesPasswort !== bestaetigung) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/passwort-zuruecksetzen", { token, neuesPasswort });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Der Link ist ungültig oder abgelaufen.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "hsl(var(--sidebar))" }}>
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl shadow-2xl border p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold">Neues Passwort festlegen</h2>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="text-sm text-muted-foreground">Dein Passwort wurde erfolgreich geändert.</p>
              <Button className="w-full h-11 mt-2" onClick={() => { window.location.hash = "#/"; }} data-testid="button-zur-anmeldung">
                Zur Anmeldung
              </Button>
            </div>
          ) : !token ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-muted-foreground">Der Link ist ungültig. Bitte fordere über die Anmeldeseite einen neuen Link an.</p>
              <Button variant="outline" className="w-full h-11 mt-2" onClick={() => { window.location.hash = "#/"; }}>
                Zur Anmeldung
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Neues Passwort (mind. 12 Zeichen)"
                  value={neuesPasswort}
                  onChange={(e) => setNeuesPasswort(e.target.value)}
                  className="pl-9 pr-10 h-11"
                  autoComplete="new-password"
                  autoFocus
                  data-testid="input-neues-passwort"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-3 text-muted-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Passwort bestätigen"
                  value={bestaetigung}
                  onChange={(e) => setBestaetigung(e.target.value)}
                  className="pl-9 h-11"
                  autoComplete="new-password"
                  data-testid="input-passwort-bestaetigung"
                />
              </div>
              {error && <p className="text-sm text-destructive font-medium">{error}</p>}
              <Button type="submit" className="w-full h-11" disabled={loading || !neuesPasswort || !bestaetigung} data-testid="button-passwort-speichern">
                {loading ? "Wird gespeichert…" : "Passwort speichern"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
