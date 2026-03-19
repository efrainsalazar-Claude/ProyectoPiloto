---
date: 2026-03-18T00:00:00-06:00
git_commit: d7fb5d29eaffd99e700cdb4eb9a9af426ae01bc3
branch: main
repository: proyecto-piloto
topic: "Dashboard con sidebar, vista semanal de calendario y Google Calendar API"
tags: [research, codebase, dashboard, sidebar, calendar, google-calendar-api, nextauth, jwt]
status: complete
last_updated: 2026-03-18
---

# Research: Dashboard con sidebar, vista semanal de calendario y Google Calendar API

**Date**: 2026-03-18
**Git Commit**: d7fb5d29eaffd99e700cdb4eb9a9af426ae01bc3
**Branch**: main

## Research Question
Quiero construir el home page principal de la aplicación para usuarios autenticados con Google OAuth.
La feature incluye: sidebar fijo con navegación (Calendario, Estadísticas), avatar + nombre + email + logout en la parte inferior del sidebar, vista semanal tipo Google Calendar (lunes-viernes, 8am-8pm) con eventos de Google Calendar API del usuario, soporte dark/light mode, y protección de ruta `/dashboard`.

---

## Summary

El proyecto tiene la autenticación con Google completamente implementada (Auth.js v5, JWT strategy, PrismaAdapter) pero **ningún componente de dashboard, sidebar ni calendario existe todavía**. El middleware ya protege `/dashboard/*` redirigiendo a `/login` si no hay sesión. Para integrar Google Calendar API es necesario: (1) agregar los scopes de Calendar al provider Google en `auth.config.ts`, (2) añadir callbacks `jwt` y `session` en `auth.ts` para exponer el `access_token` en la sesión, y (3) crear un API route que llame a `https://www.googleapis.com/calendar/v3/calendars/primary/events` con el token. No hay ninguna librería de calendario UI instalada — deberá instalarse o construirse desde cero con Tailwind.

---

## Detailed Findings

### Estado actual del codebase

**Rutas existentes:**
- `app/page.tsx` — Landing page pública (localhost:3000)
- `app/login/page.tsx` — Página de login; redirige a `/` si ya hay sesión
- `app/api/auth/[...nextauth]/route.ts` — Handler de Auth.js v5

**Ruta a crear:**
- `app/dashboard/` — NO existe. El middleware (`middleware.ts`) ya la protege con redirect a `/login` si no hay sesión activa.

**Componentes existentes (`src/components/`):**
- `Navbar.tsx` — Client Component con `useSession`/`signIn`/`signOut`. Muestra foto + nombre si autenticado.
- `GoogleSignInButton.tsx` — Botón `signIn("google")`

**No existen:** Sidebar, CalendarView, ni ningún componente de dashboard.

---

### Configuración de Auth.js v5 actual

**`auth.config.ts:1-14`** — Config Edge-compatible (sin Prisma), usada por el middleware:
```typescript
providers: [Google],   // sin scopes extra de Calendar todavía
pages: { signIn: "/login" },
callbacks: { redirect: async ({ baseUrl }) => baseUrl }
```

**`auth.ts:1-10`** — Config completa con PrismaAdapter:
```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // NO hay callbacks jwt/session → access_token NO está en la sesión todavía
})
```

**Problema clave**: La sesión actual no expone el `access_token` de Google. Para llamar a Google Calendar API hay que agregar callbacks `jwt` y `session` a `auth.ts`.

---

### Cambios requeridos en Auth.js para Google Calendar API

**Scopes a agregar al provider Google en `auth.config.ts`:**
```typescript
Google({
  authorization: {
    params: {
      prompt: "consent",
      access_type: "offline",
      response_type: "code",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events.readonly",
        // calendar.events.readonly: solo lectura de eventos (mínimo privilegio)
        // Usar calendar.events si se necesita crear/editar eventos
      ].join(" "),
    },
  },
}),
```

