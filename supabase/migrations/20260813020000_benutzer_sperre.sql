-- Dauerhafte Konto-Sperre nach zu vielen Fehlversuchen (Brute-Force-Schutz).
-- Ersetzt/ergänzt die bisherige rein zeitbasierte In-Memory-Sperre: sobald
-- ein Konto gesperrt ist, bleibt es gesperrt, bis ein Admin es in der
-- Benutzerverwaltung explizit wieder entsperrt oder das Passwort zurücksetzt.
alter table app_benutzer
  add column if not exists gesperrt boolean not null default false,
  add column if not exists gesperrt_am timestamptz;
