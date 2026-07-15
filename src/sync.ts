import { supabase } from './supabaseClient'
import { db } from './db'
import type { Movimiento } from './types'

const LAST_PULL_KEY = (householdId: string) => `last_pull_${householdId}`

function getLastPull(householdId: string): string {
  return localStorage.getItem(LAST_PULL_KEY(householdId)) ?? '1970-01-01T00:00:00.000Z'
}

function setLastPull(householdId: string, iso: string) {
  localStorage.setItem(LAST_PULL_KEY(householdId), iso)
}

/** Sube a Supabase todos los movimientos locales todavía no sincronizados. */
export async function pushPending(): Promise<{ pushed: number; error?: string }> {
  const pendientes = await db.movimientos.where('synced').equals(0).toArray()
  if (pendientes.length === 0) return { pushed: 0 }

  // Quitamos el flag `synced` (solo local) antes de mandarlo al server.
  const rows = pendientes.map(({ synced, ...rest }) => rest)

  const { error } = await supabase.from('movimientos').upsert(rows, { onConflict: 'id' })
  if (error) {
    return { pushed: 0, error: error.message }
  }

  await db.movimientos.bulkPut(pendientes.map((m) => ({ ...m, synced: 1 as const })))
  return { pushed: pendientes.length }
}

/** Trae de Supabase los cambios (propios o del otro usuario) desde el último pull. */
export async function pullRemote(householdId: string): Promise<{ pulled: number; error?: string }> {
  const since = getLastPull(householdId)
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('household_id', householdId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })

  if (error) return { pulled: 0, error: error.message }
  if (!data || data.length === 0) return { pulled: 0 }

  const asMovimientos: Movimiento[] = data.map((r) => ({ ...r, synced: 1 as const }))
  await db.movimientos.bulkPut(asMovimientos)

  const maxUpdatedAt = data.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), since)
  setLastPull(householdId, maxUpdatedAt)
  return { pulled: data.length }
}

/** Push + pull en un solo paso. Falla en silencio si no hay conexión. */
export async function runSync(householdId: string) {
  if (!navigator.onLine) return
  try {
    await pushPending()
    await pullRemote(householdId)
  } catch {
    // sin conexión real o error transitorio: se reintenta en el próximo ciclo
  }
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
