import { useState } from 'react'
import { X, ArrowDownCircle, ArrowUpCircle, Save } from 'lucide-react'
import { editarMovimiento } from '../sync'
import { FORMAS_PAGO } from '../categories'
import { parseMontoArgentino, formatMontoParaInput } from '../textParser'
import type { Movimiento, TipoMovimiento } from '../types'

interface Props {
  movimiento: Movimiento
  categorias: string[]
  householdId: string
  onClose: () => void
}

export function EditMovimientoModal({ movimiento, categorias, householdId, onClose }: Props) {
  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento.tipo)
  const [fecha, setFecha] = useState(movimiento.fecha)
  const [categoria, setCategoria] = useState(movimiento.categoria)
  const [detalle, setDetalle] = useState(movimiento.detalle)
  const [formaPago, setFormaPago] = useState(movimiento.forma_pago ?? '')
  const [monto, setMonto] = useState(formatMontoParaInput(movimiento.monto))
  const [saving, setSaving] = useState(false)

  // Los movimientos importados desde el Excel pueden tener categorías que no
  // están en la lista actual (texto libre): las incluimos igual para no
  // perder la categoría original al editar.
  const opcionesCategoria = categorias.includes(movimiento.categoria)
    ? categorias
    : [movimiento.categoria, ...categorias]

  // Igual con la forma de pago: si el movimiento tiene una que ya no está en
  // la lista (ej: una opción que se quitó), se conserva como opción.
  const opcionesFormaPago =
    movimiento.forma_pago && !FORMAS_PAGO.includes(movimiento.forma_pago)
      ? [movimiento.forma_pago, ...FORMAS_PAGO]
      : FORMAS_PAGO

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseMontoArgentino(monto)
    if (!montoNum || montoNum <= 0) return

    setSaving(true)
    await editarMovimiento(
      {
        ...movimiento,
        tipo,
        fecha,
        categoria,
        detalle: detalle.trim(),
        monto: montoNum,
        forma_pago: tipo === 'gasto' && formaPago ? formaPago : null,
      },
      householdId
    )
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card expense-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h3>Editar movimiento</h3>
          <button type="button" className="icon-btn" title="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="tipo-toggle">
          <button
            type="button"
            className={tipo === 'gasto' ? 'active gasto' : 'gasto'}
            onClick={() => setTipo('gasto')}
          >
            <ArrowDownCircle size={16} />
            Gasto
          </button>
          <button
            type="button"
            className={tipo === 'ingreso' ? 'active ingreso' : 'ingreso'}
            onClick={() => {
              setTipo('ingreso')
              setFormaPago('')
            }}
          >
            <ArrowUpCircle size={16} />
            Ingreso
          </button>
        </div>

        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>

        <label>
          Categoría
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {opcionesCategoria.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          Detalle
          <input type="text" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        </label>

        {tipo === 'gasto' && (
          <label>
            Forma de pago (opcional)
            <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
              <option value="">Sin especificar</option>
              {opcionesFormaPago.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Monto
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^0-9.,]/g, ''))}
            required
          />
        </label>

        <button type="submit" className="submit-btn" disabled={saving}>
          {saving ? 'Guardando...' : (<><Save size={16} /> Guardar cambios</>)}
        </button>
      </form>
    </div>
  )
}
