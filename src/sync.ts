import { supabase } from './supabaseClient'
import { db } from './db'
import type { Movimiento, Categoria } from './types'
import type { Table } from 'dexie'

interface Sincronizable {
  id: string
  household_id: string
  updated_at: string
  deleted: 0 | 1
  synced: 0 | 1
}

const LAST_PULL_KEY = (tabla: string, householdId: string) => `last_pull_${tabla}_${householdId}`

function getLastPull(tabla: string, householdId: string): string {
  return localStorage.getItem(LAST_PULL_KEY(tabla, householdId)) ?? '1970-01-01T00:00:00.000Z'
}

function setLastPull(tabla: string, householdId: string, iso: string) {
  localStorage.setItem(LAST_PULL_KEY(tabla, householdId), iso)
}

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

/** Push + pull de movimientos y categorías en un solo paso. Falla en silencio si no hay conexión. */
export async function runSync(householdId: string) {
  if (!navigator.onLine) return
  try {
    await pushPendienteGenerico<Movimiento>('movimientos', db.movimientos)
    await pullRemotoGenerico<Movimiento>('movimientos', db.movimientos, householdId)
    await pushPendienteGenerico<Categoria>('categorias', db.categorias)
    await pullRemotoGenerico<Categoria>('categorias', db.categorias, householdId)
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
