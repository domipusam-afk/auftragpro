import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, User, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Step = "credentials" | "totp";

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

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!benutzername || !passwort) return;
    setLoading(true);
    setError("");
    const result = await login(benutzername, passwort);
    setLoading(false);
    if (!result.ok) {
      setError(result.message || "Benutzername oder Passwort falsch");
      setPasswort("");
      return;
    }
    if (result.requires2fa && result.userId) {
      setUserId(result.userId);
      setStep("totp");
    }
    // If ok and no 2fa required, auth context handles redirect automatically
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode) return;
    setLoading(true);
    setError("");
    const result = await verify2fa(userId, totpCode);
    setLoading(false);
    if (!result.ok) {
      setError(result.message || "Falscher Code");
      setTotpCode("");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "hsl(var(--sidebar))" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo + Firmenname */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div
            className="rounded-2xl overflow-hidden shadow-xl border-2 bg-white flex items-center justify-center px-4 py-3"
            style={{ borderColor: "hsl(var(--sidebar-foreground) / 0.25)", maxWidth: "220px", width: "100%" }}
          >
            <img
              src="data:image/jpeg;base64,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"
              alt="Schneggenburger GmbH"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold" style={{ color: "hsl(var(--sidebar-foreground))" }}>
              Schneggenburger GmbH
            </h1>
            <p className="text-xs opacity-60" style={{ color: "hsl(var(--sidebar-foreground))" }}>
              AuftragsPro
            </p>
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
                    placeholder="vorname.nachname@schneggenburger.ch"
                    value={benutzername}
                    onChange={(e) => setBenutzername(e.target.value)}
                    className="pl-9 h-11"
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
                {error && <p className="text-sm text-destructive font-medium">{error}</p>}
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={loading || !benutzername || !passwort}
                  data-testid="button-login"
                >
                  {loading ? "Wird geprüft…" : "Anmelden"}
                </Button>
              </form>
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
          AuftragsPro · Schneggenburger GmbH · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
