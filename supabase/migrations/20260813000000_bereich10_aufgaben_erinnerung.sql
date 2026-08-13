-- Bereich 10 Runde 2, Punkt 4: Aufgaben-Erinnerung per E-Mail bei Überfälligkeit.
-- Verhindert Mehrfachversand: sobald eine Erinnerung verschickt wurde, wird
-- der Zeitpunkt hier vermerkt und der Cron überspringt die Aufgabe danach.
alter table public.aufgaben add column if not exists erinnerung_gesendet_am timestamptz;
