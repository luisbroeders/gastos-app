# Gastos Familia

App para registrar gastos e ingresos familiares desde el celular, con:
- **Backend + base de datos**: Supabase (Postgres gratis)
- **Frontend**: PWA (React + Vite) — se instala en el celular como una app, sin pasar por las tiendas de apps
- **Offline-first**: podés cargar un gasto sin señal; se guarda en el celular (IndexedDB) y se sincroniza solo cuando vuelve la conexión
- **Multi-usuario**: vos e Inés ven y cargan los mismos movimientos

Costo: **$0**, usando los planes free de Supabase y Vercel (alcanzan de sobra para uso familiar).

---

## 1) Crear el proyecto en Supabase (backend + DB)

1. Andá a https://supabase.com → creá una cuenta gratis → "New project".
2. Cuando esté listo, andá a **SQL Editor** → pegá el contenido de `supabase/schema.sql` → **Run**.
   Esto crea las tablas (`households`, `profiles`, `movimientos`) y las políticas de seguridad
   (cada household solo ve sus propios datos).
3. Andá a **Authentication → Users → Add user** y creá dos usuarios (uno para vos, uno para Inés)
   con email + contraseña. Anotá el `UUID` de cada uno (aparece en la lista de usuarios).
4. Volvé al **SQL Editor** y corré (reemplazando los UUID):
   ```sql
   insert into households (name, saldo_inicial, saldo_inicial_fecha)
   values ('Familia Broeders', 0, current_date)
   returning id;
   -- copiá el id que te devuelve, y usalo abajo:

   insert into profiles (id, household_id, display_name) values
     ('<uuid-usuario-luis>', '<uuid-household>', 'Luis'),
     ('<uuid-usuario-ines>', '<uuid-household>', 'Inés');
   ```
   Si querés arrancar con el saldo actual de tu cuenta (en vez de 0), poné ese valor en `saldo_inicial`
   junto con la fecha desde la que vale (por ejemplo, hoy).
5. Andá a **Project Settings → API** y copiá:
   - `Project URL`
   - `anon public key`

## 2) Configurar la app

```bash
cd gastos-app
npm install
cp .env.example .env.local
```

Editá `.env.local` con los valores del paso anterior:
```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Probalo local:
```bash
npm run dev
```

## 3) Deploy gratis (Vercel)

1. Subí esta carpeta a un repo de GitHub (puede ser privado).
2. Andá a https://vercel.com → "Add New Project" → importá el repo.
3. En **Environment Variables**, cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Te da una URL tipo `https://gastos-familia.vercel.app`.

## 4) Instalar en el celular

Abrí la URL de Vercel desde Chrome (Android) o Safari (iPhone):
- **Android**: menú (⋮) → "Agregar a pantalla de inicio" / "Instalar app".
- **iPhone**: botón compartir → "Agregar a pantalla de inicio".

Queda como un ícono más, se abre sin barra de navegador, y funciona sin conexión.

---

## Cómo funciona el offline

- Cada movimiento se guarda primero en el celular (IndexedDB, vía Dexie), así que el formulario
  nunca depende de tener señal.
- Cada 30 segundos, y apenas detecta que volvió la conexión, la app sube lo pendiente a Supabase
  y trae los movimientos nuevos que haya cargado el otro usuario.
- El saldo y los totales se calculan siempre localmente a partir de esos datos, así que se ven
  actualizados incluso sin conexión.

## Alcance de esta primera versión

Incluido:
- Carga rápida de gastos/ingresos con fecha, categoría, detalle y monto
- Listado mensual con saldo corriente y totales por mes
- Multi-usuario (vos e Inés compartiendo los mismos datos)
- Funciona offline y sincroniza solo

Quedó afuera de esta v1 (se puede sumar después):
- Pagos fijos recurrentes / próximos vencimientos (la hoja "Gastos" y "Próximos Pagos")
- Seguimiento de ahorros por cuenta/billetera
- Categorías personalizables desde la app (hoy están hardcodeadas en `src/categories.ts`)
- Editar/borrar movimientos ya cargados
- Gráficos por categoría

## Estructura del proyecto

```
gastos-app/
  src/
    App.tsx              # login gate + carga de perfil/household + loop de sync
    supabaseClient.ts     # cliente de Supabase
    db.ts                 # base local IndexedDB (Dexie)
    sync.ts               # push/pull entre IndexedDB y Supabase
    categories.ts         # categorías por defecto
    components/
      Login.tsx
      ExpenseForm.tsx      # carga de movimientos (funciona offline)
      MovementList.tsx     # listado + saldo, en vivo desde IndexedDB
  supabase/
    schema.sql             # tablas + RLS, para correr en Supabase
```