**Callbacks a agregar en `auth.ts`:**
```typescript
callbacks: {
  async jwt({ token, account }) {
    if (account) {
      // Primer login: guardar tokens del proveedor OAuth
      return {
        ...token,
        access_token: account.access_token,
        expires_at: account.expires_at,        // ya en segundos Unix
        refresh_token: account.refresh_token,
      }
    }
    // Token aún válido
    if (Date.now() < token.expires_at * 1000) return token
    // Token expirado — refrescar
    if (!token.refresh_token) throw new TypeError("Missing refresh_token")
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.AUTH_GOOGLE_ID!,
          client_secret: process.env.AUTH_GOOGLE_SECRET!,
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
        }),
      })
      const newTokens = await response.json()
      if (!response.ok) throw newTokens
      return {
        ...token,
        access_token: newTokens.access_token,
        expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_in),
        refresh_token: newTokens.refresh_token ?? token.refresh_token,
      }
    } catch (error) {
      return { ...token, error: "RefreshTokenError" as const }
    }
  },
  async session({ session, token }) {
    session.access_token = token.access_token
    session.error = token.error
    return session
  },
},
```

**TypeScript augmentation requerida:**
```typescript
declare module "next-auth" {
  interface Session {
    access_token: string
    error?: "RefreshTokenError"
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    access_token: string
    expires_at: number
    refresh_token?: string
    error?: "RefreshTokenError"
  }
}
```

---

### Google Calendar API — Endpoint de eventos

**Endpoint:** `GET https://www.googleapis.com/calendar/v3/calendars/primary/events`

**Header requerido:** `Authorization: Bearer {access_token}`

**Parámetros clave para vista semanal:**
| Parámetro | Valor | Descripción |
|---|---|---|
| `timeMin` | ISO 8601 / RFC 3339 | Inicio del rango (ej. `2026-03-16T00:00:00Z`) |
| `timeMax` | ISO 8601 / RFC 3339 | Fin del rango |
| `singleEvents` | `"true"` | Expande eventos recurrentes en instancias individuales |
| `orderBy` | `"startTime"` | Solo válido con `singleEvents=true` |
| `maxResults` | `"100"` | Máximo de eventos por página |

**Forma de respuesta:**
```json
{
  "items": [
    {
      "id": "...",
      "summary": "Team meeting",
      "start": { "dateTime": "2026-03-18T10:00:00-06:00" },
      "end":   { "dateTime": "2026-03-18T11:00:00-06:00" },
      "status": "confirmed"
    }
  ]
}
```

**Patrón de API route en Next.js:**
```typescript
// app/api/calendar/events/route.ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const params = new URLSearchParams({
    timeMin: startOfWeek.toISOString(),
    timeMax: endOfWeek.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    }
  )
  const data = await res.json()
  return NextResponse.json(data.items)
}
```

**Decisión de librería:** Usar `fetch` directamente (sin `@googleapis/calendar`). Plain fetch no agrega dependencias, funciona en Node.js runtime y Edge runtime, y es suficiente para listar/crear/editar eventos.

---

### Scopes de Google Calendar disponibles

| Scope | Acceso |
|---|---|
| `calendar.events.readonly` | Solo lectura de eventos (recomendado para vista inicial) |
| `calendar.events` | Lectura y escritura de eventos |
| `calendar.readonly` | Lectura de calendarios y eventos |
| `calendar` | Acceso completo |

Para la vista semanal (solo lectura): `calendar.events.readonly` es el scope de mínimo privilegio.
Para crear/editar eventos: `calendar.events`.

---

### CSS / Tailwind v4 y dark mode

**`app/globals.css:1-26`** — Tailwind v4 con `@import "tailwindcss"`:
```css
:root {
  --background: #ffffff;   /* light mode */
  --foreground: #171717;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;  /* dark mode automático */
    --foreground: #ededed;
  }
}
```

**Variables CSS en Tailwind v4 vía `@theme inline`:**
- `bg-background` → `var(--background)`
- `text-foreground` → `var(--foreground)`
- `var(--font-geist-sans)` y `var(--font-geist-mono)` disponibles

