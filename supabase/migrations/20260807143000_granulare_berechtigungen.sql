-- Feingranulare Berechtigungen pro Navigations-Unterpunkt.
--
-- Die Spalte app_benutzer.berechtigungen enthielt bislang nur Hauptmodul-
-- Schalter. Jeder vorhandene Hauptmodulwert wird hier auf sämtliche neuen
-- Unterpunkte übertragen. Dadurch bleibt der Zugriff bestehender Benutzer
-- unverändert, bis ein Admin einzelne Unterpunkte bewusst anpasst.
DO $$
DECLARE
  column_type text;
  user_row record;
  raw jsonb;
  normalized jsonb;
  modul jsonb;
  unterpunkt text;
  legacy_wert boolean;
  unterpunkt_wert boolean;
  mindestens_einer boolean;
  direktes_modul text;
  standard_wert boolean;
  modul_konfiguration constant jsonb := '[
    {"key":"kalkulation","standard":false,"unterpunkte":["kalkulation_vorkalkulation","kalkulation_nachkalkulation"]},
    {"key":"finanzmanagement","standard":false,"unterpunkte":["finanzmanagement_finanzen_uebersicht","finanzmanagement_mahnwesen","finanzmanagement_mwst","finanzmanagement_eingangsrechnungen","finanzmanagement_garantien"]},
    {"key":"einkauf","standard":true,"unterpunkte":["einkauf_lieferanten_material","einkauf_lagerverwaltung"]},
    {"key":"dokumente","standard":true,"unterpunkte":["dokumente_fotodokumentation","dokumente_formulare","dokumente_chat_historie","dokumente_kundendatencenter","dokumente_uebersicht"]},
    {"key":"ressourcen","standard":false,"unterpunkte":["ressourcen_mitarbeiterakte","ressourcen_planung_termine","ressourcen_kalender","ressourcen_plantafel","ressourcen_ferienplanung","ressourcen_stundenauswertung","ressourcen_lohnabrechnung","ressourcen_aufgaben"]}
  ]'::jsonb;
BEGIN
  SELECT data_type
    INTO column_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'app_benutzer'
     AND column_name = 'berechtigungen';

  IF column_type IS NULL THEN
    RAISE EXCEPTION 'Spalte public.app_benutzer.berechtigungen wurde nicht gefunden';
  END IF;

  FOR user_row IN
    SELECT id, berechtigungen::jsonb AS rechte
      FROM public.app_benutzer
     WHERE berechtigungen IS NOT NULL
  LOOP
    raw := user_row.rechte;
    normalized := raw; -- unbekannte/zukünftige Flags bleiben erhalten

    -- Einteilige Module behalten ihren bisherigen Wert (bzw. ihren Standard).
    FOREACH direktes_modul IN ARRAY ARRAY[
      'dashboard_finanzen', 'auftraege', 'zeiterfassung', 'rechnungen',
      'offerten', 'benutzerverwaltung', 'einstellungen'
    ]
    LOOP
      standard_wert := direktes_modul IN ('auftraege', 'zeiterfassung', 'offerten');
      normalized := jsonb_set(
        normalized,
        ARRAY[direktes_modul],
        to_jsonb(COALESCE((raw ->> direktes_modul)::boolean, standard_wert)),
        true
      );
    END LOOP;

    -- Mehrteilige Module: altes Hauptmodul-Flag wird als Fallback für alle
    -- fehlenden Unterpunkt-Flags verwendet. Das Hauptmodul selbst ist danach
    -- genau dann erlaubt, wenn mindestens ein Unterpunkt erlaubt ist.
    FOR modul IN SELECT value FROM jsonb_array_elements(modul_konfiguration)
    LOOP
      legacy_wert := COALESCE(
        (raw ->> (modul ->> 'key'))::boolean,
        (modul ->> 'standard')::boolean
      );
      mindestens_einer := false;

      FOR unterpunkt IN
        SELECT jsonb_array_elements_text(modul -> 'unterpunkte')
      LOOP
        unterpunkt_wert := COALESCE((raw ->> unterpunkt)::boolean, legacy_wert);
        normalized := jsonb_set(normalized, ARRAY[unterpunkt], to_jsonb(unterpunkt_wert), true);
        mindestens_einer := mindestens_einer OR unterpunkt_wert;
      END LOOP;

      normalized := jsonb_set(
        normalized,
        ARRAY[modul ->> 'key'],
        to_jsonb(mindestens_einer),
        true
      );
    END LOOP;

    IF column_type IN ('text', 'character varying', 'character') THEN
      UPDATE public.app_benutzer
         SET berechtigungen = normalized::text
       WHERE id = user_row.id;
    ELSIF column_type = 'json' THEN
      UPDATE public.app_benutzer
         SET berechtigungen = normalized::json
       WHERE id = user_row.id;
    ELSE
      UPDATE public.app_benutzer
         SET berechtigungen = normalized
       WHERE id = user_row.id;
    END IF;
  END LOOP;
END $$;
