// Lógica de "ciclos" de tarjeta de crédito, por tarjeta individual.
//
// A diferencia de un cierre que cae siempre el mismo día del mes, acá el
// cierre es una FECHA EXACTA que puede variar (fines de semana, feriados,
// políticas del banco). Por eso cada tarjeta guarda dos fechas concretas:
//   - cierre_anterior: cuándo cerró el ciclo pasado (arranca el ciclo actual)
//   - cierre_proximo: cuándo cierra el ciclo actual (termina el ciclo actual)
//
// Para poder ubicar cuotas de compras viejas (ciclos pasados) o cuotas que
// caen en ciclos futuros más allá del próximo cierre, no tenemos las fechas
// exactas de esos otros ciclos — así que se estima su duración usando la
// del ciclo actual (cierre_proximo - cierre_anterior), tanto hacia atrás
// como hacia adelante. Esta estimación se autocorrige cada vez que el
// usuario actualiza las fechas de cierre de esa tarjeta.

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Parsea 'YYYY-MM-DD' como fecha LOCAL (evita el corrimiento de un día que
 * da `new Date('YYYY-MM-DD')` por interpretarlo como UTC). */
export function parseFechaLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA)
}

/**
 * Número de ciclo de `fecha` relativo al ciclo actual (definido por
 * `cierreAnterior` y `cierreProximo`). El ciclo actual es el 0; ciclos
 * futuros son positivos, pasados son negativos. La duración de cualquier
 * ciclo que no sea el actual se estima usando la duración del ciclo actual.
 */
export function numeroDeCiclo(fecha: Date, cierreAnterior: Date, cierreProximo: Date): number | null {
  const duracion = diasEntre(cierreAnterior, cierreProximo)
  if (duracion <= 0) return null // fechas de cierre inválidas/incompletas
  const dias = diasEntre(cierreAnterior, fecha)
  return Math.floor(dias / duracion)
}

/**
 * Valor de cada cuota aplicando la tasa anual (TNA) sobre el plazo en meses:
 * interés = monto × (tasa/100) × (cuotas/12); cuota = (monto + interés) / cuotas.
 * Con tasa 0%, es simplemente monto / cuotas.
 */
export function calcularValorCuota(monto: number, cuotas: number, tasaAnual: number): number {
  const interes = monto * (tasaAnual / 100) * (cuotas / 12)
  return (monto + interes) / Math.max(cuotas, 1)
}
