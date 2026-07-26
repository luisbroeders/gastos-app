import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../db'

interface Props {
  householdId: string
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const monthLabelFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })

function mesLabel(mesISO: string) {
  const [y, m] = mesISO.split('-').map(Number)
  return monthLabelFmt.format(new Date(y, m - 1, 1))
}

export function IngresosVsGastosChart({ householdId }: Props) {
  const movimientos = useLiveQuery(
    () =>
      db.movimientos
        .where('household_id')
        .equals(householdId)
        .and((m) => m.deleted === 0)
        .toArray(),
    [householdId]
  )

  // Categorías excluidas del gráfico. Vacío = están todas incluidas por defecto.
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set())

  const categoriasDisponibles = useMemo(() => {
    if (!movimientos) return []
    const set = new Set(movimientos.map((m) => m.categoria))
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [movimientos])

  function toggleCategoria(cat: string) {
    setExcluidas((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const datosPorMes = useMemo(() => {
    if (!movimientos) return []
    const mapa = new Map<string, { mes: string; ingreso: number; gasto: number }>()
    for (const m of movimientos) {
      if (excluidas.has(m.categoria)) continue
      const mes = m.fecha.slice(0, 7) // YYYY-MM
      if (!mapa.has(mes)) mapa.set(mes, { mes, ingreso: 0, gasto: 0 })
      const entry = mapa.get(mes)!
      if (m.tipo === 'ingreso') entry.ingreso += m.monto
      else entry.gasto += m.monto
    }
    return [...mapa.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((d) => ({ ...d, mesLabel: mesLabel(d.mes) }))
  }, [movimientos, excluidas])

  const totales = datosPorMes.reduce(
    (acc, d) => ({ ingreso: acc.ingreso + d.ingreso, gasto: acc.gasto + d.gasto }),
    { ingreso: 0, gasto: 0 }
  )
  const neto = totales.ingreso - totales.gasto

  if (!movimientos) return <p>Cargando...</p>

  return (
    <div className="chart-section">
      <h2>Ingresos vs. gastos por mes</h2>

      <div className="chart-filter">
        <div className="chart-filter-header">
          <span>Categorías incluidas</span>
          <div className="chart-filter-actions">
            <button type="button" onClick={() => setExcluidas(new Set())}>
              Todas
            </button>
            <button type="button" onClick={() => setExcluidas(new Set(categoriasDisponibles))}>
              Ninguna
            </button>
          </div>
        </div>
        <div className="chart-filter-list">
          {categoriasDisponibles.map((cat) => (
            <label key={cat} className="chart-filter-item">
              <input
                type="checkbox"
                checked={!excluidas.has(cat)}
                onChange={() => toggleCategoria(cat)}
              />
              {cat}
            </label>
          ))}
        </div>
      </div>

      {datosPorMes.length === 0 ? (
        <p className="categorias-hint">No hay movimientos para las categorías seleccionadas.</p>
      ) : (
        <>
          <div className="chart-totales">
            <div>
              <span>Ingresos</span>
              <strong className="ingreso">{money.format(totales.ingreso)}</strong>
            </div>
            <div>
              <span>Gastos</span>
              <strong className="gasto">{money.format(totales.gasto)}</strong>
            </div>
            <div>
              <span>Neto</span>
              <strong className={neto >= 0 ? 'ingreso' : 'gasto'}>{money.format(neto)}</strong>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datosPorMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mesLabel" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v) => money.format(Number(v))}
                width={64}
              />
              <Tooltip
                formatter={(value: number) => money.format(value)}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend />
              <Bar dataKey="ingreso" name="Ingresos" fill="#4ade80" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gasto" name="Gastos" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
