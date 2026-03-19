---
date: 2026-03-18T00:00:00-06:00
git_commit: d7fb5d29eaffd99e700cdb4eb9a9af426ae01bc3
branch: main
topic: "Dashboard principal con sidebar, vista semanal FullCalendar y Google Calendar API"
status: in-progress
---

# Plan: Dashboard principal con sidebar, vista semanal FullCalendar y Google Calendar API

## Objective
Construir la página principal autenticada (`/dashboard`) con sidebar de navegación fijo, vista semanal tipo Google Calendar (lun-vie, 8am-8pm) conectada a Google Calendar API del usuario, y modal simple para crear y editar eventos.

## Current State
- `auth.config.ts:4-14` — Provider Google sin scopes de Calendar. Sin callbacks `jwt`/`session` → `access_token` NO disponible en sesión.
- `auth.ts:6-10` — JWT strategy con PrismaAdapter. Sin callbacks → access_token no se propaga.
- `middleware.ts` — Ya protege `/dashboard/*`, redirige a `/login` sin sesión.
- `app/layout.tsx:17-27` — RootLayout con SessionProvider y Navbar globales. El Navbar aparece en todas las páginas.
- `app/dashboard/` — No existe ningún archivo.
- `src/components/` — Solo existen `Navbar.tsx` y `GoogleSignInButton.tsx`. No hay Sidebar ni CalendarView.
- No hay librerías de calendario UI instaladas.
- Paleta establecida: indigo/gray, clases `dark:` en Tailwind v4.

## Assumptions
1. **Scope de escritura**: Se usa `calendar.events` (lectura + escritura) para soportar crear y editar eventos.
2. **Modal simple**: Al crear o editar un evento se muestra un modal con solo título + fecha/hora inicio + fecha/hora fin + botones guardar/eliminar.
3. **Navegación semanal**: FullCalendar renderiza sus propios botones prev/next/today en el toolbar del calendario.
4. **Sin librería de iconos**: Se usan SVGs inline igual que en Navbar.tsx y login/page.tsx.
5. **Tabla `users` vacía en dev**: Re-login de usuarios existentes para otorgar nuevos scopes no rompe datos.
6. **Zona horaria**: Se usa la zona horaria del navegador del usuario (`Intl.DateTimeFormat().resolvedOptions().timeZone`) para los eventos nuevos.
7. **Sección Estadísticas**: Se incluye en el sidebar como link deshabilitado/placeholder (fuera de scope construirla).
8. **El Navbar global NO aparece en `/dashboard`**: Se suprime vía `app/dashboard/layout.tsx` anidado que no lo incluye.

---

## Implementation Phases

### Phase 1: Auth — Scopes de Calendar + access_token en sesión
**Goal**: Que el `access_token` de Google esté disponible en `session.access_token` para hacer llamadas a Google Calendar API.

