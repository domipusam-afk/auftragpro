import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, FileText, Image, File, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Dokument {
  id: string;
  auftrag_id: string;
  name: string;
  mime_type: string;
  datei_data?: string;
  erstellt: string;
}

interface Foto {
  id: string;
  auftrag_id: string;
  bezeichnung: string;
  datei_name: string;
  datei_data: string;
  datei_mime: string;
  kategorie: string;
  erstellt: string;
}

interface Eingangsrechnung {
  id: string;
  lieferant: string;
  auftrag_id?: string;
  betrag: number;
  datum: string;
  datei_name?: string;
}

const MIME_ICONS: Record<string, any> = {
  "image/": Image,
  "application/pdf": FileText,
};

const getIcon = (mime: string) => {
  for (const [key, Icon] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(key)) return Icon;
  }
  return File;
};

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const FORMATE_INFO = [
  { gruppe: "Bilder", formate: "JPG, PNG, GIF, WebP, HEIC, TIFF, BMP, SVG" },
  { gruppe: "Dokumente", formate: "PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, ODT, ODS" },
  { gruppe: "CAD & Pläne", formate: "DWG, DXF, STEP, STP, IGS, IGES, STL, 3DS" },
  { gruppe: "Tabellen", formate: "CSV, XLS, XLSX, ODS" },
  { gruppe: "Audio", formate: "MP3, WAV, M4A, OGG, AAC" },
  { gruppe: "Video", formate: "MP4, MOV, AVI, MKV, WebM" },
  { gruppe: "Archiv", formate: "ZIP, RAR, 7Z, TAR, GZ" },
  { gruppe: "Sonstiges", formate: "TXT, RTF, XML, JSON, DXF, IFC, BCF" },
];

export default function DokumenteUebersicht() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"alle" | "formate">("alle");

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  // Load documents from all orders
  const { data: allDocs = [], isLoading: docsLoading } = useQuery<Dokument[]>({
    queryKey: ["/api/dokumente/alle"],
    queryFn: async () => {
      const results = await Promise.all(
        auftraege.map((a) =>
          apiRequest("GET", `/api/auftraege/${a.id}/dokumente`)
            .then((r) => r.json())
            .catch(() => [])
        )
      );
      return results.flat();
    },
    enabled: auftraege.length > 0,
  });

  const { data: allFotos = [] } = useQuery<Foto[]>({
    queryKey: ["/api/fotos/alle"],
    queryFn: async () => {
      const results = await Promise.all(
        auftraege.map((a) =>
          apiRequest("GET", `/api/fotos/${a.id}`)
            .then((r) => r.json())
            .catch(() => [])
        )
      );
      return results.flat();
    },
    enabled: auftraege.length > 0,
  });

  const getAuftragNr = (id: string) => {
    return auftraege.find((a) => a.id === id)?.nr || id;
  };

  const downloadFile = (data: string, name: string) => {
    const a = document.createElement("a");
    a.href = data;
    a.download = name;
    a.click();
  };

  // Combine all files
  const allFiles = [
    ...allDocs.map((d) => ({
      id: d.id,
      name: d.name,
      mime: d.mime_type || "application/octet-stream",
      auftrag_id: d.auftrag_id,
      data: d.datei_data || "",
      typ: "Dokument",
      erstellt: d.erstellt,
    })),
    ...allFotos.filter((f) => f.datei_data).map((f) => ({
      id: f.id,
      name: f.datei_name || f.bezeichnung,
      mime: f.datei_mime || "image/jpeg",
      auftrag_id: f.auftrag_id,
      data: f.datei_data,
      typ: "Foto",
      erstellt: f.erstellt,
    })),
  ];

  const filtered = allFiles.filter((f) => {
    const q = search.toLowerCase();
    return (
      !q ||
      f.name.toLowerCase().includes(q) ||
      getAuftragNr(f.auftrag_id).toLowerCase().includes(q) ||
      f.typ.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => (b.erstellt ?? '').localeCompare(a.erstellt ?? ''));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <FolderOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Dokumente</h1>
          <p className="text-sm text-muted-foreground">Alle Dateien zentral — über 40 Formate unterstützt</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[{ value: "alle", label: "Alle Dokumente" }, { value: "formate", label: "+40 Formate" }].map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value as any)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === t.value ? "border-[#e8620a] text-[#e8620a]" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === "alle" ? (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Dateiname, Auftragsnummer suchen…"
              className="pl-9"
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 text-center">
              <p className="text-xl font-bold">{allFiles.length}</p>
              <p className="text-xs text-muted-foreground">Dateien gesamt</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xl font-bold">{allDocs.length}</p>
              <p className="text-xs text-muted-foreground">Dokumente</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-xl font-bold">{allFotos.length}</p>
              <p className="text-xs text-muted-foreground">Fotos</p>
            </Card>
          </div>

          {/* Files List */}
          {docsLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <Card className="p-10 text-center">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? "Keine Dateien gefunden." : "Noch keine Dokumente vorhanden. Lade Dateien in den Auftragsplänen hoch."}
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="divide-y">
                {sorted.map((f) => {
                  const Icon = getIcon(f.mime);
                  const isImage = f.mime.startsWith("image/");
                  return (
                    <div key={f.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                      {isImage && f.data ? (
                        <img src={f.data} className="w-10 h-10 rounded object-cover shrink-0 border" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getAuftragNr(f.auftrag_id)} · {f.typ} · {new Date(f.erstellt).toLocaleDateString("de-CH")}
                        </p>
                      </div>
                      {f.data && (
                        <button
                          onClick={() => downloadFile(f.data, f.name)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title="Herunterladen"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      ) : (
        /* Formate Tab */
        <div className="space-y-4">
          <Card className="p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              AuftragsPro unterstützt über 40 verschiedene Dateiformate — von Bildern über CAD-Dateien bis hin zu Audiodateien.
              Alle Dateien werden sicher in der Datenbank gespeichert und sind jederzeit abrufbar.
            </p>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FORMATE_INFO.map((g) => (
              <Card key={g.gruppe} className="p-4">
                <p className="text-sm font-semibold mb-1">{g.gruppe}</p>
                <p className="text-xs text-muted-foreground">{g.formate}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
