import { useState, useRef, useCallback, useEffect, useMemo, useTransition } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, X, Save, Eye } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PdfVorlage {
  doc_typ: string;
  design: string;
  slogan: string;
  header_color: string;
  footer_color: string;
  logo_pos: string;
  zahlungsfrist: string;
  mahngebuehr: string;
  einleitung: string;
  schluss: string;
  fusstext: string; // Text unterhalb des QR-Zahlscheins (nur Rechnung, Seite 2)
  show_contact: boolean;
  show_page_num: boolean;
  logo_data_url: string | null;
  logo_scale: number;
  logo_offset_x: number; // 0-100%, freie horizontale Logo-Position im Header
  logo_offset_y: number; // 0-100%, freie vertikale Logo-Position im Header
  slogan_offset_x: number; // 0-100%, freie horizontale Slogan-Position (unabhängig vom Logo)
  watermark_data_url: string | null;
  watermark_opacity: number;
  watermark_size: number;
  watermark_pos: string;
  absender_pos_h: string;   // "links" | "mitte" | "rechts"
  absender_top_mm: number;  // Abstand oben in mm (für Couvertfenster)
  absender_left_mm: number; // Abstand links in mm (horizontaler Versatz)
  // Ansprechperson
  ansprechperson_aktiv: boolean;
  ansprechperson_label: string;  // z.B. "Ansprechperson" oder "Sachbearbeiter"
  ansprechperson_quelle: string; // "manuell" | "intern" | "extern"
  // Block-Positionen
  block_positions: {
    header?: { top: number; left: number; width: number };
    empfaenger?: { top: number; left: number; width: number };
    meta?: { top: number; left: number; width: number; align: string };
    ansprechperson?: { top: number; left: number; width: number };
  };
  // Positionstexte
  positionstexte: {
    pos: string;
    beschreibung: string;
    menge: string;
    einheit: string;
    preis: string;
    total: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

// WICHTIG: Nur Dokumenttypen anbieten, für die es tatsächlich einen echten
// PDF-Export gibt (eigene Route mit buildPdfHtml). "vorkalkulation" und
// "nachkalkulation" wurden entfernt: es existiert dafür kein echter PDF-Export,
// die Vorschau zeigte also ein Layout, das nie als reales Dokument entsteht.
// Falls dafür später ein PDF-Export gebaut wird, hier wieder ergänzen.
const DOC_TYPES = [
  { key: "offerte", label: "Offerte" },
  { key: "rechnung", label: "Rechnung" },
  { key: "mahnung", label: "Mahnung" },
  { key: "lieferschein", label: "Lieferschein" },
  { key: "auftragsbestaetigung", label: "Auftragsbestätigung" },
  { key: "lohnabrechnung", label: "Lohnabrechnung" },
  { key: "stundenabrechnung", label: "Stundenabrechnung" },
];

const WATERMARK_POSITIONS = [
  { value: "bottom", label: "Unten Mitte" },
  { value: "bottom-left", label: "Unten Links" },
  { value: "bottom-right", label: "Unten Rechts" },
  { value: "center", label: "Mitte" },
  { value: "top", label: "Oben Mitte" },
  { value: "full", label: "Ganzes Blatt" },
];

const DEFAULT_VORLAGE = (doc_typ: string): PdfVorlage => ({
  doc_typ,
  design: "A",
  slogan: "Qualität & Verlässlichkeit",
  header_color: "#6b4c2a",
  footer_color: "#1a3a6b",
  logo_pos: "links",
  zahlungsfrist: "30",
  mahngebuehr: "30.00",
  einleitung: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihr Vertrauen.",
  schluss: "Wir freuen uns auf Ihre Rückmeldung.\n\nMit freundlichen Grüssen\nSchneggenburger GmbH",
  fusstext: "",
  show_contact: true,
  show_page_num: true,
  logo_data_url: null,
  logo_scale: 100,
  logo_offset_x: 100,
  logo_offset_y: 0,
  slogan_offset_x: 0,
  watermark_data_url: null,
  watermark_opacity: 15,
  watermark_size: 60,
  watermark_pos: "bottom",
  absender_pos_h: "links",
  absender_top_mm: 55,
  absender_left_mm: 0,
  ansprechperson_aktiv: true,
  ansprechperson_label: "Ansprechperson",
  ansprechperson_quelle: "manuell",
  block_positions: {},
  positionstexte: { pos: "Pos.", beschreibung: "Beschreibung", menge: "Menge", einheit: "Einheit", preis: "Preis", total: "Total" },
});

// ─── Doc-Type Titel ──────────────────────────────────────────────────────────
// (getWatermarkStyle/getSampleRows/getSampleTableHeader/renderA4Preview — der alte
// JPEG-Vorschau-Renderer — wurden entfernt: die Vorschau nutzt jetzt ausschliesslich
// das echte Backend-PDF, siehe fetchPreview()/<iframe> weiter unten.)

function getDocTitle(docTyp: string): string {
  const titles: Record<string, string> = {
    offerte: "OFFERTE",
    rechnung: "RECHNUNG",
    mahnung: "MAHNUNG",
    lieferschein: "LIEFERSCHEIN",
    auftragsbestaetigung: "AUFTRAGSBESTÄTIGUNG",
    lohnabrechnung: "LOHNABRECHNUNG",
    stundenabrechnung: "STUNDENABRECHNUNG",
  };
  return titles[docTyp] ?? docTyp.toUpperCase();
}


// ─── Slider Component ────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function StyledSlider({ label, value, min, max, step = 1, unit = "%", onChange }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <Label className="text-xs text-gray-600">{label}</Label>
        <span className="text-xs font-medium text-gray-700">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: "#6b4c2a" }}
      />
    </div>
  );
}

