import { supabase } from './supabaseClient'
import { db } from './db'
import type { Movimiento, Categoria, CompraTarjeta, TarjetaCierre } from './types'
import type { Table } from 'dexie'

interface Sincronizable {
  id: string
  household_id: string
  updated_at: string
  deleted: 0 | 1
  synced: 0 | 1
}

const LAST_PULL_KEY = (tabla: string, householdId: string) => `last_pull_${tabla}_${householdId}`
const ULTIMA_SYNC_KEY = (householdId: string) => `ultima_sync_${householdId}`
const EVENTO_SYNC = 'gastos-sync-actualizada'

function getLastPull(tabla: string, householdId: string): string {
  return localStorage.getItem(LAST_PULL_KEY(tabla, householdId)) ?? '1970-01-01T00:00:00.000Z'
}

function setLastPull(tabla: string, householdId: string, iso: string) {
  localStorage.setItem(LAST_PULL_KEY(tabla, householdId), iso)
}

/** Fecha/hora (ISO) de la última sincronización exitosa, o null si nunca sincronizó en este dispositivo. */
export function getUltimaSync(householdId: string): string | null {
  return localStorage.getItem(ULTIMA_SYNC_KEY(householdId))
}

function setUltimaSync(householdId: string) {
  const ahora = new Date().toISOString()
  localStorage.setItem(ULTIMA_SYNC_KEY(householdId), ahora)
  // Evento propio para que la UI (el indicador de "última sync") se actualice
  // en el momento, sea que la sincronización haya sido automática o manual.
  window.dispatchEvent(new CustomEvent(EVENTO_SYNC, { detail: { householdId, fecha: ahora } }))
}

/** Nombre del evento que dispara cada sincronización exitosa (útil para suscribirse desde componentes). */
export const EVENTO_SYNC_ACTUALIZADA = EVENTO_SYNC

/** Sube a Supabase los registros locales todavía no sincronizados de una tabla. */
async function pushPendienteGenerico<T extends Sincronizable>(tabla: string, tablaLocal: Table<T, string>) {
  const pendientes = await tablaLocal.where('synced').equals(0).toArray()
  if (pendientes.length === 0) return { pushed: 0 }

  const rows = pendientes.map(({ synced, ...rest }) => rest)
  const { error } = await supabase.from(tabla).upsert(rows as any[], { onConflict: 'id' })
  if (error) return { pushed: 0, error: error.message }

  await tablaLocal.bulkPut(pendientes.map((r) => ({ ...r, synced: 1 as const })))
  return { pushed: pendientes.length }
}

/**
 * Trae de Supabase los cambios (propios o del otro usuario) desde el último pull de esa tabla.
 *
 * Pagina explícitamente: Supabase/PostgREST limita cada respuesta a un máximo de filas
 * (por defecto 1000), así que una sola consulta no alcanza para households con muchos
 * movimientos (por ejemplo, después de una carga masiva). Sin paginar, el `since` quedaba
 * calculado sobre una página incompleta y el resto de las filas nunca se volvían a pedir
 * (sobre todo si comparten el mismo `updated_at`, como pasa con filas insertadas en el
 * mismo lote), dejando el saldo local desincronizado de forma persistente.
 */
async function pullRemotoGenerico<T extends Sincronizable>(
  tabla: string,
  tablaLocal: Table<T, string>,
  householdId: string
) {
  const since = getLastPull(tabla, householdId)
  const PAGE_SIZE = 1000
  let offset = 0
  let totalPulled = 0
  let maxUpdatedAt = since

  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .eq('household_id', householdId)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) return { pulled: totalPulled, error: error.message }
    if (!data || data.length === 0) break

    const registros = data.map((r) => ({ ...r, synced: 1 as const })) as T[]
    await tablaLocal.bulkPut(registros)
    totalPulled += data.length
    maxUpdatedAt = data.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), maxUpdatedAt)

    if (data.length < PAGE_SIZE) break // última página: no hace falta pedir más
    offset += PAGE_SIZE
  }

  if (totalPulled > 0) setLastPull(tabla, householdId, maxUpdatedAt)
  return { pulled: totalPulled }
}

export async function pushPending() {
  return pushPendienteGenerico<Movimiento>('movimientos', db.movimientos)
}

export async function pullRemote(householdId: string) {
  return pullRemotoGenerico<Movimiento>('movimientos', db.movimientos, householdId)
}

