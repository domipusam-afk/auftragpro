-- Passwort-Zurücksetzen per E-Mail-Link.
-- Token wird nur gehasht gespeichert (wie ein Passwort) — der Klartext-Token
-- existiert ausschliesslich kurz im E-Mail-Link. Läuft nach 1 Stunde ab und
-- ist nach einmaliger Verwendung ungültig.
create table if not exists passwort_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  benutzer_id uuid not null references app_benutzer(id) on delete cascade,
  token_hash text not null,
  erstellt timestamptz not null default now(),
  ablauf timestamptz not null,
  verwendet_am timestamptz
);

create index if not exists idx_passwort_reset_tokens_benutzer_id on passwort_reset_tokens(benutzer_id);
create index if not exists idx_passwort_reset_tokens_token_hash on passwort_reset_tokens(token_hash);

comment on table passwort_reset_tokens is 'Kurzlebige, gehashte Tokens für Self-Service Passwort-Reset per E-Mail-Link.';
