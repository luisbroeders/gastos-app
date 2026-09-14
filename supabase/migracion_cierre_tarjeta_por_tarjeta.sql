-- =========================================================
-- Migración: fecha de cierre POR TARJETA (reemplaza el enfoque anterior de
-- una sola fecha global en `households` — si llegaste a correr
-- "migracion_cierre_tarjeta.sql" en algún momento, esta la reemplaza:
-- la columna `households.tarjeta_cierre_fecha` queda sin uso, no hace falta
-- borrarla a mano, simplemente no se usa más.)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

-- Fechas de cierre por tarjeta (una fila por tarjeta): son fechas exactas,
-- no un día del mes que se repite, porque el cierre real puede correrse
-- (fines de semana, feriados, políticas del banco).
create table if not exists tarjetas_cierres (
  id uuid primary key,
  household_id uuid not null references households(id),
  tarjeta text not null,
  cierre_anterior date null,  -- arranca el ciclo actual
  cierre_proximo date null,   -- termina el ciclo actual
  updated_at timestamptz not null default now(),
  deleted smallint not null default 0,
  unique (household_id, tarjeta)
);

create index if not exists idx_tarjetas_cierres_household on tarjetas_cierres(household_id);
create index if not exists idx_tarjetas_cierres_updated_at on tarjetas_cierres(updated_at);

alter table tarjetas_cierres enable row level security;

create policy "select tarjetas_cierres same household" on tarjetas_cierres
  for select using (household_id = get_my_household());

create policy "insert tarjetas_cierres same household" on tarjetas_cierres
  for insert with check (household_id = get_my_household());

create policy "update tarjetas_cierres same household" on tarjetas_cierres
  for update using (household_id = get_my_household());
