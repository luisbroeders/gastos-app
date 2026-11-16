import { useState } from 'react'
import { FileUp, X, Save, AlertTriangle } from 'lucide-react'
import { TARJETAS } from '../categories'
import { extraerLineasPDF, parsearResumenBBVA, type ResumenParseado } from '../resumenTarjeta'
import { guardarRevisionTarjeta } from '../sync'
import { tituloRevision } from '../conciliacion'
import { fechaCorta, pesos, dolares } from '../formato'
import type { RevisionTarjeta } from '../types'

interface Props {
  householdId: string
  userId: string
  userName: string
  existentes: RevisionTarjeta[]
  onCancel: () => void
  onGuardada: (id: string) => void
}

export function NuevaRevision({ householdId, userId, userName, existentes, onCancel, onGuardada }: Props) {
  const [tarjeta, setTarjeta] = useState('')
  const [archivo, setArchivo] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenParseado | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    setResumen(null)
    setArchivo(f.name)
    setLeyendo(true)
    try {
      const lineas = await extraerLineasPDF(f)
      const r = parsearResumenBBVA(lineas)
      setResumen(r)
      if (r.tarjetaSugerida && !tarjeta) setTarjeta(r.tarjetaSugerida)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el PDF.')
    } finally {
      setLeyendo(false)
    }
  }

  const duplicada =
    resumen && tarjeta
      ? existentes.find((r) => r.tarjeta === tarjeta && r.cierre_actual === resumen.cierreActual)
      : undefined

  async function handleGuardar() {
    if (!resumen || !tarjeta || !resumen.cierreActual || !resumen.cierreAnterior) return
    if (
      duplicada &&
      !window.confirm(
        'Ya cargaste la revisión de este resumen para esta tarjeta. Si seguís, se reemplaza y se pierden las confirmaciones manuales. ¿Continuar?'
      )
    ) {
      return
    }
    setGuardando(true)
    const revision: RevisionTarjeta = {
      id: crypto.randomUUID(),
      household_id: householdId,
      tarjeta,
      cierre_anterior: resumen.cierreAnterior,
      cierre_actual: resumen.cierreActual,
      proximo_cierre: resumen.proximoCierre,
      vencimiento: resumen.vencimientoActual,
      saldo_pesos: resumen.saldoPesos,
      saldo_usd: resumen.saldoUsd,
      consumos: resumen.consumos,
      cargos: resumen.cargos,
      confirmados: [],
      archivo,
      created_by: userId,
      created_by_nombre: userName,
      updated_at: new Date().toISOString(),
      deleted: 0,
      synced: 0,
    }
    await guardarRevisionTarjeta(revision, householdId)
    setGuardando(false)
    onGuardada(duplicada?.id ?? revision.id)
  }

  const totalCargos = resumen ? resumen.cargos.reduce((a, c) => a + c.monto, 0) : 0
  const totalPesos = resumen ? resumen.consumos.reduce((a, c) => a + (c.monto ?? 0), 0) : 0
  const totalUsd = resumen ? resumen.consumos.reduce((a, c) => a + (c.usd ?? 0), 0) : 0

  return (
    <div className="expense-form nueva-revision">
      <div className="modal-header">
        <h3>Nueva revisión de resumen</h3>
        <button type="button" className="icon-btn" title="Cancelar" onClick={onCancel}>
          <X size={16} />
        </button>
      </div>

      <p className="categorias-hint">
        Elegí el PDF del resumen de la tarjeta. Se lee en este dispositivo: el archivo no se sube a ningún
        lado, solo se guardan los consumos que contiene. Por ahora se reconoce el formato de BBVA.
      </p>

      <label className="archivo-btn">
        <FileUp size={16} />
        {leyendo ? 'Leyendo el PDF...' : archivo ? `Cambiar archivo (${archivo})` : 'Elegir PDF del resumen'}
        <input type="file" accept="application/pdf,.pdf" onChange={handleArchivo} disabled={leyendo} hidden />
      </label>

      {error && <p className="error">{error}</p>}

      {resumen && (
        <>
          <label>
            Tarjeta
            <select value={tarjeta} onChange={(e) => setTarjeta(e.target.value)}>
              <option value="">Elegí la tarjeta de este resumen</option>
              {TARJETAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {resumen.cierreAnterior && resumen.cierreActual && tarjeta && (
            <p className="rev-titulo-preview">
              {tituloRevision({ tarjeta, cierre_anterior: resumen.cierreAnterior, cierre_actual: resumen.cierreActual })}
            </p>
          )}

          <div className="rev-preview">
            <div><span>Período</span><strong>{fechaCorta(resumen.cierreAnterior!)} → {fechaCorta(resumen.cierreActual!)}</strong></div>
            {resumen.vencimientoActual && <div><span>Vencimiento</span><strong>{fechaCorta(resumen.vencimientoActual)}</strong></div>}
            {resumen.proximoCierre && <div><span>Próximo cierre</span><strong>{fechaCorta(resumen.proximoCierre)}</strong></div>}
            <div><span>Consumos leídos</span><strong>{resumen.consumos.length}</strong></div>
            <div><span>Total consumos</span><strong>{pesos(totalPesos)}{totalUsd > 0 ? ` + ${dolares(totalUsd)}` : ''}</strong></div>
            <div><span>Impuestos y cargos (no se comparan)</span><strong>{pesos(totalCargos)}</strong></div>
          </div>

          {resumen.advertencias.length > 0 && (
            <div className="rev-aviso-caja">
              <AlertTriangle size={14} />
              <div>
                <strong>Revisá la lectura:</strong>
                {resumen.advertencias.map((a, i) => (
                  <div key={i}>{a}</div>
                ))}
              </div>
            </div>
          )}

          {duplicada && (
            <p className="rev-aviso">
              Ya existe una revisión de este resumen para {tarjeta}: al guardar se reemplaza.
            </p>
          )}

          <button type="button" className="submit-btn" disabled={!tarjeta || guardando} onClick={handleGuardar}>
            {guardando ? 'Guardando...' : (<><Save size={16} /> Guardar y revisar</>)}
          </button>
        </>
      )}
    </div>
  )
}
