-- Etappe 12: allow_all-Policies nach erfolgreichem Supabase-Auth-Cutover entfernen
-- Datum: 2026-08-10
-- WICHTIG: Diese Migration ist STAGED und darf erst nach Code-Deploy sowie
-- erfolgreicher Live-Verifikation ausgeführt werden. Vorher bleibt sie nur im Repository.
-- Rollback-Warnung: Ein Env-Kill-Switch stellt bereits entfernte DB-Policies nicht wieder her;
-- bei Bedarf die zugehörige _rollback.sql kontrolliert und manuell anwenden.
-- Die SECURITY DEFINER-Hilfsfunktion(en) aus Etappe 11 bleiben unverändert.

BEGIN;

DROP POLICY IF EXISTS allow_all_benutzer ON public.app_benutzer;
DROP POLICY IF EXISTS allow_all ON public.einstellungen;
DROP POLICY IF EXISTS "allow anon insert" ON public.forster_selections;
DROP POLICY IF EXISTS allow_all_nachkalkulation ON public.nachkalkulation;
DROP POLICY IF EXISTS allow_all_naka_fremd ON public.nachkalkulation_fremdleistungen;
DROP POLICY IF EXISTS allow_all_nk_fremd ON public.nachkalkulation_fremdleistungen;
DROP POLICY IF EXISTS allow_all_naka_material ON public.nachkalkulation_material;
DROP POLICY IF EXISTS allow_all_nk_material ON public.nachkalkulation_material;
DROP POLICY IF EXISTS allow_all_nk_soek ON public.nachkalkulation_soek;
DROP POLICY IF EXISTS allow_all_nk_stunden ON public.nachkalkulation_stunden;
DROP POLICY IF EXISTS allow_all_nk_positionen ON public.nk_positionen;
DROP POLICY IF EXISTS allow_all_nk_stunden ON public.nk_stunden;
DROP POLICY IF EXISTS allow_all ON public.pdf_vorlagen;
DROP POLICY IF EXISTS allow_all_vk_fremdleistungen ON public.vk_fremdleistungen;
DROP POLICY IF EXISTS allow_all_vk_hauptmaterial ON public.vk_hauptmaterial;
DROP POLICY IF EXISTS allow_all_vk_hilfsmaterial ON public.vk_hilfsmaterial;
DROP POLICY IF EXISTS allow_all_vk_soek ON public.vk_soek;
DROP POLICY IF EXISTS allow_all_vk_stunden ON public.vk_stunden;
DROP POLICY IF EXISTS allow_all_vorkalkulation ON public.vorkalkulation;
DROP POLICY IF EXISTS allow_all_vk_config ON public.vorkalkulation_config;
DROP POLICY IF EXISTS allow_all_vk_fremd ON public.vorkalkulation_fremdleistungen;
DROP POLICY IF EXISTS allow_all_hauptmat_flaeche ON public.vorkalkulation_hauptmaterial_flaeche;
DROP POLICY IF EXISTS allow_all_hilfsmaterial ON public.vorkalkulation_hilfsmaterial;
DROP POLICY IF EXISTS allow_all_vk_material ON public.vorkalkulation_material;
DROP POLICY IF EXISTS allow_all_vk_soek ON public.vorkalkulation_soek;
DROP POLICY IF EXISTS allow_all_vk_stunden ON public.vorkalkulation_stunden;

-- Verify: exactly the 26 permissive policies staged above must be gone.
SELECT count(*) AS remaining_allow_all_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND (policyname LIKE 'allow_all%' OR policyname = 'allow anon insert');

COMMIT;
