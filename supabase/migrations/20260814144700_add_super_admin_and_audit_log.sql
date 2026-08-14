BEGIN;

ALTER TABLE public.app_benutzer
  ADD COLUMN IF NOT EXISTS ist_super_admin boolean NOT NULL DEFAULT false;

-- app_benutzer uses benutzername rather than a separate email column. Resolve
-- the requested e-mail through Supabase Auth, which is the canonical source.
UPDATE public.app_benutzer
SET ist_super_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'domipusam@gmail.com'
)
OR lower(benutzername) = 'domipusam@gmail.com';

CREATE TABLE IF NOT EXISTS public.super_admin_settings (
  benutzer_id uuid PRIMARY KEY REFERENCES public.app_benutzer(id) ON DELETE CASCADE,
  admin_passwort_hash text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.super_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benutzer_id uuid NOT NULL REFERENCES public.app_benutzer(id),
  aktion text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id),
  betroffene_entitaet text,
  entitaet_id uuid,
  beschreibung text NOT NULL,
  metadaten jsonb,
  ip_adresse text,
  user_agent text,
  zeitstempel timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS super_admin_audit_log_zeitstempel_idx
  ON public.super_admin_audit_log (zeitstempel DESC);
CREATE INDEX IF NOT EXISTS super_admin_audit_log_benutzer_zeitstempel_idx
  ON public.super_admin_audit_log (benutzer_id, zeitstempel DESC);
CREATE INDEX IF NOT EXISTS super_admin_audit_log_tenant_zeitstempel_idx
  ON public.super_admin_audit_log (tenant_id, zeitstempel DESC);

ALTER TABLE public.super_admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_audit_log ENABLE ROW LEVEL SECURITY;

COMMIT;
