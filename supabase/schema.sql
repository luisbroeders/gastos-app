-- =========================================================
-- Esquema para Gastos Familia
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

create extension if not exists "uuid-ossp";

-- Un "household" agrupa a las personas que comparten los movimientos (vos e Inés)
create table if not exists households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  saldo_inicial numeric(14,2) not null default 0,
  saldo_inicial_fecha date not null default current_date
);

-- Un perfil por usuario de Supabase Auth, vinculado a su household
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id),
  display_name text not null,
  created_at timestamptz default now()
);

-- Movimientos (gastos e ingresos)
create table if not exists movimientos (
  id uuid primary key,                          -- generado en el cliente (crypto.randomUUID)
  household_id uuid not null references households(id),
  fecha date not null,
  categoria text not null,
  detalle text default '',
  monto numeric(14,2) not null check (monto > 0),
  tipo text not null check (tipo in ('gasto', 'ingreso')),
  created_by uuid references profiles(id),
  created_by_nombre text,
  updated_at timestamptz not null default now(),
  deleted smallint not null default 0
);

create index if not exists idx_movimientos_household on movimientos(household_id);
create index if not exists idx_movimientos_updated_at on movimientos(updated_at);

-- =========================================================
-- Row Level Security: cada usuario solo ve datos de su household
-- =========================================================

create or replace function get_my_household()
returns uuid
language sql
security definer
stable
as $$
  select household_id from profiles where id = auth.uid()
$$;

alter table households enable row level security;
alter table profiles enable row level security;
alter table movimientos enable row level security;

create policy "select own household" on households
  for select using (id = get_my_household());

create policy "select profiles same household" on profiles
  for select using (household_id = get_my_household());

create policy "update own profile" on profiles
  for update using (id = auth.uid());

create policy "select movimientos same household" on movimientos
  for select using (household_id = get_my_household());

create policy "insert movimientos same household" on movimientos
  for insert with check (household_id = get_my_household());

create policy "update movimientos same household" on movimientos
  for update using (household_id = get_my_household());

-- =========================================================
-- Setup inicial manual (una sola vez, para 2 usuarios)
-- =========================================================
-- 1) Creá los dos usuarios en Authentication -> Users -> Add user
--    (con email + password para vos e Inés).
-- 2) Corré esto reemplazando los valores:
--
-- insert into households (name, saldo_inicial, saldo_inicial_fecha)
-- values ('Familia Broeders', 0, current_date)
-- returning id; -- copiá el id que devuelve
--
-- insert into profiles (id, household_id, display_name) values
--   ('<uuid-usuario-luis>', '<uuid-household>', 'Luis'),
--   ('<uuid-usuario-ines>', '<uuid-household>', 'Inés');
--
-- Los uuid de usuario se ven en Authentication -> Users.
