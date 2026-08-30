import { useEffect, useState, lazy, Suspense } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { Receipt, BarChart3, LayoutGrid, LogOut, CreditCard } from 'lucide-react'
import { supabase } from './supabaseClient'
import { Login } from './components/Login'
import { ExpenseForm } from './components/ExpenseForm'
import { MovementList } from './components/MovementList'
import { SaldoActual } from './components/SaldoActual'
import { CategoriasAdmin } from './components/CategoriasAdmin'
import { ComprasTarjeta } from './components/ComprasTarjeta'
const IngresosVsGastosChart = lazy(() =>
  import('./components/IngresosVsGastosChart').then((m) => ({ default: m.IngresosVsGastosChart }))
)
import { startSyncLoop } from './sync'
import { DEFAULT_CATEGORIES } from './categories'
import { db } from './db'
import type { Household, Profile, Categoria } from './types'

const HOUSEHOLD_CACHE_KEY = 'cached_household'
const PROFILE_CACHE_KEY = 'cached_profile'

type Tab = 'movimientos' | 'graficos' | 'tarjeta' | 'dashboard'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('movimientos')

  // Sesión de Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  // Estado de conexión, para mostrar el indicador y no depender solo del sync loop
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Cargar profile + household. Se cachean en localStorage para poder abrir
  // la app sin conexión (solo son datos de configuración, casi no cambian).
  useEffect(() => {
    if (!session) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function load() {
      const cachedProfile = localStorage.getItem(PROFILE_CACHE_KEY)
      const cachedHousehold = localStorage.getItem(HOUSEHOLD_CACHE_KEY)
      if (cachedProfile && cachedHousehold) {
        setProfile(JSON.parse(cachedProfile))
        setHousehold(JSON.parse(cachedHousehold))
        setLoading(false)
      }

      if (!navigator.onLine) return

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session!.user.id)
        .single()

      if (cancelled || !profileData) return
      setProfile(profileData)
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileData))

      const { data: householdData } = await supabase
        .from('households')
        .select('*')
        .eq('id', profileData.household_id)
        .single()

      if (cancelled || !householdData) return
      setHousehold(householdData)
      localStorage.setItem(HOUSEHOLD_CACHE_KEY, JSON.stringify(householdData))
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session])

  // Loop de sincronización mientras haya un household cargado
  useEffect(() => {
    if (!household) return
    const stop = startSyncLoop(household.id)
    return stop
  }, [household?.id])

  // Nombres de categorías activas, en vivo desde la base local (se administran
  // desde el Dashboard). Si todavía no llegó nada de Supabase (primer uso sin
  // conexión), mostramos la lista por defecto como respaldo para no bloquear la carga.
  const categoriasDB = useLiveQuery(
    () =>
      household
        ? db.categorias
            .where('household_id')
            .equals(household.id)
            .and((c) => c.deleted === 0)
            .toArray()
        : Promise.resolve<Categoria[]>([]),
    [household?.id]
  )
  const nombresCategorias =
    categoriasDB && categoriasDB.length > 0
      ? categoriasDB.map((c) => c.nombre).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      : DEFAULT_CATEGORIES

  if (!session) return <Login />
  if (loading || !profile || !household) return <p className="loading">Cargando...</p>

  return (
    <div className="app">
      <header>
        <h1>Gastos Familia</h1>
        <div className="header-right">
          <span className={`online-badge ${online ? 'online' : 'offline'}`}>
            <span className="dot" />
            {online ? 'En línea' : 'Sin conexión'}
          </span>
          <button className="icon-btn" title="Salir" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {tab === 'movimientos' && (
        <>
          <SaldoActual household={household} />
          <ExpenseForm
            householdId={household.id}
            userId={profile.id}
            userName={profile.display_name}
            categorias={nombresCategorias}
          />
          <MovementList household={household} />
        </>
      )}

      {tab === 'graficos' && (
        <Suspense fallback={<p className="loading-inline">Cargando gráfico...</p>}>
          <IngresosVsGastosChart householdId={household.id} />
        </Suspense>
      )}

      {tab === 'tarjeta' && (
        <ComprasTarjeta householdId={household.id} userId={profile.id} userName={profile.display_name} />
      )}

      {tab === 'dashboard' && <CategoriasAdmin householdId={household.id} />}

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <button className={tab === 'movimientos' ? 'active' : ''} onClick={() => setTab('movimientos')}>
            <Receipt size={20} />
            Movimientos
          </button>
          <button className={tab === 'graficos' ? 'active' : ''} onClick={() => setTab('graficos')}>
            <BarChart3 size={20} />
            Gráficos
          </button>
          <button className={tab === 'tarjeta' ? 'active' : ''} onClick={() => setTab('tarjeta')}>
            <CreditCard size={20} />
            Tarjeta
          </button>
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            <LayoutGrid size={20} />
            Dashboard
          </button>
        </div>
      </nav>
    </div>
  )
}
