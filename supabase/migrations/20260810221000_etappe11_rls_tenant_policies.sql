-- Etappe 11: additive RLS-Readiness mit tenant-basierten Policies
-- Datum: 2026-08-10
-- Zweck: Vorbereitende, noch nicht scharfe RLS-Policies fuer den Auth-Cutover.
-- Idempotenz: Jede Etappe-11-Policy wird vor dem Anlegen gezielt gedroppt und
--   im selben Transaction-Block neu angelegt. Bestehende allow_all-/service_role-
--   Policies werden bewusst NICHT veraendert oder entfernt.
-- Zero-Downtime: Es wird an keiner Tabelle RLS aktiviert/deaktiviert. Der Legacy-
--   Server verwendet SUPABASE_ANON_KEY; die neuen Policies gelten ausschliesslich
--   fuer authenticated. Bei bereits aktiviertem RLS bleiben permissive Altpolicies
--   fuer public aktiv. Tabellen mit heute deaktiviertem RLS bleiben bis Etappe 12
--   unveraendert offen und die Policies damit dormant.
-- Nicht abgedeckt: auth.users (Supabase-owned), forster_content, forster_selections
--   sowie Storage; diese benoetigen vor Cutover eine eigene Abstimmung.

BEGIN;

-- app_benutzer hat keine tenant_id. Die Funktion prueft dieselbe aktive
-- Mitgliedschaft und laeuft SECURITY DEFINER, damit die bewusst enge SELECT-
-- Policy auf tenant_memberships (nur eigene Zeilen) nicht die Userliste blockiert.
CREATE OR REPLACE FUNCTION public.is_active_member_of_same_tenant(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS current_membership
    JOIN public.tenant_memberships AS target_membership
      ON target_membership.tenant_id = current_membership.tenant_id
     AND target_membership.aktiv = true
    WHERE current_membership.user_id = auth.uid()
      AND current_membership.aktiv = true
      AND target_membership.user_id = target_user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_member_of_same_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_member_of_same_tenant(uuid) TO authenticated;

-- Special table: only the tenant(s) of the requesting authenticated user.
DROP POLICY IF EXISTS tenant_isolation_tenants ON public.tenants;
CREATE POLICY tenant_isolation_tenants
ON public.tenants
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Special table: authenticated users can read only their own membership rows.
DROP POLICY IF EXISTS tenant_isolation_tenant_memberships ON public.tenant_memberships;
CREATE POLICY tenant_isolation_tenant_memberships
ON public.tenant_memberships
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Special table: own profile plus active profiles in a tenant shared with caller.
-- app_benutzer.id is uuid and was verified to match all active membership user_id values.
DROP POLICY IF EXISTS tenant_isolation_app_benutzer ON public.app_benutzer;
CREATE POLICY tenant_isolation_app_benutzer
ON public.app_benutzer
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_active_member_of_same_tenant(id)
);

