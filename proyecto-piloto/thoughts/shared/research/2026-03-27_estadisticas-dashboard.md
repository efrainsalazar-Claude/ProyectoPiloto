---
date: 2026-03-27T00:00:00-06:00
git_commit: 789645cdad4d2696d4b3405b1b84ceceb2487cfe
branch: main
repository: ProyectoPiloto
topic: "Módulo de Estadísticas del Dashboard — ruta, auth, Google Calendar API, gráficas y patrones"
tags: [research, codebase, dashboard, estadisticas, google-calendar, recharts, nextauth, charts]
status: complete
last_updated: 2026-03-27
---

# Research: Módulo de Estadísticas del Dashboard

**Date**: 2026-03-27
**Git Commit**: `789645c`
**Branch**: main

## Research Question

Quiero implementar el módulo de Estadísticas en el dashboard. Es la sección que ya existe en el sidebar marcada como "Pronto". No cambia nada del calendario ni de la autenticación existente.

Investiga: cómo está implementada la ruta del dashboard, cómo se protegen las rutas con NextAuth (el middleware o verificación de sesión existente), cómo se obtienen los eventos de Google Calendar API en el proyecto actual, qué librerías de gráficas están instaladas o disponibles, y qué patrones de componentes existen en el proyecto para modelar esta nueva sección.

---

## Summary

La ruta `/dashboard/stats` ya está declarada en el Sidebar pero marcada con `disabled: true` — solo hay que crear la página y quitar esa flag para activarla. La protección de autenticación es automática: `app/dashboard/layout.tsx` ya llama a `await auth()` + `redirect("/login")` para cualquier ruta anidada bajo `/dashboard`, incluyendo `/dashboard/stats`. La API route de eventos de Google Calendar (`GET /api/calendar/events?timeMin=&timeMax=`) ya existe, pagina automáticamente y devuelve todos los eventos; la nueva sección puede reutilizarla directamente. No hay ninguna librería de gráficas instalada actualmente — Recharts v3 es la opción más compatible con React 19.2.3 y este stack.

---

## Detailed Findings

### 1. Sidebar — Ruta actual y flag "Pronto"

**Archivo**: `src/components/Sidebar.tsx:41-52`

El sidebar tiene exactamente dos `navItems` declarados:

```tsx
// src/components/Sidebar.tsx:28-53
const navItems = [
  {
    href: "/dashboard",
    label: "Calendario",
    icon: <svg .../>,
  },
  {
    href: "/dashboard/stats",   // ← ruta ya definida
    label: "Estadísticas",
    disabled: true,             // ← la flag que lo deshabilita
    icon: <svg .../>,
  },
]
```

Cuando `item.disabled === true`, el nav item se renderiza como `<div>` (no como `<Link>`), con clases `cursor-not-allowed text-gray-400 dark:text-gray-600` y el badge `"Pronto"` (`src/components/Sidebar.tsx:117-136`).

**Para activar la navegación**: eliminar la propiedad `disabled: true` del segundo ítem. El `<Link href="/dashboard/stats">` ya está implementado en la rama `else` del map (`src/components/Sidebar.tsx:138-156`). No se necesita ningún otro cambio en el Sidebar.

La ruta que hay que crear es: `app/dashboard/stats/page.tsx`

---

### 2. Protección de autenticación — Cómo funcionan las rutas protegidas

Hay **dos capas** de protección que cubren automáticamente cualquier subruta de `/dashboard/*`:

#### Capa 1 — Middleware Edge Runtime (`middleware.ts`)
Redirige a `/login` si no hay sesión activa. Corre antes de renderizar. Compatible con Edge Runtime porque usa `auth.config.ts` (sin Prisma).

#### Capa 2 — Layout del Dashboard (`app/dashboard/layout.tsx:1-28`)

```tsx
// app/dashboard/layout.tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Sidebar from "@/src/components/Sidebar"

export default async function DashboardLayout({ children }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar user={session.user ?? {}} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <footer ...>
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            © 2026 CalendarAI
          </p>
        </footer>
      </div>
    </div>
  )
}
```

