import { CATEGORY_KEYWORDS } from './categories'
import type { TipoMovimiento } from './types'

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // saca tildes para que "café" matchee "cafe"
}

/** Busca la categoría cuya lista de palabras clave tenga más coincidencias en el texto. */
export function guessCategoria(textoLibre: string): string {
  const texto = normalizar(textoLibre)
  let mejorCategoria = 'Sin categoría'
  let mejorScore = 0

  for (const [categoria, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => (texto.includes(normalizar(kw)) ? acc + 1 : acc), 0)
    if (score > mejorScore) {
      mejorScore = score
      mejorCategoria = categoria
    }
  }

  return mejorCategoria
}

const PALABRAS_INGRESO = ['cobre', 'cobro', 'ingreso', 'deposito', 'sueldo', 'me pagaron', 'me depositaron']

function guessTipo(textoNormalizado: string): TipoMovimiento {
  return PALABRAS_INGRESO.some((p) => textoNormalizado.includes(p)) ? 'ingreso' : 'gasto'
}

/**
 * Convierte un token puramente numérico (ej: "1.500,50", "1500", "1500.50")
 * a un número, siguiendo la convención Argentina (punto = miles, coma = decimales).
 */
function parseNumeroArg(token: string): number {
  let t = token.trim()
  const tieneComa = t.includes(',')
  const tienePunto = t.includes('.')

  if (tieneComa) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (tienePunto) {
    const partes = t.split('.')
    const ultimo = partes[partes.length - 1]
    if (ultimo.length === 3) {
      t = t.replace(/\./g, '')
    }
  }
  return parseFloat(t)
}

// --- Vocabulario para números escritos en palabras (español) ---
const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
}
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
}

const NUMERIC_TOKEN = /^\$?\d[\d.,]*$/

function esTokenNumerico(palabra: string): boolean {
  return NUMERIC_TOKEN.test(palabra)
}

function esPalabraDeNumero(palabra: string): boolean {
  return (
    esTokenNumerico(palabra) ||
    palabra in UNIDADES ||
    palabra in DECENAS ||
    palabra in CENTENAS ||
    palabra === 'mil' ||
    palabra === 'millon' ||
    palabra === 'millones'
  )
}

interface Corrida {
  inicio: number
  fin: number // índice exclusivo (primera palabra que ya no pertenece a la corrida)
  valor: number
}

/**
 * A partir de un array de palabras normalizadas, arma una "corrida" numérica
 * empezando en `inicio`: combina dígitos sueltos, números en palabras, y
 * multiplicadores como "mil"/"millón" (maneja tanto "45000" como "45 mil"
 * como "cuarenta y cinco mil", que son las 3 formas que devuelve el
 * reconocimiento de voz del navegador según cuánto convierta a dígitos).
 */
function parseCorridaDesde(palabras: string[], inicio: number): Corrida {
  let total = 0
  let actual = 0
  let i = inicio

  while (i < palabras.length) {
    const w = palabras[i]

    if (esTokenNumerico(w)) {
      actual += parseNumeroArg(w.replace('$', ''))
      i++
      continue
    }
    if (w in UNIDADES) {
      actual += UNIDADES[w]
      i++
      continue
    }
    if (w in DECENAS) {
      actual += DECENAS[w]
      i++
      continue
    }
    if (w in CENTENAS) {
      actual += CENTENAS[w]
      i++
      continue
    }
    if (w === 'mil') {
      actual = (actual === 0 ? 1 : actual) * 1000
      total += actual
      actual = 0
      i++
      continue
    }
    if (w === 'millon' || w === 'millones') {
      actual = (actual === 0 ? 1 : actual) * 1_000_000
      total += actual
      actual = 0
      i++
      continue
    }
    if (w === 'y' && (total > 0 || actual > 0)) {
      // conector ("cuarenta y cinco"): lo consumimos sin sumar nada, siempre que
      // ya estemos en medio de un número (si no, "y" corta la corrida).
      i++
      continue
    }
    break
  }

  total += actual
  return { inicio, fin: i, valor: total }
}

/** Encuentra todas las corridas numéricas no superpuestas en el texto (de izquierda a derecha). */
function encontrarCorridas(palabras: string[]): Corrida[] {
  const corridas: Corrida[] = []
  let i = 0
  while (i < palabras.length) {
    if (esPalabraDeNumero(palabras[i])) {
      const corrida = parseCorridaDesde(palabras, i)
      if (corrida.valor > 0) corridas.push(corrida)
      i = Math.max(corrida.fin, i + 1)
    } else {
      i++
    }
  }
  return corridas
}

export interface ResultadoParseo {
  monto: number | null
  detalle: string
  categoria: string
  tipo: TipoMovimiento
}

/**
 * Interpreta un texto libre (típicamente dictado por voz) y devuelve monto,
 * detalle (el texto sin el monto), categoría sugerida y tipo.
 *
 * Maneja los 3 formatos que puede devolver el reconocimiento de voz para un
 * mismo número, según cuánto convierta a dígitos:
 *  - "45000"                          (todo en dígitos)
 *  - "45 mil"                         (parcialmente convertido)
 *  - "cuarenta y cinco mil"           (todo en palabras)
 *
 * Ejemplos:
 *  - "nafta 15000 pesos"          -> monto 15000, categoría Auto
 *  - "compré carne por 8500"      -> monto 8500, categoría Almacén
 *  - "cobré el sueldo 900000"     -> tipo ingreso, categoría Sueldo
 *  - "veintitrés mil de super"    -> monto 23000, categoría Supermercado
 */
export function parseTextoLibre(textoOriginal: string): ResultadoParseo {
  const texto = textoOriginal.trim()
  const palabrasOriginales = texto.split(/\s+/)
  const palabrasNorm = palabrasOriginales.map((w) => normalizar(w).replace(/[.,]+$/, ''))

  const corridas = encontrarCorridas(palabrasNorm)

  let corridaElegida: Corrida | null = null
  if (corridas.length > 0) {
    // Preferimos la corrida seguida de cerca por "peso(s)"/"ars"/"$"; si ninguna
    // cumple, tomamos la de mayor valor (suele ser el monto y no, por ej, una fecha).
    const conPesosCerca = corridas.find((c) => {
      const siguientes = palabrasNorm.slice(c.fin, c.fin + 2).join(' ')
      return siguientes.includes('peso') || siguientes.includes('ars') || palabrasOriginales[c.inicio].includes('$')
    })
    corridaElegida = conPesosCerca ?? corridas.reduce((a, b) => (b.valor > a.valor ? b : a))
  }

  const monto = corridaElegida && corridaElegida.valor > 0 ? corridaElegida.valor : null

  // Detalle = palabras originales sin la corrida numérica ni "pesos"/"ars"/"$" sueltos
  const palabrasDetalle = palabrasOriginales.filter((_, idx) => {
    if (corridaElegida && idx >= corridaElegida.inicio && idx < corridaElegida.fin) return false
    const norm = palabrasNorm[idx]
    if (norm === 'peso' || norm === 'pesos' || norm === 'ars' || norm === '$') return false
    return true
  })
  let detalle = palabrasDetalle.join(' ').replace(/\s{2,}/g, ' ').trim()
  detalle = detalle.replace(/^(por|de)\s+/i, '').replace(/\s+(por|de)$/i, '').trim()

  const normalizado = normalizar(texto)
  return {
    monto,
    detalle: detalle || texto,
    categoria: guessCategoria(normalizado),
    tipo: guessTipo(normalizado),
  }
}
