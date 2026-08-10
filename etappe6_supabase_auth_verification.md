# Etappe 6 – Supabase-Auth-Verifikation

Datum: 2026-08-10

## Isolierte Middleware-Prüfung

`npm run test:auth-middleware` bestand erfolgreich.

Abgedeckte Ergebnisse:

- fehlender Bearer-Token: HTTP 401
- ungültiger Token: HTTP 401
- verifizierter User ohne Mitgliedschaft: HTTP 403
- verifizierter User mit aktiver Mitgliedschaft: `req.auth` wird vollständig gesetzt
- fehlender `SUPABASE_SERVICE_ROLE_KEY` für die service-role-geschützte Mitgliedschaftsabfrage: HTTP 503

## Temporärer Auth-Testuser

Ein echter Testuser konnte nicht angelegt werden: Supabase lehnte zuerst die `.invalid`-/Beispiel-Adressen als ungültig ab; beim anschließenden Versuch mit einer eindeutig markierten Gmail-Adresse antwortete Supabase mit `email rate limit exceeded`.

Es wurde deshalb keine Test-Mitgliedschaft angelegt. Die abschließenden Abfragen bestätigten `auth_test_users = 0` und `test_memberships = 0`. Es bleiben keine Etappe-6-Testdaten zurück.

## Konfiguration

Die Tabellen `tenants` und `tenant_memberships` sind mit einer `service_role_only`-RLS-Policy geschützt. Die Middleware verlangt daher bei einer späteren Aktivierung einen ausschließlich serverseitigen `SUPABASE_SERVICE_ROLE_KEY` für die Mitgliedschaftsabfrage. Dieser Key wird weder in die Browser-Anwendung eingebunden noch in dieser Etappe konfiguriert.