/** Push + pull de movimientos, categorías, compras con tarjeta y sus fechas de cierre. Falla en silencio si no hay conexión. */
export async function runSync(householdId: string) {
  if (!navigator.onLine) return
  try {
    await pushPendienteGenerico<Movimiento>('movimientos', db.movimientos)
    await pullRemotoGenerico<Movimiento>('movimientos', db.movimientos, householdId)
    await pushPendienteGenerico<Categoria>('categorias', db.categorias)
    await pullRemotoGenerico<Categoria>('categorias', db.categorias, householdId)
    await pushPendienteGenerico<CompraTarjeta>('compras_tarjeta', db.comprasTarjeta)
    await pullRemotoGenerico<CompraTarjeta>('compras_tarjeta', db.comprasTarjeta, householdId)
    await pushPendienteGenerico<TarjetaCierre>('tarjetas_cierres', db.tarjetasCierres)
    await pullRemotoGenerico<TarjetaCierre>('tarjetas_cierres', db.tarjetasCierres, householdId)
    setUltimaSync(householdId)
  } catch {
    // sin conexión real o error transitorio: se reintenta en el próximo ciclo
  }
}

/**
 * Borra (soft-delete) un movimiento cargado mal. No se elimina físicamente:
 * se marca `deleted = 1` y se deja `synced = 0` para que el próximo sync lo
 * suba y desaparezca también del lado del otro usuario. Funciona offline
 * igual que una carga nueva (se sincroniza cuando vuelve la conexión).
 */
export async function borrarMovimiento(id: string, householdId: string) {
  const actual = await db.movimientos.get(id)
  if (!actual) return
  await db.movimientos.put({ ...actual, deleted: 1, updated_at: new Date().toISOString(), synced: 0 })
  runSync(householdId)
}

/** Crea o renombra una categoría (ABM). Funciona offline igual que el resto. */
export async function guardarCategoria(categoria: Categoria, householdId: string) {
  await db.categorias.put(categoria)
  runSync(householdId)
}

/** Borra (soft-delete) una categoría. Los movimientos ya cargados con ese texto no se tocan. */
export async function borrarCategoria(id: string, householdId: string) {
  const actual = await db.categorias.get(id)
  if (!actual) return
  await db.categorias.put({ ...actual, deleted: 1, updated_at: new Date().toISOString(), synced: 0 })
  runSync(householdId)
}

/** Crea una compra con tarjeta. No afecta el saldo (no es un movimiento de caja). */
export async function guardarCompraTarjeta(compra: CompraTarjeta, householdId: string) {
  await db.comprasTarjeta.put(compra)
  runSync(householdId)
}

/** Borra (soft-delete) una compra con tarjeta cargada mal. */
export async function borrarCompraTarjeta(id: string, householdId: string) {
  const actual = await db.comprasTarjeta.get(id)
  if (!actual) return
  await db.comprasTarjeta.put({ ...actual, deleted: 1, updated_at: new Date().toISOString(), synced: 0 })
  runSync(householdId)
}

/**
 * Guarda las fechas de cierre de una tarjeta (una fila por tarjeta). Si ya
 * existía una fila para esa tarjeta la actualiza (mismo id); si no, crea una
 * nueva. Esto evita duplicados si el usuario edita las fechas más de una vez.
 */
export async function guardarTarjetaCierre(
  householdId: string,
  tarjeta: string,
  cierreAnterior: string | null,
  cierreProximo: string | null
) {
  const existente = await db.tarjetasCierres
    .where('household_id')
    .equals(householdId)
    .and((t) => t.tarjeta === tarjeta && t.deleted === 0)
    .first()

  const registro: TarjetaCierre = {
    id: existente?.id ?? crypto.randomUUID(),
    household_id: householdId,
    tarjeta,
    cierre_anterior: cierreAnterior,
    cierre_proximo: cierreProximo,
    updated_at: new Date().toISOString(),
    deleted: 0,
    synced: 0,
  }
  await db.tarjetasCierres.put(registro)
  runSync(householdId)
}
/** Arranca sincronización periódica + al reconectar. Devuelve función de limpieza. */
export function startSyncLoop(householdId: string, intervalMs = 30_000) {
  const tick = () => runSync(householdId)
  tick()
  const interval = setInterval(tick, intervalMs)
  window.addEventListener('online', tick)
  return () => {
    clearInterval(interval)
    window.removeEventListener('online', tick)
  }
}
