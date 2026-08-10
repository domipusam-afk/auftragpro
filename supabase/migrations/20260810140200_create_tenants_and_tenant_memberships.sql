create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'aktiv' check (status in ('aktiv','gesperrt','archiviert')),
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rolle text not null check (rolle in ('admin','mitarbeiter')),
  berechtigungen jsonb not null default '{}'::jsonb,
  aktiv boolean not null default true,
  mfa_erforderlich boolean not null default false,
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_memberships_user_active_idx
  on public.tenant_memberships (user_id, tenant_id) where aktiv;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;

create policy "service_role_only" on public.tenants
  for all to service_role
  using (true)
  with check (true);

create policy "service_role_only" on public.tenant_memberships
  for all to service_role
  using (true)
  with check (true);
