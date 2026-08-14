import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/queryClient";
import { setAdminSessionToken, superAdminApi } from "@/lib/super-admin-api";

export default function PasswordVerifyForm({ onVerified }: { onVerified: () => void }) {
  const [passwort, setPasswort] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(""); setSaving(true); try { const result = await superAdminApi.verify(passwort); setAdminSessionToken(result.adminSessionToken); onVerified(); } catch (err: any) { if (err instanceof ApiRequestError && err.status === 429) setError("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen."); else setError(err.message || "Admin-Passwort nicht korrekt."); } finally { setSaving(false); } };
  return <Card className="mx-auto max-w-md p-6"><LockKeyhole className="h-6 w-6 text-primary"/><h1 className="mt-4 text-xl font-semibold">Sicherheitsprüfung</h1><p className="mt-2 text-sm text-muted-foreground">Bitte das zusätzliche Admin-Passwort eingeben. Die Freigabe gilt 15 Minuten und wird bei Nutzung verlängert.</p><form className="mt-6 space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="verify-admin-password">Admin-Passwort</Label><Input id="verify-admin-password" data-testid="input-admin-password-verify" type="password" autoComplete="current-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoFocus /></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button className="w-full" type="submit" disabled={saving} data-testid="button-admin-password-verify">{saving ? "Wird geprüft…" : "System-Verwaltung öffnen"}</Button></form></Card>;
}
