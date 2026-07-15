export type TipoMovimiento = 'gasto' | 'ingreso'

export interface Movimiento {
  id: string // uuid, generado en el cliente (crypto.randomUUID)
  household_id: string
  fecha: string // YYYY-MM-DD
  categoria: string
  detalle: string
  monto: number // siempre positivo, el signo lo da `tipo`
  tipo: TipoMovimiento
  created_by: string
  created_by_nombre?: string
  updated_at: string // ISO timestamp, usado para resolver conflictos (last-write-wins)
  // Nota: se usan 0/1 en vez de boolean porque IndexedDB no admite booleanos
  // como clave de índice (Dexie los necesita para poder filtrar por estos campos).
  deleted: 0 | 1
  synced: 0 | 1 // solo local: indica si ya se subió a Supabase
}

export interface Household {
  id: string
  name: string
  saldo_inicial: number
  saldo_inicial_fecha: string
}

export interface Profile {
  id: string
  household_id: string
  display_name: string
}
