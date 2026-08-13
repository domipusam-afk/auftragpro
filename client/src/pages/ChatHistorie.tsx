import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Send, Building2, HardHat, Paperclip, X, FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Nachricht {
  id: string;
  auftrag_id: string;
  absender: string;
  nachricht: string | null;
  typ: string;
  erstellt: string;
  anhang_name?: string | null;
  anhang_mime?: string | null;
  anhang_data?: string | null;
}

const CHAT_ANHANG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB Rohdatei (Base64 ist ~1.37x groesser)

const TYP_OPTIONS = [
  { value: "intern", label: "Büro intern", icon: Building2, color: "bg-blue-100 text-blue-800" },
  { value: "baustelle", label: "Büro ↔ Baustelle", icon: HardHat, color: "bg-orange-100 text-orange-800" },
  { value: "auftraggeber", label: "Büro ↔ Auftraggeber", icon: Building2, color: "bg-green-100 text-green-800" },
];

export default function ChatHistorie() {
  const { toast } = useToast();
  const [selectedAuftrag, setSelectedAuftrag] = useState("");
  const [absender, setAbsender] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [typ, setTyp] = useState("intern");
  const [anhang, setAnhang] = useState<{ name: string; mime: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Timestamp-basiertes "gelesen"-Tracking (nur im React-State, kein localStorage)
  // Wird gesetzt wenn Nachrichten angezeigt werden – für zukünftige Nutzung (z.B. Highlight-Indikator)
  const [, setLetzteGelesenZeit] = useState<Date>(() => new Date());
  // Zuletzt gesehene Nachrichten-ID für Browser-Notification-Polling
  const letzteGesehenIdRef = useRef<string | null>(null);
  // Notification-Permission: nur einmal anfragen
  const notifPermissionAngefragt = useRef(false);

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: nachrichten = [], isLoading } = useQuery<Nachricht[]>({
    queryKey: ["/api/chat", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/chat/${selectedAuftrag}`).then((r) => r.json()),
    enabled: !!selectedAuftrag,
    refetchInterval: 15000, // Refresh every 15s
  });

  // Nachrichten als gelesen markieren wenn Chat geöffnet wird
  const alsGelesenMarkieren = useCallback(() => {
    setLetzteGelesenZeit(new Date());
    // Server informieren (für zukünftige gelesen-Flag Unterstützung)
    apiRequest("POST", "/api/chat/als-gelesen", {}).catch(() => {});
    // Sidebar-Badge aktualisieren
    queryClient.invalidateQueries({ queryKey: ["/api/chat/ungelesen"] });
  }, []);

  // Beim Öffnen der Seite: Permission anfragen + als gelesen markieren
  useEffect(() => {
    // Notification-Permission nur einmal anfragen
    if (!notifPermissionAngefragt.current && "Notification" in window) {
      notifPermissionAngefragt.current = true;
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
    // Chat als gelesen markieren
    alsGelesenMarkieren();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wenn nachrichten sich laden: letzte ID merken + als gelesen markieren
  useEffect(() => {
    if (nachrichten.length > 0) {
      const letzteId = nachrichten[nachrichten.length - 1].id;
      letzteGesehenIdRef.current = letzteId;
      alsGelesenMarkieren();
    }
  }, [nachrichten, alsGelesenMarkieren]);

  // Browser-Notification Polling (alle 10 Sek.) – nur wenn Tab nicht aktiv
  useEffect(() => {
    if (!selectedAuftrag) return;
    const interval = setInterval(async () => {
      if (!document.hidden) return; // Nur wenn Tab im Hintergrund
      if (Notification.permission !== "granted") return;
      try {
        const response = await apiRequest("GET", `/api/chat/${selectedAuftrag}`);
        const alle: Nachricht[] = await response.json();
        if (!alle || alle.length === 0) return;
        const letzteId = letzteGesehenIdRef.current;
        // Neue Nachrichten: nach der zuletzt gesehenen ID
        const letzteIndex = letzteId ? alle.findIndex((n) => n.id === letzteId) : -1;
        const neue = letzteIndex >= 0 ? alle.slice(letzteIndex + 1) : alle.slice(-1);
        if (neue.length > 0) {
          const neuestId = alle[alle.length - 1].id;
          letzteGesehenIdRef.current = neuestId;
          // Browser-Notification für jede neue Nachricht (max. 3)
          neue.slice(0, 3).forEach((msg) => {
            try {
              new Notification("Neue Chat-Nachricht", {
                body: `${msg.absender}: ${msg.nachricht}`,
                icon: "/icon-192.png",
              });
            } catch (_) {}
          });
        }
      } catch (_) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedAuftrag]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [nachrichten]);

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/chat/${selectedAuftrag}`, {
        absender,
        nachricht,
        typ,
        ...(anhang ? { anhang_name: anhang.name, anhang_mime: anhang.mime, anhang_data: anhang.data } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat", selectedAuftrag] });
      setNachricht("");
      setAnhang(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Nachricht gesendet" });
    },
    onError: (error: Error) => toast({ title: "Fehler", description: error.message, variant: "destructive" }),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > CHAT_ANHANG_MAX_BYTES) {
      toast({ title: "Datei zu gross", description: "Maximal 10 MB pro Anhang.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAnhang({ name: file.name, mime: file.type || "application/octet-stream", data: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((nachricht.trim() || anhang) && absender) sendMutation.mutate();
    }
  };

  const downloadAnhang = (n: Nachricht) => {
    if (!n.anhang_data) return;
    const a = document.createElement("a");
    a.href = n.anhang_data;
    a.download = n.anhang_name || "anhang";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString("de-CH") + " " + d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  };

  const getTypColor = (t: string) => TYP_OPTIONS.find((o) => o.value === t)?.color || "";
  const getTypLabel = (t: string) => TYP_OPTIONS.find((o) => o.value === t)?.label || t;

  const selectedAuftragData = auftraege.find((a) => a.id === selectedAuftrag);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Chat & Historie</h1>
          <p className="text-sm text-muted-foreground">Auftragsbezogene Kommunikation und Protokoll</p>
        </div>
      </div>

      {/* Auftrag wählen */}
      <Card className="p-4">
        <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
          <SelectTrigger><SelectValue placeholder="Auftrag für Chat wählen…" /></SelectTrigger>
          <SelectContent>
            {auftraege.map((a) => <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {selectedAuftrag && (
        <>
          {/* Absender + Typ */}
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Dein Name</label>
                <Input value={absender} onChange={(e) => setAbsender(e.target.value)} placeholder="Name eingeben…" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Kommunikationskanal</label>
                <Select value={typ} onValueChange={setTyp}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYP_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Chat */}
          <Card className="flex flex-col" style={{ height: "clamp(300px, 50vh, 500px)" }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-3/4" />)}</div>
              ) : nachrichten.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Noch keine Nachrichten.</p>
                  <p className="text-xs text-muted-foreground">Schreib die erste Nachricht für diesen Auftrag.</p>
                </div>
              ) : (
                nachrichten.map((n) => (
                  <div key={n.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{n.absender}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", getTypColor(n.typ))}>
                        {getTypLabel(n.typ)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{formatTime(n.erstellt)}</span>
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm max-w-[85%] space-y-2">
                      {n.nachricht && <p>{n.nachricht}</p>}
                      {n.anhang_data && (
                        n.anhang_mime?.startsWith("image/") ? (
                          <button type="button" onClick={() => downloadAnhang(n)} className="block">
                            <img src={n.anhang_data} alt={n.anhang_name || "Anhang"} className="max-h-48 rounded border" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => downloadAnhang(n)}
                            className="flex items-center gap-2 text-xs underline hover:no-underline"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{n.anhang_name || "Anhang"}</span>
                            <Download className="h-3.5 w-3.5 shrink-0" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Anhang-Vorschau vor dem Senden */}
            {anhang && (
              <div className="border-t px-3 pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate flex-1">{anhang.name}</span>
                <button type="button" onClick={() => { setAnhang(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="p-1 rounded hover:bg-muted">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Input */}
            <div className="border-t p-3 flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!absender}
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0"
                title="Datei anhängen"
                aria-label="Datei anhängen"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={absender ? "Nachricht schreiben… (Enter zum Senden)" : "Zuerst deinen Namen eingeben"}
                disabled={!absender}
                className="flex-1"
              />
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={(!nachricht.trim() && !anhang) || !absender || sendMutation.isPending}
                className="text-white shrink-0"
                style={{ background: "#e8620a" }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* Info Box */}
          <Card className="p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">
              Alle Nachrichten werden automatisch protokolliert und bleiben dauerhaft abrufbar.
              Aktualisierung alle 15 Sekunden.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
