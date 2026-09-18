import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { runSync, getUltimaSync, EVENTO_SYNC_ACTUALIZADA } from '../sync'

interface Props {
  householdId: string
}

const fmtFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })

function formatearUltimaSync(iso: string | null): string {
  if (!iso) return 'Sin sincronizar todavía'
  return `Últ. sincronización: ${fmtFecha.format(new Date(iso))}`
}

export function SyncStatus({ householdId }: Props) {
  const [ultimaSync, setUltimaSync] = useState<string | null>(() => getUltimaSync(householdId))
  const [sincronizando, setSincronizando] = useState(false)

  // Se actualiza solo cada vez que corre una sincronización (manual o
  // automática, desde cualquier parte de la app), sin necesidad de recargar.
  useEffect(() => {
    function onSync(e: Event) {
      const detail = (e as CustomEvent<{ householdId: string; fecha: string }>).detail
      if (detail?.householdId === householdId) setUltimaSync(detail.fecha)
    }
    window.addEventListener(EVENTO_SYNC_ACTUALIZADA, onSync)
    return () => window.removeEventListener(EVENTO_SYNC_ACTUALIZADA, onSync)
  }, [householdId])

  async function handleSync() {
    setSincronizando(true)
    await runSync(householdId)
    setSincronizando(false)
  }

  return (
    <div className="sync-status">
      <button
        type="button"
        className="icon-btn sync-btn"
        title="Sincronizar ahora"
        onClick={handleSync}
        disabled={sincronizando}
      >
        <RefreshCw size={15} className={sincronizando ? 'spin' : ''} />
        Sincronizar
      </button>
      <span className="sync-fecha">{formatearUltimaSync(ultimaSync)}</span>
    </div>
  )
}