**Pasos manuales (tú los haces antes del código):**
1. Ir a [Google Cloud Console](https://console.cloud.google.com) → APIs y Servicios → Biblioteca
2. Buscar "Google Calendar API" → **Habilitar**
3. (Si la app está en modo "Testing" en OAuth consent screen) — no se necesita hacer nada más con los scopes; la pantalla de consentimiento los solicitará automáticamente al re-login.

**Files to modify:**
- `auth.config.ts` — agregar scopes de Calendar al provider Google, `prompt: consent`, `access_type: offline`
- `auth.ts` — agregar callbacks `jwt` y `session`, agregar TypeScript module augmentation

**`auth.config.ts` — nuevo contenido:**
```typescript
import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

export const authConfig: NextAuthConfig = {
  providers: [
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
            "https://www.googleapis.com/auth/calendar.events",
          ].join(" "),
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      return baseUrl
    },
  },
}
```

**`auth.ts` — nuevo contenido:**
```typescript
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/src/lib/prisma"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          refresh_token: account.refresh_token,
        }
      }
      if (Date.now() < (token.expires_at as number) * 1000) return token
      if (!token.refresh_token) throw new TypeError("Missing refresh_token")
      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refresh_token as string,
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
      } catch {
        return { ...token, error: "RefreshTokenError" as const }
      }
    },
    async session({ session, token }) {
      session.access_token = token.access_token as string
      session.error = token.error as "RefreshTokenError" | undefined
      return session
    },
  },
})

declare module "next-auth" {
  interface Session {
    access_token: string
    error?: "RefreshTokenError"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string
    expires_at?: number
    refresh_token?: string
    error?: "RefreshTokenError"
  }
}
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [x] `npm run dev` inicia sin errores
- [x] Cerrar sesión → volver a loguearse con Google → la pantalla de consentimiento de Google muestra "Ver, editar, compartir y eliminar permanentemente todos los calendarios a los que puedes acceder con Google Calendar"
- [x] `GET http://localhost:3000/api/auth/session` en el navegador (logueado) devuelve JSON con `"access_token": "ya29...."` en la respuesta

---

### Phase 2: Dashboard layout + Sidebar
**Goal**: La ruta `/dashboard` muestra un layout con sidebar fijo a la izquierda y área de contenido a la derecha, sin el Navbar global.

**Files to create:**
- `app/dashboard/layout.tsx` — layout anidado del dashboard (sin Navbar, con Sidebar)
- `src/components/Sidebar.tsx` — sidebar con navegación + perfil de usuario + logout

**`app/dashboard/layout.tsx`:**
```typescript
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Sidebar from "@/src/components/Sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar user={session.user} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

**`src/components/Sidebar.tsx`:**
```typescript
"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

interface SidebarProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  const navItems = [
    {
      href: "/dashboard",
      label: "Calendario",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      href: "/dashboard/stats",
      label: "Estadísticas",
      disabled: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
  ]

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-indigo-100 dark:border-indigo-900 h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-indigo-100 dark:border-indigo-900">
        <Link href="/" className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          CalendarAI
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed"
              >
                {item.icon}
                {item.label}
                <span className="ml-auto text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">Pronto</span>
              </div>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User profile + logout */}
      <div className="px-3 py-4 border-t border-indigo-100 dark:border-indigo-900">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          {user.image && (
            <Image
              src={user.image}
              alt={user.name ?? "Usuario"}
              width={32}
              height={32}
              className="rounded-full flex-shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [x] `http://localhost:3000/dashboard` (logueado) — muestra sidebar a la izquierda sin Navbar global
- [x] Sidebar muestra: logo CalendarAI, "Calendario" activo (indigo), "Estadísticas" deshabilitado con badge "Pronto"
- [x] Parte inferior: foto + nombre + email del usuario + botón "Cerrar sesión"
- [x] Click "Cerrar sesión" → redirige a `/` y cierra sesión
- [x] `http://localhost:3000/dashboard` sin sesión → redirige a `/login`
- [x] Dark mode: sidebar usa `dark:bg-gray-900` correctamente

---

### Phase 3: API routes de Google Calendar
**Goal**: Endpoints del servidor para leer, crear, editar y eliminar eventos del calendario del usuario.

**Files to create:**
- `src/lib/google-calendar.ts` — helper reutilizable de fetch a Google Calendar API
- `app/api/calendar/events/route.ts` — GET (listar) y POST (crear)
- `app/api/calendar/events/[eventId]/route.ts` — PATCH (editar) y DELETE (eliminar)

**`src/lib/google-calendar.ts`:**
```typescript
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
    throw Object.assign(
      new Error(err?.error?.message ?? `Calendar API error ${res.status}`),
      { status: res.status, reason: err?.error?.errors?.[0]?.reason }
    )
  }
  return res.json()
}
```

**`app/api/calendar/events/route.ts`:**
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { calendarRequest } from "@/src/lib/google-calendar"

// GET /api/calendar/events?timeMin=...&timeMax=...
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const timeMin = searchParams.get("timeMin")
  const timeMax = searchParams.get("timeMax")

  if (!timeMin || !timeMax) {
    return NextResponse.json({ error: "timeMin y timeMax son requeridos" }, { status: 400 })
  }

  // Fetch con paginación defensiva
  const allEvents: unknown[] = []
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
    const data = await calendarRequest<{ items?: unknown[]; nextPageToken?: string }>(
      `/primary/events?${params}`,
      "GET",
      session.access_token
    )
    allEvents.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return NextResponse.json(allEvents)
}

// POST /api/calendar/events
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const event = await calendarRequest(
    "/primary/events",
    "POST",
    session.access_token,
    body
  )
  return NextResponse.json(event, { status: 201 })
}
```

**`app/api/calendar/events/[eventId]/route.ts`:**
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { calendarRequest } from "@/src/lib/google-calendar"

// PATCH /api/calendar/events/:eventId
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { eventId } = await params
  const body = await request.json()
  // Eliminar claves undefined para no sobreescribir con null
  const patch = JSON.parse(JSON.stringify(body))
  const event = await calendarRequest(
    `/primary/events/${eventId}`,
    "PATCH",
    session.access_token,
    patch
  )
  return NextResponse.json(event)
}

// DELETE /api/calendar/events/:eventId
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { eventId } = await params
  await calendarRequest(
    `/primary/events/${eventId}`,
    "DELETE",
    session.access_token
  )
  return new Response(null, { status: 204 })
}
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [x] (Con servidor corriendo) `GET /api/calendar/events?timeMin=2026-03-16T00:00:00Z&timeMax=2026-03-20T23:59:59Z` devuelve array de eventos (puede ser vacío `[]`)
- [x] La respuesta incluye los campos `id`, `summary`, `start`, `end` por cada evento

---

### Phase 4: Dashboard page + CalendarView
**Goal**: La página `/dashboard` muestra el calendario semanal con eventos del usuario, con navegación entre semanas.

**Files to install:**
```bash
npm install @fullcalendar/react @fullcalendar/core @fullcalendar/timegrid @fullcalendar/interaction
```

**Files to create:**
- `app/dashboard/page.tsx` — página del dashboard (Server Component mínimo)
- `src/components/CalendarView.tsx` — componente FullCalendar con fetch de eventos

**`app/dashboard/page.tsx`:**
```typescript
import CalendarView from "@/src/components/CalendarView"

export default function DashboardPage() {
  return (
    <div className="h-full p-6">
      <CalendarView />
    </div>
  )
}
```

**`src/components/CalendarView.tsx`:**
```typescript
"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import type { DateSelectArg, EventClickArg, DatesSetArg, EventInput } from "@fullcalendar/core"

// Lazy load FullCalendar para evitar SSR issues y reducir bundle inicial
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false })

