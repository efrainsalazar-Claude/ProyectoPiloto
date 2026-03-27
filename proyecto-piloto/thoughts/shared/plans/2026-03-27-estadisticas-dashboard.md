---
date: 2026-03-27T00:00:00-06:00
git_commit: 789645cdad4d2696d4b3405b1b84ceceb2487cfe
branch: main
topic: "Módulo de Estadísticas — /dashboard/stats"
status: in-progress
---

# Plan: Módulo de Estadísticas del Dashboard

## Objective
Implementar la ruta `/dashboard/stats` con KPIs, 3 gráficas Recharts y lista de reuniones back-to-back, usando la API de Google Calendar existente y activando el link del sidebar.

## Current State
- `src/components/Sidebar.tsx:41-52` — navItem "Estadísticas" con `href: "/dashboard/stats"` y `disabled: true`; el `<Link>` ya está en la rama `else` del map (línea 138)
- `app/dashboard/layout.tsx` — protege automáticamente toda subruta `/dashboard/*` con `await auth()` + `redirect("/login")`; también renderiza el Sidebar y el footer
- `app/api/calendar/events/route.ts` — `GET /api/calendar/events?timeMin=&timeMax=` devuelve array plano de eventos con paginación automática
- `src/lib/get-access-token.ts` — `getServerToken(req)` extrae el `access_token` del JWT httpOnly
- `src/lib/rate-limiter.ts` — `checkRateLimit(userId)` retorna `boolean`
- `src/lib/calendar-validation.ts` — `isValidISO8601(value)` valida formato ISO 8601
- `src/lib/google-calendar.ts` — `calendarRequest<T>(path, method, token)` wrapper de fetch
- `package.json` — **no tiene librería de gráficas instalada**; React 19.2.3, Next.js 16.2.0

