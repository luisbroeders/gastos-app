import type { ConsumoResumen, CargoResumen } from './types'

// ---------------------------------------------------------------------------
// Lectura de resúmenes de tarjeta (PDF) y extracción de consumos.
//
// Todo se procesa en el dispositivo: el PDF no se sube a ningún lado, solo se
// guardan después los consumos extraídos (en la base de la propia familia).
// Por ahora se reconoce el formato de los resúmenes de BBVA (Visa/Mastercard).
// ---------------------------------------------------------------------------

export interface ItemTexto {
  s: string
  x: number
  y: number
  w: number
}

export interface Linea {
  texto: string
  items: ItemTexto[]
}

export interface ResumenParseado {
  cierreAnterior: string | null
  cierreActual: string | null
  vencimientoActual: string | null
  proximoCierre: string | null
  proximoVencimiento: string | null
  saldoPesos: number | null
  saldoUsd: number | null
  consumos: ConsumoResumen[]
  cargos: CargoResumen[]
  advertencias: string[]
  tarjetaSugerida: string | null
}

// ---------- Utilidades de formato ----------

const MESES: Record<string, string> = {
  ene: '01', jan: '01', feb: '02', mar: '03', abr: '04', apr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', aug: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12', dec: '12',
}

const RE_FECHA = /\b(\d{2})-([A-Za-z]{3})-(\d{2})\b/
const RE_FECHA_G = /\b(\d{2})-([A-Za-z]{3})-(\d{2})\b/g
const RE_IMPORTE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/

/** '29-Oct-26' -> '2026-10-29' (null si no se puede interpretar). */
export function parseFechaResumen(texto: string): string | null {
  const m = texto.match(RE_FECHA)
  if (!m) return null
  const mes = MESES[m[2].toLowerCase()]
  if (!mes) return null
  return `20${m[3]}-${mes}-${m[1]}`
}

/** '1.234,56' -> 1234.56 (convención argentina). */
export function parseImporteResumen(texto: string): number {
  return parseFloat(texto.replace(/\./g, '').replace(',', '.'))
}

function sinAcentos(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ---------- Reconstrucción de líneas a partir de los textos del PDF ----------

/**
 * Agrupa los fragmentos de texto del PDF en líneas (por coordenada vertical)
 * y los ordena de izquierda a derecha. Los fragmentos pegados (por ejemplo
 * las tildes, que vienen como fragmentos aparte) se unen sin espacio.
 */
export function agruparLineas(items: ItemTexto[], tolerancia = 3): Linea[] {
  const utiles = items.filter((i) => i.s.trim() !== '')
  utiles.sort((a, b) => b.y - a.y || a.x - b.x)

  const grupos: ItemTexto[][] = []
  for (const it of utiles) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && Math.abs(ultimo[0].y - it.y) <= tolerancia) ultimo.push(it)
    else grupos.push([it])
  }

  return grupos.map((g) => {
    g.sort((a, b) => a.x - b.x)
    let texto = ''
    let finPrevio: number | null = null
    for (const it of g) {
      if (finPrevio !== null) {
        const hueco = it.x - finPrevio
        // Si hay hueco visible va un espacio; si están pegados (ej: "Cr" + "é" + "dito") se unen.
        if (hueco > 1.2 || /^\s/.test(it.s) || /\s$/.test(texto)) texto += ' '
      }
      texto += it.s.trim()
      finPrevio = it.x + it.w
    }
    return { texto: texto.replace(/\s+/g, ' ').trim(), items: g }
  })
}

// Tipo mínimo de lo que usamos de pdf.js (evita depender de sus tipos en el parser).
interface PdfPagina {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number }> }>
}
interface PdfDocumento {
  numPages: number
  getPage(n: number): Promise<PdfPagina>
}

/** Lee todas las páginas de un documento de pdf.js y devuelve sus líneas, en orden. */
export async function lineasDesdeDocumento(doc: PdfDocumento): Promise<Linea[]> {
  const todas: Linea[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p)
    const contenido = await pagina.getTextContent()
    const items: ItemTexto[] = []
    for (const it of contenido.items) {
      if (typeof it.str !== 'string' || !it.transform) continue
      items.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 })
    }
    todas.push(...agruparLineas(items))
  }
  return todas
}

/**
 * Abre un PDF en el navegador y devuelve sus líneas. pdf.js se carga recién
 * acá (carga diferida) para no pesar en el arranque de la app. Si el PDF
 * tiene contraseña (los resúmenes de algunos bancos la tienen), la pide.
 */
