import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { FilePlus2, ChevronRight } from 'lucide-react'
import { db } from '../db'
import { conciliar, tituloRevision } from '../conciliacion'
import { fechaCorta } from '../formato'
import { NuevaRevision } from './NuevaRevision'
import { RevisionDetalle } from './RevisionDetalle'

interface Props {
  householdId: string
  userId: string
  userName: string
}

export function RevisionesTarjeta({ householdId, userId, userName }: Props) {
  const [nueva, setNueva] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const revisiones = useLiveQuery(
    () => db.revisionesTarjeta.where('household_id').equals(householdId).and((r) => r.deleted === 0).toArray(),
    [householdId]
  )
  const compras = useLiveQuery(
    () => db.comprasTarjeta.where('household_id').equals(householdId).and((c) => c.deleted === 0).toArray(),
    [householdId]
  )

  // Resumen de estado de cada revisión (se recalcula si cambian las compras).
  const estados = useMemo(() => {
    const m = new Map<string, { coincidencias: number; aRevisar: number }>()
    if (!revisiones || !compras) return m
    for (const r of revisiones) {
      const res = conciliar(r, compras)
      m.set(r.id, { coincidencias: res.coincidencias.length, aRevisar: res.resumenARevisar.length + res.appARevisar.length })
    }
    return m
  }, [revisiones, compras])

  if (abierta) {
    return <RevisionDetalle revisionId={abierta} householdId={householdId} onVolver={() => setAbierta(null)} />
  }

  if (nueva) {
    return (
      <NuevaRevision
        householdId={householdId}
        userId={userId}
        userName={userName}
        existentes={revisiones ?? []}
        onCancel={() => setNueva(false)}
        onGuardada={(id) => {
          setNueva(false)
          setAbierta(id)
        }}
      />
    )
  }

  const ordenadas = (revisiones ?? []).slice().sort((a, b) => b.cierre_actual.localeCompare(a.cierre_actual))

  return (
    <div className="revisiones">
      <p className="categorias-hint">
        Cargá el resumen que te manda el banco y comparalo con las compras que registraste en la pestaña
        Compras. Hay una revisión por tarjeta y por resumen; las anteriores quedan guardadas para consultarlas.
      </p>

      <button type="button" className="submit-btn" onClick={() => setNueva(true)}>
        <FilePlus2 size={16} /> Nueva revisión
      </button>

      {revisiones && ordenadas.length === 0 && (
        <p className="categorias-hint">Todavía no cargaste ninguna revisión.</p>
      )}

      <div className="revisiones-lista">
        {ordenadas.map((r) => {
          const e = estados.get(r.id)
          return (
            <button key={r.id} type="button" className="revision-item" onClick={() => setAbierta(r.id)}>
              <div className="revision-item-main">
                <span className="revision-item-titulo">{tituloRevision(r)}</span>
                <span className="revision-item-sub">
                  Cierre {fechaCorta(r.cierre_actual)} · {r.consumos.length} consumos
                  {!r.synced ? ' · ⏳' : ''}
                </span>
                {e && (
                  <span className="rev-badges">
                    <i className="si">{e.coincidencias} coinciden</i>
                    <i className={e.aRevisar ? 'no' : 'si'}>{e.aRevisar ? `${e.aRevisar} a revisar` : 'todo revisado'}</i>
                  </span>
                )}
              </div>
              <ChevronRight size={18} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
