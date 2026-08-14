import { useState } from "react";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const actionLabels: Record<string, string> = {
  "tenant.create": "Firma angelegt", "tenant.rename": "Firma bearbeitet", "tenant.status_change": "Firmenstatus geändert", "tenant.activate": "Firma aktiviert", "tenant.deactivate": "Firma deaktiviert",
  "user.create": "Mitarbeiter angelegt", "user.update": "Mitarbeiter bearbeitet", "user.reset_password": "Passwort zurückgesetzt",
  "branding.update": "Branding aktualisiert", "admin.password_set": "Admin-Passwort gesetzt", "admin.password_changed": "Admin-Passwort geändert",
};

export function PageHeader({ title, children, description }: { title: string; description: string; children?: React.ReactNode }) {
  return <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{children}</header>;
}

export function TemporaryPassword({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* user can select it manually */ } };
  return <Card className="border-amber-500/40 bg-amber-500/5 p-4" role="status"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"/><div className="min-w-0 flex-1"><h3 className="font-medium">Temporäres Passwort</h3><p className="mt-1 text-sm text-muted-foreground">Wird nur einmal angezeigt. Bitte sicher an die Person weitergeben.</p><div className="mt-3 flex flex-wrap items-center gap-2"><code className="rounded bg-background px-3 py-2 text-sm font-semibold tracking-wide">{password}</code><Button variant="outline" size="sm" onClick={copy} data-testid="button-copy-temporary-password">{copied ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>}{copied ? "Kopiert" : "Kopieren"}</Button><Button variant="ghost" size="sm" onClick={onDismiss}>Ausblenden</Button></div></div></div></Card>;
}

export function formatTime(value?: string | null): string {
  return value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}
