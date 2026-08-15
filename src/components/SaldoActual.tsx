import { useLiveQuery } from 'dexie-react-hooks'
import { WalletMinimal } from 'lucide-react'
import { db } from '../db'
import type { Household } from '../types'

interface Props {
  household: Household
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function SaldoActual({ household }: Props) {
  // useLiveQuery re-renderiza automáticamente cuando cambia IndexedDB
  // (carga nueva, borrado, o datos que trajo el sync).
  const movimientos = useLiveQuery(
    () =>
      db.movimientos
        .where('household_id')
        .equals(household.id)
        .and((m) => m.deleted === 0)
        .toArray(),
    [household.id]
  )

  if (!movimientos) return null

  const saldo = movimientos.reduce(
    (acc, m) => acc + (m.tipo === 'ingreso' ? m.monto : -m.monto),
    household.saldo_inicial
  )

  return (
    <div className={`saldo-hero ${saldo >= 0 ? 'positivo' : 'negativo'}`}>
      <div className="saldo-hero-content">
        <div className="saldo-hero-label">
          <WalletMinimal size={14} />
          <span>Saldo disponible</span>
        </div>
        <div className="saldo-hero-amount">{money.format(saldo)}</div>
      </div>
    </div>
  )
}
