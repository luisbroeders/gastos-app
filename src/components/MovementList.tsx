import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { db } from '../db'
import { borrarMovimiento } from '../sync'
import type { Household } from '../types'

interface Props {
  household: Household
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function MovementList({ household }: Props) {
  const [borrando, setBorrando] = useState<string | null>(null)

  // useLiveQuery re-renderiza automáticamente cuando cambia IndexedDB
  // (ya sea por una carga local nueva o por datos que trajo el sync).
  const movimientos = useLiveQuery(
    () =>
      db.movimientos
        .where('household_id')
        .equals(household.id)
        .and((m) => m.deleted === 0)
        .sortBy('fecha'),
    [household.id]
  )

  if (!movimientos) return <p>Cargando...</p>

  async function handleBorrar(id: string, resumen: string) {
    if (!window.confirm(`¿Borrar "${resumen}"? Esta acción no se puede deshacer.`)) return
    setBorrando(id)
    await borrarMovimiento(id, household.id)
    setBorrando(null)
  }

  // Agrupamos por mes solo para los totales de cada grupo (el saldo corriente
  // ahora se muestra arriba de todo, en el componente SaldoActual).
  const ordenados = [...movimientos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.updated_at.localeCompare(b.updated_at)
  })

  const grupos = new Map<string, typeof ordenados>()
  for (const m of ordenados) {
    const mes = m.fecha.slice(0, 7) // YYYY-MM
    if (!grupos.has(mes)) grupos.set(mes, [])
    grupos.get(mes)!.push(m)
  }
  const meses = [...grupos.keys()].sort().reverse()

  return (
    <div className="movement-list">
      {meses.map((mes) => {
        const items = grupos.get(mes)!.slice().reverse()
        const totalGastos = items.filter((i) => i.tipo === 'gasto').reduce((s, i) => s + i.monto, 0)
        const totalIngresos = items.filter((i) => i.tipo === 'ingreso').reduce((s, i) => s + i.monto, 0)
        return (
          <div key={mes} className="mes-group">
            <div className="mes-header">
              <h3>{mes}</h3>
              <div className="mes-totales">
                <span className="ingreso">+{money.format(totalIngresos)}</span>
                <span className="gasto">-{money.format(totalGastos)}</span>
              </div>
            </div>
            {items.map((m) => (
              <div key={m.id} className="movement-row">
                <div className={`movement-icon ${m.tipo}`}>{m.categoria.trim().charAt(0).toUpperCase() || '?'}</div>
                <div className="movement-main">
                  <span className={`badge ${m.tipo}`}>{m.categoria}</span>
                  <span className="detalle">
                    {m.detalle}
                    {m.forma_pago && <span className="forma-pago"> · {m.forma_pago}</span>}
                  </span>
                </div>
                <div className="movement-side">
                  <span className={`monto ${m.tipo}`}>
                    {m.tipo === 'gasto' ? '-' : '+'}
                    {money.format(m.monto)}
                  </span>
                  <span className="fecha">{m.fecha}</span>
                  {!m.synced && <span className="pending" title="Pendiente de sincronizar">⏳</span>}
                </div>
                <button
                  type="button"
                  className="delete-btn"
                  title="Borrar movimiento"
                  disabled={borrando === m.id}
                  onClick={() => handleBorrar(m.id, `${m.categoria} - ${money.format(m.monto)}`)}
                >
                  {borrando === m.id ? '…' : <Trash2 size={15} />}
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
