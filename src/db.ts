import Dexie, { type Table } from 'dexie'
import type { Movimiento } from './types'

// Base local (IndexedDB) que vive en el celular/navegador. Es la fuente de
// verdad para la UI: se escribe acá primero (funciona sin conexión) y un
// proceso de sincronización aparte la mantiene alineada con Supabase.
class GastosDB extends Dexie {
  movimientos!: Table<Movimiento, string>

  constructor() {
    super('gastos-app-db')
    this.version(1).stores({
      // índices para las consultas más comunes: por fecha, por synced, por deleted
      movimientos: 'id, fecha, synced, deleted, household_id',
    })
  }
}

export const db = new GastosDB()
