import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { guardarCategoria, borrarCategoria } from '../sync'
import type { Categoria } from '../types'

interface Props {
  householdId: string
}

export function CategoriasAdmin({ householdId }: Props) {
  const [nombreNueva, setNombreNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nombreEdit, setNombreEdit] = useState('')

  const categorias = useLiveQuery(
    () =>
      db.categorias
        .where('household_id')
        .equals(householdId)
        .and((c) => c.deleted === 0)
        .toArray(),
    [householdId]
  )

  const ordenadas = (categorias ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))

  function nombreYaExiste(nombre: string, ignorarId?: string) {
    const norm = nombre.trim().toLowerCase()
    return ordenadas.some((c) => c.id !== ignorarId && c.nombre.trim().toLowerCase() === norm)
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    const nombre = nombreNueva.trim()
    if (!nombre) return
    if (nombreYaExiste(nombre)) {
      setError('Ya existe una categoría con ese nombre.')
      return
    }
    setGuardando(true)
    setError(null)
    const nueva: Categoria = {
      id: crypto.randomUUID(),
      household_id: householdId,
      nombre,
      updated_at: new Date().toISOString(),
      deleted: 0,
      synced: 0,
    }
    await guardarCategoria(nueva, householdId)
    setNombreNueva('')
    setGuardando(false)
  }

  function empezarEdicion(c: Categoria) {
    setEditandoId(c.id)
    setNombreEdit(c.nombre)
    setError(null)
  }

  async function handleGuardarEdicion(c: Categoria) {
    const nombre = nombreEdit.trim()
    if (!nombre) return
    if (nombreYaExiste(nombre, c.id)) {
      setError('Ya existe una categoría con ese nombre.')
      return
    }
    await guardarCategoria({ ...c, nombre, updated_at: new Date().toISOString(), synced: 0 }, householdId)
    setEditandoId(null)
  }

  async function handleBorrar(c: Categoria) {
    if (!window.confirm(`¿Borrar la categoría "${c.nombre}"? Los movimientos ya cargados con esa categoría no se modifican.`)) {
      return
    }
    await borrarCategoria(c.id, householdId)
  }

  return (
    <div className="categorias-admin">
      <h2>Categorías</h2>
      <p className="categorias-hint">
        Se usan en el formulario de carga y en la clasificación automática por voz.
      </p>

      <form className="categoria-form" onSubmit={handleCrear}>
        <input
          type="text"
          placeholder="Nueva categoría"
          value={nombreNueva}
          onChange={(e) => setNombreNueva(e.target.value)}
        />
        <button type="submit" disabled={guardando || !nombreNueva.trim()}>
          Agregar
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {categorias === undefined ? (
        <p>Cargando...</p>
      ) : ordenadas.length === 0 ? (
        <p className="categorias-hint">Todavía no hay categorías cargadas.</p>
      ) : (
        <ul className="categorias-list">
          {ordenadas.map((c) => (
            <li key={c.id} className="categoria-row">
              {editandoId === c.id ? (
                <>
                  <input
                    type="text"
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    autoFocus
                  />
                  <div className="categoria-actions">
                    <button type="button" onClick={() => handleGuardarEdicion(c)}>
                      Guardar
                    </button>
                    <button type="button" className="secondary" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="categoria-nombre">
                    {c.nombre}
                    {!c.synced && <span className="pending" title="Pendiente de sincronizar"> ⏳</span>}
                  </span>
                  <div className="categoria-actions">
                    <button type="button" className="secondary" onClick={() => empezarEdicion(c)}>
                      ✏️
                    </button>
                    <button type="button" className="delete-btn" onClick={() => handleBorrar(c)}>
                      🗑
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