## Assumptions
1. **Eventos de todo el día** (`start.date` sin `dateTime`): se cuentan como **8 horas fijas**.
2. **Selector "Últimas 4 semanas"**: el gráfico "Horas por día" **agrupa por semana** — 4 barras etiquetadas "Sem 1", "Sem 2", "Sem 3", "Sem 4"; los otros selectores muestran Lun/Mar/Mié/Jue/Vie.
3. **Eventos cancelados** (`status === "cancelled"`): se excluyen de todas las estadísticas.
4. **Rango horario de ocupación**: 8am–8pm, lunes a viernes = 12h × 5 días = 60h semanales = 3600 minutos.
5. **Buffer back-to-back**: < 15 minutos entre fin de un evento e inicio del siguiente = back-to-back.
6. **Rango de comparación** ("previous") en la barra: siempre es el rango de igual duración inmediatamente anterior al rango principal.
7. **Librería de gráficas**: Recharts v3 — la única con soporte React 19 confirmado (issue #4558 cerrado), ~40 kB gzip tree-shakable.
8. **Todos los componentes nuevos en `src/components/`** (sin subcarpetas) — consistente con la estructura actual del proyecto.

---

## Implementation Phases

### Phase 1: Instalación de Recharts + API route de estadísticas
**Goal**: Recharts instalado y `GET /api/calendar/stats` listo y funcionando, devolviendo todos los datos que necesitan las 4 secciones de UI.

**Files to create:**
- `app/api/calendar/stats/route.ts` — nueva API route que computa todas las estadísticas

**Commands:**
```bash
npm install recharts
```

**Implementation steps:**

1. Instalar Recharts:
   ```bash
   npm install recharts
   ```

2. Crear `app/api/calendar/stats/route.ts` con este handler `GET`:

   **Parámetros aceptados:**
   - `timeMin` — ISO 8601, inicio del rango principal (requerido)
   - `timeMax` — ISO 8601, fin del rango principal (requerido)
   - `prevTimeMin` — ISO 8601, inicio del rango de comparación (opcional)
   - `prevTimeMax` — ISO 8601, fin del rango de comparación (opcional)
   - `groupBy` — `"day"` | `"week"` (default: `"day"`)

   **Auth/rate-limit** (mismo patrón que `app/api/calendar/events/route.ts`):
   ```typescript
   import { NextRequest, NextResponse } from "next/server"
   import { getServerToken } from "@/src/lib/get-access-token"
   import { calendarRequest } from "@/src/lib/google-calendar"
   import { isValidISO8601 } from "@/src/lib/calendar-validation"
   import { checkRateLimit } from "@/src/lib/rate-limiter"

   export async function GET(request: NextRequest) {
     const { accessToken, userId, error } = await getServerToken(request)
     if (error === "RefreshTokenError") return NextResponse.json({ error: "Session expired" }, { status: 401 })
     if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
     if (userId && !checkRateLimit(userId)) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
     // ... validación de params ...
   }
   ```

   **Fetch en paralelo** de ambos rangos:
   ```typescript
   const [currentEvents, prevEvents] = await Promise.all([
     fetchAllEvents(accessToken, timeMin, timeMax),
     prevTimeMin && prevTimeMax ? fetchAllEvents(accessToken, prevTimeMin, prevTimeMax) : Promise.resolve([])
   ])
   ```

   Donde `fetchAllEvents` replica el loop de paginación de la ruta existente (máx 10 páginas × 2500).

   **Tipo del evento** (inferido de la API de Google Calendar):
   ```typescript
   interface GCalEvent {
     id: string
     summary?: string
     status?: string
     start: { dateTime?: string; date?: string }
     end:   { dateTime?: string; date?: string }
     colorId?: string
   }
   ```

   **Funciones de cómputo** (todas puras, en el mismo archivo o importadas):

   a) `filterEvents(events)` — filtra `status === "cancelled"`

   b) `getDurationMinutes(event)`:
   - Si `start.dateTime` existe: `(new Date(end.dateTime) - new Date(start.dateTime)) / 60000`
   - Si `start.date` (all-day): retorna `480` (8h fijas)

   c) `computeKpis(events)` → `{ totalHours, totalEvents, occupancyPercent, avgDurationMinutes }`:
   ```typescript
   const totalMinutes = events.reduce((sum, e) => sum + getDurationMinutes(e), 0)
   const totalHours = parseFloat((totalMinutes / 60).toFixed(2))
   const totalEvents = events.length
   const occupancyPercent = parseFloat(((totalMinutes / 3600) * 100).toFixed(1))
   const avgDurationMinutes = totalEvents > 0 ? Math.round(totalMinutes / totalEvents) : 0
   ```

   d) `computeHoursPerDay(currentEvents, prevEvents, groupBy)`:
   - `groupBy === "day"`: agrupa por día de la semana (lunes=0..viernes=4)
     - Labels: `["Lun", "Mar", "Mié", "Jue", "Vie"]`
     - Solo incluye días lunes-viernes (`getDay()` 1-5)
   - `groupBy === "week"`: agrupa por número de semana relativo (ordena fechas, agrupa en bloques de 7 días)
     - Labels: `["Sem 1", "Sem 2", "Sem 3", "Sem 4"]`
   - Retorna: `Array<{ label: string; current: number; previous: number }>`

   e) `computeByCategory(events)`:
   - Mapa de palabras clave (lowercase, se aplica `summary.toLowerCase().includes(kw)`):
     ```
     "1:1"        → ["1:1", "1on1", "one on one", "one-on-one"]
     "Planning"   → ["planning", "sprint", "roadmap"]
     "Review"     → ["review", "retro", "retrospectiva"]
     "Standup"    → ["standup", "stand-up", "daily", "scrum"]
     "Entrevista" → ["entrevista", "interview"]
     "Sync"       → ["sync", "sincronización", "reunion", "reunión", "meeting"]
     "Formación"  → ["training", "capacitación", "formación", "workshop"]
     "Otro"       → catch-all (ninguna keyword coincide)
     ```
   - Suma horas por categoría, calcula porcentaje sobre el total
   - Excluye categorías con 0 horas
   - Retorna: `Array<{ name: string; hours: number; percent: number }>`

   f) `computePeakHours(events)`:
   - Para cada evento (solo `dateTime`, no all-day), determina qué horas cubre (8h–20h)
   - Por cada hora parcial o completa que cubre, incrementa el contador de esa hora
   - Retorna: `Array<{ hour: string; count: number }>` (12 entradas: "08:00" hasta "19:00")

   g) `detectBackToBack(events)`:
   - Filtra solo eventos con `dateTime` (excluye all-day)
   - Ordena por `start.dateTime` ASC
   - Itera: si `new Date(events[i].end.dateTime) + 15min >= new Date(events[i+1].start.dateTime)` → back-to-back
   - Agrupa cadenas consecutivas en arrays
   - Retorna solo grupos con `length >= 2`
   - Retorna: `Array<Array<{ id, summary, start, end }>>`

   **Respuesta final:**
   ```typescript
   return NextResponse.json({
     kpis: computeKpis(filtered),
     hoursPerDay: computeHoursPerDay(filtered, prevFiltered, groupBy),
     byCategory: computeByCategory(filtered),
     peakHours: computePeakHours(filtered),
     backToBack: detectBackToBack(filtered),
   })
   ```

