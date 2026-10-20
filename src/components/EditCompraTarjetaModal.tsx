import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { editarCompraTarjeta } from '../sync'
import { TARJETAS } from '../categories'
import { parseMontoArgentino, formatMontoParaInput } from '../textParser'
import type { CompraTarjeta } from '../types'

interface Props {
  compra: CompraTarjeta
  householdId: string
  onClose: () => void
}

export function EditCompraTarjetaModal({ compra, householdId, onClose }: Props) {
  const [fecha, setFecha] = useState(compra.fecha)
  const [descripcion, setDescripcion] = useState(compra.descripcion)
  const [monto, setMonto] = useState(formatMontoParaInput(compra.monto))
  const [tarjeta, setTarjeta] = useState(compra.tarjeta ?? '')
  const [cuotas, setCuotas] = useState(String(compra.cuotas))
  const [tasa, setTasa] = useState(formatMontoParaInput(compra.tasa))
  const [saving, setSaving] = useState(false)

  // Si la compra tiene una tarjeta que ya no está en la lista (por ejemplo
  // "Mastercard MP", que se separó en Luis/Euge), se muestra como opción para
  // no perderla por accidente; elegir otra la reasigna.
  const opcionesTarjeta =
    compra.tarjeta && !TARJETAS.includes(compra.tarjeta) ? [compra.tarjeta, ...TARJETAS] : TARJETAS

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseMontoArgentino(monto)
    if (!montoNum || montoNum <= 0 || !descripcion.trim()) return

    const cuotasNum = parseInt(cuotas, 10)
    const tasaNum = parseMontoArgentino(tasa)

    setSaving(true)
    await editarCompraTarjeta(
      {
        ...compra,
        fecha,
        descripcion: descripcion.trim(),
        monto: montoNum,
        tarjeta: tarjeta || null,
        cuotas: Number.isFinite(cuotasNum) && cuotasNum > 0 ? cuotasNum : 1,
        tasa: tasaNum !== null && tasaNum >= 0 ? tasaNum : 0,
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
          <h3>Editar compra con tarjeta</h3>
          <button type="button" className="icon-btn" title="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>

        <label>
          Descripción
          <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
        </label>

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

        <label>
          Tarjeta (opcional)
          <select value={tarjeta} onChange={(e) => setTarjeta(e.target.value)}>
            <option value="">Sin especificar</option>
            {opcionesTarjeta.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <div className="form-row-2">
          <label>
            Cuotas
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={cuotas}
              onChange={(e) => setCuotas(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
          <label>
            Tasa %
            <input
              type="text"
              inputMode="decimal"
              value={tasa}
              onChange={(e) => setTasa(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
          </label>
        </div>

        <button type="submit" className="submit-btn" disabled={saving}>
          {saving ? 'Guardando...' : (<><Save size={16} /> Guardar cambios</>)}
        </button>
      </form>
    </div>
  )
}
