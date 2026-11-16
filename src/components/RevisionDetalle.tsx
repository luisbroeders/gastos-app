import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Pencil, Trash2, CalendarCheck, AlertTriangle } from 'lucide-react'
import { db } from '../db'
import { conciliar, tituloRevision, type Coincidencia, type ItemApp } from '../conciliacion'
import { borrarRevisionTarjeta, confirmarEnRevision, guardarTarjetaCierre } from '../sync'
import { fechaCorta, pesos, dolares } from '../formato'
import { EditCompraTarjetaModal } from './EditCompraTarjetaModal'
import type { CompraTarjeta, ConsumoResumen } from '../types'

interface Props {
  revisionId: string
  householdId: string
  onVolver: () => void
}

function montoResumen(c: ConsumoResumen): string {
  return c.monto !== null ? pesos(c.monto) : c.usd !== null ? dolares(c.usd) : ''
}

function etiquetaCuota(c: ConsumoResumen): string {
  return c.cuota ? ` · cuota ${c.cuota.n}/${c.cuota.total}` : ''
}

export function RevisionDetalle({ revisionId, householdId, onVolver }: Props) {
  const revision = useLiveQuery(() => db.revisionesTarjeta.get(revisionId), [revisionId])
  const compras = useLiveQuery(
    () => db.comprasTarjeta.where('household_id').equals(householdId).and((c) => c.deleted === 0).toArray(),
    [householdId]
  )
  const cierres = useLiveQuery(
    () => db.tarjetasCierres.where('household_id').equals(householdId).and((t) => t.deleted === 0).toArray(),
    [householdId]
  )
  const [editando, setEditando] = useState<CompraTarjeta | null>(null)
  const [aplicado, setAplicado] = useState(false)

  const resultado = useMemo(
    () => (revision && compras ? conciliar(revision, compras) : null),
    [revision, compras]
  )

  if (!revision || !resultado || !cierres) return <p className="loading-inline">Cargando...</p>

  const cfg = cierres.find((c) => c.tarjeta === revision.tarjeta)
  const coincideEsteCiclo =
    !!cfg && cfg.cierre_anterior === revision.cierre_anterior && cfg.cierre_proximo === revision.cierre_actual
  const coincideCicloSiguiente =
    !!cfg &&
    !!revision.proximo_cierre &&
    cfg.cierre_anterior === revision.cierre_actual &&
    cfg.cierre_proximo === revision.proximo_cierre
  const fechasAlineadas = coincideEsteCiclo || coincideCicloSiguiente
  const puedeActualizar =
    !fechasAlineadas && !!revision.proximo_cierre && (!cfg?.cierre_anterior || revision.cierre_actual > cfg.cierre_anterior)

  async function actualizarFechasTarjeta() {
    if (!revision?.proximo_cierre) return
    await guardarTarjetaCierre(householdId, revision.tarjeta, revision.cierre_actual, revision.proximo_cierre)
    setAplicado(true)
  }

  async function handleBorrar() {
    if (!window.confirm('¿Borrar esta revisión? Se pierden también las confirmaciones manuales.')) return
    await borrarRevisionTarjeta(revision!.id, householdId)
    onVolver()
  }

  const confirmar = (clave: string, valor: boolean) => confirmarEnRevision(revision.id, clave, valor, householdId)
  const aRevisar = resultado.resumenARevisar.length + resultado.appARevisar.length
  const manuales = resultado.coincidencias.filter((c) => c.tipo !== 'auto').length
  const totalCargos = revision.cargos.reduce((a, c) => a + c.monto, 0)

  return (
    <div className="revision-detalle">
      <button type="button" className="volver-btn" onClick={onVolver}>
        <ArrowLeft size={15} /> Revisiones
      </button>

      <h2 className="rev-titulo">{tituloRevision(revision)}</h2>
      <p className="categorias-hint">
        Período: {fechaCorta(revision.cierre_anterior)} (cierre anterior) → {fechaCorta(revision.cierre_actual)} (cierre
        actual), contando desde el día siguiente al cierre anterior hasta el día del cierre inclusive.
        {revision.vencimiento ? ` Vence el ${fechaCorta(revision.vencimiento)}.` : ''}
      </p>

      <div className="rev-resumen-cards">
        <div className="rev-card ok">
          <strong>{resultado.coincidencias.length}</strong>
          <span>Coincidencias{manuales > 0 ? ` (${manuales} a mano)` : ''}</span>
        </div>
        <div className={`rev-card ${resultado.resumenARevisar.length ? 'warn' : 'ok'}`}>
          <strong>{resultado.resumenARevisar.length}</strong>
          <span>Del resumen sin encontrar en la app</span>
        </div>
        <div className={`rev-card ${resultado.appARevisar.length ? 'warn' : 'ok'}`}>
          <strong>{resultado.appARevisar.length}</strong>
          <span>De la app sin encontrar en el resumen</span>
        </div>
      </div>

      <div className="rev-totales">
        <div><span>Consumos del resumen</span><strong>{pesos(resultado.totales.resumenPesos)}</strong></div>
        {resultado.totales.resumenUsd > 0 && (
          <div><span>Consumos en dólares</span><strong>{dolares(resultado.totales.resumenUsd)}</strong></div>
        )}
        {resultado.totales.resumenARevisarPesos > 0 && (
          <div><span>Del resumen a revisar</span><strong>{pesos(resultado.totales.resumenARevisarPesos)}</strong></div>
        )}
        {resultado.totales.appARevisarPesos > 0 && (
          <div><span>De la app a revisar</span><strong>{pesos(resultado.totales.appARevisarPesos)}</strong></div>
        )}
      </div>

      {/* Fechas de cierre: lo que dice el resumen vs lo cargado en la app */}
      <details className="cierre-row" open={!fechasAlineadas}>
        <summary className="cierre-summary">
          <span className="cierre-tarjeta-nombre"><CalendarCheck size={14} /> Fechas de cierre</span>
          {fechasAlineadas && <span className="cierre-badge-ok">✓ coinciden con la app</span>}
        </summary>
        <div className="rev-cierres">
          <div>
            <span>Según el resumen</span>
            <p>
              Cierre anterior {fechaCorta(revision.cierre_anterior)} · cierre actual {fechaCorta(revision.cierre_actual)}
              {revision.proximo_cierre ? ` · próximo cierre ${fechaCorta(revision.proximo_cierre)}` : ''}
            </p>
          </div>
          <div>
            <span>Cargadas en la app para {revision.tarjeta}</span>
            <p>
              {cfg?.cierre_anterior && cfg?.cierre_proximo
                ? `Cierre anterior ${fechaCorta(cfg.cierre_anterior)} · próximo cierre ${fechaCorta(cfg.cierre_proximo)}`
                : 'Todavía no hay fechas de cierre cargadas para esta tarjeta.'}
            </p>
          </div>
          {puedeActualizar && !aplicado && (
            <button type="button" className="submit-btn secondary-btn" onClick={actualizarFechasTarjeta}>
              Actualizar la tarjeta con las fechas de este resumen
            </button>
          )}
          {aplicado && <p className="saved-msg">Fechas de cierre de {revision.tarjeta} actualizadas ✓</p>}
        </div>
      </details>

      {/* A revisar */}
      <h3 className="rev-seccion">A revisar ({aRevisar})</h3>
      {aRevisar === 0 ? (
        <p className="rev-todo-ok"><Check size={14} /> No queda nada pendiente: todo coincide.</p>
      ) : (
        <p className="categorias-hint">Tildá un ítem para pasarlo a coincidencias (por ejemplo, si ya lo verificaste por otro lado).</p>
      )}

      {resultado.resumenARevisar.length > 0 && (
        <>
          <h4 className="rev-subseccion">Están en el resumen y no en la app</h4>
          <div className="rev-lista">
            {resultado.resumenARevisar.map((c) => (
              <label key={c.id} className="rev-item">
                <input type="checkbox" checked={false} onChange={() => confirmar(`s:${c.id}`, true)} />
                <div className="rev-item-main">
                  <span className="rev-item-titulo">{c.descripcion}</span>
                  <span className="rev-item-sub">
                    {fechaCorta(c.fecha)} · {c.titular}{etiquetaCuota(c)}
                  </span>
                </div>
                <span className="rev-item-monto">{montoResumen(c)}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {resultado.appARevisar.length > 0 && (
        <>
          <h4 className="rev-subseccion">Están en la app y no en el resumen</h4>
          <div className="rev-lista">
            {resultado.appARevisar.map((a) => (
              <ItemAppARevisar key={a.key} item={a} onConfirmar={() => confirmar(a.key, true)} onEditar={() => setEditando(a.compra)} />
            ))}
          </div>
        </>
      )}

      {/* Coincidencias */}
      <h3 className="rev-seccion">Coincidencias ({resultado.coincidencias.length})</h3>
      <div className="rev-lista">
        {resultado.coincidencias.map((c) => (
          <FilaCoincidencia
            key={c.resumen ? `s${c.resumen.id}` : c.app!.key}
            c={c}
            onDesmarcar={(clave) => confirmar(clave, false)}
            onEditar={(compra) => setEditando(compra)}
          />
        ))}
        {resultado.coincidencias.length === 0 && <p className="categorias-hint">Todavía no hay coincidencias.</p>}
      </div>

      {revision.cargos.length > 0 && (
        <details className="cierre-row">
          <summary className="cierre-summary">
            <span className="cierre-tarjeta-nombre">Impuestos, cargos e intereses</span>
            <span className="cierre-badge-ok">{pesos(totalCargos)} · no se comparan</span>
          </summary>
          <div className="rev-lista">
            {revision.cargos.map((c, i) => (
              <div key={i} className="rev-item solo-lectura">
                <div className="rev-item-main">
                  <span className="rev-item-titulo">{c.descripcion}</span>
                  <span className="rev-item-sub">{fechaCorta(c.fecha)}</span>
                </div>
                <span className="rev-item-monto">{pesos(c.monto)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <button type="button" className="borrar-revision-btn" onClick={handleBorrar}>
        <Trash2 size={14} /> Borrar esta revisión
      </button>

      {editando && (
        <EditCompraTarjetaModal compra={editando} householdId={householdId} onClose={() => setEditando(null)} />
      )}
    </div>
  )
}

function ItemAppARevisar({ item, onConfirmar, onEditar }: { item: ItemApp; onConfirmar: () => void; onEditar: () => void }) {
  return (
    <div className="rev-item">
      <input type="checkbox" checked={false} onChange={onConfirmar} aria-label="Confirmar" />
      <div className="rev-item-main">
        <span className="rev-item-titulo">{item.descripcion}</span>
        <span className="rev-item-sub">
          {fechaCorta(item.fecha)}
          {item.cuota ? ` · cuota ${item.cuota.n}/${item.cuota.total}` : ''}
        </span>
      </div>
      <span className="rev-item-monto">{pesos(item.monto)}</span>
      <button type="button" className="delete-btn edit-btn" title="Editar compra" onClick={onEditar}>
        <Pencil size={14} />
      </button>
    </div>
  )
}

function FilaCoincidencia({
  c,
  onDesmarcar,
  onEditar,
}: {
  c: Coincidencia
  onDesmarcar: (clave: string) => void
  onEditar: (compra: CompraTarjeta) => void
}) {
  if (c.tipo === 'auto' && c.resumen && c.app && c.condiciones) {
    return (
      <div className="rev-item coincidencia">
        <Check size={16} className="rev-check-ok" />
        <div className="rev-item-main">
          <span className="rev-item-titulo">
            {c.resumen.descripcion}
            <em>{etiquetaCuota(c.resumen)}</em>
          </span>
          <span className="rev-item-sub">
            Resumen {fechaCorta(c.resumen.fecha)} · App: {c.app.descripcion} {fechaCorta(c.app.fecha)}
            {c.app.monto !== c.resumen.monto ? ` (${pesos(c.app.monto)})` : ''}
          </span>
          <span className="rev-badges">
            <i className={c.condiciones.nombre ? 'si' : 'no'}>Nombre</i>
            <i className={c.condiciones.fecha ? 'si' : 'no'}>Fecha</i>
            <i className={c.condiciones.importe ? 'si' : 'no'}>
              {c.resumen.monto === null ? 'Importe (USD, no se compara)' : 'Importe'}
            </i>
          </span>
          {c.avisos.map((a, i) => (
            <span key={i} className="rev-aviso"><AlertTriangle size={12} /> {a}</span>
          ))}
        </div>
        <span className="rev-item-monto">{montoResumen(c.resumen)}</span>
        <button type="button" className="delete-btn edit-btn" title="Editar compra" onClick={() => onEditar(c.app!.compra)}>
          <Pencil size={14} />
        </button>
      </div>
    )
  }

  const esResumen = c.tipo === 'manual-resumen'
  const clave = esResumen ? `s:${c.resumen!.id}` : c.app!.key
  return (
    <label className="rev-item coincidencia manual">
      <input type="checkbox" checked onChange={() => onDesmarcar(clave)} aria-label="Deshacer confirmación" />
      <div className="rev-item-main">
        <span className="rev-item-titulo">{esResumen ? c.resumen!.descripcion : c.app!.descripcion}</span>
        <span className="rev-item-sub">
          Confirmado a mano · {esResumen ? 'del resumen' : 'de la app'} · {fechaCorta(esResumen ? c.resumen!.fecha : c.app!.fecha)}
        </span>
      </div>
      <span className="rev-item-monto">{esResumen ? montoResumen(c.resumen!) : pesos(c.app!.monto)}</span>
    </label>
  )
}
