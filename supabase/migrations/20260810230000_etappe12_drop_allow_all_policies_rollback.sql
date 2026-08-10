-- Etappe 12 rollback: permissive Pre-Snapshot-Policies wiederherstellen
-- Datum: 2026-08-10
-- Nur für einen bestätigten Datenbank-Notfall nach Ausführung der Etappe-12-Migration.
-- Rekonstruiert die 26 Policies aus dem Etappe-11-Pre-Snapshot; SECURITY DEFINER-
-- Hilfsfunktionen und tenant_isolation_* Policies werden bewusst nicht verändert.

BEGIN;

CREATE POLICY allow_all_benutzer ON public.app_benutzer FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.einstellungen FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "allow anon insert" ON public.forster_selections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_all_nachkalkulation ON public.nachkalkulation FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_naka_fremd ON public.nachkalkulation_fremdleistungen FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_nk_fremd ON public.nachkalkulation_fremdleistungen FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_naka_material ON public.nachkalkulation_material FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_nk_material ON public.nachkalkulation_material FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_nk_soek ON public.nachkalkulation_soek FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_nk_stunden ON public.nachkalkulation_stunden FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_nk_positionen ON public.nk_positionen FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_nk_stunden ON public.nk_stunden FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.pdf_vorlagen FOR ALL TO public USING (true);
CREATE POLICY allow_all_vk_fremdleistungen ON public.vk_fremdleistungen FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_hauptmaterial ON public.vk_hauptmaterial FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_hilfsmaterial ON public.vk_hilfsmaterial FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_soek ON public.vk_soek FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_stunden ON public.vk_stunden FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vorkalkulation ON public.vorkalkulation FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_config ON public.vorkalkulation_config FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_fremd ON public.vorkalkulation_fremdleistungen FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_hauptmat_flaeche ON public.vorkalkulation_hauptmaterial_flaeche FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_hilfsmaterial ON public.vorkalkulation_hilfsmaterial FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_material ON public.vorkalkulation_material FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_soek ON public.vorkalkulation_soek FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all_vk_stunden ON public.vorkalkulation_stunden FOR ALL TO public USING (true) WITH CHECK (true);

SELECT count(*) AS restored_allow_all_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND (policyname LIKE 'allow_all%' OR policyname = 'allow anon insert');

COMMIT;
