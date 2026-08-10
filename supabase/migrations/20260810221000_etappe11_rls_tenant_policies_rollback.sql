-- Etappe 11 RLS tenant policies - emergency rollback
-- Datum: 2026-08-10
-- Entfernt ausschliesslich die in Etappe 11 angelegten tenant_isolation_* Policies
-- und die dazugehoerige Helper-Funktion. Bestehende allow_all-/service_role-
-- Policies und RLS-Flags bleiben unangetastet.

BEGIN;
DROP POLICY IF EXISTS tenant_isolation_tenants ON public.tenants;
DROP POLICY IF EXISTS tenant_isolation_tenant_memberships ON public.tenant_memberships;
DROP POLICY IF EXISTS tenant_isolation_app_benutzer ON public.app_benutzer;
DROP POLICY IF EXISTS tenant_isolation_aufgaben ON public.aufgaben;
DROP POLICY IF EXISTS tenant_isolation_auftraege ON public.auftraege;
DROP POLICY IF EXISTS tenant_isolation_auftrag_kommentare ON public.auftrag_kommentare;
DROP POLICY IF EXISTS tenant_isolation_auftrag_positionen ON public.auftrag_positionen;
DROP POLICY IF EXISTS tenant_isolation_auftrag_schritt_fotos ON public.auftrag_schritt_fotos;
DROP POLICY IF EXISTS tenant_isolation_auftrag_schritte ON public.auftrag_schritte;
DROP POLICY IF EXISTS tenant_isolation_auftrag_status_pipeline ON public.auftrag_status_pipeline;
DROP POLICY IF EXISTS tenant_isolation_chat_nachrichten ON public.chat_nachrichten;
DROP POLICY IF EXISTS tenant_isolation_dokument_daten ON public.dokument_daten;
DROP POLICY IF EXISTS tenant_isolation_dokumente ON public.dokumente;
DROP POLICY IF EXISTS tenant_isolation_eingangsrechnungen ON public.eingangsrechnungen;
DROP POLICY IF EXISTS tenant_isolation_einstellungen ON public.einstellungen;
DROP POLICY IF EXISTS tenant_isolation_ferien ON public.ferien;
DROP POLICY IF EXISTS tenant_isolation_formulare ON public.formulare;
DROP POLICY IF EXISTS tenant_isolation_foto_dokumentation ON public.foto_dokumentation;
DROP POLICY IF EXISTS tenant_isolation_garantien ON public.garantien;
DROP POLICY IF EXISTS tenant_isolation_kalkulationen ON public.kalkulationen;
DROP POLICY IF EXISTS tenant_isolation_kunden ON public.kunden;
DROP POLICY IF EXISTS tenant_isolation_lager_artikel ON public.lager_artikel;
DROP POLICY IF EXISTS tenant_isolation_lager_buchungen ON public.lager_buchungen;
DROP POLICY IF EXISTS tenant_isolation_lieferanten ON public.lieferanten;
DROP POLICY IF EXISTS tenant_isolation_liefertermine ON public.liefertermine;
DROP POLICY IF EXISTS tenant_isolation_mahnungen ON public.mahnungen;
DROP POLICY IF EXISTS tenant_isolation_materialbestellungen ON public.materialbestellungen;
DROP POLICY IF EXISTS tenant_isolation_mitarbeiter ON public.mitarbeiter;
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation ON public.nachkalkulation;
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_fremdleistungen ON public.nachkalkulation_fremdleistungen;
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_material ON public.nachkalkulation_material;
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_soek ON public.nachkalkulation_soek;
DROP POLICY IF EXISTS tenant_isolation_nachkalkulation_stunden ON public.nachkalkulation_stunden;
DROP POLICY IF EXISTS tenant_isolation_nk_positionen ON public.nk_positionen;
DROP POLICY IF EXISTS tenant_isolation_nk_stunden ON public.nk_stunden;
DROP POLICY IF EXISTS tenant_isolation_notizen ON public.notizen;
DROP POLICY IF EXISTS tenant_isolation_offerten ON public.offerten;
DROP POLICY IF EXISTS tenant_isolation_pdf_vorlagen ON public.pdf_vorlagen;
DROP POLICY IF EXISTS tenant_isolation_plantafel ON public.plantafel;
DROP POLICY IF EXISTS tenant_isolation_rechnungen ON public.rechnungen;
DROP POLICY IF EXISTS tenant_isolation_rechnungsvorlagen ON public.rechnungsvorlagen;
DROP POLICY IF EXISTS tenant_isolation_reklamationen ON public.reklamationen;
DROP POLICY IF EXISTS tenant_isolation_stundensaetze ON public.stundensaetze;
DROP POLICY IF EXISTS tenant_isolation_subunternehmer ON public.subunternehmer;
DROP POLICY IF EXISTS tenant_isolation_tagesrapporte ON public.tagesrapporte;
DROP POLICY IF EXISTS tenant_isolation_termine ON public.termine;
DROP POLICY IF EXISTS tenant_isolation_verlauf ON public.verlauf;
DROP POLICY IF EXISTS tenant_isolation_vk_fremdleistungen ON public.vk_fremdleistungen;
DROP POLICY IF EXISTS tenant_isolation_vk_hauptmaterial ON public.vk_hauptmaterial;
DROP POLICY IF EXISTS tenant_isolation_vk_hilfsmaterial ON public.vk_hilfsmaterial;
DROP POLICY IF EXISTS tenant_isolation_vk_soek ON public.vk_soek;
DROP POLICY IF EXISTS tenant_isolation_vk_stunden ON public.vk_stunden;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation ON public.vorkalkulation;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_config ON public.vorkalkulation_config;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_fremdleistungen ON public.vorkalkulation_fremdleistungen;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_hauptmaterial_flaeche ON public.vorkalkulation_hauptmaterial_flaeche;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_hilfsmaterial ON public.vorkalkulation_hilfsmaterial;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_material ON public.vorkalkulation_material;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_soek ON public.vorkalkulation_soek;
DROP POLICY IF EXISTS tenant_isolation_vorkalkulation_stunden ON public.vorkalkulation_stunden;
DROP POLICY IF EXISTS tenant_isolation_zeiteintraege ON public.zeiteintraege;
DROP FUNCTION IF EXISTS public.is_active_member_of_same_tenant(uuid);

SELECT count(*) AS remaining_etappe11_tenant_isolation_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'tenant_isolation_%';

COMMIT;
