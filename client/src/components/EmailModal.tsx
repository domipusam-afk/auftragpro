import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

  // Update form when props change
  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setForm({ to, subject, body });
    }
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
