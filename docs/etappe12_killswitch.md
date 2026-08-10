# Etappe 12 – Kill-Switch für Supabase Auth / RLS-Cutover

## Wann einsetzen

Bei Login-Fehlern, unerwarteten 401/403-Antworten oder fehlenden Daten unmittelbar nach dem Code-Deploy den folgenden Not-Aus verwenden. Er ist für die Zeit **vor** der Ausführung der staged SQL-Migration vollständig.

## Render-Dashboard: exakte Schritte

1. Render öffnen und den Web Service **auftragpro** wählen.
2. **Environment** öffnen.
3. `AUTH_MODE` auf `legacy` setzen.
4. `POLICY_MODE` auf `observe` setzen. Für reine Diagnose ohne Policy-Logs ist alternativ `off` möglich; der vollständige Not-Aus verwendet `observe`.
5. Speichern und einen neuen Deploy auslösen bzw. den von Render angeforderten Redeploy abwarten.
6. Nach dem Deploy mit einem bekannten Legacy-Login und einer Standardfunktion prüfen.

Die Service-Role-Variable bleibt unverändert. Sie wird für den Legacy-Fallback nicht verwendet.

## Vollständiger Not-Aus: interne Rückfallkaskade

- `AUTH_MODE=legacy`: `POST /api/auth/login` nutzt wieder ausschließlich den vorhandenen `app_benutzer`-bcrypt-Vergleich und die signierte Legacy-Cookie-Session. Der Browser speichert nach einem solchen Login keinen Bearer-Token.
- `POLICY_MODE=observe`: die Policy-Matrix protokolliert nur Abweichungen; sie blockiert keine Route.
- Der Server-DB-Client fällt für jede neue Request wieder auf den bisherigen anon-Client zurück. Ein vorhandener Bearer-Header wird in diesem Modus nicht an PostgREST als Nutzeridentität weitergereicht.

`POLICY_MODE=off` deaktiviert zusätzlich die Beobachtungslogs. Es ersetzt **nicht** `AUTH_MODE=legacy`.

## Wichtige Grenze: staged SQL-Migration

`supabase/migrations/20260810230000_etappe12_drop_allow_all_policies.sql` wird mit diesem Commit **nicht** ausgeführt. Bis zu ihrer Ausführung reicht der Env-Kill-Switch aus.

Nach manueller Ausführung der Drop-Migration stellt eine bloße Env-Änderung die entfernten `allow_all`-Policies nicht wieder her. Dann gilt:

1. Erst Code/Anmeldung mit `AUTH_MODE=legacy`, `POLICY_MODE=observe` stabilisieren.
2. Falls die alte anon-basierte Datenbankberechtigung zwingend benötigt wird, das kontrollierte SQL-Rollback `20260810230000_etappe12_drop_allow_all_policies_rollback.sql` manuell anwenden und dessen Verify-SELECT prüfen.
3. Die Ausführung der Drop-Migration daher erst nach erfolgreicher Live-Verifikation und einem bewusst gewählten Beobachtungszeitraum vornehmen.

Die SECURITY DEFINER-Hilfsfunktion aus Etappe 11 wird weder vom Drop noch vom Rollback verändert.
