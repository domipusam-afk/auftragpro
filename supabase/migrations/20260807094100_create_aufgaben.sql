-- Eigenständige To-Do-Liste. Die optionalen Verknüpfungen werden beim Löschen
-- eines Auftrags bzw. Mitarbeiters bewusst gelöst, damit die Aufgabe erhalten bleibt.
create table if not exists public.aufgaben (
  id text primary key,
  titel text not null,
  beschreibung text,
  auftrag_id text references public.auftraege(id) on delete set null,
  mitarbeiter_id text references public.mitarbeiter(id) on delete set null,
  faellig_datum date,
  status text not null default 'offen' check (status in ('offen', 'abgeschlossen')),
  erstellt timestamptz not null default now(),
  erledigt_am timestamptz,
  aktualisiert timestamptz not null default now()
);

create index if not exists aufgaben_status_idx on public.aufgaben (status);
create index if not exists aufgaben_faellig_datum_idx on public.aufgaben (faellig_datum);