// Plugins se importan de forma dinámica dentro del componente
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"

interface CalendarViewProps {
  onSelectSlot?: (arg: DateSelectArg) => void
  onEventClick?: (arg: EventClickArg) => void
}

export default function CalendarView({ onSelectSlot, onEventClick }: CalendarViewProps) {
  const [events, setEvents] = useState<EventInput[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = useCallback(async (timeMin: string, timeMax: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ timeMin, timeMax })
      const res = await fetch(`/api/calendar/events?${params}`)
      if (!res.ok) throw new Error("Error fetching events")
      const data = await res.json()
      // Mapear al formato de FullCalendar
      setEvents(
        data.map((e: { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }) => ({
          id: e.id,
          title: e.summary ?? "(Sin título)",
          start: e.start.dateTime ?? e.start.date,
          end: e.end.dateTime ?? e.end.date,
          allDay: !e.start.dateTime,
        }))
      )
    } catch (err) {
      console.error("Error fetching calendar events:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      fetchEvents(arg.startStr, arg.endStr)
    },
    [fetchEvents]
  )

  return (
    <div className="h-full relative">
      {loading && (
        <div className="absolute top-2 right-2 z-10">
          <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 px-2 py-1 rounded shadow">
            Cargando...
          </span>
        </div>
      )}
      <FullCalendar
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "",
        }}
        locale="es"
        slotMinTime="08:00:00"
        slotMaxTime="20:00:00"
        weekends={false}
        allDaySlot={true}
        selectable={true}
        selectMirror={true}
        height="100%"
        events={events}
        datesSet={handleDatesSet}
        select={onSelectSlot}
        eventClick={onEventClick}
        buttonText={{
          today: "Hoy",
          prev: "←",
          next: "→",
        }}
        nowIndicator={true}
        eventColor="#4f46e5"
        eventBorderColor="#4338ca"
        slotLabelFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
      />
    </div>
  )
}
```

**Nota**: `CalendarView` recibe callbacks `onSelectSlot` y `onEventClick` opcionales — en Phase 5 se conectan con el modal.

**Verification:**
- [x] `npm install` completa sin errores de peer deps
- [x] `npx tsc --noEmit` sin errores
- [ ] `http://localhost:3000/dashboard` muestra el calendario semanal lun-vie, 8am-8pm
- [ ] Los eventos del Google Calendar del usuario aparecen en el calendario
- [ ] Las flechas prev/next/today navegan entre semanas y re-cargan los eventos
- [ ] El indicador de "Cargando..." aparece brevemente al cambiar de semana
- [ ] El calendario muestra la hora actual con la línea roja (`nowIndicator`)