El dark mode en el proyecto actual usa `dark:` prefix en Tailwind (ej. `dark:bg-gray-900`) — el Navbar y la login page lo usan extensamente. No hay `tailwind.config.*` — Tailwind v4 se configura en el CSS.

---

### Layout global actual (`app/layout.tsx`)

El RootLayout envuelve toda la app con `SessionProvider` y `Navbar`:
```typescript
export default async function RootLayout({ children }) {
  const session = await auth()
  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          <Navbar />        ← Navbar en TODAS las páginas incluido dashboard
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
```

**Implicación para el dashboard:** El Navbar actual aparecerá en `/dashboard` a menos que se cree un `app/dashboard/layout.tsx` separado que omita la Navbar y use en su lugar el Sidebar. Next.js App Router permite `layout.tsx` anidados — un layout de dashboard puede redefinir la estructura sin la Navbar global.

---

### Dependencias instaladas relevantes

```json
{
  "next": "16.1.6",
  "react": "19.2.3",
  "next-auth": "^5.0.0-beta.30",
  "@auth/prisma-adapter": "^2.11.1",
  "@prisma/client": "^7.5.0"
}
```

**No instaladas:** ninguna librería de UI de calendario (FullCalendar, react-big-calendar, @schedule-x/react, etc.) ni de iconos (Lucide, Heroicons). Si se decide usar una librería de calendario, debe instalarse.

---

## Code References

- `auth.config.ts:4-14` — Provider Google sin scopes de Calendar; callbacks solo tienen `redirect`
- `auth.ts:6-10` — NextAuth con JWT strategy; sin callbacks `jwt`/`session` → access_token no disponible
- `middleware.ts` — Ya protege `/dashboard/*`, redirige a `/login` sin sesión
- `app/layout.tsx:17-27` — RootLayout con SessionProvider y Navbar globales
- `app/globals.css:1-26` — Variables CSS `--background`/`--foreground` con dark mode automático
- `src/components/Navbar.tsx` — Patrón de `useSession`/`signIn`/`signOut` en Client Component
- `prisma/schema.prisma` — Solo modelos de auth (User, Account, Session, VerificationToken); sin modelos de Calendar/Events

## Key Architectural Decisions Found

1. **Layout anidado para dashboard**: `app/dashboard/layout.tsx` puede reemplazar la Navbar global con el Sidebar, sin modificar `app/layout.tsx`. Este es el patrón estándar de Next.js App Router.
2. **JWT strategy**: La sesión usa JWT (no database sessions), lo que permite acceder al `access_token` en el JWT callback y propagarlo al `session` callback — necesario para llamar a Google Calendar API.
3. **Split auth config**: `auth.config.ts` (Edge-compatible, sin Prisma) + `auth.ts` (con Prisma). Los callbacks `jwt` y `session` deben ir en `auth.ts` (no en `auth.config.ts`) porque hacen calls de red y usan tipos de Node.js.
4. **Plain fetch para Google Calendar API**: Sin dependencia extra; funciona en App Router; suficiente para operaciones CRUD de eventos.
5. **Re-autenticación al agregar scopes**: Al añadir `calendar.events.readonly` al scope de Google, los usuarios ya autenticados deben volver a hacer login para otorgar el nuevo permiso. `prompt: "consent"` fuerza esto en cada login.

---

## Librería UI de Calendario — Comparativa (React 19 + Next.js 16, solo gratis)

| Criterio | FullCalendar | react-big-calendar | @schedule-x/react | DayPilot Lite |
|---|---|---|---|---|
| Licencia | MIT (core) | MIT | MIT core; drag-to-create = **PREMIUM** | Apache 2.0 |
| React 19 | **Confirmado** en peerDeps | ❌ Issue abierto #2701 | Sin confirmar (vanilla JS) | Probable (demo lo usa) |
| Vista semanal (gratis) | Sí (`timeGridWeek`) | Sí | Sí | Sí |
| Drag-to-create (gratis) | **Sí** (`interaction` + `selectable`) | Sí (`onSelectSlot`) | ❌ Solo en tier de pago | Sí (`onTimeRangeSelected`) |
| Click-to-editar (gratis) | Sí (`eventClick`) | Sí (`onSelectEvent`) | Parcial (callbacks custom) | Sí |
| npm descargas/semana | ~1M+ | ~500K | ~5-10K | Muy bajo |
| Último release | ~3 meses | ~9 meses (lento) | Días (muy activo) | Activo |
| Bundle minificado | Grande (~150–200 KB) | Moderado (~60–80 KB) | Pequeño (modular) | Moderado |
| Next.js App Router | ✅ Funciona (necesita `use client`) | ⚠️ Issues conocidos desde Next 13.4.9 | ✅ Funciona | ✅ Ejemplos explícitos con Next 16 |

