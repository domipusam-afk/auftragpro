# AuftragPro – Etappe 11: RLS-Härtung (additive Policies)

Datum: 2026-08-10
Status: **erfolgreich appliert, bewusst noch nicht scharf**

## Ergebnis in Kürze

- Sync-HEAD vor Arbeitsbeginn: `5709f22 Etappe 10: Policy-Middleware im Shadow-Modus (POLICY_MODE=observe)`.
- Die produktive Migration `etappe11_rls_tenant_policies` wurde erfolgreich angewendet und ist mit Version `20260810201539` in der Supabase-Migrationshistorie verzeichnet.
- 61 additive Policies `tenant_isolation_*` wurden ergänzt; die Gesamtzahl stieg von 29 auf 90. RLS wurde an keiner Tabelle aktiviert, deaktiviert oder sonst geändert.
- Der Legacy-Fachclient verwendet `SUPABASE_ANON_KEY` und verbindet sich damit als `anon`. Die neuen Policies gelten ausschließlich für `authenticated`; bestehende `allow_all*`-Policies blieben erhalten.
- Live-Smoke-Test `/api/termine`: vor und nach Apply HTTP 200, 775 Bytes, Antwortkörper byte-identisch.

## Teil A – IST-Analyse

Der vollständige Vorab-Snapshot liegt in `/home/user/workspace/auftragpro_etappe11_rls_ist_analyse.md`; der unmittelbar vor dem Apply erstellte Snapshot in `auftragpro_etappe11_rls_pre.md`.

### Server-Verbindungsrolle

- `server/supabase.ts` instanziiert den fachlichen Standardclient mit `process.env.SUPABASE_URL` und `process.env.SUPABASE_ANON_KEY` (inklusive Anon-Fallback). Die Live-Anwendung nutzt für den Legacy-Betrieb damit **`anon`** und nicht `service_role`.
- `server/auth-middleware.ts` besitzt zusätzlich einen separat konstruierten `service_role`-Client, aber nur für serverseitige Membership-Auflösung des zukünftigen Auth-Pfads. Dieser ist nicht der allgemeine Datenclient.
- Konsequenz für Zero Downtime: Etappe 11 ergänzt nur `TO authenticated`-Policies. Sie treffen den heutigen Anon-Livepfad nicht. Insbesondere enthält diese Migration kein `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` und kein Entfernen permissiver Altpolicies.

### Datenbank vor Apply

- 63 Basistabellen im Schema `public`; RLS war auf 27 aktiv; 29 Policies existierten.
- 59 Tabellen führen `tenant_id`. Davon erhalten 58 fachliche Tabellen das Standardmuster; `tenant_memberships` erhält bewusst die engere Sonderregel.
- Im Default-Tenant `cbb89e60-d328-4daf-a5a5-be56f488e897` sind 3 aktive Mitgliedschaften vorhanden.
- `app_benutzer` hat kein `tenant_id`; alle 3 vorhandenen `app_benutzer.id` entsprechen einer `tenant_memberships.user_id`.
- Ohne `tenant_id` und in Etappe 11 unverändert: `app_benutzer`, `tenants`, `forster_content`, `forster_selections`. `auth.users` ist Supabase-owned und wurde nicht angefasst.

## Teil B/C – Policy-Design und Dateien

- Migration: `supabase/migrations/20260810221000_etappe11_rls_tenant_policies.sql`.
- Notfall-Rollback: `supabase/migrations/20260810221000_etappe11_rls_tenant_policies_rollback.sql`.
- Die Migration liegt vollständig in `BEGIN`/`COMMIT` und ist wiederholbar: Sie droppt ausschließlich die gleichnamige Etappe-11-Policy und erstellt sie anschließend neu. Bestehende `allow_all*`- und `service_role_only`-Policies werden nicht angefasst.
- 58 Standardpolicies folgen `FOR ALL TO authenticated` mit identischem `USING` und `WITH CHECK`: aktive Tenant-Mitgliedschaft für `auth.uid()` und dieselbe `tenant_id`.
- `tenants`: `SELECT` nur für eigene aktive Tenant-Mitgliedschaften.
- `tenant_memberships`: `SELECT` nur der eigenen Zeilen (`user_id = auth.uid()`).
- `app_benutzer`: `SELECT` eigener Eintrag oder aktiver Eintrag im gleichen Tenant. Eine eng berechtigte, `SECURITY DEFINER`-Helper-Funktion prüft nur diese gemeinsame aktive Mitgliedschaft; sie ist für `PUBLIC` gesperrt und nur `authenticated` darf sie ausführen. Dadurch bleibt die Membership-Policy selbst auf eigene Zeilen beschränkt und Userlisten funktionieren nach Cutover trotzdem.
- Alle 61 neuen Policies sind laut Post-Apply-Katalog ausschließlich der Rolle `authenticated` zugeordnet. Die drei Sonderpolicies sind `SELECT`; die übrigen 58 sind `ALL`.

