-- =========================================================
-- Migración: compras con tarjeta de crédito (no afectan el saldo)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

create table if not exists compras_tarjeta (
  id uuid primary key,               -- generado en el cliente (crypto.randomUUID)
  household_id uuid not null references households(id),
  fecha date not null,
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  tarjeta text null,                 -- opcional: Visa BBVA / Mastercard BBVA / Mastercard MP / Mastercard BNA
  created_by uuid references profiles(id),
  created_by_nombre text,
  updated_at timestamptz not null default now(),
  deleted smallint not null default 0
);

create index if not exists idx_compras_tarjeta_household on compras_tarjeta(household_id);
create index if not exists idx_compras_tarjeta_updated_at on compras_tarjeta(updated_at);

alter table compras_tarjeta enable row level security;

create policy "select compras_tarjeta same household" on compras_tarjeta
  for select using (household_id = get_my_household());

create policy "insert compras_tarjeta same household" on compras_tarjeta
  for insert with check (household_id = get_my_household());

create policy "update compras_tarjeta same household" on compras_tarjeta
  for update using (household_id = get_my_household());

-- Nota: esta tabla es completamente independiente de `movimientos` (no se
-- suma ni resta del saldo en ningún cálculo de la app) porque son compras a
-- crédito, no plata que salió de la cuenta en el momento.
