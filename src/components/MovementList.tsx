import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
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

  // Saldo corriente: arranca en el saldo inicial configurado y va sumando/restando
  // en orden cronológico (empate por updated_at para mantener orden estable).
  const ordenados = [...movimientos].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.updated_at.localeCompare(b.updated_at)
  })

  let saldo = household.saldo_inicial
  const conSaldo = ordenados.map((m) => {
    saldo += m.tipo === 'ingreso' ? m.monto : -m.monto
    return { ...m, saldoAcumulado: saldo }
  })

  const grupos = new Map<string, typeof conSaldo>()
  for (const m of conSaldo) {
    const mes = m.fecha.slice(0, 7) // YYYY-MM
    if (!grupos.has(mes)) grupos.set(mes, [])
    grupos.get(mes)!.push(m)
  }
  const meses = [...grupos.keys()].sort().reverse()

  return (
    <div className="movement-list">
      <div className="saldo-actual">
        <span>Saldo actual</span>
        <strong>{money.format(saldo)}</strong>
      </div>

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
                <div className="movement-main">
                  <span className={`badge ${m.tipo}`}>{m.categoria}</span>
                  <span className="detalle">{m.detalle}</span>
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
                  {borrando === m.id ? '…' : '🗑'}
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
