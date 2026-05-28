import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Smartphone, Copy, Check } from "lucide-react";

export default function ZweiFA() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"start" | "scan" | "confirm" | "done">("start");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const setupMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/setup-2fa", { userId: user?.id });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: (d) => {
      setQrDataUrl(d.qrDataUrl);
      setBackupCodes(d.backupCodes);
      setStep("scan");
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/confirm-2fa", { userId: user?.id, code });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Falscher Code");
      return d;
    },
    onSuccess: () => setStep("done"),
    onError: (e: Error) => toast({ title: "Falscher Code", description: e.message, variant: "destructive" }),
  });

  const copyBackup = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">2-Faktor Authentifizierung einrichten</h1>
      </div>

      {step === "start" && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Smartphone className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Was du brauchst</p>
              <p className="text-sm text-muted-foreground mt-1">
                Installiere <strong>Google Authenticator</strong> oder <strong>Authy</strong> auf deinem Handy
                (kostenlos im App Store / Play Store).
              </p>
            </div>
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
            Nach der Einrichtung brauchst du beim Login zusätzlich zum Passwort einen
            6-stelligen Code aus der App. Der Code wechselt alle 30 Sekunden.
          </div>
          <Button
            className="w-full"
            onClick={() => setupMut.mutate()}
            disabled={setupMut.isPending}
            data-testid="button-start-2fa"
          >
            {setupMut.isPending ? "Wird generiert…" : "2FA einrichten"}
          </Button>
        </Card>
      )}

      {step === "scan" && (
        <Card className="p-6 space-y-6">
          <div>
            <p className="font-semibold mb-1">Schritt 1 — QR-Code scannen</p>
            <p className="text-sm text-muted-foreground mb-4">
              Öffne Google Authenticator → + → QR-Code scannen
            </p>
            {qrDataUrl && (
              <div className="flex justify-center">
                <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg border" />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-sm">Schritt 2 — Backup-Codes sichern</p>
              <Button size="sm" variant="outline" onClick={copyBackup}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span className="ml-1">{copied ? "Kopiert" : "Kopieren"}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Drucke diese Codes aus oder speichere sie sicher. Jeder Code kann einmal verwendet werden falls du dein Handy verlierst.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((c) => (
                <code key={c} className="bg-muted rounded px-2 py-1 text-sm font-mono text-center">{c}</code>
              ))}
            </div>
          </div>

          <Button className="w-full" onClick={() => setStep("confirm")} data-testid="button-next-confirm">
            Weiter zur Bestätigung →
          </Button>
        </Card>
      )}

      {step === "confirm" && (
        <Card className="p-6 space-y-4">
          <p className="font-semibold">Schritt 3 — Bestätigen</p>
          <p className="text-sm text-muted-foreground">
            Gib den aktuellen 6-stelligen Code aus der App ein um die Einrichtung abzuschliessen.
          </p>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="000 000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
            maxLength={6}
            className="h-14 text-center text-2xl tracking-widest font-mono"
            autoFocus
            data-testid="input-confirm-code"
          />
          <Button
            className="w-full"
            onClick={() => confirmMut.mutate()}
            disabled={confirmMut.isPending || code.length < 6}
            data-testid="button-confirm-2fa"
          >
            {confirmMut.isPending ? "Wird geprüft…" : "2FA aktivieren"}
          </Button>
          <button
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setStep("scan")}
          >
            ← Zurück zum QR-Code
          </button>
        </Card>
      )}

      {step === "done" && (
        <Card className="p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h2 className="font-bold text-lg">2FA erfolgreich aktiviert!</h2>
          <p className="text-sm text-muted-foreground">
            Ab sofort brauchst du beim Login zusätzlich deinen Authenticator-Code.
            Beim nächsten Abmelden wird er abgefragt.
          </p>
        </Card>
      )}
    </div>
  );
}
