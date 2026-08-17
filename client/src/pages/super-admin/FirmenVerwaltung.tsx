import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { superAdminApi, type Tenant } from "@/lib/super-admin-api";
import { PageHeader } from "./_shared";

const SYSTEM_TENANT_ID = "cbb89e60-d328-4daf-a5a5-be56f488e897";

function TenantDialog({ tenant, onClose }: { tenant?: Tenant; onClose: () => void }) {
  const [name, setName] = useState(tenant?.name || "");
  const [slug, setSlug] = useState(tenant?.slug || "");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPasswort, setAdminPasswort] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => (
      tenant
        ? superAdminApi.updateTenant(tenant.id, { name, slug })
        : superAdminApi.createTenant({ name, slug, adminName, adminEmail, adminPasswort })
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "overview"] });
      onClose();
    },
    onError: (error: Error) => setError(error.message || "Speichern nicht möglich."),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenant ? "Firma bearbeiten" : "Neue Firma anlegen"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">Firmenname</Label>
            <Input id="tenant-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-slug">URL-Slug</Label>
            <Input
              id="tenant-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="muster-sanitaer"
              required
            />
            <p className="text-xs text-muted-foreground">
              Kleinbuchstaben, Ziffern und Bindestriche; wird bei Bedarf normalisiert.
            </p>
          </div>
          {!tenant && (
            <fieldset className="space-y-4 border-t pt-4">
              <legend className="text-sm font-medium">Erster Administrator</legend>
              <div className="space-y-1.5">
                <Label htmlFor="tenant-admin-name">Name</Label>
                <Input
                  id="tenant-admin-name"
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tenant-admin-email">E-Mail</Label>
                <Input
                  id="tenant-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tenant-admin-password">Temporäres Passwort</Label>
                <Input
                  id="tenant-admin-password"
                  type="password"
                  value={adminPasswort}
                  onChange={(event) => setAdminPasswort(event.target.value)}
                  required
                />
              </div>
            </fieldset>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Wird gespeichert…" : "Speichern"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTenantDialog({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [confirmationName, setConfirmationName] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: () => superAdminApi.deleteTenant(tenant.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "overview"] });
      toast({ title: "Firma gelöscht" });
      onClose();
    },
    onError: (error: Error) => setError(error.message || "Firma konnte nicht gelöscht werden."),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !deleteMutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma unwiderruflich löschen</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            deleteMutation.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Die Firma &quot;{tenant.name}&quot; und ALLE zugehörigen Daten (Mitarbeiter, Kunden,
            Angebote, Aufträge, Rechnungen, Termine, Nachkalkulationen, Einkauf, Dokumente,
            Aufgaben, Einstellungen und mehr) werden unwiderruflich gelöscht. Dies kann NICHT
            rückgängig gemacht werden.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="delete-tenant-confirmation">
              Zum Bestätigen den Firmennamen eintippen:
            </Label>
            <Input
              id="delete-tenant-confirmation"
              value={confirmationName}
              onChange={(event) => setConfirmationName(event.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirmationName !== tenant.name || deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? "Wird gelöscht…" : "Firma löschen"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FirmenVerwaltung() {
  const [dialog, setDialog] = useState<Tenant | undefined | false>(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const { toast } = useToast();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["super-admin", "tenants"],
    queryFn: superAdminApi.tenants,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => superAdminApi.setTenantStatus(id, active),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "overview"] });
      toast({ title: variables.active ? "Firma aktiviert" : "Firma deaktiviert" });
    },
    onError: (error: Error) => {
      toast({
        title: "Status konnte nicht geändert werden",
        description: error.message || "Bitte Admin-Freigabe prüfen und erneut versuchen.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firmen"
        description="Mandanten anlegen, umbenennen sowie aktivieren oder deaktivieren."
      >
        <Button onClick={() => setDialog(undefined)} data-testid="button-create-tenant">
          <Plus className="h-4 w-4" />
          Neue Firma anlegen
        </Button>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Firma</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">Mitarbeiter</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    Wird geladen…
                  </td>
                </tr>
              ) : tenants.map((tenant) => {
                const isSystemTenant = tenant.id === SYSTEM_TENANT_ID;
                const isActive = tenant.status === "aktiv";

                return (
                  <tr className="border-t" key={tenant.id}>
                    <td className="px-5 py-3 font-medium">
                      <Building2 className="mr-2 inline h-4 w-4 text-primary" />
                      {tenant.name}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{tenant.slug}</td>
                    <td className="px-5 py-3">{tenant.aktiveMitarbeiter}/{tenant.mitarbeiterAnzahl}</td>
                    <td className="px-5 py-3">
                      <Badge variant={isActive ? "default" : "secondary"}>{tenant.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDialog(tenant)}
                        aria-label={`${tenant.name} bearbeiten`}
                      >
                        <Pencil className="h-4 w-4" />
                        Bearbeiten
                      </Button>
                      {isSystemTenant ? (
                        <span className="ml-2 text-xs text-muted-foreground">System-Firma</span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant={isActive ? "outline" : "default"}
                            className={`ml-2 ${isActive ? "text-amber-600 hover:text-amber-700" : ""}`}
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate({ id: tenant.id, active: !isActive })}
                          >
                            {isActive ? "Deaktivieren" : "Aktivieren"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-2 text-destructive hover:text-destructive"
                            onClick={() => setTenantToDelete(tenant)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Löschen
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog !== false && <TenantDialog tenant={dialog || undefined} onClose={() => setDialog(false)} />}
      {tenantToDelete && (
        <DeleteTenantDialog tenant={tenantToDelete} onClose={() => setTenantToDelete(null)} />
      )}
    </div>
  );
}
