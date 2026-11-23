import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder: string
}

export function BuscadorLista({ value, onChange, placeholder }: Props) {
  return (
    <div className="buscador">
      <Search size={15} className="buscador-icono" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Buscar"
      />
      {value && (
        <button type="button" className="buscador-limpiar" title="Limpiar búsqueda" onClick={() => onChange('')}>
          <X size={15} />
        </button>
      )}
    </div>
  )
}
