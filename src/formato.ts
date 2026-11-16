import { parseFechaLocal } from './cicloTarjeta'

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })

export const pesos = (n: number) => ars.format(n)
export const dolares = (n: number) => usd.format(n)

/** '2026-10-29' -> '29/10/2026' (siempre día/mes/año, sin depender del idioma del dispositivo). */
export function fechaCorta(iso: string): string {
  return parseFechaLocal(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
