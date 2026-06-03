import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Pencil, Trash2, ShieldOff, ShieldCheck, Eye, EyeOff, SlidersHorizontal, Check } from "lucide-react";
import { formatDate } from "@/lib/format";
import { ALLE_MODULE, standardBerechtigungen, ModulKey } from "@/lib/permissions";

interface Benutzer {
  id: string;
  benutzername: string;
  rolle: "admin" | "mitarbeiter";
  totp_aktiv: boolean;
  aktiv: boolean;
  erstellt: string;
  berechtigungen: string | null;
}

// ─── Berechtigungs-Modal ────────────────────────────────────────────────────
function BerechtigungenModal({
  benutzer,
  onClose,
}: {
  benutzer: Benutzer;
  onClose: () => void;
}) {
  const { toast } = useToast();

  // Aktuelle Berechtigungen laden (oder Standard)
  const initPerms = (): Record<ModulKey, boolean> => {
    if (!benutzer.berechtigungen) return standardBerechtigungen();
    try { return JSON.parse(benutzer.berechtigungen); } catch { return standardBerechtigungen(); }
  };

  const [perms, setPerms] = useState<Record<ModulKey, boolean>>(initPerms);

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/benutzer/${benutzer.id}`, { berechtigungen: perms });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benutzer"] });
      toast({ title: "✅ Berechtigungen gespeichert" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const toggle = (key: ModulKey) => setPerms(p => ({ ...p, [key]: !p[key] }));

  const alleAn = () => setPerms(Object.fromEntries(ALLE_MODULE.map(m => [m.key, true])) as Record<ModulKey, boolean>);
  const alleAus = () => setPerms(Object.fromEntries(ALLE_MODULE.map(m => [m.key, false])) as Record<ModulKey, boolean>);
  const standard = () => setPerms(standardBerechtigungen());

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Berechtigungen — {benutzer.benutzername.split("@")[0]}
          </DialogTitle>
        </DialogHeader>

        {benutzer.rolle === "admin" ? (
          <div className="py-4 text-center text-muted-foreground text-sm">
            Admins haben automatisch vollen Zugriff auf alle Module.
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Schnellaktionen */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={alleAn} className="text-xs">Alle aktivieren</Button>
              <Button size="sm" variant="outline" onClick={alleAus} className="text-xs">Alle deaktivieren</Button>
              <Button size="sm" variant="outline" onClick={standard} className="text-xs">Standard wiederherstellen</Button>
            </div>

            {/* Modul-Liste */}
            <div className="space-y-1.5">
              {ALLE_MODULE.map((modul) => (
                <div
                  key={modul.key}
                  onClick={() => toggle(modul.key)}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer border transition-colors ${
                    perms[modul.key]
                      ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                      : "bg-muted/30 border-transparent hover:bg-muted/50"
                  }`}
                  data-testid={`perm-toggle-${modul.key}`}
                >
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    perms[modul.key] ? "bg-primary border-primary" : "border-muted-foreground/40"
                  }`}>
                    {perms[modul.key] && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-none ${perms[modul.key] ? "text-foreground" : "text-muted-foreground"}`}>
                      {modul.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{modul.beschreibung}</p>
                  </div>
                  <Badge variant={perms[modul.key] ? "default" : "secondary"} className="text-[10px] shrink-0 mt-0.5">
                    {perms[modul.key] ? "Erlaubt" : "Gesperrt"}
                  </Badge>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              data-testid="button-save-perms"
            >
              {saveMut.isPending ? "Wird gespeichert…" : "Berechtigungen speichern"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Hauptseite ─────────────────────────────────────────────────────────────
export default function Benutzerverwaltung() {
  const { toast } = useToast();
  const { isAdmin, user: currentUser } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<Benutzer | null>(null);
  const [permUser, setPermUser] = useState<Benutzer | null>(null);
  const [newName, setNewName] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newRolle, setNewRolle] = useState<"admin" | "mitarbeiter">("mitarbeiter");
  const [showPw, setShowPw] = useState(false);

  const { data: benutzer = [], isLoading } = useQuery<Benutzer[]>({
    queryKey: ["/api/benutzer"],
    enabled: isAdmin,
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/benutzer", {
        benutzername: newName,
        passwort: newPw,
        rolle: newRolle,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benutzer"] });
      toast({ title: "✅ Benutzer erstellt" });
      setShowAdd(false);
      setNewName(""); setNewPw(""); setNewRolle("mitarbeiter");
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: async (updates: Partial<{ benutzername: string; rolle: string; aktiv: boolean; passwort: string }>) => {
      if (!editUser) return;
      const res = await apiRequest("PATCH", `/api/benutzer/${editUser.id}`, updates);
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benutzer"] });
      toast({ title: "✅ Gespeichert" });
      setEditUser(null);
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/benutzer/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benutzer"] });
      toast({ title: "Benutzer gelöscht" });
    },
  });

  const reset2faMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/benutzer/${id}/reset-2fa`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benutzer"] });
      toast({ title: "✅ 2FA zurückgesetzt" });
    },
  });

  if (!isAdmin) return (
    <div className="p-6 text-muted-foreground">Kein Zugriff — nur für Admins.</div>
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Benutzerverwaltung</h1>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="button-add-user">
          <Plus className="h-4 w-4 mr-2" /> Benutzer hinzufügen
        </Button>
      </div>

      {/* User list */}
      <Card className="divide-y">
        {isLoading && <div className="p-6 text-muted-foreground text-sm">Lädt…</div>}
        {!isLoading && benutzer.length === 0 && (
          <div className="p-6 text-muted-foreground text-sm">Noch keine Benutzer.</div>
        )}
        {benutzer.map((u) => {
          // Berechtigungen-Zähler
          const permCount = u.rolle === "admin" ? null : (() => {
            const p = u.berechtigungen ? JSON.parse(u.berechtigungen) : standardBerechtigungen();
            return Object.values(p).filter(Boolean).length;
          })();

          return (
            <div key={u.id} className="flex items-center justify-between px-4 py-3 gap-2" data-testid={`row-user-${u.id}`}>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{u.benutzername}</span>
                  {u.id === currentUser?.id && (
                    <Badge variant="outline" className="text-xs">Du</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <Badge variant={u.rolle === "admin" ? "default" : "secondary"} className="text-xs">
                    {u.rolle === "admin" ? "Admin" : "Mitarbeiter"}
                  </Badge>
                  {u.totp_aktiv
                    ? <span className="flex items-center gap-1 text-green-600"><ShieldCheck className="h-3 w-3" />2FA aktiv</span>
                    : <span className="flex items-center gap-1 text-muted-foreground"><ShieldOff className="h-3 w-3" />Kein 2FA</span>
                  }
                  {!u.aktiv && <Badge variant="destructive" className="text-xs">Deaktiviert</Badge>}
                  {permCount !== null && (
                    <span className="text-muted-foreground">· {permCount} von {ALLE_MODULE.length} Module erlaubt</span>
                  )}
                  {u.rolle === "admin" && (
                    <span className="text-muted-foreground">· Voller Zugriff</span>
                  )}
                  <span className="opacity-50">· seit {formatDate(u.erstellt)}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap justify-end shrink-0">
                {/* Berechtigungen Button (nur für Mitarbeiter) */}
                {u.rolle === "mitarbeiter" && (
                  <Button
                    size="sm" variant="outline"
                    className="text-primary border-primary/30 hover:bg-primary/5"
                    onClick={() => setPermUser(u)}
                    title="Berechtigungen verwalten"
                    data-testid={`button-perms-${u.id}`}
                  >
                    <SlidersHorizontal className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Berechtigungen</span>
                  </Button>
                )}
                {u.totp_aktiv ? (
                  <Button
                    size="sm" variant="outline"
                    className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                    onClick={() => {
                      if (confirm(`2FA für "${u.benutzername}" wirklich deaktivieren?`)) {
                        reset2faMut.mutate(u.id);
                      }
                    }}
                    title="2FA deaktivieren"
                    data-testid={`button-disable2fa-${u.id}`}
                    disabled={reset2faMut.isPending}
                  >
                    <ShieldOff className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">2FA deaktiv.</span>
                  </Button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded border border-dashed"
                    title="Der Benutzer kann 2FA selbst in Einstellungen → Sicherheit aktivieren"
                  >
                    <ShieldOff className="h-3 w-3" />
                    <span className="hidden sm:inline">Kein 2FA</span>
                  </span>
                )}
                <Button
                  size="sm" variant="outline"
                  onClick={() => setEditUser(u)}
                  data-testid={`button-edit-${u.id}`}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                {u.id !== currentUser?.id && (
                  <Button
                    size="sm" variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMut.mutate(u.id)}
                    data-testid={`button-delete-${u.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Berechtigungs-Modal */}
      {permUser && <BerechtigungenModal benutzer={permUser} onClose={() => setPermUser(null)} />}

      {/* Add user dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Benutzer hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Benutzername</label>
              <Input
                placeholder="vorname.nachname@schneggenburger.ch"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="input-new-username"
              />
              <p className="text-xs text-muted-foreground mt-1">Format: vorname.nachname@schneggenburger.ch</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Passwort</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Mindestens 6 Zeichen"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  data-testid="input-new-password"
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-2.5 text-muted-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rolle</label>
              <Select value={newRolle} onValueChange={(v) => setNewRolle(v as "admin" | "mitarbeiter")}>
                <SelectTrigger data-testid="select-rolle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="mitarbeiter">Mitarbeiter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || !newName || !newPw}
              data-testid="button-save-user"
            >
              {addMut.isPending ? "Wird erstellt…" : "Benutzer erstellen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Benutzer bearbeiten</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Benutzername</label>
                <Input
                  defaultValue={editUser.benutzername}
                  onBlur={(e) => setEditUser({ ...editUser, benutzername: e.target.value })}
                  data-testid="input-edit-username"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Neues Passwort (leer lassen = unverändert)</label>
                <Input
                  type="password"
                  placeholder="Neues Passwort"
                  id="edit-pw"
                  data-testid="input-edit-password"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Rolle</label>
                <Select
                  value={editUser.rolle}
                  onValueChange={(v) => setEditUser({ ...editUser, rolle: v as "admin" | "mitarbeiter" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="mitarbeiter">Mitarbeiter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="aktiv-check"
                  checked={editUser.aktiv}
                  onChange={(e) => setEditUser({ ...editUser, aktiv: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="aktiv-check" className="text-sm">Benutzer aktiv</label>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  const pw = (document.getElementById("edit-pw") as HTMLInputElement)?.value;
                  editMut.mutate({
                    benutzername: editUser.benutzername,
                    rolle: editUser.rolle,
                    aktiv: editUser.aktiv,
                    ...(pw ? { passwort: pw } : {}),
                  });
                }}
                disabled={editMut.isPending}
                data-testid="button-save-edit"
              >
                {editMut.isPending ? "Wird gespeichert…" : "Speichern"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
