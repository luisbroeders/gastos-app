-- =========================================================
-- Migración: cuotas y tasa en compras_tarjeta
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

alter table compras_tarjeta add column if not exists cuotas integer not null default 1;
alter table compras_tarjeta add column if not exists tasa numeric(6,2) not null default 0;

-- Ambos son opcionales para quien carga (la app ya manda 1 y 0 si se dejan
-- en blanco), así que no hace falta backfill: las filas existentes quedan
-- automáticamente en 1 cuota / 0% de tasa con el "default" de la columna.
