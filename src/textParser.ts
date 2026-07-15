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
 * Convierte un token numérico hablado/transcripto (ej: "1.500,50", "1500", "1500.50")
 * a un número, siguiendo la convención Argentina (punto = miles, coma = decimales).
 */
function parseNumeroArg(token: string): number {
  let t = token.trim()
  const tieneComa = t.includes(',')
  const tienePunto = t.includes('.')

  if (tieneComa) {
    // "1.500,50" -> saco puntos de miles, coma pasa a punto decimal
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (tienePunto) {
    // Si el último grupo después del punto tiene 3 dígitos, es separador de miles ("1.500" -> 1500).
    // Si tiene 1 o 2, lo tratamos como decimal ("1500.5" -> 1500.5).
    const partes = t.split('.')
    const ultimo = partes[partes.length - 1]
    if (ultimo.length === 3) {
      t = t.replace(/\./g, '')
    }
    // si no, lo dejamos como está (ya es un separador decimal válido en JS)
  }
  return parseFloat(t)
}

export interface ResultadoParseo {
  monto: number | null
  detalle: string
  categoria: string
  tipo: TipoMovimiento
}

/**
 * Interpreta un texto libre (típicamente dictado por voz) y devuelve monto,
 * detalle (el texto sin el monto/palabra "pesos"), categoría sugerida y tipo.
 *
 * Ejemplos de entrada que maneja bien:
 *  - "nafta 15000 pesos"          -> monto 15000, categoría Auto
 *  - "compré carne por 8500"      -> monto 8500, categoría Almacén
 *  - "cobré el sueldo 900000"     -> tipo ingreso, categoría Sueldo
 */
export function parseTextoLibre(textoOriginal: string): ResultadoParseo {
  const texto = textoOriginal.trim()
  const normalizado = normalizar(texto)

  // Busca números: un dígito, seguido opcionalmente de más dígitos/separadores,
  // terminando siempre en dígito (para no arrastrar puntuación de la oración).
  const regex = /\$?\s?\d(?:[\d.,]*\d)?/g
  const matches = texto.match(regex) ?? []

  let monto: number | null = null
  let tokenElegido = ''
  if (matches.length > 0) {
    // Si hay varios números, preferimos el que aparece antes de la palabra "peso"/"ars";
    // si no hay ninguno así, tomamos el más grande (suele ser el monto y no, por ej, una fecha).
    const conPesosCerca = matches.find((m) => {
      const idx = texto.indexOf(m)
      const despues = normalizar(texto.slice(idx, idx + m.length + 12))
      return despues.includes('peso') || despues.includes('ars') || despues.includes('$')
    })
    tokenElegido = conPesosCerca ?? matches.reduce((a, b) => (parseNumeroArg(a.replace('$', '')) >= parseNumeroArg(b.replace('$', '')) ? a : b))
    const num = parseNumeroArg(tokenElegido.replace('$', '').trim())
    monto = Number.isFinite(num) && num > 0 ? num : null
  }

  // Detalle = texto sin el monto ni palabras sueltas tipo "pesos"/"por"
  let detalle = texto
  if (tokenElegido) detalle = detalle.replace(tokenElegido, '')
  detalle = detalle
    .replace(/\bpesos?\b/gi, '')
    .replace(/\bars\b/gi, '')
    .replace(/\$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // saca conectores sueltos al final/principio como "por", "de"
  detalle = detalle.replace(/^(por|de)\s+/i, '').replace(/\s+(por|de)$/i, '').trim()

  return {
    monto,
    detalle: detalle || texto,
    categoria: guessCategoria(normalizado),
    tipo: guessTipo(normalizado),
  }
}