// ─── Section Header (not collapsible, used in sub-sections) ─────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{title}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

// ─── Accordion Section (collapsible) ─────────────────────────────────────────

function AccordionSection({ title, icon, children, defaultOpen = true, badge }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{title}</span>
          {badge && <span className="ml-1">{badge}</span>}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className="text-gray-400 flex-shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Color Picker with Contrast Preview ──────────────────────────────────────

function contrastColorPreview(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const toLinear = (x: number) => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.179 ? "#1a1a1a" : "#ffffff";
}

function ColorPickerField({
  label, value, onChange, hint
}: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const textColor = contrastColorPreview(value || "#6b4c2a");
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-300 flex-shrink-0"
          style={{ padding: 2 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
          }}
          className="h-8 text-xs font-mono border border-gray-200 rounded-md px-2 flex-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
          maxLength={7}
          placeholder="#6b4c2a"
        />
      </div>
      {/* Kontrast-Vorschau */}
      <div
        className="rounded px-2 py-1 text-xs flex items-center justify-between"
        style={{ background: value || "#6b4c2a", color: textColor }}
      >
        <span style={{ fontWeight: 600, fontSize: 10 }}>Schrift auf diesem Hintergrund</span>
        <span style={{ fontSize: 9, opacity: 0.85 }}>{textColor === "#ffffff" ? "hell (Auto)" : "dunkel (Auto)"}</span>
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── File Upload Field ───────────────────────────────────────────────────────

interface FileUploadProps {
  label: string;
  dataUrl: string | null;
  onUpload: (dataUrl: string) => void;
  onRemove: () => void;
  previewSize?: number;
}

function FileUploadField({ label, dataUrl, onUpload, onRemove, previewSize = 48 }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) onUpload(result);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex items-center gap-2 flex-wrap">
        {dataUrl && (
          <img
            src={dataUrl}
            alt="Vorschau"
            style={{ height: previewSize, maxWidth: previewSize * 2, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 4 }}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="text-xs h-7 px-2 gap-1"
        >
          <Upload className="w-3 h-3" />
          {dataUrl ? "Ändern" : "Hochladen"}
        </Button>
        {dataUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-xs h-7 px-2 gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <X className="w-3 h-3" />
            Entfernen
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

// ─── Design Card ─────────────────────────────────────────────────────────────

interface DesignCardProps {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  previewContent: React.ReactNode;
}

function DesignCard({ id, title, description, selected, onClick, previewContent }: DesignCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border-2 p-1.5 text-left transition-all cursor-pointer ${
        selected ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
      style={{ borderColor: selected ? "#e8620a" : undefined }}
    >
      <div className="rounded overflow-hidden mb-1 bg-gray-50 border border-gray-100" style={{ height: 52 }}>
        {previewContent}
      </div>
      <div className="font-semibold text-xs truncate" style={{ color: selected ? "#e8620a" : "#374151", fontSize: 10 }}>{id}: {title}</div>
      <div className="leading-tight mt-0.5 truncate" style={{ fontSize: 9, color: "#9ca3af" }}>{description}</div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PdfVorlagenTab() {
  const { toast } = useToast();

  const [activeDoc, setActiveDoc] = useState<string>("offerte");
  // Echte PDF-Vorschau: direktes PDF vom Backend (Puppeteer-gerendert), angezeigt via
  // Object-URL in einem <iframe> — der native Browser-PDF-Viewer übernimmt Mehrseiten-
  // Navigation (z.B. Rechnung: Seite 2 = QR-Zahlschein) selbst, keine eigene Paging-UI nötig.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Schutz gegen Race Conditions: nur die Antwort der zuletzt gestarteten Anfrage darf
  // den State noch aktualisieren. Ohne dies könnte eine ältere, langsamere Antwort eine
  // neuere überschreiben, wenn schnell hintereinander getippt wird.
  const previewSeqRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const [vorlagen, setVorlagen] = useState<Record<string, PdfVorlage>>(() => {
    const init: Record<string, PdfVorlage> = {};
    DOC_TYPES.forEach(({ key }) => { init[key] = DEFAULT_VORLAGE(key); });
    return init;
  });

  // Tracks the last saved state per doc_typ (for "unsaved changes" indicator)
  const [savedVorlagen, setSavedVorlagen] = useState<Record<string, PdfVorlage>>({});

  // ─── Fetch all vorlagen ───────────────────────────────
  const { isLoading, data: fetchedVorlagen } = useQuery<PdfVorlage[]>({
    queryKey: ["/api/pdf-vorlagen"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pdf-vorlagen");
      return res.json();
    },
  });

  // TanStack Query v5: onSuccess wurde entfernt → useEffect verwenden
  useEffect(() => {
    if (!fetchedVorlagen || !Array.isArray(fetchedVorlagen)) return;
    setVorlagen((prev) => {
      const next = { ...prev };
      fetchedVorlagen.forEach((v) => {
        if (v.doc_typ) next[v.doc_typ] = { ...DEFAULT_VORLAGE(v.doc_typ), ...v };
      });
      return next;
    });
    setSavedVorlagen((prev) => {
      const next = { ...prev };
      fetchedVorlagen.forEach((v) => {
        if (v.doc_typ) next[v.doc_typ] = { ...DEFAULT_VORLAGE(v.doc_typ), ...v };
      });
      return next;
    });
  }, [fetchedVorlagen]);

  // ─── Save mutation ────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (vorlage: PdfVorlage) => {
      const res = await apiRequest("PUT", `/api/pdf-vorlagen/${vorlage.doc_typ}`, vorlage);
      return res.json();
    },
    onSuccess: (_saved: PdfVorlage, submitted: PdfVorlage) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pdf-vorlagen"] });
      // Update savedVorlagen with the just-saved version (submitted kommt vom mutate-Aufruf)
      setSavedVorlagen((prev) => ({ ...prev, [submitted.doc_typ]: submitted }));
      toast({ title: "Vorlage gespeichert ✓", description: `${getDocTitle(submitted.doc_typ)} wurde erfolgreich gespeichert.` });
    },
    onError: () => {
      toast({ title: "Fehler beim Speichern", description: "Bitte versuchen Sie es erneut.", variant: "destructive" });
    },
  });

  const vorlage = vorlagen[activeDoc] ?? DEFAULT_VORLAGE(activeDoc);

  const updateVorlage = useCallback((updates: Partial<PdfVorlage>) => {
    setVorlagen((prev) => ({
      ...prev,
      [activeDoc]: { ...prev[activeDoc], ...updates },
    }));
  }, [activeDoc]);

  const handleSave = () => saveMutation.mutate(vorlage);

  // ─── Echte PDF-Vorschau: Debounced fetch vom Backend ────────────────
  const fetchPreview = useCallback((v: PdfVorlage, docTyp: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const mySeq = ++previewSeqRef.current;
      setPreviewLoading(true);
      setPreviewError(false);
      try {
        const resp = await fetch("/api/pdf-vorlagen/vorschau", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vorlage: v, doc_typ: docTyp }),
        });
        if (!resp.ok) throw new Error("Fehler beim Rendern");
        const blob = await resp.blob();
        // Race-Schutz: falls inzwischen eine neuere Anfrage gestartet wurde, diese
        // (jetzt veraltete) Antwort verwerfen — nicht mehr in den State schreiben.
        if (mySeq !== previewSeqRef.current) return;
        const objectUrl = URL.createObjectURL(blob);
        // Alte Object-URL erst NACH dem Setzen der neuen freigeben, damit das <iframe>
        // nie kurzzeitig auf eine bereits ungültige URL zeigt (verhindert Flackern/Fehler).
        const prevUrl = previewUrlRef.current;
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
        if (prevUrl) URL.revokeObjectURL(prevUrl);
      } catch {
        if (mySeq !== previewSeqRef.current) return;
        setPreviewError(true);
      } finally {
        if (mySeq === previewSeqRef.current) setPreviewLoading(false);
      }
    }, 800); // 800ms Debounce
  }, []);

  // Vorschau neu laden wenn sich Vorlage oder Dokumenttyp ändert
  useEffect(() => {
    fetchPreview(vorlage, activeDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorlage, activeDoc]);

  // Cleanup bei Unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // ─── Design preview mini content ─────────────────────
  // WICHTIG: Nur Designs anbieten, die im echten PDF-Generator (buildPdfHtml,
  // server/routes.ts) auch tatsächlich als eigenständiges Layout ankommen.
  // "B" (Modern), "C" (Minimal) und "E" (Elegant) werden serverseitig aktuell
  // NICHT eigenständig gerendert (der finale Rückgabepfad kennt nur "G" und
  // einen "A"-Fallback für alles andere) — sie würden in der Auswahl etwas
  // anderes zeigen als im echten PDF. Deshalb bewusst deaktiviert, bis sie
  // als eigenes Feature nachgebaut werden. Nicht einfach löschen, damit die
  // Definitionen für eine spätere Wiederaufnahme erhalten bleiben.
  const allDesignPreviews = [
    {
      id: "A",
      title: "Klassisch",
      description: "Weisser BG, Trennlinie",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ width: 18, height: 10, background: vorlage.header_color, borderRadius: 2 }} />
            <div style={{ fontSize: 7, color: "#666" }}>RECHNUNG</div>
          </div>
          <div style={{ borderBottom: `1.5px solid ${vorlage.header_color}`, margin: "2px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 3, background: "#e5e7eb", borderRadius: 1, width: `${70 - i * 15}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "B",
      title: "Modern",
      description: "Farbiger Header-Balken",
      previewContent: (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ background: vorlage.header_color, color: "white", padding: "3px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ width: 14, height: 8, background: "rgba(255,255,255,0.4)", borderRadius: 1 }} />
            <div style={{ fontSize: 6.5, fontWeight: 700 }}>RECHNUNG</div>
          </div>
          <div style={{ padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1.5, flex: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 3, background: "#e5e7eb", borderRadius: 1, width: `${65 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "C",
      title: "Minimal",
      description: "Nur kleines Logo",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: vorlage.header_color }}>SG</div>
            <div style={{ fontSize: 6, color: "#aaa" }}>Schneggenburger</div>
          </div>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: 2 }}>
            <div style={{ fontSize: 7, fontWeight: 300, color: "#555", letterSpacing: 0.5 }}>RECHNUNG</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 2.5, background: "#e5e7eb", borderRadius: 1, width: `${60 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    {
      id: "E",
      title: "Elegant",
      description: "Goldene Akzentlinie",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <div style={{ fontSize: 8, fontWeight: 800, color: vorlage.header_color, letterSpacing: 1 }}>SG</div>
            <div style={{ fontSize: 6, color: "#999", textAlign: "right" }}>
              <div style={{ fontWeight: 600 }}>RECHNUNG</div>
              <div>#2024-001</div>
            </div>
          </div>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${vorlage.header_color}, ${vorlage.footer_color})`, borderRadius: 1, marginBottom: 4 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1.5, flex: 1 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 2.5, background: "#e5e7eb", borderRadius: 1, width: `${80 - i * 10}%` }} />)}
          </div>
          <div style={{ height: 1, background: `linear-gradient(90deg, ${vorlage.footer_color}, ${vorlage.header_color})`, borderRadius: 1, marginTop: 3 }} />
        </div>
      ),
    },
    {
      id: "G",
      title: "Swiss Classic",
      description: "Schweizer Geschäftsbrief",
      previewContent: (
        <div style={{ padding: "4px 6px", height: "100%", display: "flex", flexDirection: "column", background: "white" }}>
          <div style={{ borderTop: `2px solid ${vorlage.header_color}`, paddingTop: 3 }}>
            <div style={{ fontSize: 6.5, color: "#333", fontWeight: 600 }}>Schneggenburger GmbH</div>
            <div style={{ fontSize: 5.5, color: "#888" }}>Hefenhoferstr. 7 · 8580 Sommeri</div>
          </div>
          <div style={{ margin: "3px 0", borderBottom: "0.5px solid #ddd" }} />
          <div style={{ fontSize: 7, color: "#555", marginBottom: 2 }}>
            <div>Musterfirma AG, 8001 Zürich</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#111" }}>RECHNUNG</div>
            <div style={{ fontSize: 5.5, color: "#888" }}>15.04.2024</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[1, 2].map(i => <div key={i} style={{ height: 2.5, background: "#e8e8e8", borderRadius: 1, width: `${65 - i * 10}%` }} />)}
          </div>
        </div>
      ),
    },
    ];

  // Aktiv anwählbar sind nur A und G (siehe Kommentar oben). Bereits gespeicherte
  // ältere Vorlagen mit design B/C/E werden serverseitig ohnehin wie A behandelt;
  // die Karte für die zuvor gewählte, jetzt deaktivierte Design-ID bleibt sichtbar
  // (aber ausgegraut/nicht auswählbar), damit der Nutzer sieht, was aktuell gespeichert ist.
  const designPreviews = allDesignPreviews.filter(dp => dp.id === "A" || dp.id === "G");
  // Fallback wie im Backend (buildPdfHtml): jeder unbekannte/deaktivierte Design-Wert
  // (z.B. altes "B"/"C"/"E" oder ein Fremdwert) wird wie "A" gerendert. Damit die
  // Auswahl-Karten das widerspiegeln, gilt "A" auch in der UI als ausgewählt, sobald
  // der gespeicherte Wert keiner aktiven Karte entspricht.
  const effectiveSelectedDesign = designPreviews.some(dp => dp.id === vorlage.design) ? vorlage.design : "A";

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-1">
        {DOC_TYPES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveDoc(key)}
            className={`px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeDoc === key
                ? "text-white"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            }`}
            style={activeDoc === key ? { background: "#6b4c2a" } : undefined}
          >
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {label}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ─── Left: Config (Accordion-Sektionen) ────── */}
          <div className="space-y-0 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">

            {/* 1. Design-Auswahl */}
            <AccordionSection title="Design" defaultOpen={true}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
            >
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {designPreviews.map((dp) => (
                  <DesignCard
                    key={dp.id}
                    id={dp.id}
                    title={dp.title}
                    description={dp.description}
                    selected={effectiveSelectedDesign === dp.id}
                    onClick={() => updateVorlage({ design: dp.id })}
                    previewContent={dp.previewContent}
                  />
                ))}
              </div>
            </AccordionSection>

            {/* 2. Farben */}
            <AccordionSection title="Farben" defaultOpen={true}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/><path d="M12 12 2 12"/></svg>}
            >
              <div className="space-y-4">
                <ColorPickerField
                  label="Header-Farbe"
                  value={vorlage.header_color}
                  onChange={(v) => updateVorlage({ header_color: v })}
                  hint="Schriftfarbe passt sich automatisch an (WCAG-Kontrast)"
                />
                <ColorPickerField
                  label="Footer-Farbe"
                  value={vorlage.footer_color}
                  onChange={(v) => updateVorlage({ footer_color: v })}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Slogan / Untertitel</Label>
                  <textarea
                    value={vorlage.slogan}
                    onChange={(e) => updateVorlage({ slogan: e.target.value })}
                    placeholder={"z.B. Qualit\u00e4t & Verl\u00e4sslichkeit\nIhr Partner f\u00fcr Metallbau"}
                    rows={2}
                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 resize-y"
                  />
                  <p className="text-xs text-gray-400">Enter für Zeilenumbruch — der Slogan erscheint dann untereinander unter dem Logo.</p>
                  <StyledSlider
                    label="Slogan-Position horizontal"
                    value={vorlage.slogan_offset_x ?? 0}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(v) => updateVorlage({ slogan_offset_x: v })}
                  />
                </div>
              </div>
            </AccordionSection>

            {/* 3. Logo */}
            <AccordionSection title="Logo" defaultOpen={false}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
            >
              <FileUploadField
                label="Logo-Datei"
                dataUrl={vorlage.logo_data_url}
                onUpload={(url) => updateVorlage({ logo_data_url: url })}
                onRemove={() => updateVorlage({ logo_data_url: null })}
                previewSize={40}
              />
              {vorlage.logo_data_url && (
                <>
                  <StyledSlider
                    label="Logo-Grösse"
                    value={vorlage.logo_scale}
                    min={30}
                    max={400}
                    onChange={(v) => updateVorlage({ logo_scale: v })}
                  />
                  <StyledSlider
                    label="Logo-Position horizontal"
                    value={vorlage.logo_offset_x ?? 100}
                    min={0}
                    max={100}
                    onChange={(v) => updateVorlage({ logo_offset_x: v })}
                  />
                  <StyledSlider
                    label="Logo-Position vertikal"
                    value={vorlage.logo_offset_y ?? 0}
                    min={0}
                    max={100}
                    onChange={(v) => updateVorlage({ logo_offset_y: v })}
                  />
                </>
              )}
            </AccordionSection>

            {/* 4. Empfänger-Position — für ALLE Dokumente */}
            <AccordionSection title="Empfänger-Position" defaultOpen={true}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Horizontale Ausrichtung</Label>
                  <div className="flex gap-2">
                    {([["links", "◀ Links"], ["mitte", "● Mitte"], ["rechts", "Rechts ▶"]] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => updateVorlage({ absender_pos_h: val })}
                        className={`flex-1 py-1.5 px-2 rounded text-xs border transition-colors ${
                          vorlage.absender_pos_h === val
                            ? "text-white border-transparent"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                        style={vorlage.absender_pos_h === val ? { background: "#6b4c2a", borderColor: "#6b4c2a" } : undefined}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Couvert-Fenster Position — für ALLE Dokument-Typen */}
                <div className="rounded bg-blue-50 border border-blue-100 px-2.5 py-1.5 text-xs text-blue-700">
                  Schweizer Norm SN (C5/6 Couvert): oben 55 mm, links 20 mm
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Abstand oben (mm)</Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={10}
                        max={150}
                        value={vorlage.absender_top_mm ?? 55}
                        onChange={(e) => updateVorlage({ absender_top_mm: Number(e.target.value) })}
                        className="h-8 text-xs border border-gray-200 rounded-md px-2 w-20 focus:outline-none"
                      />
                      <span className="text-xs text-gray-400">mm</span>
                    </div>
                    <p className="text-xs text-gray-400">SN-Norm: 55 mm (A4 2× gefaltet)</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Abstand links (mm)</Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={150}
                        value={vorlage.absender_left_mm ?? 20}
                        onChange={(e) => updateVorlage({ absender_left_mm: Number(e.target.value) })}
                        className="h-8 text-xs border border-gray-200 rounded-md px-2 w-20 focus:outline-none"
                      />
                      <span className="text-xs text-gray-400">mm</span>
                    </div>
                    <p className="text-xs text-gray-400">SN-Norm: 20 mm vom Rand</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-xs text-gray-400 bg-gray-50 rounded p-2">
                  <div><span className="font-semibold text-gray-600">C5/6 (DL)</span><br/>oben 21 mm<br/>links 12 mm (SN)</div>
                  <div><span className="font-semibold text-gray-600">C5</span><br/>oben 65 mm<br/>links 12 mm (SN)</div>
                  <div><span className="font-semibold text-gray-600">A4 gefaltet</span><br/>oben 55 mm<br/>links 20 mm (⭐)</div>
                </div>
              </div>
            </AccordionSection>

            {/* 5. Dokument-Texte */}
            <AccordionSection title="Texte" defaultOpen={false}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
            >
              <div className="space-y-3">
                {(activeDoc === "rechnung" || activeDoc === "offerte") && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Zahlungsfrist (Tage)</Label>
                    <input
                      type="number"
                      value={vorlage.zahlungsfrist}
                      onChange={(e) => updateVorlage({ zahlungsfrist: e.target.value })}
                      placeholder="30"
                      min="1"
                      className="w-full h-8 border border-gray-200 rounded-md px-2 text-xs focus:outline-none"
                    />
                  </div>
                )}
                {activeDoc === "mahnung" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Mahngebühr (CHF)</Label>
                    <input
                      type="text"
                      value={vorlage.mahngebuehr}
                      onChange={(e) => updateVorlage({ mahngebuehr: e.target.value })}
                      placeholder="30.00"
                      className="w-full h-8 border border-gray-200 rounded-md px-2 text-xs focus:outline-none"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Einleitung</Label>
                  <textarea
                    value={vorlage.einleitung}
                    onChange={(e) => updateVorlage({ einleitung: e.target.value })}
                    rows={3}
                    className="w-full border border-gray-200 rounded-md p-2 text-xs resize-y focus:outline-none focus:ring-1"
                    placeholder="Einleitungstext..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Schluss / Grussformel</Label>
                  <textarea
                    value={vorlage.schluss}
                    onChange={(e) => updateVorlage({ schluss: e.target.value })}
                    rows={3}
                    className="w-full border border-gray-200 rounded-md p-2 text-xs resize-y focus:outline-none focus:ring-1"
                    placeholder="Schlusstext..."
                  />
                </div>
                {activeDoc === "rechnung" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600">Fusstext (erscheint unter dem QR-Zahlschein, Seite 2)</Label>
                    <textarea
                      value={vorlage.fusstext}
                      onChange={(e) => updateVorlage({ fusstext: e.target.value })}
                      rows={6}
                      className="w-full border border-gray-200 rounded-md p-2 text-xs resize-y focus:outline-none focus:ring-1"
                      placeholder="z.B. Zahlungsbedingungen, Eigentumsvorbehalt, Reklamationsfrist, MWST-Nummer..."
                    />
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* 6. Wasserzeichen */}
            <AccordionSection title="Wasserzeichen" defaultOpen={false}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            >
              <FileUploadField
                label="Wasserzeichen-Datei"
                dataUrl={vorlage.watermark_data_url}
                onUpload={(url) => updateVorlage({ watermark_data_url: url })}
                onRemove={() => updateVorlage({ watermark_data_url: null })}
                previewSize={36}
              />
              {vorlage.watermark_data_url && (
                <div className="space-y-3">
                  <StyledSlider
                    label="Transparenz"
                    value={vorlage.watermark_opacity}
                    min={5}
                    max={100}
                    onChange={(v) => updateVorlage({ watermark_opacity: v })}
                  />
                  <StyledSlider
                    label="Grösse"
                    value={vorlage.watermark_size}
                    min={10}
                    max={300}
                    unit="%"
                    onChange={(v) => updateVorlage({ watermark_size: v })}
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Position</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {WATERMARK_POSITIONS.map(({ value, label }) => (
                        <label
                          key={value}
                          className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer text-xs transition-colors ${
                            vorlage.watermark_pos === value
                              ? "border-orange-400 bg-orange-50 text-orange-700"
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                          style={vorlage.watermark_pos === value ? { borderColor: "#e8620a" } : undefined}
                        >
                          <input
                            type="radio"
                            name={`watermark_pos_${activeDoc}`}
                            value={value}
                            checked={vorlage.watermark_pos === value}
                            onChange={() => updateVorlage({ watermark_pos: value })}
                            className="sr-only"
                          />
                          <div
                            className={`w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center ${
                              vorlage.watermark_pos === value ? "border-orange-500" : "border-gray-300"
                            }`}
                            style={vorlage.watermark_pos === value ? { borderColor: "#e8620a" } : undefined}
                          >
                            {vorlage.watermark_pos === value && (
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#e8620a" }} />
                            )}
                          </div>
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </AccordionSection>

            {/* 7. Ansprechperson */}
            <AccordionSection title="Ansprechperson" defaultOpen={false}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
            >
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => updateVorlage({ ansprechperson_aktiv: !vorlage.ansprechperson_aktiv })}
                    className="w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0"
                    style={{ background: vorlage.ansprechperson_aktiv ? "#6b4c2a" : "#e5e7eb" }}
                  >
                    <div
                      className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow"
                      style={{ transform: vorlage.ansprechperson_aktiv ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">Ansprechperson anzeigen</span>
                </label>
                {vorlage.ansprechperson_aktiv && (
                  <div className="space-y-2 pl-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Bezeichnung / Label</Label>
                      <input
                        type="text"
                        value={vorlage.ansprechperson_label}
                        onChange={(e) => updateVorlage({ ansprechperson_label: e.target.value })}
                        placeholder="z.B. Ansprechperson, Sachbearbeiter"
                        className="w-full h-8 border border-gray-200 rounded-md px-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-600">Quelle</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          ["intern", "Intern"],
                          ["extern", "Extern"],
                          ["manuell", "Manuell"],
                        ] as const).map(([val, lbl]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateVorlage({ ansprechperson_quelle: val })}
                            className={`py-1.5 px-2 rounded text-xs border transition-colors text-center ${
                              vorlage.ansprechperson_quelle === val
                                ? "text-white border-transparent"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                            }`}
                            style={vorlage.ansprechperson_quelle === val ? { background: "#6b4c2a", borderColor: "#6b4c2a" } : undefined}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">
                        {vorlage.ansprechperson_quelle === "intern" && "Zugewiesener Mitarbeiter aus dem Auftrag."}
                        {vorlage.ansprechperson_quelle === "extern" && "Kundenkontakt (Ansprechperson beim Kunden)."}
                        {vorlage.ansprechperson_quelle === "manuell" && "Beim Erstellen des Dokuments manuell eingeben."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* 8. Tabellenspalten */}
            <AccordionSection title="Tabellenspalten" defaultOpen={false}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>}
            >
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["pos", "Pos."],
                  ["beschreibung", "Beschreibung"],
                  ["menge", "Menge"],
                  ["einheit", "Einheit"],
                  ["preis", "Preis"],
                  ["total", "Total"],
                ] as const).map(([field, placeholder]) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs text-gray-600 capitalize">{placeholder}</Label>
                    <input
                      type="text"
                      value={(vorlage.positionstexte as any)?.[field] ?? placeholder}
                      onChange={(e) => updateVorlage({
                        positionstexte: {
                          ...(vorlage.positionstexte || {}),
                          [field]: e.target.value
                        }
                      })}
                      placeholder={placeholder}
                      className="w-full h-7 border border-gray-200 rounded-md px-2 text-xs focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </AccordionSection>

            {/* 9. Footer */}
            <AccordionSection title="Footer" defaultOpen={false}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
            >
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => updateVorlage({ show_contact: !vorlage.show_contact })}
                    className="w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0"
                    style={vorlage.show_contact ? { background: "#6b4c2a" } : { background: "#e5e7eb" }}
                  >
                    <div
                      className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow"
                      style={{ transform: vorlage.show_contact ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">Kontaktdaten im Footer anzeigen</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => updateVorlage({ show_page_num: !vorlage.show_page_num })}
                    className="w-9 h-5 rounded-full transition-colors relative cursor-pointer flex-shrink-0"
                    style={vorlage.show_page_num ? { background: "#6b4c2a" } : { background: "#e5e7eb" }}
                  >
                    <div
                      className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow"
                      style={{ transform: vorlage.show_page_num ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </div>
                  <span className="text-xs text-gray-600">Seitennummer anzeigen</span>
                </label>
              </div>
            </AccordionSection>

            {/* Spacer */}
            <div className="h-4" />
          </div>

          {/* ─── Right: Live Preview ───────────────────── */}
          <div className="lg:sticky lg:top-4 self-start">
            {/* Live-Vorschau Header */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#22c55e" }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#22c55e" }} />
                </span>
                <span className="text-sm font-medium text-gray-700">Live-Vorschau</span>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#f3f4f6", color: "#6b4c2a" }}>{getDocTitle(activeDoc)}</span>
              </div>
              {(() => {
                const saved = savedVorlagen[activeDoc];
                const isUnsaved = saved
                  ? JSON.stringify({ ...vorlage, logo_data_url: null, watermark_data_url: null }) !==
                    JSON.stringify({ ...saved, logo_data_url: null, watermark_data_url: null })
                  : false;
                return isUnsaved ? (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#fef3c7", color: "#92400e" }}>● Ungespeichert</span>
                ) : saved ? (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#d1fae5", color: "#065f46" }}>✓ Gespeichert</span>
                ) : null;
              })()}
            </div>
            {/* A4-Vorschau — echtes Puppeteer-Rendering (1:1 mit generiertem PDF) */}
            <div
              style={{
                width: "100%",
                maxWidth: 640,
                aspectRatio: "1 / 1.4142",
                background: "#f3f3f3",
                boxShadow: "0 4px 24px rgba(0,0,0,0.15), 0 1.5px 6px rgba(0,0,0,0.08)",
                overflow: "hidden",
                position: "relative",
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Vorheriges PDF als Hintergrund (verhindert Flackern beim Nachladen).
                  Natives Browser-PDF-Rendering — exakt byte-identisch mit dem echten PDF,
                  inkl. nativer Mehrseiten-Navigation (z.B. Rechnung: Seite 2 = QR-Zahlschein). */}
              {previewUrl && (
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  title="PDF-Vorschau"
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                    display: "block",
                    opacity: previewLoading ? 0.45 : 1,
                    transition: "opacity 0.25s",
                  }}
                />
              )}
              {/* Ladeindikator */}
              {previewLoading && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  background: previewUrl ? "rgba(255,255,255,0.4)" : "#f8f7f5",
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b4c2a" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                  <span style={{ fontSize: 11, color: "#6b4c2a", fontWeight: 500 }}>Vorschau wird gerendert…</span>
                </div>
              )}
              {/* Fehlerzustand */}
              {previewError && !previewLoading && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "#fff5f5",
                }}>
                  <span style={{ fontSize: 28 }}>&#x26A0;</span>
                  <span style={{ fontSize: 11, color: "#991b1b" }}>Vorschau konnte nicht geladen werden</span>
                  <button
                    type="button"
                    onClick={() => fetchPreview(vorlage, activeDoc)}
                    style={{ fontSize: 11, color: "#6b4c2a", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                  >Erneut versuchen</button>
                </div>
              )}
              {/* Initialer Leerzustand (noch kein PDF, kein Fehler) */}
              {!previewUrl && !previewLoading && !previewError && (
                <div style={{ fontSize: 11, color: "#999", textAlign: "center" }}>Vorschau wird geladen…</div>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-400">Echte Vorschau — 1:1 identisch mit generiertem PDF{activeDoc === "rechnung" ? " (Seite 2 im PDF-Viewer: QR-Zahlschein)" : ""}</p>
              <button
                type="button"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="text-xs px-2.5 py-1 rounded text-white flex items-center gap-1"
                style={{ background: "#6b4c2a" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {saveMutation.isPending ? "..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="gap-2 text-white"
          style={{ background: "#6b4c2a", borderColor: "#6b4c2a" }}
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Speichert..." : "Vorlage speichern"}
        </Button>
      </div>
    </div>
  );
}