**Decisión recomendada: FullCalendar (`@fullcalendar/react`)**

Es la única librería que confirma React 19 explícitamente en sus `peerDependencies`. Todos los features necesarios (vista semanal TimeGrid, drag-to-create vía `selectable`, click-to-edit, drag-to-move de eventos existentes) están en los plugins MIT gratuitos. El bundle grande se mitiga con `dynamic(() => import(...), { ssr: false })` de Next.js.

**Paquetes necesarios (todos MIT gratuitos):**
```bash
npm install @fullcalendar/react @fullcalendar/core @fullcalendar/timegrid @fullcalendar/interaction
```

**Patrón básico:**
```typescript
"use client"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"

<FullCalendar
  plugins={[timeGridPlugin, interactionPlugin]}
  initialView="timeGridWeek"
  selectable={true}           // drag-to-create
  selectMirror={true}
  slotMinTime="08:00:00"      // 8am
  slotMaxTime="20:00:00"      // 8pm
  weekends={false}            // lunes a viernes
  events={events}
  select={handleSelect}       // callback al dibujar nuevo evento
  eventClick={handleEventClick} // callback al click en evento
/>
```

---

## Google Calendar API — Crear, Editar y Eliminar Eventos

### POST — Crear evento

**URL:** `POST https://www.googleapis.com/calendar/v3/calendars/primary/events`

**Campos requeridos:** `start` y `end` (ambos deben usar el mismo tipo: `dateTime` o `date`).

```typescript
// Evento con hora (timed)
const body = {
  summary: "Team Standup",
  description: "Daily sync",
  start: { dateTime: "2026-04-01T10:00:00-06:00", timeZone: "America/Chicago" },
  end:   { dateTime: "2026-04-01T10:30:00-06:00", timeZone: "America/Chicago" },
}

// Evento todo el día (all-day)
const allDay = {
  summary: "Día festivo",
  start: { date: "2026-04-01" },   // yyyy-mm-dd, SIN dateTime
  end:   { date: "2026-04-02" },   // exclusivo — siguiente día para evento de 1 día
}
```

**Respuesta:** JSON completo del `Event` creado, incluyendo `id` generado automáticamente.

### PATCH — Actualizar evento

**URL:** `PATCH https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}`

Semántica de patch parcial: solo los campos enviados cambian. **Excepción:** arrays como `attendees[]` se reemplazan completos si se incluyen.

```typescript
// Solo actualiza summary y horario — el resto no cambia
const patch = {
  summary: "Nuevo título",
  start: { dateTime: "2026-04-01T11:00:00-06:00", timeZone: "America/Chicago" },
  end:   { dateTime: "2026-04-01T11:30:00-06:00", timeZone: "America/Chicago" },
}
// Tip: eliminar claves undefined antes de enviar:
// JSON.parse(JSON.stringify(patch))
```

### DELETE — Eliminar evento

**URL:** `DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}`

**Respuesta exitosa:** `204 No Content` (body vacío).

