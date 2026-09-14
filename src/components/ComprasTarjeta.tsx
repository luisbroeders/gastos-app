import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { CreditCard, Send, Trash2, CalendarCog } from 'lucide-react'
import { db } from '../db'
import { guardarCompraTarjeta, borrarCompraTarjeta, guardarTarjetaCierre } from '../sync'
import { TARJETAS } from '../categories'
import { parseMontoArgentino } from '../textParser'
import { parseFechaLocal, numeroDeCiclo, calcularValorCuota } from '../cicloTarjeta'
import type { CompraTarjeta, Household } from '../types'

interface Props {
  household: Household
  userId: string
  userName: string
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

interface Borrador {
  anterior: string
  proximo: string
}

export function ComprasTarjeta({ household, userId, userName }: Props) {
  const householdId = household.id
  const [fecha, setFecha] = useState(todayISODate())
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [tarjeta, setTarjeta] = useState('')
  const [cuotas, setCuotas] = useState('1')
  const [tasa, setTasa] = useState('0')
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

  const cierres = useLiveQuery(
    () =>
      db.tarjetasCierres
        .where('household_id')
        .equals(householdId)
        .and((t) => t.deleted === 0)
        .toArray(),
    [householdId]
  )
  const cierresPorTarjeta = new Map((cierres ?? []).map((c) => [c.tarjeta, c]))

  // Borrador de edición de fechas por tarjeta. Se "siembra" una sola vez con
  // lo que ya está guardado (para no pisar lo que el usuario esté tipeando
  // si llega una sincronización de fondo mientras edita).
  const [borradores, setBorradores] = useState<Record<string, Borrador>>(
    Object.fromEntries(TARJETAS.map((t) => [t, { anterior: '', proximo: '' }]))
  )
  const sembrado = useRef(false)
  useEffect(() => {
    if (sembrado.current || !cierres) return
    sembrado.current = true
    setBorradores((prev) => {
      const next = { ...prev }
      for (const t of TARJETAS) {
        const guardado = cierresPorTarjeta.get(t)
        next[t] = { anterior: guardado?.cierre_anterior ?? '', proximo: guardado?.cierre_proximo ?? '' }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cierres])

  const [guardandoTarjeta, setGuardandoTarjeta] = useState<string | null>(null)
  const [cierreMsg, setCierreMsg] = useState<string | null>(null)

  async function handleGuardarCierre(t: string) {
    const b = borradores[t]
    setGuardandoTarjeta(t)
    await guardarTarjetaCierre(householdId, t, b.anterior || null, b.proximo || null)
    setGuardandoTarjeta(null)
    setCierreMsg(`Fechas de ${t} guardadas ✓`)
    setTimeout(() => setCierreMsg(null), 2500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseMontoArgentino(monto)
    if (!montoNum || montoNum <= 0 || !descripcion.trim()) return

    const cuotasNum = parseInt(cuotas, 10)
    const tasaNum = parseMontoArgentino(tasa)

    setSaving(true)
    const nueva: CompraTarjeta = {
      id: crypto.randomUUID(),
      household_id: householdId,
      fecha,
      descripcion: descripcion.trim(),
      monto: montoNum,
      tarjeta: tarjeta || null,
      cuotas: Number.isFinite(cuotasNum) && cuotasNum > 0 ? cuotasNum : 1,
      tasa: tasaNum !== null && tasaNum >= 0 ? tasaNum : 0,
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
    setCuotas('1')
    setTasa('0')
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

  // Acumulado del ciclo actual, POR TARJETA: cada tarjeta tiene su propio
  // ciclo (definido por sus dos fechas de cierre). Cada cuota de cada compra
  // de esa tarjeta cae en el ciclo de la compra + (número de cuota - 1);
  // sumamos las que caen en el ciclo 0 (el actual) de ESA tarjeta.
  const acumuladoPorTarjeta: Record<string, number> = {}
  for (const t of TARJETAS) {
    const cierre = cierresPorTarjeta.get(t)
    if (!cierre?.cierre_anterior || !cierre?.cierre_proximo) continue
    const anterior = parseFechaLocal(cierre.cierre_anterior)
    const proximo = parseFechaLocal(cierre.cierre_proximo)
    let acumulado = 0
    for (const c of ordenadas) {
      if (c.tarjeta !== t) continue
      const cicloCompra = numeroDeCiclo(parseFechaLocal(c.fecha), anterior, proximo)
      if (cicloCompra === null) continue
      const valorCuota = calcularValorCuota(c.monto, c.cuotas, c.tasa)
      for (let i = 0; i < c.cuotas; i++) {
        if (cicloCompra + i === 0) acumulado += valorCuota
      }
    }
    acumuladoPorTarjeta[t] = acumulado
  }
  const totalAcumulado = Object.values(acumuladoPorTarjeta).reduce((a, b) => a + b, 0)
  const hayAlgunCicloConfigurado = Object.keys(acumuladoPorTarjeta).length > 0

  return (
    <div className="tarjeta-section">
      <p className="categorias-hint">
        Estas compras quedan registradas aparte y <strong>no descuentan del saldo</strong>, porque
        no son pagos hechos con dinero en el momento (se pagan después, con el resumen de la tarjeta).
      </p>

      <h2 className="tarjeta-subtitulo"><CalendarCog size={16} /> Fechas de cierre por tarjeta</h2>
      <p className="categorias-hint">
        Cargá la fecha del cierre anterior (arranca el ciclo actual) y la próxima fecha de cierre
        (lo termina). Cuando llegue el resumen real, actualizalas: lo que hoy es "próximo" pasa a
        ser el "anterior" del ciclo siguiente.
      </p>

      <div className="cierres-list">
        {TARJETAS.map((t) => {
          const configurada = !!(borradores[t]?.anterior && borradores[t]?.proximo)
          return (
            <details key={t} className="cierre-row">
              <summary className="cierre-summary">
                <span className="cierre-tarjeta-nombre">{t}</span>
                {configurada && <span className="cierre-badge-ok">✓ configurada</span>}
              </summary>
              <div className="cierre-fechas">
                <label>
                  Cierre anterior
                  <input
                    type="date"
                    value={borradores[t]?.anterior ?? ''}
                    onChange={(e) =>
                      setBorradores((prev) => ({ ...prev, [t]: { ...prev[t], anterior: e.target.value } }))
                    }
                  />
                </label>
                <label>
                  Próximo cierre
                  <input
                    type="date"
                    value={borradores[t]?.proximo ?? ''}
                    onChange={(e) =>
                      setBorradores((prev) => ({ ...prev, [t]: { ...prev[t], proximo: e.target.value } }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="submit-btn secondary-btn cierre-guardar-btn"
                  disabled={guardandoTarjeta === t}
                  onClick={() => handleGuardarCierre(t)}
                >
                  {guardandoTarjeta === t ? '...' : 'Guardar'}
                </button>
              </div>
            </details>
          )
        })}
      </div>
      {cierreMsg && <p className="saved-msg">{cierreMsg}</p>}

      {hayAlgunCicloConfigurado && (
        <div className="tarjeta-total acumulado">
          <div className="acumulado-total-row">
            <span>Total acumulado (todas las tarjetas)</span>
            <strong>{money.format(totalAcumulado)}</strong>
          </div>
          <div className="acumulado-detalle">
            {TARJETAS.filter((t) => acumuladoPorTarjeta[t] !== undefined).map((t) => (
              <div key={t} className="acumulado-detalle-item">
                <span>{t}</span>
                <span>{money.format(acumuladoPorTarjeta[t])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="categorias-hint">
        Solo se cuentan en el acumulado las compras que tienen una tarjeta específica asignada
        (no las que quedaron "Sin especificar").
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

        <div className="form-row-2">
          <label>
            Cuotas (opcional)
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="1"
              value={cuotas}
              onChange={(e) => setCuotas(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>

          <label>
            Tasa % (opcional)
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={tasa}
              onChange={(e) => setTasa(e.target.value.replace(/[^0-9.,]/g, ''))}
            />
          </label>
        </div>

        <button type="submit" className="submit-btn" disabled={saving}>
          {saving ? 'Guardando...' : (<><Send size={16} /> Registrar</>)}
        </button>
        {savedMsg && <p className="saved-msg">{savedMsg}</p>}
      </form>

      <div className="movement-list">
        {ordenadas.map((c) => (
          <div key={c.id} className="movement-row">
            <div className="movement-icon gasto">
              <CreditCard size={16} />
            </div>
            <div className="movement-main">
              <span className="badge gasto">{c.descripcion}</span>
              <span className="detalle">
                {c.tarjeta ?? 'Sin tarjeta especificada'}
                {(c.cuotas > 1 || c.tasa > 0) && (
                  <span className="forma-pago">
                    {' '}
                    · {c.cuotas > 1 ? `${c.cuotas} cuotas de ${money.format(calcularValorCuota(c.monto, c.cuotas, c.tasa))}` : '1 cuota'}
                    {c.tasa > 0 ? ` (${c.tasa}% TNA)` : ''}
                  </span>
                )}
              </span>
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