### Neu angelegte Policies je Tabelle

| Tabelle | Policies vor | Policies nach | Neu |
|---|---:|---:|---:|
| `app_benutzer` | 1 | 2 | +1 |
| `aufgaben` | 0 | 1 | +1 |
| `auftraege` | 0 | 1 | +1 |
| `auftrag_kommentare` | 0 | 1 | +1 |
| `auftrag_positionen` | 0 | 1 | +1 |
| `auftrag_schritt_fotos` | 0 | 1 | +1 |
| `auftrag_schritte` | 0 | 1 | +1 |
| `auftrag_status_pipeline` | 0 | 1 | +1 |
| `chat_nachrichten` | 0 | 1 | +1 |
| `dokument_daten` | 0 | 1 | +1 |
| `dokumente` | 0 | 1 | +1 |
| `eingangsrechnungen` | 0 | 1 | +1 |
| `einstellungen` | 1 | 2 | +1 |
| `ferien` | 0 | 1 | +1 |
| `formulare` | 0 | 1 | +1 |
| `foto_dokumentation` | 0 | 1 | +1 |
| `garantien` | 0 | 1 | +1 |
| `kalkulationen` | 0 | 1 | +1 |
| `kunden` | 0 | 1 | +1 |
| `lager_artikel` | 0 | 1 | +1 |
| `lager_buchungen` | 0 | 1 | +1 |
| `lieferanten` | 0 | 1 | +1 |
| `liefertermine` | 0 | 1 | +1 |
| `mahnungen` | 0 | 1 | +1 |
| `materialbestellungen` | 0 | 1 | +1 |
| `mitarbeiter` | 0 | 1 | +1 |
| `nachkalkulation` | 1 | 2 | +1 |
| `nachkalkulation_fremdleistungen` | 2 | 3 | +1 |
| `nachkalkulation_material` | 2 | 3 | +1 |
| `nachkalkulation_soek` | 1 | 2 | +1 |
| `nachkalkulation_stunden` | 1 | 2 | +1 |
| `nk_positionen` | 1 | 2 | +1 |
| `nk_stunden` | 1 | 2 | +1 |
| `notizen` | 0 | 1 | +1 |
| `offerten` | 0 | 1 | +1 |
| `pdf_vorlagen` | 1 | 2 | +1 |
| `plantafel` | 0 | 1 | +1 |
| `rechnungen` | 0 | 1 | +1 |
| `rechnungsvorlagen` | 0 | 1 | +1 |
| `reklamationen` | 0 | 1 | +1 |
| `stundensaetze` | 0 | 1 | +1 |
| `subunternehmer` | 0 | 1 | +1 |
| `tagesrapporte` | 0 | 1 | +1 |
| `tenant_memberships` | 1 | 2 | +1 |
| `tenants` | 1 | 2 | +1 |
| `termine` | 0 | 1 | +1 |
| `verlauf` | 0 | 1 | +1 |
| `vk_fremdleistungen` | 1 | 2 | +1 |
| `vk_hauptmaterial` | 1 | 2 | +1 |
| `vk_hilfsmaterial` | 1 | 2 | +1 |
| `vk_soek` | 1 | 2 | +1 |
| `vk_stunden` | 1 | 2 | +1 |
| `vorkalkulation` | 1 | 2 | +1 |
| `vorkalkulation_config` | 1 | 2 | +1 |
| `vorkalkulation_fremdleistungen` | 1 | 2 | +1 |
| `vorkalkulation_hauptmaterial_flaeche` | 1 | 2 | +1 |
| `vorkalkulation_hilfsmaterial` | 1 | 2 | +1 |
| `vorkalkulation_material` | 1 | 2 | +1 |
| `vorkalkulation_soek` | 1 | 2 | +1 |
| `vorkalkulation_stunden` | 1 | 2 | +1 |
| `zeiteintraege` | 0 | 1 | +1 |

## Teil D – Produktiv-Apply und Snapshot-Vergleich

