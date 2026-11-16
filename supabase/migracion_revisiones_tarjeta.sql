-- =========================================================
-- Migración: revisión de resúmenes de tarjeta
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

-- Una fila por revisión (una por tarjeta y por resumen). Guarda lo que se leyó
-- del PDF del banco (consumos y cargos, en jsonb) y qué ítems se confirmaron a
-- mano. El cruce con las compras de la app se calcula en la app, en vivo.
-- No hay restricción UNIQUE a propósito: la app ya evita duplicar (reutiliza el
-- id si existe la revisión del mismo resumen), y una restricción acá podría
-- hacer fallar la sincronización si dos dispositivos cargan lo mismo a la vez.
create table if not exists revisiones_tarjeta (
  id uuid primary key,                 -- generado en el cliente (crypto.randomUUID)
  household_id uuid not null references households(id),
  tarjeta text not null,               -- una de las tarjetas de la app
  cierre_anterior date not null,
  cierre_actual date not null,
  proximo_cierre date null,
  vencimiento date null,
  saldo_pesos numeric(14,2) null,
  saldo_usd numeric(14,2) null,
  consumos jsonb not null default '[]'::jsonb,
  cargos jsonb not null default '[]'::jsonb,
  confirmados jsonb not null default '[]'::jsonb,
  archivo text null,
  created_by uuid references profiles(id),
  created_by_nombre text,
  updated_at timestamptz not null default now(),
  deleted smallint not null default 0
);

create index if not exists idx_revisiones_tarjeta_household on revisiones_tarjeta(household_id);
create index if not exists idx_revisiones_tarjeta_updated_at on revisiones_tarjeta(updated_at);

alter table revisiones_tarjeta enable row level security;

create policy "select revisiones_tarjeta same household" on revisiones_tarjeta
  for select using (household_id = get_my_household());

create policy "insert revisiones_tarjeta same household" on revisiones_tarjeta
  for insert with check (household_id = get_my_household());

create policy "update revisiones_tarjeta same household" on revisiones_tarjeta
  for update using (household_id = get_my_household());