**Verification:**
- [x] `npm run build` sin errores TypeScript en la nueva ruta
- [ ] `npm run dev` y `GET /api/calendar/stats?timeMin=2026-03-23T00:00:00-06:00&timeMax=2026-03-27T23:59:59-06:00` devuelve JSON con los 5 campos correctamente estructurados (verificar en browser con sesión activa)
- [ ] Con `timeMin`/`timeMax` inválidos devuelve `400`
- [ ] Sin sesión devuelve `401`

---

### Phase 2: Página + StatsClient con KPIs y selector de rango
**Goal**: La ruta `/dashboard/stats` es accesible, muestra las 4 KPI cards y el selector de rango funciona (cambia los datos al seleccionar).

**Files to create:**
- `app/dashboard/stats/page.tsx` — Server Component (entrada de la ruta)
- `src/components/StatsClient.tsx` — Client Component principal

**Implementation steps:**

1. Crear `app/dashboard/stats/page.tsx`:
   ```tsx
   import StatsClient from "@/src/components/StatsClient"

   export default function StatsPage() {
     return (
       <div className="p-6">
         <StatsClient />
       </div>
     )
   }
   ```
   Patrón idéntico a `app/dashboard/page.tsx`.

2. Crear `src/components/StatsClient.tsx` con:

   **Tipos** (definidos en el mismo archivo):
   ```typescript
   type RangeOption = "current" | "previous" | "last4weeks"

   interface StatsData {
     kpis: { totalHours: number; totalEvents: number; occupancyPercent: number; avgDurationMinutes: number }
     hoursPerDay: Array<{ label: string; current: number; previous: number }>
     byCategory: Array<{ name: string; hours: number; percent: number }>
     peakHours: Array<{ hour: string; count: number }>
     backToBack: Array<Array<{ id: string; summary: string; start: string; end: string }>>
   }
   ```

   **Función helper** `getRangeDates(range: RangeOption)`:
   - Calcula `timeMin`, `timeMax`, `prevTimeMin`, `prevTimeMax` en ISO 8601 según el rango:
     - `"current"`: semana actual (lunes 00:00 → domingo 23:59:59), prev: semana anterior
     - `"previous"`: semana anterior, prev: dos semanas atrás
     - `"last4weeks"`: 4 semanas atrás (lunes) → último domingo, prev: 4 semanas antes que eso; `groupBy: "week"`
   - Retorna `{ timeMin, timeMax, prevTimeMin, prevTimeMax, groupBy: "day" | "week" }`
   - Nota: "semana" = lunes a domingo (usar `getDay()` con ajuste: domingo=6 en lugar de 0)

   **Estado y fetch**:
   ```typescript
   const [range, setRange] = useState<RangeOption>("current")
   const [data, setData] = useState<StatsData | null>(null)
   const [loading, setLoading] = useState(true)
   const [error, setError] = useState<string | null>(null)

   useEffect(() => {
     const { timeMin, timeMax, prevTimeMin, prevTimeMax, groupBy } = getRangeDates(range)
     const params = new URLSearchParams({ timeMin, timeMax, prevTimeMin, prevTimeMax, groupBy })
     setLoading(true)
     setError(null)
     fetch(`/api/calendar/stats?${params}`)
       .then(res => { if (!res.ok) throw new Error("Error"); return res.json() })
       .then(setData)
       .catch(() => setError("No se pudieron cargar las estadísticas"))
       .finally(() => setLoading(false))
   }, [range])
   ```

   **Selector de rango** (3 botones):
   ```tsx
   <div className="flex gap-2">
     {[
       { value: "current",    label: "Esta semana" },
       { value: "previous",   label: "Semana anterior" },
       { value: "last4weeks", label: "Últimas 4 semanas" },
     ].map(({ value, label }) => (
       <button
         key={value}
         onClick={() => setRange(value as RangeOption)}
         className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
           range === value
             ? "bg-indigo-600 text-white"
             : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-indigo-100 dark:border-indigo-900 hover:bg-gray-50 dark:hover:bg-gray-700"
         }`}
       >
         {label}
       </button>
     ))}
   </div>
   ```

   **Loading skeleton** (4 cards placeholder):
   ```tsx
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
     {[...Array(4)].map((_, i) => (
       <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-6 animate-pulse">
         <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
         <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
       </div>
     ))}
   </div>
   ```

   **Empty state** (cuando `data` existe pero `kpis.totalEvents === 0`):
   ```tsx
   <div className="flex flex-col items-center justify-center py-20 text-center">
     <svg ...>{/* icono calendario */}</svg>
     <p className="text-gray-500 dark:text-gray-400 mt-4">
       No hay eventos en este rango
     </p>
   </div>
   ```

   **4 KPI cards** (cuando `data` existe y hay eventos):
   ```tsx
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
     <KpiCard label="Horas en reuniones"    value={`${data.kpis.totalHours.toFixed(1)}h`}    icon={...} />
     <KpiCard label="Total de eventos"      value={data.kpis.totalEvents.toString()}          icon={...} />
     <KpiCard label="Tiempo ocupado"        value={`${data.kpis.occupancyPercent.toFixed(0)}%`} icon={...} />
     <KpiCard label="Duración promedio"     value={`${data.kpis.avgDurationMinutes}min`}      icon={...} />
   </div>
   ```

   Donde `KpiCard` es un componente local inline (no se crea archivo separado):
   ```tsx
   function KpiCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
     return (
       <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
         <div className="flex items-center gap-2 mb-3">
           <div className="text-indigo-600 dark:text-indigo-400">{icon}</div>
           <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
         </div>
         <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
       </div>
     )
   }
   ```

   **Estructura del render principal:**
   ```tsx
   return (
     <div className="space-y-6">
       {/* Header + selector */}
       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estadísticas</h1>
         {/* selector de rango */}
       </div>

       {/* Error state */}
       {error && <p className="text-red-500 dark:text-red-400">{error}</p>}

       {/* Loading o contenido */}
       {loading ? (
         /* skeleton */
       ) : data?.kpis.totalEvents === 0 ? (
         /* empty state */
       ) : data ? (
         <>
           {/* KPI cards */}
           {/* StatsCharts — se agrega en Phase 3 */}
           {/* StatsBackToBack — se agrega en Phase 4 */}
         </>
       ) : null}
     </div>
   )
   ```

**Verification:**
- [x] `npm run dev` → navegar a `localhost:3000/dashboard/stats` (con sesión activa) — página carga sin errores de consola
- [ ] Las 4 KPI cards muestran valores reales
- [ ] El selector de rango cambia los valores al hacer clic
- [ ] Estado de loading (skeleton) visible brevemente al cambiar el rango
- [ ] Estado vacío visible si el calendario no tiene eventos en el rango

---

### Phase 3: Gráficas Recharts + dark mode CSS
**Goal**: Las 3 gráficas (barras comparativa, dona por categoría, barras horas pico) son responsivas y respetan el tema oscuro.

**Files to create:**
- `src/components/StatsCharts.tsx` — 3 componentes de gráficas con Recharts

**Files to modify:**
- `app/globals.css` — overrides dark mode para Recharts
- `src/components/StatsClient.tsx` — importar y renderizar `<StatsCharts />`

**Implementation steps:**

1. Crear `src/components/StatsCharts.tsx`:

   ```tsx
   "use client"
   import {
     BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
     PieChart, Pie, Cell,
   } from "recharts"

   interface StatsChartsProps {
     hoursPerDay: Array<{ label: string; current: number; previous: number }>
     byCategory:  Array<{ name: string; hours: number; percent: number }>
     peakHours:   Array<{ hour: string; count: number }>
   }
   ```

   **Paleta de colores** (consistente con indigo/gray del proyecto):
   ```typescript
   const COLORS = {
     current:  "#6366f1",  // indigo-500
     previous: "#a5b4fc",  // indigo-300 (más claro = semana anterior)
     pieColors: ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"],
     peakBar:  "#6366f1",
   }
   ```

   **Gráfica 1 — Horas por día (BarChart comparativo)**:
   ```tsx
   function HoursPerDayChart({ data }: { data: StatsChartsProps["hoursPerDay"] }) {
     return (
       <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
         <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Horas por día</h2>
         <ResponsiveContainer width="100%" height={220}>
           <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="var(--stats-grid)" />
             <XAxis dataKey="label" tick={{ fill: "var(--stats-axis-text)", fontSize: 12 }} />
             <YAxis tick={{ fill: "var(--stats-axis-text)", fontSize: 12 }} />
             <Tooltip contentStyle={{ background: "var(--stats-tooltip-bg)", border: "none", borderRadius: "8px" }} />
             <Legend />
             <Bar dataKey="current"  name="Esta semana"  fill={COLORS.current}  radius={[4,4,0,0]} />
             <Bar dataKey="previous" name="Sem. anterior" fill={COLORS.previous} radius={[4,4,0,0]} />
           </BarChart>
         </ResponsiveContainer>
       </div>
     )
   }
   ```

   **Gráfica 2 — Distribución por categoría (PieChart/dona)**:
   ```tsx
   function CategoryChart({ data }: { data: StatsChartsProps["byCategory"] }) {
     return (
       <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
         <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Por categoría</h2>
         <div className="flex items-center gap-4">
           <ResponsiveContainer width="50%" height={200}>
             <PieChart>
               <Pie data={data} dataKey="hours" nameKey="name" cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80} paddingAngle={3}>
                 {data.map((_, i) => <Cell key={i} fill={COLORS.pieColors[i % COLORS.pieColors.length]} />)}
               </Pie>
               <Tooltip formatter={(v: number) => [`${v.toFixed(1)}h`, ""]} />
             </PieChart>
           </ResponsiveContainer>
           {/* Leyenda manual */}
           <ul className="flex-1 space-y-1">
             {data.map((cat, i) => (
               <li key={cat.name} className="flex items-center justify-between text-sm">
                 <span className="flex items-center gap-2">
                   <span className="w-3 h-3 rounded-full flex-shrink-0"
                         style={{ background: COLORS.pieColors[i % COLORS.pieColors.length] }} />
                   <span className="text-gray-700 dark:text-gray-300">{cat.name}</span>
                 </span>
                 <span className="text-gray-500 dark:text-gray-400">{cat.percent.toFixed(0)}%</span>
               </li>
             ))}
           </ul>
         </div>
       </div>
     )
   }
   ```

   **Gráfica 3 — Horas pico (BarChart horizontal o vertical)**:
   ```tsx
   function PeakHoursChart({ data }: { data: StatsChartsProps["peakHours"] }) {
     return (
       <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
         <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Horas pico</h2>
         <ResponsiveContainer width="100%" height={180}>
           <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
             <CartesianGrid strokeDasharray="3 3" stroke="var(--stats-grid)" />
             <XAxis dataKey="hour" tick={{ fill: "var(--stats-axis-text)", fontSize: 11 }} />
             <YAxis tick={{ fill: "var(--stats-axis-text)", fontSize: 11 }} allowDecimals={false} />
             <Tooltip contentStyle={{ background: "var(--stats-tooltip-bg)", border: "none", borderRadius: "8px" }} />
             <Bar dataKey="count" name="Eventos" fill={COLORS.peakBar} radius={[4,4,0,0]} />
           </BarChart>
         </ResponsiveContainer>
       </div>
     )
   }
   ```

   **Export del componente principal**:
   ```tsx
   export default function StatsCharts({ hoursPerDay, byCategory, peakHours }: StatsChartsProps) {
     return (
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <HoursPerDayChart data={hoursPerDay} />
         <CategoryChart data={byCategory} />
         <PeakHoursChart data={peakHours} />
       </div>
     )
   }
   ```

2. Agregar CSS variables para dark mode de Recharts en `app/globals.css` (siguiendo el mismo patrón que los overrides de FullCalendar):

   ```css
   /* Stats / Recharts dark mode */
   :root {
     --stats-grid: #e5e7eb;
     --stats-axis-text: #6b7280;
     --stats-tooltip-bg: #ffffff;
   }

   @media (prefers-color-scheme: dark) {
     :root {
       --stats-grid: #1f2937;
       --stats-axis-text: #9ca3af;
       --stats-tooltip-bg: #111827;
     }
   }
   ```

3. En `src/components/StatsClient.tsx`, importar y agregar `<StatsCharts />` dentro del bloque de datos:
   ```tsx
   import StatsCharts from "@/src/components/StatsCharts"

   // Dentro del render, después de las KPI cards:
   <StatsCharts
     hoursPerDay={data.hoursPerDay}
     byCategory={data.byCategory}
     peakHours={data.peakHours}
   />
   ```

**Verification:**
- [ ] Las 3 gráficas renderizan sin errores en `localhost:3000/dashboard/stats`
- [ ] En modo oscuro (cambiar preferencia del SO) los colores de ejes/grid/tooltips se actualizan correctamente
- [ ] Al reducir la ventana a móvil, las gráficas se adaptan (ResponsiveContainer)
- [ ] El gráfico de barras muestra dos series ("Esta semana" y "Sem. anterior") con la leyenda
- [ ] El gráfico de dona muestra la leyenda lateral con porcentajes
- [x] `npm run build` sin errores

---

### Phase 4: Lista back-to-back + activar sidebar
**Goal**: La sección de reuniones back-to-back se muestra y el link del sidebar navega correctamente a `/dashboard/stats`.

**Files to create:**
- `src/components/StatsBackToBack.tsx` — lista de reuniones consecutivas

**Files to modify:**
- `src/components/StatsClient.tsx` — importar y renderizar `<StatsBackToBack />`
- `src/components/Sidebar.tsx` — eliminar `disabled: true` (línea 44)

**Implementation steps:**

1. Crear `src/components/StatsBackToBack.tsx`:

   ```tsx
   "use client"

   interface BackToBackGroup {
     id: string; summary: string; start: string; end: string
   }

   interface Props {
     groups: BackToBackGroup[][]
   }

   export default function StatsBackToBack({ groups }: Props) {
     if (groups.length === 0) {
       return (
         <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
           <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Reuniones back-to-back</h2>
           <p className="text-sm text-gray-500 dark:text-gray-400">
             No se detectaron reuniones consecutivas sin buffer esta semana.
           </p>
         </div>
       )
     }

     const totalMeetings = groups.reduce((sum, g) => sum + g.length, 0)

     return (
       <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
         <div className="flex items-center gap-2 mb-4">
           <h2 className="text-base font-semibold text-gray-900 dark:text-white">Reuniones back-to-back</h2>
           <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
             {totalMeetings} detectadas en {groups.length} bloque{groups.length > 1 ? "s" : ""}
           </span>
         </div>
         <div className="space-y-4">
           {groups.map((group, gi) => (
             <div key={gi} className="border-l-2 border-red-400 dark:border-red-600 pl-3 space-y-1">
               {group.map((event) => {
                 const start = new Date(event.start).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                 const end   = new Date(event.end).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                 return (
                   <div key={event.id} className="flex items-center justify-between">
                     <p className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-xs">
                       {event.summary ?? "(Sin título)"}
                     </p>
                     <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
                       {start}–{end}
                     </span>
                   </div>
                 )
               })}
             </div>
           ))}
         </div>
       </div>
     )
   }
   ```

2. En `src/components/StatsClient.tsx`, agregar al final del bloque de datos:
   ```tsx
   import StatsBackToBack from "@/src/components/StatsBackToBack"

   // Después de <StatsCharts />:
   <StatsBackToBack groups={data.backToBack} />
   ```

3. En `src/components/Sidebar.tsx`, eliminar la propiedad `disabled: true` del segundo navItem (línea 44):

   **Antes:**
   ```tsx
   {
     href: "/dashboard/stats",
     label: "Estadísticas",
     disabled: true,
     icon: (...),
   },
   ```

   **Después:**
   ```tsx
   {
     href: "/dashboard/stats",
     label: "Estadísticas",
     icon: (...),
   },
   ```

   No se modifica ningún otro código del Sidebar. El `<Link>` ya existe en la rama `else` del map.

**Verification:**
- [ ] En `localhost:3000/dashboard` el link "Estadísticas" del sidebar es clicable (no aparece badge "Pronto", no tiene `cursor-not-allowed`)
- [ ] Clicar "Estadísticas" navega correctamente a `localhost:3000/dashboard/stats`
- [ ] El ítem "Estadísticas" se activa (fondo indigo, borde izquierdo) cuando la ruta es `/dashboard/stats`
- [ ] La sección back-to-back muestra las reuniones detectadas agrupadas con borde rojo, o el mensaje "No se detectaron..."
- [ ] Desde una pestaña privada (sin sesión), navegar a `localhost:3000/dashboard/stats` redirige a `/login`
- [x] `npm run build` sin errores
- [x] `npm test` sin regresiones en tests existentes

---

## Edge Cases to Handle

- **Evento sin `summary`**: mostrar "(Sin título)" en la lista back-to-back.
- **`totalEvents === 0`**: mostrar empty state; no dividir entre 0 en `avgDurationMinutes`.
- **`prevTimeMin`/`prevTimeMax` ausentes**: `hoursPerDay.previous` retorna 0 para todos los días.
- **Evento que cruza la medianoche**: `getDurationMinutes` sigue funcionando (restas de Date en ms).
- **Zona horaria del usuario**: usar `new Date(dateTime)` directamente — ya incluye offset en el string ISO de Google.
- **Sidebar colapsado**: el link de Estadísticas sigue funcionando (se muestra solo el ícono, con `title` tooltip).
- **Recharts en SSR**: todos los componentes de charts llevan `"use client"`; no se usa `dynamic()` pero tampoco `ssr: false` — Recharts v3 con React 19 ya no tiene el problema de hidratación que tenía v2.

## Out of Scope
- No se modifica `CalendarView.tsx`, `CalendarWithModal.tsx` ni `EventModal.tsx`
- No se modifica `auth.ts`, `auth.config.ts` ni `middleware.ts`
- No se agrega paginación ni caché para la ruta de estadísticas
- No se implementa exportación de datos (CSV, PDF)
- No se implementan tests unitarios para los nuevos componentes (sería un plan separado)
- No se instala shadcn/ui — se usa Recharts directamente para mantener las dependencias simples

## Commands Reference
```bash
npm install recharts              # Phase 1 — instalar Recharts v3
npm run dev                       # servidor de desarrollo en localhost:3000
npm run build                     # verificar que TypeScript compila sin errores
npm test                          # verificar que no hay regresiones
```