`app/dashboard/stats/page.tsx` es un hijo de este layout. **La protección ya está cubierta sin código adicional en la página de estadísticas.** El Sidebar y el footer se renderizan automáticamente desde el layout padre.

El patrón de redirect también existe en `app/page.tsx` y `app/login/page.tsx` para redirigir usuarios ya autenticados directamente al dashboard.

---

### 3. Obtención de Tokens de Google OAuth

#### Patrón en API Routes — `src/lib/get-access-token.ts`

```typescript
// src/lib/get-access-token.ts
import { getToken } from "next-auth/jwt"
import { type NextRequest } from "next/server"

export async function getServerToken(req: NextRequest): Promise<TokenResult> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  if (!token) return { accessToken: null, userId: null, error: null }
  return {
    accessToken: (token.access_token as string) ?? null,
    userId: (token.sub as string) ?? null,
    error: (token.error as string) ?? null,
  }
}
```

Lee el `access_token` del JWT almacenado en cookie httpOnly — **nunca se expone al cliente**. Si `error === "RefreshTokenError"`, el token de refresco expiró y se devuelve 401.

El helper tiene dos formas:
- `getServerToken(req)` → `{ accessToken, userId, error }` — usado cuando se necesita rate limiting por userId
- `getAccessToken(req)` → `string | null` — convenience wrapper

#### Flujo en auth.ts (callbacks)
- Callback `jwt`: captura `account.access_token`, `account.expires_at`, `account.refresh_token` en el primer login. En llamadas posteriores verifica expiración y hace refresh via `POST https://oauth2.googleapis.com/token`.
- Callback `session`: expone `session.access_token = token.access_token` para Server Components que no sean API routes.

---

### 4. API Routes de Google Calendar existentes

#### `GET /api/calendar/events` — `app/api/calendar/events/route.ts`

Patrón completo de una API route protegida con Google Calendar:

```typescript
// app/api/calendar/events/route.ts
export async function GET(request: NextRequest) {
  const { accessToken, userId, error } = await getServerToken(request)
  if (error === "RefreshTokenError") return NextResponse.json({ error: "..." }, { status: 401 })
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (userId && !checkRateLimit(userId)) return NextResponse.json({ error: "..." }, { status: 429 })

  const { searchParams } = new URL(request.url)
  const timeMin = searchParams.get("timeMin")  // ISO 8601 requerido
  const timeMax = searchParams.get("timeMax")  // ISO 8601 requerido

  // Loop de paginación automático (máx 10 páginas × 2500 eventos)
  // Retorna: NextResponse.json(allEvents)  ← array plano de eventos
}
```

**Respuesta**: array plano de objetos evento de Google Calendar. Cada evento tiene:
```json
{
  "id": "...",
  "summary": "Nombre del evento",
  "start": { "dateTime": "2026-03-27T10:00:00-06:00" },
  "end":   { "dateTime": "2026-03-27T11:00:00-06:00" },
  "colorId": "1",
  "status": "confirmed"
}
```

Eventos de todo el día usan `start.date` / `end.date` en lugar de `dateTime`.

#### Helper `calendarRequest` — `src/lib/google-calendar.ts`

```typescript
// src/lib/google-calendar.ts
const BASE = "https://www.googleapis.com/calendar/v3/calendars"

export async function calendarRequest<T>(
  path: string,
  method: string,
  accessToken: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) { throw ... }
  return res.json()
}
```

Otras rutas existentes:
- `GET/PATCH/DELETE /api/calendar/events/[eventId]` — `app/api/calendar/events/[eventId]/route.ts`

#### Cómo llama el Cliente a estas APIs

Desde Client Components, usando `fetch` nativo con `URLSearchParams`:

```tsx
// src/components/CalendarView.tsx:56-78
const params = new URLSearchParams({ timeMin, timeMax })
const res = await fetch(`/api/calendar/events?${params}`)
const data = await res.json()  // array de eventos
```

---

### 5. Librerías de Gráficas — Estado Actual

**No hay ninguna librería de gráficas instalada.** El `package.json` actual tiene:

```json
{
  "dependencies": {
    "next": "16.2.0",
    "react": "19.2.3",
    "next-auth": "5.0.0-beta.30",
    "@fullcalendar/react": "^6.1.20",
    "@fullcalendar/timegrid": "^6.1.20",
    "@fullcalendar/interaction": "^6.1.20",
    "@fullcalendar/core": "^6.1.20",
    "@prisma/client": "^7.5.0",
    "@prisma/adapter-pg": "^7.5.0",
    "@auth/prisma-adapter": "^2.11.1"
  }
}
```

#### Evaluación de Compatibilidad con React 19.2.3

| Librería | React 19 | Bundle (gzip) | Notas |
|---|---|---|---|
| **Recharts v3** | ✅ Soportado (issue #4558 cerrado) | ~40 kB | Tree-shakable; opción recomendada |
| **Chart.js + react-chartjs-2 v5.3** | ✅ Soportado (PR #1236 mergeado) | ~70 kB | Canvas-based; dos deps |
| **Nivo v0.88+** | ✅ Soportado (issue #2618 cerrado) | ~90-120 kB | Incluye D3; bundle mayor |
| **@tremor/react** | ❌ NO soportado (issue #1072 abierto) | ~80 kB | Parece sin mantenimiento activo |

**Opción más compatible**: `recharts` v3 — instalación:
```bash
npm install recharts
```

Todos los chart renderers requieren `"use client"` — son inherentemente Client Components (usan APIs del browser). El patrón correcto en App Router: **fetch de datos en Server Component → pasar como props al Client Component chart**.

---

### 6. Patrones de Componentes Existentes

#### Patrón de Página Dashboard (Server Component delegando a Client)

```tsx
// app/dashboard/page.tsx — patrón actual
import CalendarWithModal from "@/src/components/CalendarWithModal"

export default function DashboardPage() {
  return (
    <div className="p-6">
      <CalendarWithModal />
    </div>
  )
}
```

La página es un Server Component estático que delega al Client Component. El `p-6` es el único padding del contenido principal.

#### Patrón de Cards UI

Clases usadas consistentemente en el proyecto:

```tsx
// Card básica (app/page.tsx:46-61)
<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-8">
  {/* Icono en contenedor */}
  <div className="flex items-center justify-center w-12 h-12 bg-indigo-50 dark:bg-indigo-900 rounded-xl mb-6">
    <svg className="text-indigo-600 dark:text-indigo-400" />
  </div>
  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Título</h3>
  <p className="text-gray-600 dark:text-gray-400">Descripción</p>
</div>

// Card modal/flotante (src/components/EventModal.tsx:72)
<div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
```

#### Paleta Dark/Light Mode

| Elemento | Light | Dark |
|---|---|---|
| Fondo de página | `bg-gray-50` | `dark:bg-gray-950` |
| Fondo sidebar/card | `bg-white` | `dark:bg-gray-900` |
| Fondo card alternativo | `bg-gray-800` | `dark:bg-gray-800` |
| Texto principal | `text-gray-900` | `dark:text-white` |
| Texto secundario | `text-gray-500` | `dark:text-gray-400` |
| Texto terciario | `text-gray-600` | `dark:text-gray-400` |
| Bordes | `border-indigo-100` | `dark:border-indigo-900` |
| Acento/icono | `text-indigo-600` | `dark:text-indigo-400` |
| Fondo acento suave | `bg-indigo-50` | `dark:bg-indigo-900` |
| Item activo sidebar | `bg-indigo-50` | `dark:bg-indigo-900/50` |

El modo oscuro se activa vía `prefers-color-scheme` del sistema. **No hay toggle manual** — se usa la media query del sistema. Las variables CSS base están en `app/globals.css:3-20`.

#### Patrón de Loading State

`CalendarView.tsx` usa `useState` para loading:
```tsx
const [loading, setLoading] = useState(true)
setLoading(true)
// ... await fetch(...)
setLoading(false)
```

No hay componente de skeleton reutilizable — se implementaría ad hoc para estadísticas.

#### Patrón de Selector de Estado (Client Component)

`CalendarWithModal.tsx` usa `refreshKey` para forzar re-renders:
```tsx
const [refreshKey, setRefreshKey] = useState(0)
const refresh = () => setRefreshKey((k) => k + 1)
// Uso: <CalendarView key={refreshKey} ... />
```

Para el selector de rango de fechas en estadísticas, el patrón equivalente sería un `useState` con el rango seleccionado que desencadena un nuevo fetch.

---

## Code References

- `src/components/Sidebar.tsx:41-52` — navItem de Estadísticas con `href: "/dashboard/stats"` y `disabled: true`
- `src/components/Sidebar.tsx:115-136` — renderizado condicional del ítem disabled (badge "Pronto")
- `app/dashboard/layout.tsx:1-28` — layout protegido con `await auth()` + Sidebar + footer
- `app/dashboard/page.tsx:1-9` — patrón de página que delega al Client Component
- `src/lib/get-access-token.ts:14-22` — `getServerToken()` — lectura del JWT httpOnly
- `src/lib/google-calendar.ts:3-26` — `calendarRequest()` — wrapper de fetch para Google Calendar API
- `app/api/calendar/events/route.ts:1-64` — patrón completo de API route con auth + rate limit + paginación
- `app/page.tsx:46-61` — patrón de card con dark mode
- `app/globals.css:3-20` — variables CSS dark/light mode
- `package.json:14-28` — dependencias actuales (sin librería de gráficas)

---

## Key Architectural Decisions Found

1. **Fetch en Client Components**: Todas las llamadas a Google Calendar API se hacen desde Client Components via API routes internas — nunca llamadas directas al cliente con el token expuesto.

2. **Token en cookie httpOnly**: `getServerToken()` usa `getToken()` de `next-auth/jwt` para leer el JWT de la cookie — el `access_token` nunca toca el cliente.

3. **Split config de Auth.js**: `auth.config.ts` (sin Prisma, compatible Edge) + `auth.ts` (con Prisma) — permite que el middleware corra en Edge Runtime.

4. **Dark mode sin toggle**: `prefers-color-scheme` del sistema operativo — no hay estado de tema en la app.

5. **Paginación automática**: La API route de eventos itera hasta 10 páginas automáticamente y devuelve un array plano — la nueva ruta de estadísticas puede reusar esta misma ruta.

6. **Estructura de componentes**: Page (Server Component) → Client Component wrapper → UI. No hay fetch de datos en páginas de dashboard, solo delegación.

---

## Gaps in Research

- No se leyó `auth.ts` completo ni `auth.config.ts` — el flujo de callbacks JWT y el refresh token no se verificó directamente en el código, solo via el research anterior. Los hallazgos provienen del documento `2026-03-18_dashboard-sidebar-google-calendar.md` y del progress doc.
- No se leyó `src/lib/rate-limiter.ts` ni `src/lib/calendar-validation.ts` — se asume que son helpers internos sin impacto en la nueva ruta.
- El campo `colorId` en los eventos de Google Calendar devuelve un número del 1-11 (o `null`). No se verificó si la API devuelve un `backgroundColor` adicional — para categorización por color habría que mapear los colorIds a etiquetas/colores manualmente.
- No se verificó si `globals.css` tiene overrides de dark mode para `recharts` — sería necesario agregar overrides similares a los de FullCalendar si los gráficos no respetan el tema.

---

## Links (web research)

- [recharts/recharts #4558](https://github.com/recharts/recharts/issues/4558) — confirmación de soporte React 19 en v3.x
- [shadcn/ui chart docs](https://ui.shadcn.com/docs/components/chart) — wrapper sobre Recharts v3 con Tailwind
- [shadcn/ui React 19 docs](https://ui.shadcn.com/docs/react-19) — compatibilidad Next.js 15 + React 19
- [nivo #2618](https://github.com/plouc/nivo/issues/2618) — React 19 soportado en v0.88+
- [react-chartjs-2 #1235](https://github.com/reactchartjs/react-chartjs-2/issues/1235) — React 19 fix mergeado
- [tremor #1072](https://github.com/tremorlabs/tremor-npm/issues/1072) — sin soporte React 19 (descartado)