---

### Phase 5: Event modal (crear y editar)
**Goal**: Modal simple que aparece al hacer drag-to-create o click en evento, permitiendo guardar o eliminar.

**Files to create:**
- `src/components/EventModal.tsx` — modal con formulario de título + inicio + fin
- `src/components/CalendarWithModal.tsx` — wrapper que conecta CalendarView + EventModal

**Files to modify:**
- `app/dashboard/page.tsx` — usar `CalendarWithModal` en vez de `CalendarView` directamente

**`src/components/EventModal.tsx`:**
```typescript
"use client"

import { useState, useEffect } from "react"

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { title: string; start: string; end: string }) => Promise<void>
  onDelete?: () => Promise<void>
  initialData?: {
    id?: string
    title: string
    start: string
    end: string
  }
}

export default function EventModal({ isOpen, onClose, onSave, onDelete, initialData }: EventModalProps) {
  const [title, setTitle] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title)
      setStart(initialData.start.slice(0, 16))  // formato datetime-local: YYYY-MM-DDTHH:mm
      setEnd(initialData.end.slice(0, 16))
    } else {
      setTitle("")
      setStart("")
      setEnd("")
    }
  }, [initialData, isOpen])

  if (!isOpen) return null

  const isEditing = !!initialData?.id

  const handleSave = async () => {
    if (!title.trim() || !start || !end) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), start, end })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {isEditing ? "Editar evento" : "Nuevo evento"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Agregar título"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Inicio
            </label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fin
            </label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          {isEditing && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim() || !start || !end}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**`src/components/CalendarWithModal.tsx`:**
```typescript
"use client"

import { useState, useCallback } from "react"
import CalendarView from "./CalendarView"
import EventModal from "./EventModal"
import type { DateSelectArg, EventClickArg } from "@fullcalendar/core"

interface ModalState {
  isOpen: boolean
  eventId?: string
  title: string
  start: string
  end: string
}

const CLOSED: ModalState = { isOpen: false, title: "", start: "", end: "" }

