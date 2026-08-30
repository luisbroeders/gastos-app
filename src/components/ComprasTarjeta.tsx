import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { CreditCard, Send, Trash2 } from 'lucide-react'
import { db } from '../db'
import { guardarCompraTarjeta, borrarCompraTarjeta } from '../sync'
import { TARJETAS } from '../categories'
import { parseMontoArgentino } from '../textParser'
import type { CompraTarjeta } from '../types'

interface Props {
  householdId: string
  userId: string
  userName: string
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

export function ComprasTarjeta({ householdId, userId, userName }: Props) {
  const [fecha, setFecha] = useState(todayISODate())
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [tarjeta, setTarjeta] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)

  const compras = useLiveQuery(
    () =>
      db.comprasTarjeta
        .where('household_id')
        .equals(householdId)
        .and((c) => c.deleted === 0)
        .toArray(),
    [householdId]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseMontoArgentino(monto)
    if (!montoNum || montoNum <= 0 || !descripcion.trim()) return

    setSaving(true)
    const nueva: CompraTarjeta = {
      id: crypto.randomUUID(),
      household_id: householdId,
      fecha,
      descripcion: descripcion.trim(),
      monto: montoNum,
      tarjeta: tarjeta || null,
      created_by: userId,
      created_by_nombre: userName,
      updated_at: new Date().toISOString(),
      deleted: 0,
      synced: 0,
    }
    await guardarCompraTarjeta(nueva, householdId)

    setDescripcion('')
    setMonto('')
    setTarjeta('')
    setSaving(false)
    setSavedMsg(navigator.onLine ? 'Guardado ✓' : 'Guardado localmente — se sincroniza al recuperar señal')
    setTimeout(() => setSavedMsg(null), 2500)
  }

  async function handleBorrar(id: string, resumen: string) {
    if (!window.confirm(`¿Borrar "${resumen}"? Esta acción no se puede deshacer.`)) return
    setBorrando(id)
    await borrarCompraTarjeta(id, householdId)
    setBorrando(null)
  }

  const ordenadas = (compras ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha))
  const total = ordenadas.reduce((acc, c) => acc + c.monto, 0)

  return (
    <div className="tarjeta-section">
      <p className="categorias-hint">
        Estas compras quedan registradas aparte y <strong>no descuentan del saldo</strong>, porque
        no son pagos hechos con dinero en el momento (se pagan después, con el resumen de la tarjeta).
      </p>

      <form className="expense-form" onSubmit={handleSubmit}>
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>

        <label>
          Descripción
          <input
            type="text"
            placeholder="Ej: Zapatillas, regalo cumpleaños..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            required
          />
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
            {TARJETAS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="submit-btn" disabled={saving}>
          {saving ? 'Guardando...' : (<><Send size={16} /> Registrar</>)}
        </button>
        {savedMsg && <p className="saved-msg">{savedMsg}</p>}
      </form>

      {ordenadas.length > 0 && (
        <div className="tarjeta-total">
          <span>Total registrado</span>
          <strong>{money.format(total)}</strong>
        </div>
      )}

      <div className="movement-list">
        {ordenadas.map((c) => (
          <div key={c.id} className="movement-row">
            <div className="movement-icon gasto">
              <CreditCard size={16} />
            </div>
            <div className="movement-main">
              <span className="badge gasto">{c.descripcion}</span>
              <span className="detalle">{c.tarjeta ?? 'Sin tarjeta especificada'}</span>
            </div>
            <div className="movement-side">
              <span className="monto gasto">{money.format(c.monto)}</span>
              <span className="fecha">{c.fecha}</span>
              {!c.synced && <span className="pending" title="Pendiente de sincronizar">⏳</span>}
            </div>
            <button
              type="button"
              className="delete-btn"
              title="Borrar"
              disabled={borrando === c.id}
              onClick={() => handleBorrar(c.id, `${c.descripcion} - ${money.format(c.monto)}`)}
            >
              {borrando === c.id ? '…' : <Trash2 size={15} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
