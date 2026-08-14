import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { superAdminApi } from "@/lib/super-admin-api";

export default function ChangePasswordForm() {
 const [alt, setAlt] = useState(""); const [neu, setNeu] = useState(""); const [confirm, setConfirm] = useState(""); const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false);
 const submit = async (e: React.FormEvent) => { e.preventDefault(); setNotice(""); if (neu !== confirm) return setNotice("Die neuen Passwörter stimmen nicht überein."); if (neu.length < 10 || !/[A-Za-z]/.test(neu) || !/\d/.test(neu)) return setNotice("Mindestens 10 Zeichen, ein Buchstabe und eine Ziffer sind erforderlich."); setSaving(true); try { await superAdminApi.changePassword(alt, neu); setAlt(""); setNeu(""); setConfirm(""); setNotice("Admin-Passwort wurde geändert."); } catch (err: any) { setNotice(err.message || "Änderung nicht möglich."); } finally { setSaving(false); } };
 return <Card className="p-5"><div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary"/><h2 className="font-semibold">Admin-Passwort ändern</h2></div><form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={submit}><div className="space-y-1.5"><Label htmlFor="old-admin-password">Bisheriges Passwort</Label><Input id="old-admin-password" type="password" value={alt} onChange={(e)=>setAlt(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="new-admin-password">Neues Passwort</Label><Input id="new-admin-password" type="password" value={neu} onChange={(e)=>setNeu(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="new-admin-password-confirm">Bestätigung</Label><Input id="new-admin-password-confirm" type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} /></div><div className="sm:col-span-3 flex flex-wrap items-center gap-3"><Button type="submit" disabled={saving}>{saving ? "Wird gespeichert…" : "Passwort ändern"}</Button>{notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}</div></form></Card>;
}
