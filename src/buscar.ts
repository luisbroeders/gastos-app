import { parseFechaLocal } from './cicloTarjeta'

// Búsqueda de texto libre sobre movimientos y compras con tarjeta.
// Cada palabra escrita tiene que aparecer en algún campo del registro (se
// ignoran mayúsculas y tildes). Además de los textos, se puede buscar por
// monto ("15000", "15.000", "15.000,50") y por fecha ("2026-10", "23/10", "23/10/2026").

export function normalizarBusqueda(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const fmtMonto = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Todas las formas en que se puede tipear un monto, para que coincida con cualquiera. */
function representacionesMonto(n: number): string[] {
  const entero = Number.isInteger(n)
  return [
    String(n), // 15000.5
    String(n).replace('.', ','), // 15000,5
    fmtMonto.format(n), // 15.000,50
    entero ? fmtMonto.format(n).replace(/,00$/, '') : fmtMonto.format(n), // 15.000
  ]
}

function representacionesFecha(iso: string): string[] {
  const d = parseFechaLocal(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dmaAnio = `${dd}/${mm}/${d.getFullYear()}`
  return [iso, dmaAnio, `${dd}/${mm}`, `${d.getDate()}/${d.getMonth() + 1}`]
}

export interface Buscable {
  textos: Array<string | null | undefined>
  monto: number
  fecha: string
}

/** ¿El registro cumple con todas las palabras de la búsqueda? Una búsqueda vacía acepta todo. */
export function coincideBusqueda(consulta: string, r: Buscable): boolean {
  const palabras = normalizarBusqueda(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const pajar = normalizarBusqueda(
    [...r.textos.filter(Boolean), ...representacionesMonto(r.monto), ...representacionesFecha(r.fecha)].join(' | ')
  )
  return palabras.every((p) => pajar.includes(p))
}
