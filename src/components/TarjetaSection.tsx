import { useState } from 'react'
import { ComprasTarjeta } from './ComprasTarjeta'
import { RevisionesTarjeta } from './RevisionesTarjeta'
import type { Household } from '../types'

interface Props {
  household: Household
  userId: string
  userName: string
}

type Vista = 'compras' | 'revisiones'

/** Pestaña "Tarjeta": las compras cargadas a mano y, aparte, la revisión de los resúmenes del banco. */
export function TarjetaSection({ household, userId, userName }: Props) {
  const [vista, setVista] = useState<Vista>('compras')
  return (
    <div>
      <div className="subtabs">
        <button type="button" className={vista === 'compras' ? 'active' : ''} onClick={() => setVista('compras')}>
          Compras
        </button>
        <button type="button" className={vista === 'revisiones' ? 'active' : ''} onClick={() => setVista('revisiones')}>
          Revisión de resúmenes
        </button>
      </div>
      {vista === 'compras' ? (
        <ComprasTarjeta household={household} userId={userId} userName={userName} />
      ) : (
        <RevisionesTarjeta householdId={household.id} userId={userId} userName={userName} />
      )}
    </div>
  )
}