- Apply-Ergebnis: erfolgreich. Der erste CLI-Aufruf lief im Sandbox-Wrapper in ein Timeout, die gespeicherte Tool-Antwort lautet jedoch `{"success":true}`; sowohl Migrationshistorie als auch Post-Snapshot bestätigen den vollständigen Apply.
- Pre-Snapshot: 29 Policies. Post-Snapshot: 90 Policies. Differenz: exakt 61.
- Bei allen 61 betroffenen Tabellen stieg der Policy-Count um exakt 1.
- RLS-Aktivierung: unverändert bei allen 63 Tabellen (keine Abweichung im Pre/Post-Vergleich).
- `allow_all`-Altpolicies: **ja, weiterhin vorhanden**. Alle 26 vorgefundenen permissiven `allow_all*`-/`allow anon insert`-Policies sind nach Apply unverändert vorhanden.
- Post-Snapshot: `/home/user/workspace/auftragpro_etappe11_rls_post.md`; tabellengenauer Vergleich: `/home/user/workspace/auftragpro_etappe11_rls_pre_post_comparison.txt`.

## Live-Verifikation

| Check | Vor Apply | Nach Apply | Ergebnis |
|---|---|---|---|
| `GET https://auftragpro.onrender.com/api/termine` | HTTP 200, 775 Bytes | HTTP 200, 775 Bytes | Erfolgreich; JSON byte-identisch (SHA-256 `86902d395c73aaf458d6c41bc43b669a1f1a89358003c650206565b8bc6de43c`) |
| TypeScript `npm run check` | 21 Diagnosen | 21 Diagnosen | Baseline unverändert |

Es gab keinen HTTP-500-Fehler und keine leere Antwort. Daher war kein Rollback erforderlich.

## Teil E – Authenticated Read-Path-Test

Nicht durchgeführt. Ein Test mit realem kurzfristigem Benutzer-Token wäre in dieser Etappe nicht aussagekräftig: Der Live-Fachclient läuft noch als `anon`, ein großer Teil der Tabellen (einschließlich `termine`) hat RLS weiterhin deaktiviert, und auf aktivierten Alt-Tabellen sind die permissiven `public`/`allow_all`-Policies absichtlich noch wirksam. Ein zusätzlicher Test-Tenant würde Daten schreiben und wäre für den additive-only Sicherheitsnachweis unnötig invasiv. Der echte A/B-Read-Path-Test ist ein verpflichtendes Gate in Etappe 12, sobald der Server auf authenticated umgestellt und RLS pro Tabellenfamilie kontrolliert aktiviert wird.

## Rollback-Verfahren

Falls ein Incident unmittelbar nach dieser Etappe festgestellt wird, die Datei `supabase/migrations/20260810221000_etappe11_rls_tenant_policies_rollback.sql` als Migration anwenden. Sie entfernt ausschließlich die 61 `tenant_isolation_*`-Policies und die Helper-Funktion, lässt alle bestehenden Altpolicies sowie sämtliche RLS-Flags unverändert und liefert danach die Restanzahl der Etappe-11-Policies. Da Etappe 11 keine RLS-Flags geändert hat, ist kein zusätzliches `ALTER TABLE` für den Rollback nötig.

## Verbindliche Arbeit für Etappe 12

1. Wartungsfenster und tokenfähige Vor-Cutover-Release bereitstellen.
2. Server-Fachclient und alle geschützten API-Routen auf Bearer-Token mit `authenticated` umstellen (`AUTH_MODE=supabase`, `TENANCY_MODE=enforce`).
3. RLS für die noch deaktivierten Tenant-Tabellen kontrolliert aktivieren und sofort A/B-Read-/Write-Tests mit zwei getrennten Tenants ausführen.
4. Erst nach erfolgreichen Tests die permissiven `allow_all*`-Policies explizit entfernen; die heute hinzugefügten Policies werden dadurch wirksam.
5. `forster_content`, `forster_selections` und Storage-Policies separat entscheiden/absichern; `auth.users` bleibt unangetastet.

## Auffälligkeiten

- Die Supabase-Management-Integration vergab für die angewandte Migration die tatsächliche Versionsnummer `20260810201539`, obwohl die versionierte Repository-Datei dem lokalen Namensschema `20260810221000_...` folgt. Inhalt und Migrationsname stimmen überein.
- Der Apply-Aufruf lief im Sandbox-Wrapper länger als dessen Zeitlimit, war aber serverseitig erfolgreich abgeschlossen; der anschließende Snapshot, die Migration-History und der Live-HTTP-Check bestätigen den Erfolg. Es wurden keine Wiederholungs- oder Nebenmigrationen ausgelöst.
