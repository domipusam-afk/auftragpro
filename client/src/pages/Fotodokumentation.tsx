import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, Plus, Trash2, ImageIcon, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Auftrag } from "@shared/schema";

interface Foto {
  id: string;
  auftrag_id: string;
  kategorie: string;
  bezeichnung: string;
  datei_name: string;
  datei_data: string;
  datei_mime: string;
  notiz: string;
  erstellt: string;
}

const KATEGORIEN = [
  { value: "vorher", label: "Vorher-Dokumentation", color: "bg-blue-100 text-blue-800" },
  { value: "nachher", label: "Nachher-Dokumentation", color: "bg-green-100 text-green-800" },
  { value: "maengel", label: "Mängel-Dokumentation", color: "bg-red-100 text-red-800" },
  { value: "nachtrag", label: "Nachtrags-Dokumentation", color: "bg-orange-100 text-orange-800" },
];

export default function Fotodokumentation() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedAuftrag, setSelectedAuftrag] = useState("");
  const [kategorie, setKategorie] = useState("vorher");
  const [bezeichnung, setBezeichnung] = useState("");
  const [notiz, setNotiz] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [filterKat, setFilterKat] = useState("alle");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { data: auftraege = [] } = useQuery<Auftrag[]>({
    queryKey: ["/api/auftraege"],
    queryFn: () => apiRequest("GET", "/api/auftraege").then((r) => r.json()),
  });

  const { data: fotos = [], isLoading } = useQuery<Foto[]>({
    queryKey: ["/api/fotos", selectedAuftrag],
    queryFn: () => apiRequest("GET", `/api/fotos/${selectedAuftrag}`).then((r) => r.json()),
    enabled: !!selectedAuftrag,
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (!bezeichnung) setBezeichnung(file.name.replace(/\.[^.]+$/, ""));
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      let datei_data = "", datei_mime = "", datei_name = "";
      if (selectedFile) {
        datei_data = preview;
        datei_mime = selectedFile.type;
        datei_name = selectedFile.name;
      }
      return apiRequest("POST", `/api/fotos/${selectedAuftrag}`, {
        kategorie, bezeichnung, notiz, datei_data, datei_mime, datei_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fotos", selectedAuftrag] });
      setBezeichnung(""); setNotiz(""); setSelectedFile(null); setPreview("");
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Foto gespeichert" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/fotos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/fotos", selectedAuftrag] }),
  });

  const filtered = filterKat === "alle" ? fotos : fotos.filter((f) => f.kategorie === filterKat);

  const getKatColor = (kat: string) => KATEGORIEN.find((k) => k.value === kat)?.color || "";
  const getKatLabel = (kat: string) => KATEGORIEN.find((k) => k.value === kat)?.label || kat;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl font-bold" onClick={() => setLightboxSrc(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#1a3a6b" }}>
          <Camera className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Bild- / Fotodokumentation</h1>
          <p className="text-sm text-muted-foreground">Vorher, Nachher, Mängel und Nachträge dokumentieren</p>
        </div>
      </div>

      {/* Auftrag wählen */}
      <Card className="p-4 space-y-3">
        <Label className="text-sm font-semibold">Auftrag wählen</Label>
        <Select value={selectedAuftrag} onValueChange={setSelectedAuftrag}>
          <SelectTrigger><SelectValue placeholder="Auftrag wählen…" /></SelectTrigger>
          <SelectContent>
            {auftraege.map((a) => <SelectItem key={a.id} value={a.id}>{a.nr} — {a.titel}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {selectedAuftrag && (
        <>
          {/* Upload */}
          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold">Foto hinzufügen</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Kategorie</Label>
                <Select value={kategorie} onValueChange={setKategorie}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KATEGORIEN.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Bezeichnung</Label>
                <Input value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="Foto-Name" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Bild auswählen</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer mt-1"
              />
            </div>
            {preview && (
              <img src={preview} className="h-40 object-cover rounded-lg border" />
            )}
            <div>
              <Label className="text-xs">Notiz (optional)</Label>
              <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Bemerkung zum Foto…" />
            </div>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!bezeichnung || addMutation.isPending}
              className="w-full text-white"
              style={{ background: "#e8620a" }}
            >
              <Plus className="w-4 h-4 mr-2" /> Foto speichern
            </Button>
          </Card>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {[{ value: "alle", label: "Alle" }, ...KATEGORIEN].map((k) => (
              <button
                key={k.value}
                onClick={() => setFilterKat(k.value)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  filterKat === k.value ? "bg-[#1a3a6b] text-white border-[#1a3a6b]" : "text-muted-foreground border-border hover:border-[#1a3a6b]"
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Foto-Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-square w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-10 text-center">
              <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Noch keine Fotos in dieser Kategorie.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((f) => (
                <div key={f.id} className="group relative rounded-lg overflow-hidden border bg-muted aspect-square">
                  {f.datei_data ? (
                    <img
                      src={f.datei_data}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setLightboxSrc(f.datei_data)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-between p-2 opacity-0 group-hover:opacity-100">
                    <div className="flex justify-end">
                      <button
                        onClick={() => delMutation.mutate(f.id)}
                        className="bg-red-500 text-white rounded p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", getKatColor(f.kategorie))}>
                        {getKatLabel(f.kategorie)}
                      </span>
                      <p className="text-white text-xs font-medium mt-0.5 truncate">{f.bezeichnung}</p>
                    </div>
                  </div>
                  {/* Always visible label at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 group-hover:hidden">
                    <p className="text-white text-[10px] truncate">{f.bezeichnung}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
