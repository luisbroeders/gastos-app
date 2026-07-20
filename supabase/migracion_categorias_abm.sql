-- =========================================================
-- Migración: tabla de categorías administrables (ABM)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- (Es una migración adicional: no borra ni toca `movimientos`.)
-- =========================================================

create table if not exists categorias (
  id uuid primary key,                 -- generado en el cliente (crypto.randomUUID)
  household_id uuid not null references households(id),
  nombre text not null,
  updated_at timestamptz not null default now(),
  deleted smallint not null default 0
);

create index if not exists idx_categorias_household on categorias(household_id);
create index if not exists idx_categorias_updated_at on categorias(updated_at);

alter table categorias enable row level security;

create policy "select categorias same household" on categorias
  for select using (household_id = get_my_household());

create policy "insert categorias same household" on categorias
  for insert with check (household_id = get_my_household());

create policy "update categorias same household" on categorias
  for update using (household_id = get_my_household());

-- =========================================================
-- Seed: carga las categorías que hasta ahora estaban hardcodeadas en la app,
-- para que no se pierda nada al pasar al ABM. Reemplazá el household_id.
-- =========================================================
-- insert into categorias (id, household_id, nombre) values
--   (uuid_generate_v4(), '<uuid-household>', 'Almacén / Verdulería / Carnicería'),
--   (uuid_generate_v4(), '<uuid-household>', 'Auto / Nafta / Cochera'),
--   (uuid_generate_v4(), '<uuid-household>', 'Cafetería'),
--   (uuid_generate_v4(), '<uuid-household>', 'Celular'),
--   (uuid_generate_v4(), '<uuid-household>', 'Colegio / Educación'),
--   (uuid_generate_v4(), '<uuid-household>', 'Devoluciones / Reintegros'),
--   (uuid_generate_v4(), '<uuid-household>', 'Expensas / Municipal / ARBA'),
--   (uuid_generate_v4(), '<uuid-household>', 'Gimnasio / Deportes / Pilates'),
--   (uuid_generate_v4(), '<uuid-household>', 'Hogar / Ferretería'),
--   (uuid_generate_v4(), '<uuid-household>', 'Impuestos'),
--   (uuid_generate_v4(), '<uuid-household>', 'Indumentaria / Calzado'),
--   (uuid_generate_v4(), '<uuid-household>', 'Otros'),
--   (uuid_generate_v4(), '<uuid-household>', 'Panadería'),
--   (uuid_generate_v4(), '<uuid-household>', 'Peluquería / Estética'),
--   (uuid_generate_v4(), '<uuid-household>', 'Préstamos Inés'),
--   (uuid_generate_v4(), '<uuid-household>', 'Regalos'),
--   (uuid_generate_v4(), '<uuid-household>', 'Rendimientos / Inversiones'),
--   (uuid_generate_v4(), '<uuid-household>', 'Restaurantes / Delivery'),
--   (uuid_generate_v4(), '<uuid-household>', 'Salidas / Entretenimiento'),
--   (uuid_generate_v4(), '<uuid-household>', 'Salud (farmacia, médicos, psicóloga)'),
--   (uuid_generate_v4(), '<uuid-household>', 'Servicios (luz, gas, agua, internet)'),
--   (uuid_generate_v4(), '<uuid-household>', 'Sin categoría'),
--   (uuid_generate_v4(), '<uuid-household>', 'Sueldo'),
--   (uuid_generate_v4(), '<uuid-household>', 'Supermercado'),
--   (uuid_generate_v4(), '<uuid-household>', 'Tarjetas de crédito'),
--   (uuid_generate_v4(), '<uuid-household>', 'Transporte (Uber/Taxi/SUBE)'),
--   (uuid_generate_v4(), '<uuid-household>', 'Viajes');
--
-- Para hacerlo sin copiar el household_id a mano, podés correr directamente
-- esta versión (usa el único household que tiene la app hoy):
insert into categorias (id, household_id, nombre)
select uuid_generate_v4(), (select id from households limit 1), nombre
from unnest(array[
  'Almacén / Verdulería / Carnicería','Auto / Nafta / Cochera','Cafetería','Celular',
  'Colegio / Educación','Devoluciones / Reintegros','Expensas / Municipal / ARBA',
  'Gimnasio / Deportes / Pilates','Hogar / Ferretería','Impuestos','Indumentaria / Calzado',
  'Otros','Panadería','Peluquería / Estética','Préstamos Inés','Regalos',
  'Rendimientos / Inversiones','Restaurantes / Delivery','Salidas / Entretenimiento',
  'Salud (farmacia, médicos, psicóloga)','Servicios (luz, gas, agua, internet)','Sin categoría',
  'Sueldo','Supermercado','Tarjetas de crédito','Transporte (Uber/Taxi/SUBE)','Viajes'
]) as nombre
where not exists (
  select 1 from categorias c
  where c.household_id = (select id from households limit 1) and c.nombre = nombre
);