export async function extraerLineasPDF(archivo: File): Promise<Linea[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const datos = new Uint8Array(await archivo.arrayBuffer())
  const tarea = pdfjs.getDocument({ data: datos })
  tarea.onPassword = (actualizar: (pass: string) => void, motivo: number) => {
    const msg = motivo === 2 ? 'Contraseña incorrecta. Probá de nuevo:' : 'El PDF tiene contraseña. Ingresala:'
    const pass = window.prompt(msg)
    if (pass) actualizar(pass)
    else void tarea.destroy()
  }
  const doc = await tarea.promise
  try {
    return await lineasDesdeDocumento(doc as unknown as PdfDocumento)
  } finally {
    void doc.destroy()
  }
}

// ---------- Parser del formato BBVA ----------

const RE_FILA_CONSUMO =
  /^(\d{2}-[A-Za-z]{3}-\d{2})\s+(.+?)\s+(\d{5,8})\s+(-?\d[\d.]*,\d{2})(?:\s+(-?\d[\d.]*,\d{2}))?$/
const RE_FILA_CARGO = /^(\d{2}-[A-Za-z]{3}-\d{2})\s+(.+?)\s+(-?\d[\d.]*,\d{2})$/
const RE_TOTAL_TITULAR = /^TOTAL CONSUMOS DE (.+?)\s+(-?\d[\d.]*,\d{2})\s+(-?\d[\d.]*,\d{2})$/i
const RE_CUOTA = /\bC\.(\d{2})\/(\d{2})\b/
// Borde derecho (en puntos) a partir del cual un importe pertenece a la columna Dólares.
const BORDE_COLUMNA_USD = 530

function titularLimpio(t: string): string {
  return t
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    .trim()
}

function fechasDe(texto: string): string[] {
  const res: string[] = []
  for (const m of texto.matchAll(RE_FECHA_G)) {
    const f = parseFechaResumen(m[0])
    if (f) res.push(f)
  }
  return res
}

function importesDe(texto: string): number[] {
  return texto
    .split(/\s+/)
    .filter((t) => RE_IMPORTE.test(t))
    .map(parseImporteResumen)
}

