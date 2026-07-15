import { useState } from 'react'
import { db } from '../db'
import { runSync } from '../sync'
import { DEFAULT_CATEGORIES } from '../categories'
import { parseTextoLibre } from '../textParser'
import { useVoiceInput, isVoiceInputSupported } from '../useVoiceInput'
import type { Movimiento, TipoMovimiento } from '../types'

interface Props {
  householdId: string
  userId: string
  userName: string
  categorias: string[]
  onSaved?: () => void
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

export function ExpenseForm({ householdId, userId, userName, categorias, onSaved }: Props) {
  const [tipo, setTipo] = useState<TipoMovimiento>('gasto')
  const [fecha, setFecha] = useState(todayISODate())
  const [categoria, setCategoria] = useState(categorias[0] ?? DEFAULT_CATEGORIES[0])
  const [detalle, setDetalle] = useState('')
  const [monto, setMonto] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [categoriaAuto, setCategoriaAuto] = useState(false)
  const [ultimoTranscript, setUltimoTranscript] = useState<string | null>(null)
  const { listening, error: voiceError, start: startVoice, stop: stopVoice } = useVoiceInput()

  function handleVoiceResult(transcript: string) {
    const resultado = parseTextoLibre(transcript)
    setUltimoTranscript(transcript)
    setTipo(resultado.tipo)
    setDetalle(resultado.detalle)
    if (resultado.monto !== null) setMonto(String(resultado.monto))
    setCategoria(resultado.categoria === 'Sin categoría' || !categorias.includes(resultado.categoria)
      ? 'Sin categoría'
      : resultado.categoria)
    setCategoriaAuto(true)
  }

  function toggleVoice() {
    if (listening) {
      stopVoice()
    } else {
      startVoice(handleVoiceResult)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = Number(monto.replace(',', '.'))
    if (!montoNum || montoNum <= 0) return

    setSaving(true)
    const now = new Date().toISOString()
    const movimiento: Movimiento = {
      id: crypto.randomUUID(),
      household_id: householdId,
      fecha,
      categoria,
      detalle: detalle.trim(),
      monto: montoNum,
      tipo,
      created_by: userId,
      created_by_nombre: userName,
      updated_at: now,
      deleted: 0,
      synced: 0,
    }

    // 1) Guardado local inmediato: funciona sin conexión, la UI no espera al servidor.
    await db.movimientos.put(movimiento)

    // 2) Intento de sincronización en segundo plano (no bloquea el formulario).
    runSync(householdId)

    setDetalle('')
    setMonto('')
    setSaving(false)
    setCategoriaAuto(false)
    setUltimoTranscript(null)
    setSavedMsg(navigator.onLine ? 'Guardado ✓' : 'Guardado localmente — se sincroniza al recuperar señal')
    setTimeout(() => setSavedMsg(null), 2500)
    onSaved?.()
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit}>
      {isVoiceInputSupported() && (
        <div className="voice-row">
          <button
            type="button"
            className={listening ? 'mic-btn listening' : 'mic-btn'}
            onClick={toggleVoice}
          >
            {listening ? '⏹ Escuchando...' : '🎤 Cargar por voz'}
          </button>
          {ultimoTranscript && <p className="transcript-preview">"{ultimoTranscript}"</p>}
          {voiceError && <p className="error">{voiceError}</p>}
        </div>
      )}

      <div className="tipo-toggle">
        <button
          type="button"
          className={tipo === 'gasto' ? 'active gasto' : 'gasto'}
          onClick={() => setTipo('gasto')}
        >
          Gasto
        </button>
        <button
          type="button"
          className={tipo === 'ingreso' ? 'active ingreso' : 'ingreso'}
          onClick={() => setTipo('ingreso')}
        >
          Ingreso
        </button>
      </div>

      <label>
        Fecha
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </label>

      <label>
        Categoría {categoriaAuto && <span className="auto-badge">detectada automáticamente</span>}
        <select
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value)
            setCategoriaAuto(false)
          }}
        >
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label>
        Detalle
        <input
          type="text"
          placeholder="Ej: Coto, farmacia, nafta..."
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
        />
      </label>

      <label>
        Monto
        <input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
          min="0"
          step="0.01"
        />
      </label>

      <button type="submit" className="submit-btn" disabled={saving}>
        {saving ? 'Guardando...' : 'Registrar'}
      </button>
      {savedMsg && <p className="saved-msg">{savedMsg}</p>}
    </form>
  )
}
