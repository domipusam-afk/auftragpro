import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Lock, User, ShieldCheck, Eye, EyeOff, ShieldOff, Mail, CheckCircle2 } from "lucide-react";

type Step = "credentials" | "totp" | "passwort-vergessen";

export default function Login() {
  const { login, verify2fa } = useAuth();

  const [step, setStep] = useState<Step>("credentials");
  const [benutzername, setBenutzername] = useState("");
  const [passwort, setPasswort] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gesperrt, setGesperrt] = useState(false);
  const [verbleibend, setVerbleibend] = useState<number | null>(null);
  const [geraetMerken, setGeraetMerken] = useState(true);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!benutzername || !passwort) return;
    setLoading(true);
    setError("");
    const result = await login(benutzername, passwort);
    setLoading(false);
    if (!result.ok) {
      if (result.gesperrt) {
        setGesperrt(true);
        setVerbleibend(null);
      } else {
        setGesperrt(false);
        // Verbleibende Versuche aus Meldung parsen z.B. "(3 Versuche verbleibend)"
        const match = result.message?.match(/(\d+) Versuch/);
        setVerbleibend(match ? parseInt(match[1]) : null);
      }
      setError(result.message || "Benutzername oder Passwort falsch");
      setPasswort("");
      return;
    }
    setGesperrt(false);
    setVerbleibend(null);
    if (result.requires2fa && result.userId) {
      setUserId(result.userId);
      setStep("totp");
    }
    // If ok and no 2fa required, auth context handles redirect automatically
  };

  const handlePasswortVergessen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    try {
      await apiRequest("POST", "/api/auth/passwort-vergessen", { benutzername: resetEmail });
    } catch { /* Antwort ist bewusst immer generisch, Fehler hier egal */ }
    setResetLoading(false);
    setResetSent(true);
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode) return;
    setLoading(true);
    setError("");
    const result = await verify2fa(userId, totpCode, geraetMerken, benutzername);
    setLoading(false);
    if (!result.ok) {
      setError(result.message || "Falscher Code");
      setTotpCode("");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#44546a" }}
    >
      <div className="w-full max-w-sm">
        {/* Neutrales Produkt-Branding: ein Tenant ist vor dem Login nicht bekannt. */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/25 text-white flex items-center justify-center text-xl font-bold shadow-xl" aria-label="AuftragsPro">
            AP
          </div>
          <div className="text-center text-white">
            <h1 className="text-xl font-bold tracking-tight">AuftragsPro</h1>
            <p className="text-sm text-white/70 mt-1">Auftragsverwaltung für Ihr Unternehmen</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-2xl border p-8">

          {step === "credentials" && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold">Anmelden</h2>
              </div>
              <form onSubmit={handleCredentials} className="space-y-4">
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="benutzername oder E-Mail"
                    value={benutzername}
                    onChange={(e) => setBenutzername(e.target.value)}
                    className="pl-9 h-11 placeholder:text-[13px] sm:placeholder:text-sm"
                    autoFocus
                    autoComplete="username"
                    data-testid="input-benutzername"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="Passwort"
                    value={passwort}
                    onChange={(e) => setPasswort(e.target.value)}
                    className="pl-9 pr-10 h-11"
                    autoComplete="current-password"
                    data-testid="input-passwort"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-3 text-muted-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {gesperrt && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5">
                    <ShieldOff className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Konto gesperrt</p>
                      <p className="text-xs text-destructive/80 mt-0.5">Zu viele Fehlversuche. Bitte einen Administrator kontaktieren, um das Konto wieder zu entsperren.</p>
                    </div>
                  </div>
                )}
                {!gesperrt && verbleibend !== null && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <ShieldOff className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Falsches Passwort</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Noch <span className="font-bold">{verbleibend}</span> {verbleibend === 1 ? "Versuch" : "Versuche"} verbleibend — danach wird das Konto dauerhaft gesperrt.
                      </p>
                    </div>
                  </div>
                )}
                {!gesperrt && verbleibend === null && error && <p className="text-sm text-destructive font-medium">{error}</p>}
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={loading || !benutzername || !passwort || gesperrt}
                  data-testid="button-login"
                >
                  {loading ? "Wird geprüft…" : "Anmelden"}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                  onClick={() => { setStep("passwort-vergessen"); setError(""); setResetSent(false); setResetEmail(benutzername); }}
                  data-testid="link-passwort-vergessen"
                >
                  Passwort vergessen?
                </button>
              </form>
            </>
          )}

          {step === "passwort-vergessen" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold">Passwort zurücksetzen</h2>
              </div>
              {!resetSent ? (
                <>
                  <p className="text-sm text-muted-foreground mb-6">
                    Gib deine E-Mail-Adresse ein. Falls ein Konto existiert, erhältst du einen Link zum Zurücksetzen.
                  </p>
                  <form onSubmit={handlePasswortVergessen} className="space-y-4">
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="benutzername oder E-Mail"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="pl-9 h-11 placeholder:text-[13px] sm:placeholder:text-sm"
                        autoFocus
                        autoComplete="username"
                        data-testid="input-reset-email"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11"
                      disabled={resetLoading || !resetEmail}
                      data-testid="button-reset-anfordern"
                    >
                      {resetLoading ? "Wird gesendet…" : "Link anfordern"}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  <p className="text-sm text-muted-foreground">
                    Falls ein Konto mit dieser E-Mail existiert, wurde soeben ein Link zum Zurücksetzen versendet. Prüfe dein Postfach (auch den Spam-Ordner).
                  </p>
                </div>
              )}
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground mt-4"
                onClick={() => { setStep("credentials"); setError(""); setResetSent(false); }}
              >
                ← Zurück zur Anmeldung
              </button>
            </>
          )}

          {step === "totp" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-semibold">2-Faktor Bestätigung</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Öffne Google Authenticator und gib den 6-stelligen Code ein.
              </p>
              <form onSubmit={handleTotp} className="space-y-4">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000 000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
                  maxLength={6}
                  className="h-14 text-center text-2xl tracking-widest font-mono"
                  autoFocus
                  data-testid="input-totp"
                />
                {/* Gerät merken Checkbox */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <div
                    onClick={() => setGeraetMerken(v => !v)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      geraetMerken ? "bg-primary border-primary" : "border-muted-foreground/40 bg-transparent"
                    }`}
                  >
                    {geraetMerken && (
                      <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    Dieses Gerät 30 Tage merken
                  </span>
                </label>
                {error && <p className="text-sm text-destructive font-medium">{error}</p>}
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={loading || totpCode.length < 6}
                  data-testid="button-totp-submit"
                >
                  {loading ? "Wird geprüft…" : "Bestätigen"}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                >
                  ← Zurück zur Anmeldung
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6 opacity-40" style={{ color: "hsl(var(--sidebar-foreground))" }}>
          AuftragsPro · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
