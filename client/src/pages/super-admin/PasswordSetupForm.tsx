import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { superAdminApi } from "@/lib/super-admin-api";

export default function PasswordSetupForm({ onDone }: { onDone: () => void }) {
  const [passwort, setPasswort] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setError(""); if (passwort !== confirm) return setError("Die Passwörter stimmen nicht überein."); if (passwort.length < 10 || !/[A-Za-z]/.test(passwort) || !/\d/.test(passwort)) return setError("Mindestens 10 Zeichen, ein Buchstabe und eine Ziffer sind erforderlich."); setSaving(true); try { await superAdminApi.setupPassword(passwort); onDone(); } catch (err: any) { setError(err.message || "Passwort konnte nicht gesetzt werden."); } finally { setSaving(false); } };
  return <Card className="mx-auto max-w-md p-6"><KeyRound className="h-6 w-6 text-primary"/><h1 className="mt-4 text-xl font-semibold">Admin-Passwort festlegen</h1><p className="mt-2 text-sm text-muted-foreground">Für systemweite Änderungen ist eine zweite, kurze Sicherheitsprüfung erforderlich.</p><form className="mt-6 space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="setup-admin-password">Neues Admin-Passwort</Label><Input id="setup-admin-password" data-testid="input-admin-password-setup" type="password" autoComplete="new-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="setup-admin-password-confirm">Passwort bestätigen</Label><Input id="setup-admin-password-confirm" data-testid="input-admin-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<Button className="w-full" type="submit" disabled={saving} data-testid="button-admin-password-setup">{saving ? "Wird gespeichert…" : "Admin-Passwort festlegen"}</Button></form></Card>;
}
