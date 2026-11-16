import type { CompraTarjeta, ConsumoResumen, RevisionTarjeta } from './types'
import { parseFechaLocal, diasEntre, numeroDeCicloResumen, calcularValorCuota } from './cicloTarjeta'

// ---------------------------------------------------------------------------
// Cruce entre los consumos de un resumen de tarjeta y las compras cargadas a
// mano en la app. Dos ítems "coinciden" si cumplen 2 de estas 3 condiciones:
//   - nombre del comercio parecido
//   - misma fecha
//   - mismo importe (tolerancia de $1 por redondeos)
// ---------------------------------------------------------------------------

export const TOLERANCIA_IMPORTE = 1

/** Lo que la app espera ver en este resumen por cada compra (el total, o la cuota que toca). */
export interface ItemApp {
  key: string // "a:<idCompra>"
  compra: CompraTarjeta
  fecha: string
  descripcion: string
  monto: number // total si es 1 cuota; valor de la cuota si es en cuotas
  cuota: { n: number; total: number } | null // cuota que le toca a este resumen según la app
  esperado: boolean // ¿le corresponde a este período?
}

export interface Condiciones {
  nombre: boolean
  fecha: boolean
  importe: boolean
}

export interface Coincidencia {
  tipo: 'auto' | 'manual-resumen' | 'manual-app'
  resumen?: ConsumoResumen
  app?: ItemApp
  condiciones?: Condiciones
  avisos: string[]
}

export interface Conciliacion {
  coincidencias: Coincidencia[]
  resumenARevisar: ConsumoResumen[]
  appARevisar: ItemApp[]
  totales: {
    resumenPesos: number
    resumenUsd: number
    appEsperadoPesos: number
    resumenARevisarPesos: number
    appARevisarPesos: number
  }
}

// ---------- Nombres ----------

const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'sa', 'srl', 'sas', 'www', 'com', 'ar', 'arg',
  'argentin', 'argentina', 'mar', 'plat', 'plata', 'compra', 'compras', 'pago', 'tarjeta', 'usd',
  'consumo', 'cuota', 'cuotas', 'the', 'and',
])

function sinAcentos(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function tokensDe(texto: string): string[] {
  return sinAcentos(texto.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOPWORDS.has(t))
}

/** ¿Los dos textos comparten alguna palabra significativa (o una contiene a la otra)? */
export function nombresSimilares(a: string, b: string): boolean {
  const ta = tokensDe(a)
  const tb = tokensDe(b)
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) return true
      if (x.length >= 4 && y.includes(x)) return true
      if (y.length >= 4 && x.includes(y)) return true
    }
  }
  return false
}

// ---------- Armado de los ítems esperados en la app ----------

function armarItemsApp(revision: RevisionTarjeta, compras: CompraTarjeta[]): ItemApp[] {
  const anterior = parseFechaLocal(revision.cierre_anterior)
  const actual = parseFechaLocal(revision.cierre_actual)
  const fechasEnCuotas = new Set(revision.consumos.filter((c) => c.cuota).map((c) => c.fecha))

  const items: ItemApp[] = []
  for (const c of compras) {
    if (c.deleted !== 0 || c.tarjeta !== revision.tarjeta) continue
    const cuotas = Math.max(1, c.cuotas)
    const fecha = parseFechaLocal(c.fecha)
    const ciclo = numeroDeCicloResumen(fecha, anterior, actual)
    if (ciclo === null) continue

    if (cuotas === 1) {
      const esperado = ciclo === 0
      const cercaDelPeriodo =
        diasEntre(anterior, fecha) >= -3 && diasEntre(actual, fecha) <= 3 // por diferencias entre fecha de compra y de acreditación
      // Una compra de 1 cuota fuera del período solo entra al cruce si el resumen
      // trae un consumo en cuotas con su misma fecha (típico error: cargarla en 1 cuota).
      if (!esperado && !cercaDelPeriodo && !fechasEnCuotas.has(c.fecha)) continue
      items.push({
        key: `a:${c.id}`,
        compra: c,
        fecha: c.fecha,
        descripcion: c.descripcion,
        monto: c.monto,
        cuota: null,
        esperado,
      })
    } else {
      // Compra en cuotas: la cuota 1 cae en el ciclo de la compra, la 2 en el siguiente, etc.
      const i = -ciclo
      const esperado = i >= 0 && i < cuotas
      items.push({
        key: `a:${c.id}`,
        compra: c,
        fecha: c.fecha,
        descripcion: c.descripcion,
        monto: calcularValorCuota(c.monto, cuotas, c.tasa),
        cuota: esperado ? { n: i + 1, total: cuotas } : null,
        esperado,
      })
    }
  }
  return items
}

// ---------- Cruce ----------

function condicionesDe(s: ConsumoResumen, a: ItemApp): Condiciones {
  return {
    nombre: nombresSimilares(s.descripcion, a.descripcion),
    fecha: s.fecha === a.fecha,
    importe: s.monto !== null && Math.abs(s.monto - a.monto) <= TOLERANCIA_IMPORTE,
  }
}

function cantidad(c: Condiciones): number {
  return (c.nombre ? 1 : 0) + (c.fecha ? 1 : 0) + (c.importe ? 1 : 0)
}

