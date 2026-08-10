import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

/**
 * Isolated Stage-6 preview. It is intentionally not linked from the legacy
 * login screen or application navigation and never signs a user into the
 * legacy app session.
 */
export default function SupabaseLoginPreview() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (signInError || !data.session) {
      setPassword("");
      setError(signInError?.message || "Keine Supabase-Sitzung erhalten");
      return;
    }

    setSession(data.session);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
      <main className="mx-auto w-full max-w-md">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10">
            <ShieldCheck className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/75">Interne Vorschau</p>
            <h1 className="text-xl font-semibold tracking-tight">Supabase Auth</h1>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/85 p-6 shadow-2xl shadow-black/30">
          {session ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                <p className="text-sm font-medium text-emerald-200">Supabase-Sitzung aktiv</p>
                <dl className="mt-3 space-y-2 text-sm text-slate-300">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">E-Mail</dt>
                    <dd className="truncate text-right">{session.user.email || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">User-ID</dt>
                    <dd className="max-w-[220px] truncate text-right font-mono text-xs">{session.user.id}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Ablauf</dt>
                    <dd className="text-right">
                      {session.expires_at ? new Date(session.expires_at * 1000).toLocaleString("de-CH") : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
              <Button type="button" variant="outline" className="w-full border-slate-600 text-slate-100" onClick={handleLogout}>
                Sitzung beenden
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleLogin}>
              <p className="text-sm leading-6 text-slate-400">
                Nur für die technische Auth-Prüfung. Diese Vorschau setzt keine Legacy-Anmeldung und ist nicht verlinkt.
              </p>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-200">E-Mail</span>
                <span className="relative block">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="h-11 border-slate-700 bg-slate-950 pl-9 text-slate-100 placeholder:text-slate-600"
                    placeholder="test@example.invalid"
                    required
                  />
                </span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-200">Passwort</span>
                <span className="relative block">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="h-11 border-slate-700 bg-slate-950 pl-9 pr-10 text-slate-100 placeholder:text-slate-600"
                    placeholder="Passwort"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-200"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>
              {error && <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
              <Button type="submit" className="h-11 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={loading}>
                {loading ? "Wird angemeldet…" : "Mit Supabase anmelden"}
              </Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
