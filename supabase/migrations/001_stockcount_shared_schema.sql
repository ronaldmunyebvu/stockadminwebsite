create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  variance_threshold_pct numeric not null default 5,
  variance_threshold_units integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('admin', 'counter', 'auditor')),
  full_name text not null default '',
  email text not null,
  phone text,
  is_active boolean not null default true,
  setup_status text not null default 'invited' check (setup_status in ('active', 'invited', 'setup_complete')),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null check (type in ('warehouse', 'store', 'site')),
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete restrict,
  name text not null,
  barcode text,
  sku text not null,
  unit text not null default 'unit',
  category text,
  system_qty numeric not null default 0,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);

create table if not exists public.count_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  zone_id uuid references public.zones(id) on delete restrict,
  name text not null,
  status text not null default 'draft' check (status in ('draft','in_progress','submitted','under_review','approved','rejected','recount_assigned')),
  mode text not null check (mode in ('blind','visible','double')),
  item_ids uuid[] not null default '{}',
  assigned_counter_id uuid references public.users(id) on delete set null,
  assigned_counter_2_id uuid references public.users(id) on delete set null,
  auditor_id uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.count_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.count_sessions(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  counted_qty numeric not null,
  system_qty numeric not null,
  variance numeric not null,
  counted_by uuid not null references public.users(id) on delete restrict,
  device_id text,
  gps_lat numeric,
  gps_lon numeric,
  counted_at timestamptz not null default now(),
  is_flagged boolean not null default false,
  notes text,
  count_round integer not null default 1,
  witnessed boolean not null default false,
  witness_name text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references public.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.excel_uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  raw_data jsonb not null default '[]'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  rows_preview jsonb not null default '[]'::jsonb,
  imported_count integer not null default 0,
  zone_id uuid references public.zones(id) on delete set null,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.current_org_id() returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.users where auth_user_id = auth.uid() and is_active = true limit 1
$$;

create or replace function public.claim_invited_user(user_email text, user_name text) returns public.users language plpgsql security definer set search_path = public as $$
declare claimed public.users;
begin
  update public.users set auth_user_id = auth.uid(), full_name = nullif(trim(user_name), ''), setup_status = 'setup_complete'
  where lower(email) = lower(trim(user_email)) and auth_user_id is null and is_active = true
  returning * into claimed;
  if claimed.id is null then raise exception 'No active invitation found for this email'; end if;
  return claimed;
end;
$$;

create or replace function public.create_shop_admin(shop_name text, admin_name text, admin_email text) returns public.users language plpgsql security definer set search_path = public as $$
declare new_org public.organizations; new_admin public.users;
begin
  insert into public.organizations(name) values (trim(shop_name)) returning * into new_org;
  insert into public.users(auth_user_id, org_id, role, full_name, email, is_active, setup_status)
  values (auth.uid(), new_org.id, 'admin', trim(admin_name), lower(trim(admin_email)), true, 'setup_complete')
  returning * into new_admin;
  return new_admin;
end;
$$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.claim_invited_user(text, text) to authenticated;
grant execute on function public.create_shop_admin(text, text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.locations enable row level security;
alter table public.zones enable row level security;
alter table public.items enable row level security;
alter table public.count_sessions enable row level security;
alter table public.count_entries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.excel_uploads enable row level security;

do $$ declare t text; begin
  foreach t in array array['organizations','users','locations','zones','items','count_sessions','count_entries','audit_logs','excel_uploads'] loop
    execute format('drop policy if exists stockcount_org_access on public.%I', t);
  end loop;
end $$;

create policy stockcount_org_access on public.organizations for all to authenticated using (id = public.current_org_id()) with check (id = public.current_org_id());
create policy stockcount_org_access on public.users for all to authenticated using (org_id = public.current_org_id() or auth_user_id = auth.uid()) with check (org_id = public.current_org_id() or auth_user_id = auth.uid());
create policy stockcount_org_access on public.locations for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy stockcount_org_access on public.zones for all to authenticated using (location_id in (select id from public.locations where org_id = public.current_org_id())) with check (location_id in (select id from public.locations where org_id = public.current_org_id()));
create policy stockcount_org_access on public.items for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy stockcount_org_access on public.count_sessions for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy stockcount_org_access on public.count_entries for all to authenticated using (session_id in (select id from public.count_sessions where org_id = public.current_org_id())) with check (session_id in (select id from public.count_sessions where org_id = public.current_org_id()));
create policy stockcount_org_access on public.audit_logs for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy stockcount_org_access on public.excel_uploads for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