-- Tenant table: public.aufgaben
DROP POLICY IF EXISTS tenant_isolation_aufgaben ON public.aufgaben;
CREATE POLICY tenant_isolation_aufgaben
ON public.aufgaben
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.auftraege
DROP POLICY IF EXISTS tenant_isolation_auftraege ON public.auftraege;
CREATE POLICY tenant_isolation_auftraege
ON public.auftraege
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.auftrag_kommentare
DROP POLICY IF EXISTS tenant_isolation_auftrag_kommentare ON public.auftrag_kommentare;
CREATE POLICY tenant_isolation_auftrag_kommentare
ON public.auftrag_kommentare
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.auftrag_positionen
DROP POLICY IF EXISTS tenant_isolation_auftrag_positionen ON public.auftrag_positionen;
CREATE POLICY tenant_isolation_auftrag_positionen
ON public.auftrag_positionen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.auftrag_schritt_fotos
DROP POLICY IF EXISTS tenant_isolation_auftrag_schritt_fotos ON public.auftrag_schritt_fotos;
CREATE POLICY tenant_isolation_auftrag_schritt_fotos
ON public.auftrag_schritt_fotos
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.auftrag_schritte
DROP POLICY IF EXISTS tenant_isolation_auftrag_schritte ON public.auftrag_schritte;
CREATE POLICY tenant_isolation_auftrag_schritte
ON public.auftrag_schritte
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.auftrag_status_pipeline
DROP POLICY IF EXISTS tenant_isolation_auftrag_status_pipeline ON public.auftrag_status_pipeline;
CREATE POLICY tenant_isolation_auftrag_status_pipeline
ON public.auftrag_status_pipeline
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.chat_nachrichten
DROP POLICY IF EXISTS tenant_isolation_chat_nachrichten ON public.chat_nachrichten;
CREATE POLICY tenant_isolation_chat_nachrichten
ON public.chat_nachrichten
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.dokument_daten
DROP POLICY IF EXISTS tenant_isolation_dokument_daten ON public.dokument_daten;
CREATE POLICY tenant_isolation_dokument_daten
ON public.dokument_daten
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.dokumente
DROP POLICY IF EXISTS tenant_isolation_dokumente ON public.dokumente;
CREATE POLICY tenant_isolation_dokumente
ON public.dokumente
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.eingangsrechnungen
DROP POLICY IF EXISTS tenant_isolation_eingangsrechnungen ON public.eingangsrechnungen;
CREATE POLICY tenant_isolation_eingangsrechnungen
ON public.eingangsrechnungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.einstellungen
DROP POLICY IF EXISTS tenant_isolation_einstellungen ON public.einstellungen;
CREATE POLICY tenant_isolation_einstellungen
ON public.einstellungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.ferien
DROP POLICY IF EXISTS tenant_isolation_ferien ON public.ferien;
CREATE POLICY tenant_isolation_ferien
ON public.ferien
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.formulare
DROP POLICY IF EXISTS tenant_isolation_formulare ON public.formulare;
CREATE POLICY tenant_isolation_formulare
ON public.formulare
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.foto_dokumentation
DROP POLICY IF EXISTS tenant_isolation_foto_dokumentation ON public.foto_dokumentation;
CREATE POLICY tenant_isolation_foto_dokumentation
ON public.foto_dokumentation
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.garantien
DROP POLICY IF EXISTS tenant_isolation_garantien ON public.garantien;
CREATE POLICY tenant_isolation_garantien
ON public.garantien
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.kalkulationen
DROP POLICY IF EXISTS tenant_isolation_kalkulationen ON public.kalkulationen;
CREATE POLICY tenant_isolation_kalkulationen
ON public.kalkulationen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.kunden
DROP POLICY IF EXISTS tenant_isolation_kunden ON public.kunden;
CREATE POLICY tenant_isolation_kunden
ON public.kunden
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.lager_artikel
DROP POLICY IF EXISTS tenant_isolation_lager_artikel ON public.lager_artikel;
CREATE POLICY tenant_isolation_lager_artikel
ON public.lager_artikel
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.lager_buchungen
DROP POLICY IF EXISTS tenant_isolation_lager_buchungen ON public.lager_buchungen;
CREATE POLICY tenant_isolation_lager_buchungen
ON public.lager_buchungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.lieferanten
DROP POLICY IF EXISTS tenant_isolation_lieferanten ON public.lieferanten;
CREATE POLICY tenant_isolation_lieferanten
ON public.lieferanten
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.liefertermine
DROP POLICY IF EXISTS tenant_isolation_liefertermine ON public.liefertermine;
CREATE POLICY tenant_isolation_liefertermine
ON public.liefertermine
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.mahnungen
DROP POLICY IF EXISTS tenant_isolation_mahnungen ON public.mahnungen;
CREATE POLICY tenant_isolation_mahnungen
ON public.mahnungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.materialbestellungen
DROP POLICY IF EXISTS tenant_isolation_materialbestellungen ON public.materialbestellungen;
CREATE POLICY tenant_isolation_materialbestellungen
ON public.materialbestellungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.mitarbeiter
DROP POLICY IF EXISTS tenant_isolation_mitarbeiter ON public.mitarbeiter;
CREATE POLICY tenant_isolation_mitarbeiter
ON public.mitarbeiter
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nachkalkulation
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation ON public.nachkalkulation;
CREATE POLICY tenant_isolation_nachkalkulation
ON public.nachkalkulation
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nachkalkulation_fremdleistungen
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_fremdleistungen ON public.nachkalkulation_fremdleistungen;
CREATE POLICY tenant_isolation_nachkalkulation_fremdleistungen
ON public.nachkalkulation_fremdleistungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nachkalkulation_material
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_material ON public.nachkalkulation_material;
CREATE POLICY tenant_isolation_nachkalkulation_material
ON public.nachkalkulation_material
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nachkalkulation_soek
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_soek ON public.nachkalkulation_soek;
CREATE POLICY tenant_isolation_nachkalkulation_soek
ON public.nachkalkulation_soek
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nachkalkulation_stunden
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_stunden ON public.nachkalkulation_stunden;
CREATE POLICY tenant_isolation_nachkalkulation_stunden
ON public.nachkalkulation_stunden
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nk_positionen
DROP POLICY IF EXISTS tenant_isolation_nk_positionen ON public.nk_positionen;
CREATE POLICY tenant_isolation_nk_positionen
ON public.nk_positionen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.nk_stunden
DROP POLICY IF EXISTS tenant_isolation_nk_stunden ON public.nk_stunden;
CREATE POLICY tenant_isolation_nk_stunden
ON public.nk_stunden
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.notizen
DROP POLICY IF EXISTS tenant_isolation_notizen ON public.notizen;
CREATE POLICY tenant_isolation_notizen
ON public.notizen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.offerten
DROP POLICY IF EXISTS tenant_isolation_offerten ON public.offerten;
CREATE POLICY tenant_isolation_offerten
ON public.offerten
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.pdf_vorlagen
DROP POLICY IF EXISTS tenant_isolation_pdf_vorlagen ON public.pdf_vorlagen;
CREATE POLICY tenant_isolation_pdf_vorlagen
ON public.pdf_vorlagen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.plantafel
DROP POLICY IF EXISTS tenant_isolation_plantafel ON public.plantafel;
CREATE POLICY tenant_isolation_plantafel
ON public.plantafel
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.rechnungen
DROP POLICY IF EXISTS tenant_isolation_rechnungen ON public.rechnungen;
CREATE POLICY tenant_isolation_rechnungen
ON public.rechnungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.rechnungsvorlagen
DROP POLICY IF EXISTS tenant_isolation_rechnungsvorlagen ON public.rechnungsvorlagen;
CREATE POLICY tenant_isolation_rechnungsvorlagen
ON public.rechnungsvorlagen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.reklamationen
DROP POLICY IF EXISTS tenant_isolation_reklamationen ON public.reklamationen;
CREATE POLICY tenant_isolation_reklamationen
ON public.reklamationen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.stundensaetze
DROP POLICY IF EXISTS tenant_isolation_stundensaetze ON public.stundensaetze;
CREATE POLICY tenant_isolation_stundensaetze
ON public.stundensaetze
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.subunternehmer
DROP POLICY IF EXISTS tenant_isolation_subunternehmer ON public.subunternehmer;
CREATE POLICY tenant_isolation_subunternehmer
ON public.subunternehmer
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.tagesrapporte
DROP POLICY IF EXISTS tenant_isolation_tagesrapporte ON public.tagesrapporte;
CREATE POLICY tenant_isolation_tagesrapporte
ON public.tagesrapporte
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.termine
DROP POLICY IF EXISTS tenant_isolation_termine ON public.termine;
CREATE POLICY tenant_isolation_termine
ON public.termine
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.verlauf
DROP POLICY IF EXISTS tenant_isolation_verlauf ON public.verlauf;
CREATE POLICY tenant_isolation_verlauf
ON public.verlauf
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vk_fremdleistungen
DROP POLICY IF EXISTS tenant_isolation_vk_fremdleistungen ON public.vk_fremdleistungen;
CREATE POLICY tenant_isolation_vk_fremdleistungen
ON public.vk_fremdleistungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vk_hauptmaterial
DROP POLICY IF EXISTS tenant_isolation_vk_hauptmaterial ON public.vk_hauptmaterial;
CREATE POLICY tenant_isolation_vk_hauptmaterial
ON public.vk_hauptmaterial
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vk_hilfsmaterial
DROP POLICY IF EXISTS tenant_isolation_vk_hilfsmaterial ON public.vk_hilfsmaterial;
CREATE POLICY tenant_isolation_vk_hilfsmaterial
ON public.vk_hilfsmaterial
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vk_soek
DROP POLICY IF EXISTS tenant_isolation_vk_soek ON public.vk_soek;
CREATE POLICY tenant_isolation_vk_soek
ON public.vk_soek
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vk_stunden
DROP POLICY IF EXISTS tenant_isolation_vk_stunden ON public.vk_stunden;
CREATE POLICY tenant_isolation_vk_stunden
ON public.vk_stunden
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation ON public.vorkalkulation;
CREATE POLICY tenant_isolation_vorkalkulation
ON public.vorkalkulation
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_config
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_config ON public.vorkalkulation_config;
CREATE POLICY tenant_isolation_vorkalkulation_config
ON public.vorkalkulation_config
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_fremdleistungen
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_fremdleistungen ON public.vorkalkulation_fremdleistungen;
CREATE POLICY tenant_isolation_vorkalkulation_fremdleistungen
ON public.vorkalkulation_fremdleistungen
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_hauptmaterial_flaeche
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_hauptmaterial_flaeche ON public.vorkalkulation_hauptmaterial_flaeche;
CREATE POLICY tenant_isolation_vorkalkulation_hauptmaterial_flaeche
ON public.vorkalkulation_hauptmaterial_flaeche
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_hilfsmaterial
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_hilfsmaterial ON public.vorkalkulation_hilfsmaterial;
CREATE POLICY tenant_isolation_vorkalkulation_hilfsmaterial
ON public.vorkalkulation_hilfsmaterial
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_material
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_material ON public.vorkalkulation_material;
CREATE POLICY tenant_isolation_vorkalkulation_material
ON public.vorkalkulation_material
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_soek
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_soek ON public.vorkalkulation_soek;
CREATE POLICY tenant_isolation_vorkalkulation_soek
ON public.vorkalkulation_soek
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.vorkalkulation_stunden
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_stunden ON public.vorkalkulation_stunden;
CREATE POLICY tenant_isolation_vorkalkulation_stunden
ON public.vorkalkulation_stunden
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Tenant table: public.zeiteintraege
DROP POLICY IF EXISTS tenant_isolation_zeiteintraege ON public.zeiteintraege;
CREATE POLICY tenant_isolation_zeiteintraege
ON public.zeiteintraege
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM public.tenant_memberships
    WHERE user_id = auth.uid()
      AND aktiv = true
  )
);

-- Verify: Exactly 61 Etappe-11 policies are expected (58 tenant_id tables
-- except tenant_memberships plus tenants, tenant_memberships and app_benutzer).
SELECT count(*) AS etappe11_tenant_isolation_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'tenant_isolation_%';

COMMIT;
