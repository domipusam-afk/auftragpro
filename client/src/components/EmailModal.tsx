import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

interface EmailModalProps {
  open: boolean;
  onClose: () => void;
  to?: string;
  subject?: string;
  body?: string;
  type?: "rechnung" | "offerte" | "mahnung";
  refId?: string;
}

export function EmailModal({ open, onClose, to = "", subject = "", body = "", type, refId }: EmailModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({ to, subject, body });
  const [loading, setLoading] = useState(false);

  // SMTP-Konfiguration prüfen
  const { data: einstellungen = [] } = useQuery<any[]>({
    queryKey: ["/api/einstellungen"],
    enabled: open,
  });
  const sm: Record<string, string> = {};
  for (const e of einstellungen) sm[e.schluessel] = e.wert;
  const smtpKonfiguriert = !!(sm.smtp_host && sm.smtp_user && (sm.smtp_passwort || sm.smtp_pass));

  // Props beim Öffnen synchronisieren (wichtig wenn Modal mehrmals geöffnet wird)
  useEffect(() => {
    if (open) {
      setForm({ to, subject, body });
    }
  }, [open, to, subject, body]);

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const handleSend = async () => {
    if (!form.to || !form.subject) {
      toast({ title: "Bitte E-Mail-Adresse und Betreff angeben.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await apiRequest("POST", "/api/email/send", {
        to: form.to,
        subject: form.subject,
        body: form.body,
        type,
        refId,
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: "E-Mail gesendet", description: form.to });
        onClose();
      } else {
        toast({
          title: "E-Mail-Versand",
          description: data.message || "SMTP in Einstellungen konfigurieren",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> E-Mail senden
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {/* SMTP-Warnung wenn nicht konfiguriert */}
          {!smtpKonfiguriert && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span>
                SMTP nicht konfiguriert. E-Mail-Versand funktioniert nicht.
                {" "}<a href="/#/einstellungen" className="underline font-medium" onClick={onClose}>Jetzt einrichten →</a>
              </span>
            </div>
          )}
          {smtpKonfiguriert && sm.smtp_von && (
            <div className="text-xs text-muted-foreground">
              Von: <span className="font-medium">{sm.smtp_von}</span>
            </div>
          )}
          <div>
            <Label className="text-xs">An (E-Mail) *</Label>
            <Input
              type="email"
              value={form.to}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
              placeholder="empfaenger@beispiel.ch"
            />
          </div>
          <div>
            <Label className="text-xs">Betreff *</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Betreff"
            />
          </div>
          <div>
            <Label className="text-xs">Nachricht</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={6}
              placeholder="Ihre Nachricht…"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 text-white"
              style={{ background: "#e8620a" }}
              onClick={handleSend}
              disabled={loading || !form.to || !form.subject}
            >
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Wird gesendet…" : "Senden"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Abbrechen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