### Helper reutilizable (plain fetch)

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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err?.error?.message ?? `Error ${res.status}`), {
      status: res.status,
      reason: err?.error?.errors?.[0]?.reason,
    })
  }
  return res.json()
}
```

### Errores comunes

| Código | Razón | Acción |
|---|---|---|
| `400` | Campo requerido faltante | Corregir body |
| `401` | Token expirado/inválido | Refresh token; re-auth si falla |
| `403 forbidden` | Sin permisos de escritura en el calendario | Verificar scope (`calendar.events` en vez de `.readonly`) |
| `403 quotaExceeded` | Cuota agotada | Backoff exponencial |
| `404` | `eventId` no existe | Verificar ID |
| `409 duplicate` | ID ya existe | Omitir `id` (dejar que API lo genere) |
| `410 gone` | Sync token inválido | Descartar token y full re-sync |

---

## Google Calendar API — Paginación con `nextPageToken`

### Cómo funciona

- La respuesta incluye `nextPageToken: string` **solo cuando hay más páginas**.
- Cuando es la última página, el campo está ausente — en su lugar aparece `nextSyncToken`.
- Para la siguiente página: repetir la **misma request exacta** añadiendo `pageToken=<valor>` como query param.

### ¿Es necesaria para vista semanal?

**En la práctica: No.** Una semana de lunes a viernes, 8am-8pm, en el peor caso tiene ~100 eventos. Configurar `maxResults=2500` (máximo absoluto de la API) hace que la paginación sea extremadamente improbable. Sin embargo, siempre se debe implementar el loop defensivamente porque la API puede devolver menos de `maxResults` aunque existan más resultados.

### Patrón de loop (fetch de todas las páginas)

```typescript
async function fetchAllEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const all: CalendarEvent[] = []
  let pageToken: string | undefined = undefined

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    )
    const data = await res.json()
    all.push(...(data.items ?? []))
    pageToken = data.nextPageToken ?? undefined
  } while (pageToken !== undefined)

  return all
}
```

### `syncToken` — para polling incremental (futura referencia)

- La última página devuelve `nextSyncToken` en vez de `nextPageToken`.
- Se usa en la siguiente llamada con el parámetro `syncToken` para obtener **solo cambios desde la última sync**.
- Si el servidor invalida el token → responde `410 Gone` → hacer full re-sync y guardar nuevo `nextSyncToken`.
- **No es para tiempo real**: para actualizaciones en tiempo real se usan webhooks (`calendar.events.watch`).

---

## Gaps in Research

- No se investigó el manejo de eventos de múltiples calendarios (no solo `primary`).
- No se verificó si `prompt: "consent"` en `auth.config.ts` (Edge) vs `auth.ts` causaría conflictos con el split config actual.
- No se investigó paginación de resultados incrementales con `syncToken` en el contexto de la app.
- React 19 compatibility de `@schedule-x/react` no fue confirmada oficialmente (requiere verificar `peerDependencies` en npm directamente).

## Links

- [Auth.js — Refresh Token Rotation](https://authjs.dev/guides/refresh-token-rotation) — patrón completo de callbacks `jwt`/`session`
- [Auth.js — Google Provider](https://authjs.dev/getting-started/providers/google) — `access_type: offline`, `prompt: consent`
- [Auth.js — Configuring OAuth Providers](https://authjs.dev/guides/configuring-oauth-providers) — override de `authorization.params.scope`
- [Google Calendar API — Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) — endpoint, parámetros, respuesta
- [Google Calendar API — Events: insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) — crear eventos
- [Google Calendar API — Events: patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch) — actualizar eventos
- [Google Calendar API — Events: delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete) — eliminar eventos
- [Google Calendar API — Scopes](https://developers.google.com/workspace/calendar/api/auth) — lista completa de scopes OAuth
- [Google Calendar API — Paginación](https://developers.google.com/calendar/api/guides/pagination) — nextPageToken, syncToken
- [Google Calendar API — Errores](https://developers.google.com/workspace/calendar/api/guides/errors) — tabla completa de errores y manejo
- [Auth.js — Get Session](https://authjs.dev/getting-started/session-management/get-session) — uso de `auth()` en server components y API routes
- [FullCalendar — TimeGrid View](https://fullcalendar.io/docs/timegrid-view) — vista semanal
- [FullCalendar — selectable (drag-to-create)](https://fullcalendar.io/docs/selectable) — plugin de interacción gratuito
- [FullCalendar — Premium vs Free](https://fullcalendar.io/docs/premium) — confirma qué features son gratuitos
