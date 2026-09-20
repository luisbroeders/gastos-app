import { useMemo } from 'react'

interface Props {
  value: string // 'YYYY-MM-DD' o '' si está vacío/incompleto
  onChange: (iso: string) => void
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * Selector de fecha con tres desplegables (Día / Mes por nombre / Año) en vez
 * de un <input type="date"> nativo. El nativo ordena los segmentos según el
 * idioma del sistema operativo (MM/DD en inglés, DD/MM en español) — tipear
 * la misma secuencia de números en dos dispositivos con locale distinto
 * arma fechas distintas sin que se note. Eligiendo el mes por nombre no hay
 * ambigüedad posible, sin importar el idioma del dispositivo.
 */
export function FechaSelector({ value, onChange }: Props) {
  const anioActual = useMemo(() => new Date().getFullYear(), [])
  const anios = useMemo(() => {
    const arr: number[] = []
    for (let y = anioActual - 2; y <= anioActual + 3; y++) arr.push(y)
    return arr
  }, [anioActual])

  const [anio, mes, dia] = value ? value.split('-') : ['', '', '']

  function emitir(nuevoAnio: string, nuevoMes: string, nuevoDia: string) {
    onChange(nuevoAnio && nuevoMes && nuevoDia ? `${nuevoAnio}-${nuevoMes}-${nuevoDia}` : '')
  }

  const diasEnMes = mes && anio ? new Date(Number(anio), Number(mes), 0).getDate() : 31

  return (
    <div className="fecha-selector">
      <select aria-label="Día" value={dia} onChange={(e) => emitir(anio, mes, e.target.value)}>
        <option value="">Día</option>
        {Array.from({ length: diasEnMes }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d).padStart(2, '0')}>
            {d}
          </option>
        ))}
      </select>
      <select aria-label="Mes" value={mes} onChange={(e) => emitir(anio, e.target.value, dia)}>
        <option value="">Mes</option>
        {MESES.map((nombre, i) => (
          <option key={nombre} value={String(i + 1).padStart(2, '0')}>
            {nombre}
          </option>
        ))}
      </select>
      <select aria-label="Año" value={anio} onChange={(e) => emitir(e.target.value, mes, dia)}>
        <option value="">Año</option>
        {anios.map((a) => (
          <option key={a} value={String(a)}>
            {a}
          </option>
        ))}
      </select>
    </div>
  )
}
