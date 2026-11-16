export type TipoMovimiento = 'gasto' | 'ingreso'

export interface Movimiento {
  id: string // uuid, generado en el cliente (crypto.randomUUID)
  household_id: string
  fecha: string // YYYY-MM-DD
  categoria: string
  detalle: string
  monto: number // siempre positivo, el signo lo da `tipo`
  tipo: TipoMovimiento
  forma_pago: string | null // opcional; solo aplica a gastos
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

export interface Categoria {
  id: string // uuid, generado en el cliente
  household_id: string
  nombre: string
  updated_at: string
  deleted: 0 | 1
  synced: 0 | 1 // solo local
}

export interface CompraTarjeta {
  id: string // uuid, generado en el cliente
  household_id: string
  fecha: string // YYYY-MM-DD
  descripcion: string
  monto: number
  tarjeta: string | null // opcional
  cuotas: number // opcional para el usuario; por defecto 1
  tasa: number // opcional para el usuario; por defecto 0 (%)
  created_by: string
  created_by_nombre?: string
  updated_at: string
  deleted: 0 | 1
  synced: 0 | 1 // solo local
}

export interface TarjetaCierre {
  id: string // uuid, generado en el cliente (uno por tarjeta)
  household_id: string
  tarjeta: string // uno de los valores de TARJETAS
  cierre_anterior: string | null // YYYY-MM-DD — arranca el ciclo actual
  cierre_proximo: string | null // YYYY-MM-DD — termina el ciclo actual
  updated_at: string
  deleted: 0 | 1
  synced: 0 | 1 // solo local
}

/** Un consumo tal como figura en el resumen del banco. */
export interface ConsumoResumen {
  id: string // estable dentro de la revisión ("c0", "c1", ...)
  fecha: string // YYYY-MM-DD (en cuotas, es la fecha de la compra original)
  descripcion: string // comercio, sin la marca de cuota ni el "USD x"
  descripcionOriginal: string
  monto: number | null // en pesos (null si el consumo es en dólares)
  usd: number | null // en dólares (null si es en pesos)
  cuota: { n: number; total: number } | null // "C.02/03" -> { n: 2, total: 3 }
  cupon: string
  titular: string // titular/adicional al que corresponde el consumo
}

/** Impuestos, cargos e intereses del resumen (no se comparan con las compras). */
export interface CargoResumen {
  fecha: string
  descripcion: string
  monto: number
}

/**
 * Revisión de un resumen de tarjeta: guarda lo leído del resumen y qué ítems
 * se confirmaron a mano. El cruce con las compras de la app se recalcula en
 * vivo (así, si corregís una compra, la revisión se actualiza sola).
 */
export interface RevisionTarjeta {
  id: string
  household_id: string
  tarjeta: string // una de TARJETAS
  cierre_anterior: string // YYYY-MM-DD
  cierre_actual: string // YYYY-MM-DD
  proximo_cierre: string | null
  vencimiento: string | null
  saldo_pesos: number | null
  saldo_usd: number | null
  consumos: ConsumoResumen[]
  cargos: CargoResumen[]
  confirmados: string[] // claves confirmadas a mano: "s:<idConsumo>" y "a:<idCompra>"
  archivo: string | null // nombre del PDF original
  created_by: string
  created_by_nombre?: string
  updated_at: string
  deleted: 0 | 1
  synced: 0 | 1 // solo local
}
