import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { Login } from './components/Login'
import { ExpenseForm } from './components/ExpenseForm'
import { MovementList } from './components/MovementList'
import { startSyncLoop } from './sync'
import { DEFAULT_CATEGORIES } from './categories'
import type { Household, Profile } from './types'

const HOUSEHOLD_CACHE_KEY = 'cached_household'
const PROFILE_CACHE_KEY = 'cached_profile'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)

  // Sesión de Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  /// Estado de conexión, para mostrar el indicador y no depender solo del sync loop
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

  if (!session) return <Login />
  if (loading || !profile || !household) return <p className="loading">Cargando...</p>

  return (
    <div className="app">
      <header>
        <h1>Gastos Familia</h1>
        <div className="header-right">
          <span className={`online-badge ${online ? 'online' : 'offline'}`}>
            {online ? 'En línea' : 'Sin conexión'}
          </span>
          <button className="logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </header>

      <ExpenseForm
        householdId={household.id}
        userId={profile.id}
        userName={profile.display_name}
        categorias={DEFAULT_CATEGORIES}
      />

      <MovementList household={household} />
    </div>
  )
}