function avisosDeCuotas(s: ConsumoResumen, a: ItemApp): string[] {
  const avisos: string[] = []
  const cuotasApp = Math.max(1, a.compra.cuotas)
  if (s.cuota && cuotasApp === 1) {
    avisos.push(`El resumen la muestra en cuotas (${s.cuota.n}/${s.cuota.total}) y en la app está cargada en 1 cuota.`)
  } else if (!s.cuota && cuotasApp > 1) {
    avisos.push(`En la app está en ${cuotasApp} cuotas, pero el resumen no la muestra en cuotas.`)
  } else if (s.cuota && cuotasApp > 1) {
    if (s.cuota.total !== cuotasApp) {
      avisos.push(`El resumen indica ${s.cuota.total} cuotas y la app tiene ${cuotasApp}.`)
    } else if (a.cuota && s.cuota.n !== a.cuota.n) {
      avisos.push(`El resumen indica la cuota ${s.cuota.n}/${s.cuota.total} y la app calcula la ${a.cuota.n}/${a.cuota.total}.`)
    }
  }
  return avisos
}

export function conciliar(revision: RevisionTarjeta, compras: CompraTarjeta[]): Conciliacion {
  const itemsApp = armarItemsApp(revision, compras)
  const confirmados = new Set(revision.confirmados)

  // Todos los pares que cumplen al menos 2 de 3 condiciones, del mejor al peor.
  interface Candidato {
    s: ConsumoResumen
    a: ItemApp
    cond: Condiciones
    n: number
    difImporte: number
    difDias: number
  }
  const candidatos: Candidato[] = []
  for (const s of revision.consumos) {
    for (const a of itemsApp) {
      const cond = condicionesDe(s, a)
      const n = cantidad(cond)
      if (n < 2) continue
      candidatos.push({
        s,
        a,
        cond,
        n,
        difImporte: s.monto !== null ? Math.abs(s.monto - a.monto) : Number.MAX_SAFE_INTEGER,
        difDias: Math.abs(diasEntre(parseFechaLocal(s.fecha), parseFechaLocal(a.fecha))),
      })
    }
  }
  candidatos.sort((x, y) => y.n - x.n || x.difImporte - y.difImporte || x.difDias - y.difDias)

  const usadosResumen = new Set<string>()
  const usadosApp = new Set<string>()
  const coincidencias: Coincidencia[] = []
  for (const c of candidatos) {
    if (usadosResumen.has(c.s.id) || usadosApp.has(c.a.key)) continue
    usadosResumen.add(c.s.id)
    usadosApp.add(c.a.key)
    coincidencias.push({ tipo: 'auto', resumen: c.s, app: c.a, condiciones: c.cond, avisos: avisosDeCuotas(c.s, c.a) })
  }

  // Lo que quedó sin pareja: va a "A revisar", salvo que se haya confirmado a mano.
  const resumenARevisar: ConsumoResumen[] = []
  for (const s of revision.consumos) {
    if (usadosResumen.has(s.id)) continue
    if (confirmados.has(`s:${s.id}`)) coincidencias.push({ tipo: 'manual-resumen', resumen: s, avisos: [] })
    else resumenARevisar.push(s)
  }
  const appARevisar: ItemApp[] = []
  for (const a of itemsApp) {
    if (usadosApp.has(a.key) || !a.esperado) continue // solo se reclama lo que corresponde a este período
    if (confirmados.has(a.key)) coincidencias.push({ tipo: 'manual-app', app: a, avisos: [] })
    else appARevisar.push(a)
  }

  const suma = (xs: number[]) => xs.reduce((acc, n) => acc + n, 0)
  return {
    coincidencias,
    resumenARevisar,
    appARevisar,
    totales: {
      resumenPesos: suma(revision.consumos.map((c) => c.monto ?? 0)),
      resumenUsd: suma(revision.consumos.map((c) => c.usd ?? 0)),
      appEsperadoPesos: suma(itemsApp.filter((i) => i.esperado).map((i) => i.monto)),
      resumenARevisarPesos: suma(resumenARevisar.map((c) => c.monto ?? 0)),
      appARevisarPesos: suma(appARevisar.map((i) => i.monto)),
    },
  }
}

// ---------- Títulos ----------

/** Mes al que corresponde el resumen: el del punto medio del período (el cierre solo puede caer en el mes siguiente). */
export function mesDelResumen(cierreAnterior: string, cierreActual: string): { anio: number; mes: number } {
  const a = parseFechaLocal(cierreAnterior)
  const b = parseFechaLocal(cierreActual)
  const medio = new Date((a.getTime() + b.getTime()) / 2)
  return { anio: medio.getFullYear(), mes: medio.getMonth() + 1 }
}

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function etiquetaMes(cierreAnterior: string, cierreActual: string): string {
  const { anio, mes } = mesDelResumen(cierreAnterior, cierreActual)
  return `${NOMBRES_MES[mes - 1]} de ${anio}`
}

export function tituloRevision(r: Pick<RevisionTarjeta, 'tarjeta' | 'cierre_anterior' | 'cierre_actual'>): string {
  return `Revisión consumos tarjeta ${r.tarjeta} de ${etiquetaMes(r.cierre_anterior, r.cierre_actual)}`
}