/** Limpia la descripción: saca la marca de cuota (C.02/03) y el "USD 20,18" que repite el importe. */
function descripcionLimpia(original: string): string {
  return original
    .replace(RE_CUOTA, '')
    .replace(/\bUSD\s+\d[\d.]*,\d{2}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿El último importe de la línea está en la columna Dólares? Usa la posición; si no hay, el texto "USD". */
function esColumnaUsd(linea: Linea, descripcion: string): boolean {
  const ultimoImporte = [...linea.items].reverse().find((it) => RE_IMPORTE.test(it.s.trim()))
  if (ultimoImporte && ultimoImporte.w > 0) return ultimoImporte.x + ultimoImporte.w > BORDE_COLUMNA_USD
  return /\bUSD\b/i.test(descripcion)
}

export function parsearResumenBBVA(lineas: Linea[]): ResumenParseado {
  const advertencias: string[] = []
  const norm = lineas.map((l) => sinAcentos(l.texto).toUpperCase())

  // --- Encabezado: fechas de cierre, vencimiento y saldos ---
  let cierreActual: string | null = null
  let vencimientoActual: string | null = null
  let saldoPesos: number | null = null
  let saldoUsd: number | null = null
  // Los valores van en la fila de abajo de los títulos, pero a veces un rótulo
  // de la fila (ej: "Otros períodos") queda en el medio: se busca en las
  // próximas líneas la primera que tenga la cantidad de fechas esperada.
  const filaConFechas = (desde: number, minimo: number): string | null => {
    for (let i = desde + 1; i <= desde + 3 && i < lineas.length; i++) {
      if (fechasDe(lineas[i].texto).length >= minimo) return lineas[i].texto
    }
    return null
  }

  const iActual = norm.findIndex((t) => t.includes('CIERRE ACTUAL'))
  const filaActual = iActual >= 0 ? filaConFechas(iActual, 2) : null
  if (filaActual) {
    const f = fechasDe(filaActual)
    cierreActual = f[0] ?? null
    vencimientoActual = f[1] ?? null
    const imp = importesDe(filaActual)
    saldoPesos = imp[0] ?? null
    saldoUsd = imp[1] ?? null
  }

  let cierreAnterior: string | null = null
  let proximoCierre: string | null = null
  let proximoVencimiento: string | null = null
  const iAnterior = norm.findIndex((t) => t.includes('CIERRE ANTERIOR') && t.includes('PROXIMO CIERRE'))
  const filaAnterior = iAnterior >= 0 ? filaConFechas(iAnterior, 3) : null
  if (filaAnterior) {
    const f = fechasDe(filaAnterior)
    cierreAnterior = f[0] ?? null
    proximoCierre = f[2] ?? null
    proximoVencimiento = f[3] ?? null
  }

  // --- Consumos por titular, totales y cargos ---
  const consumos: ConsumoResumen[] = []
  const cargos: CargoResumen[] = []
  const totales = new Map<string, { pesos: number; usd: number }>()
  let titular: string | null = null
  let enCargos = false

  for (const linea of lineas) {
    const t = linea.texto

    const mTotal = t.match(RE_TOTAL_TITULAR)
    if (mTotal) {
      totales.set(titularLimpio(mTotal[1]), {
        pesos: parseImporteResumen(mTotal[2]),
        usd: parseImporteResumen(mTotal[3]),
      })
      titular = null
      continue
    }

    const mTitular = t.match(/^Consumos\s+(.+)$/i)
    if (mTitular && !/^TOTAL/i.test(t)) {
      titular = titularLimpio(mTitular[1])
      enCargos = false
      continue
    }
    if (/^Impuestos,\s*cargos e intereses/i.test(sinAcentos(t))) {
      enCargos = true
      titular = null
      continue
    }
    if (/^SALDO ACTUAL/i.test(t)) {
      enCargos = false
      continue
    }

    if (titular) {
      const m = t.match(RE_FILA_CONSUMO)
      if (!m) continue
      const fecha = parseFechaResumen(m[1])
      if (!fecha) continue
      const original = m[2]
      const importe = parseImporteResumen(m[4])
      const usd = esColumnaUsd(linea, original)
      const cuota = original.match(RE_CUOTA)
      consumos.push({
        id: `c${consumos.length}`,
        fecha,
        descripcion: descripcionLimpia(original),
        descripcionOriginal: original,
        monto: usd ? null : importe,
        usd: usd ? importe : null,
        cuota: cuota ? { n: parseInt(cuota[1], 10), total: parseInt(cuota[2], 10) } : null,
        cupon: m[3],
        titular,
      })
    } else if (enCargos) {
      const m = t.match(RE_FILA_CARGO)
      if (!m) continue
      const fecha = parseFechaResumen(m[1])
      if (!fecha) continue
      cargos.push({ fecha, descripcion: m[2].trim(), monto: parseImporteResumen(m[3]) })
    }
  }

  // --- Validación: lo extraído tiene que sumar lo que dice el propio resumen ---
  for (const [nombre, tot] of totales) {
    const delTitular = consumos.filter((c) => c.titular === nombre)
    const sumaPesos = delTitular.reduce((a, c) => a + (c.monto ?? 0), 0)
    const sumaUsd = delTitular.reduce((a, c) => a + (c.usd ?? 0), 0)
    if (Math.abs(sumaPesos - tot.pesos) > 0.01) {
      advertencias.push(
        `Consumos de ${nombre} en pesos: se leyeron ${fmt(sumaPesos)} pero el resumen indica ${fmt(tot.pesos)}.`
      )
    }
    if (Math.abs(sumaUsd - tot.usd) > 0.01) {
      advertencias.push(
        `Consumos de ${nombre} en dólares: se leyeron ${fmt(sumaUsd)} pero el resumen indica ${fmt(tot.usd)}.`
      )
    }
  }
  if (totales.size === 0) advertencias.push('No se encontraron los totales por titular para validar la lectura.')

  // --- Tarjeta sugerida (por el encabezado de la primera página) ---
  const cabecera = norm.slice(0, 40).join(' ')
  let tarjetaSugerida: string | null = null
  if (cabecera.includes('BBVA') || norm.join(' ').includes('BANCO BBVA')) {
    if (cabecera.includes('MASTERCARD')) tarjetaSugerida = 'Mastercard BBVA'
    else if (cabecera.includes('VISA')) tarjetaSugerida = 'Visa BBVA'
  }

  if (!cierreActual || !cierreAnterior) {
    throw new Error('No pude leer las fechas de cierre del resumen. ¿Es un resumen de tarjeta de BBVA?')
  }
  if (consumos.length === 0) {
    throw new Error('No encontré consumos en el PDF. Por ahora solo se reconoce el formato de los resúmenes de BBVA.')
  }

  return {
    cierreAnterior,
    cierreActual,
    vencimientoActual,
    proximoCierre,
    proximoVencimiento,
    saldoPesos,
    saldoUsd,
    consumos,
    cargos,
    advertencias,
    tarjetaSugerida,
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}