export default function CalendarWithModal() {
  const [modal, setModal] = useState<ModalState>(CLOSED)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey((k) => k + 1)

  const handleSelectSlot = useCallback((arg: DateSelectArg) => {
    setModal({
      isOpen: true,
      title: "",
      start: arg.startStr,
      end: arg.endStr,
    })
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const { event } = arg
    setModal({
      isOpen: true,
      eventId: event.id,
      title: event.title,
      start: event.startStr,
      end: event.endStr,
    })
  }, [])

  const handleSave = async (data: { title: string; start: string; end: string }) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const body = {
      summary: data.title,
      start: { dateTime: new Date(data.start).toISOString(), timeZone: tz },
      end:   { dateTime: new Date(data.end).toISOString(), timeZone: tz },
    }

    if (modal.eventId) {
      // Editar evento existente
      await fetch(`/api/calendar/events/${modal.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } else {
      // Crear nuevo evento
      await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    }
    refresh()
  }

  const handleDelete = async () => {
    if (!modal.eventId) return
    await fetch(`/api/calendar/events/${modal.eventId}`, { method: "DELETE" })
    refresh()
  }

  return (
    <>
      <CalendarView
        key={refreshKey}
        onSelectSlot={handleSelectSlot}
        onEventClick={handleEventClick}
      />
      <EventModal
        isOpen={modal.isOpen}
        onClose={() => setModal(CLOSED)}
        onSave={handleSave}
        onDelete={modal.eventId ? handleDelete : undefined}
        initialData={modal.isOpen ? { id: modal.eventId, title: modal.title, start: modal.start, end: modal.end } : undefined}
      />
    </>
  )
}
```

**`app/dashboard/page.tsx` actualizado:**
```typescript
import CalendarWithModal from "@/src/components/CalendarWithModal"

export default function DashboardPage() {
  return (
    <div className="h-full p-6">
      <CalendarWithModal />
    </div>
  )
}
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [ ] Arrastrar en el calendario → se abre el modal "Nuevo evento" con inicio/fin prellenados
- [ ] Escribir un título → click "Guardar" → el evento aparece en el calendario
- [ ] El evento creado aparece en Google Calendar del usuario (verificar en calendar.google.com)
- [ ] Click en un evento existente → se abre el modal "Editar evento" con los datos prellenados
- [ ] Modificar el título → "Guardar" → el cambio se refleja en el calendario
- [ ] Click "Eliminar" → el evento desaparece del calendario y de Google Calendar
- [ ] Click en backdrop o "Cancelar" cierra el modal sin cambios

---

## Edge Cases to Handle

- **`access_token` ausente en sesión**: El API route devuelve `401`. El frontend no tiene manejo de error explícito — el evento simplemente no aparecerá. (Manejo de error completo está fuera de scope.)
- **`RefreshTokenError`**: Si el token no se puede refrescar, `session.error === "RefreshTokenError"`. No se redirige automáticamente al login — la siguiente solicitud al API devolverá 401.
- **Evento sin título (`summary` vacío en Google Calendar)**: El componente muestra `"(Sin título)"`.
- **Eventos de todo el día (`allDay`)**: FullCalendar los muestra en el slot `allDaySlot`. El modal no los soporta para creación (solo crea eventos con hora). Mostrarlos en lectura es suficiente.
- **Usuario sin eventos en la semana**: `data.items` puede ser `undefined` — el loop usa `data.items ?? []`.
- **Concurrencia de creación**: `refreshKey` se incrementa después de cada mutación para re-fetchear eventos — solución simple, no optimista.

## Out of Scope
- Página de Estadísticas (`/dashboard/stats`) — placeholder en el sidebar
- Manejo de errores visual (toasts, banners) para fallos de la API de Google Calendar
- Eventos recurrentes (creación/edición desde la app)
- Múltiples calendarios (solo se usa `primary`)
- Drag-to-move de eventos existentes (requiere lógica adicional de PATCH)
- Notificaciones / recordatorios al crear eventos
- Responsividad mobile del dashboard (sidebar colapsable)
- `syncToken` para actualizaciones incrementales

## Commands Reference
```bash
npm run dev                               # servidor en localhost:3000
npm install @fullcalendar/react @fullcalendar/core @fullcalendar/timegrid @fullcalendar/interaction
npx tsc --noEmit                          # type check sin compilar
npx prisma studio                         # ver BD en localhost:5555
```
