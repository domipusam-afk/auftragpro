-- PDF Vorlagen Tabelle
create table if not exists pdf_vorlagen (
  id uuid primary key default gen_random_uuid(),
  doc_typ text not null unique check (doc_typ in ('offerte','rechnung','mahnung','lieferschein','auftragsbestaetigung')),
  design text not null default 'A',
  slogan text default 'Ihr Partner für Metallbau & Schreinerei',
  header_color text default '#6b4c2a',
  footer_color text default '#1a3a6b',
  logo_pos text default 'links',
  zahlungsfrist text default '30',
  mahngebuehr text default '30.00',
  einleitung text default '',
  schluss text default '',
  show_contact boolean default true,
  show_page_num boolean default true,
  logo_data_url text default null,
  logo_scale integer default 100,
  watermark_data_url text default null,
  watermark_opacity integer default 15,
  watermark_size integer default 60,
  watermark_pos text default 'bottom',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS policies
alter table pdf_vorlagen enable row level security;
create policy "allow_all" on pdf_vorlagen for all using (true);
