-- Preise im Auftragsbereich sind für bestehende Mitarbeiter standardmässig
-- ausgeblendet. Admins prüfen diese Berechtigung im Frontend nicht.
--
-- Die Spalte kann je nach bestehender Installation als text, json oder jsonb
-- vorliegen; der Inhalt wird deshalb wie bei der vorangehenden
-- Berechtigungs-Migration typgerecht zurückgeschrieben.
DO $$
DECLARE
  column_type text;
  user_row record;
  normalized jsonb;
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
    SELECT id, COALESCE(berechtigungen::jsonb, '{}'::jsonb) AS rechte
      FROM public.app_benutzer
     WHERE rolle IS DISTINCT FROM 'admin'
  LOOP
    normalized := jsonb_set(
      user_row.rechte,
      ARRAY['auftraege_preise_sichtbar'],
      'false'::jsonb,
      true
    );

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
