-- =========================================================
-- Migración: agregar "Forma de pago" a movimientos
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

alter table movimientos add column if not exists forma_pago text null;

-- Nota: es un campo de texto libre (no un enum en la base) para no tener que
-- migrar el esquema si el día de mañana se agrega/renombra una forma de pago
-- desde la app. La lista cerrada (Efectivo, Crédito, Billetera Digital,
-- Débito, Transferencia) se valida y ordena alfabéticamente del lado del
-- frontend (src/categories.ts -> FORMAS_PAGO).
