---
date: 2026-03-19T00:00:00-06:00
git_commit: e23734d366665745ac0e22e027ef079b09b3a252
branch: main
topic: "Mejoras UI/UX: sidebar desplegable, header duplicado, footer, redirección autenticado"
status: in-progress
---

# Plan: Mejoras UI/UX del dashboard

## Objective
Mejorar la experiencia del dashboard eliminando el header duplicado (Navbar en /dashboard), añadiendo colapso/expansión al sidebar con animación y responsive, añadiendo footer al dashboard, y redirigiendo automáticamente a usuarios autenticados que visiten la landing.

## Current State
- `app/layout.tsx:22` — `<Navbar />` se renderiza en TODAS las rutas incluyendo `/dashboard`, duplicando la info de sesión
- `src/components/Sidebar.tsx:47` — ancho fijo `w-64`, sin `useState`, sin toggle de colapso
- `src/components/Sidebar.tsx:83` — active state sin borde izquierdo de color
- `app/dashboard/layout.tsx:13-20` — layout `flex h-screen`, sin footer, main con `overflow-auto`
- `app/page.tsx:3` — Server Component síncrono, sin `auth()`, sin redirección para usuarios autenticados
- `app/login/page.tsx:7` — redirige a `"/"` si hay sesión (no a `/dashboard`)
- `app/page.tsx:95-99` — footer de referencia: `bg-gray-50 dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-8`

## Assumptions
1. **ConditionalNavbar en root layout**: para suprimir el Navbar en `/dashboard*` sin hacer el root layout un Client Component, se crea `src/components/ConditionalNavbar.tsx` que usa `usePathname()` y retorna `null` en rutas de dashboard.
2. **Estado de colapso interno al Sidebar**: el `useState(collapsed)` vive dentro de `Sidebar.tsx`, no en el layout padre. La prop interface no cambia.
3. **Responsive**: en pantallas < 768px el sidebar inicia colapsado. Se implementa con `useEffect` + `window.innerWidth` en el mount. Puede haber un flash breve en SSR → aceptable.
4. **Tooltip en collapsed**: se usa el atributo `title` nativo del HTML en los elementos del nav. No se añade librería de tooltip.
5. **Footer del dashboard**: se coloca fuera del `<main>` (en el mismo nivel), dentro de una columna flex derecha que incluye main + footer. El footer es siempre visible al fondo, el calendario scrollea arriba.
6. **Login page**: se cambia `redirect("/")` a `redirect("/dashboard")` — es una mejora de UX que no toca configuración de OAuth.
7. **auth.config.ts NO se toca**: el redirect callback de OAuth sigue apuntando a `/`. La cadena es: OAuth completa → `/` → `app/page.tsx` detecta sesión → `/dashboard`. Doble redirect pero funcional.
8. **Sidebar expandido**: mantiene `w-64`. Sidebar colapsado: `w-16` (64px).
9. **Active state mejorado**: borde izquierdo `border-l-2 border-indigo-600` solo cuando expandido (se omite en collapsed porque visualmente se ve raro en 64px).

---

## Implementation Phases

### Phase 1: ConditionalNavbar — eliminar header duplicado
**Goal**: El Navbar global desaparece en todas las rutas `/dashboard*`, sin modificar la lógica de auth del root layout.

**Files to create:**
- `src/components/ConditionalNavbar.tsx` — Client Component que retorna `null` en `/dashboard*`

**Files to modify:**
- `app/layout.tsx` — reemplazar `<Navbar />` por `<ConditionalNavbar />`

**`src/components/ConditionalNavbar.tsx` — contenido completo:**
```typescript
"use client"

import { usePathname } from "next/navigation"
import Navbar from "./Navbar"

export default function ConditionalNavbar() {
  const pathname = usePathname()
  if (pathname.startsWith("/dashboard")) return null
  return <Navbar />
}
```

**Cambio en `app/layout.tsx`:**
```typescript
// Cambiar import:
// import Navbar from "@/src/components/Navbar"
import ConditionalNavbar from "@/src/components/ConditionalNavbar"

// Cambiar en JSX:
// <Navbar />
<ConditionalNavbar />
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [ ] `http://localhost:3000/` — Navbar aparece normalmente (logo + botón login/usuario)
- [ ] `http://localhost:3000/dashboard` (logueado) — NO aparece Navbar, solo sidebar a la izquierda
- [ ] `http://localhost:3000/login` — Navbar aparece (no es ruta de dashboard)

---

### Phase 2: Sidebar desplegable con toggle y responsive
**Goal**: El sidebar tiene un botón toggle que colapsa/expande con animación. Colapsado muestra solo iconos (64px). Expandido muestra iconos + texto (256px). En pantallas < 768px inicia colapsado. Active state con borde izquierdo de color.

**Files to modify:**
- `src/components/Sidebar.tsx` — reescritura completa con estado de colapso

**`src/components/Sidebar.tsx` — contenido completo:**
```typescript
"use client"

import { useState, useEffect } from "react"
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
  const [collapsed, setCollapsed] = useState(false)

  // Inicia colapsado en pantallas pequeñas
  useEffect(() => {
    if (window.innerWidth < 768) {
      setCollapsed(true)
    }
  }, [])

  const navItems = [
    {
      href: "/dashboard",
      label: "Calendario",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
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
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
  ]

  return (
    <aside
      className={`flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-indigo-100 dark:border-indigo-900 h-full transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo + botón toggle */}
      <div className="flex items-center border-b border-indigo-100 dark:border-indigo-900 h-[62px] px-3">
        {!collapsed && (
          <Link
            href="/"
            className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-lg flex-1 min-w-0 overflow-hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="truncate">CalendarAI</span>
          </Link>
        )}
        {collapsed && (
          <Link
            href="/"
            className="flex items-center justify-center flex-1 text-indigo-700 dark:text-indigo-400"
            title="CalendarAI"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          if (item.disabled) {
            return (
              <div
                key={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                {item.icon}
                {!collapsed && (
                  <>
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      Pronto
                    </span>
                  </>
                )}
              </div>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                isActive
                  ? `bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300${
                      !collapsed ? " border-l-2 border-indigo-600 dark:border-indigo-400" : ""
                    }`
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User profile + logout */}
      <div className="px-2 py-4 border-t border-indigo-100 dark:border-indigo-900">
        {!collapsed ? (
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
        ) : (
          <div className="flex justify-center py-2 mb-1">
            {user.image && (
              <Image
                src={user.image}
                alt={user.name ?? "Usuario"}
                width={32}
                height={32}
                className="rounded-full"
                title={user.name ?? "Usuario"}
              />
            )}
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  )
}
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [ ] `http://localhost:3000/dashboard` — sidebar expandido por defecto (64px, iconos + texto)
- [ ] Click en el botón chevron (←) → sidebar se colapsa a 64px con animación suave
- [ ] En modo colapsado: solo iconos visibles, chevron apunta a la derecha (→)
- [ ] Hover sobre icono de "Calendario" en modo colapsado → tooltip nativo muestra "Calendario"
- [ ] Hover sobre avatar en modo colapsado → tooltip muestra nombre del usuario
- [ ] Hover sobre botón de logout colapsado → tooltip muestra "Cerrar sesión"
- [ ] Item activo (Calendario) tiene borde izquierdo indigo + fondo indigo tenue cuando expandido
- [ ] Item activo en modo colapsado tiene fondo indigo sin borde izquierdo
- [ ] En pantalla < 768px (DevTools → mobile): sidebar inicia colapsado automáticamente
- [ ] El layout no se rompe en ninguna de las dos dimensiones

---

### Phase 3: Footer del dashboard
**Goal**: El footer con `© 2026 CalendarAI` aparece siempre visible al fondo del área de contenido del dashboard, sin interferir con el scroll del calendario.

**Files to modify:**
- `app/dashboard/layout.tsx` — añadir columna derecha flex con main + footer

**`app/dashboard/layout.tsx` — contenido completo:**
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
      <Sidebar user={session.user ?? {}} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <footer className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-4">
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            © 2026 CalendarAI
          </p>
        </footer>
      </div>
    </div>
  )
}
```

**Nota de estructura**: se envuelve `main` + `footer` en un `<div className="flex-1 flex flex-col overflow-hidden">`. El `main` tiene `flex-1 overflow-auto` (scrollea el contenido), el `footer` tiene `flex-shrink-0` (nunca se comprime). El `overflow-hidden` en la columna derecha evita que el footer salga del viewport.

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [ ] `http://localhost:3000/dashboard` — footer visible al fondo del área derecha
- [ ] Footer muestra "© 2026 CalendarAI" centrado, gris tenue
- [ ] Al scrollear el calendario, el footer permanece fijo (no scrollea con el contenido)
- [ ] El footer NO aparece debajo del sidebar (está solo en la columna de contenido)
- [ ] Dark mode: footer usa `bg-gray-900` con texto `text-gray-600`

---

### Phase 4: Redirección de usuario autenticado
**Goal**: Si un usuario con sesión activa visita `/` (landing) o `/login`, es redirigido automáticamente a `/dashboard`.

**Files to modify:**
- `app/page.tsx` — añadir `async`, importar `auth`, redirect a `/dashboard` si hay sesión
- `app/login/page.tsx` — cambiar `redirect("/")` a `redirect("/dashboard")`

**`app/page.tsx` — cambios:**
```typescript
// Añadir imports al inicio:
import { auth } from "@/auth"
import { redirect } from "next/navigation"

// Cambiar la función a async y añadir check al inicio:
export default async function Home() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    // ... resto del JSX sin cambios ...
  )
}
```

**`app/login/page.tsx` — cambio:**
```typescript
// Línea 7: cambiar redirect("/") por:
if (session) redirect("/dashboard")
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [ ] Navegar a `http://localhost:3000/` sin sesión → landing page normal
- [ ] Navegar a `http://localhost:3000/` con sesión activa → redirige inmediatamente a `/dashboard`
- [ ] Navegar a `http://localhost:3000/login` con sesión activa → redirige a `/dashboard`
- [ ] Cerrar sesión desde sidebar → redirige a `/` → landing normal (sin loop)
- [ ] Login con Google exitoso → termina en `/dashboard` (vía `/ → /dashboard`)

---

## Edge Cases to Handle

- **Flash del sidebar en mobile**: el sidebar inicia expandido en SSR y colapsa en `useEffect`. El flash es breve (1 frame) y aceptable dado el enfoque de `useState` client-side.
- **Usuario sin foto de perfil (`user.image === null`)**: en modo colapsado el área de usuario queda vacía si no hay imagen — el botón de logout sigue siendo accesible con tooltip.
- **Loop de redirección en `/`**: no puede ocurrir porque `signOut({ callbackUrl: "/" })` lleva a `/` y `auth()` retorna `null` después del logout — la landing se muestra normalmente.
- **Borde izquierdo en active colapsado**: se omite intencionalmente en modo colapsado para mantener el icono centrado limpio. El fondo indigo tenue es suficiente indicador visual.
- **`transition-all` en sidebar**: anima tanto `width` como otras propiedades. El contenido interno (texto) podría verse comprimido durante la animación — se usa `overflow-hidden` en el aside para que el texto no desborde durante la transición.

## Out of Scope
- Persistencia del estado colapsado en localStorage entre sesiones
- Sidebar completamente oculto (0px) en mobile — solo colapsa a 64px
- Animación de fade del texto al colapsar (solo width transition)
- Tooltip custom estilizado — se usa `title` nativo del HTML
- Submenús o items anidados en el sidebar
- Botón "hamburger" para mobile que overlay el sidebar (no aplica en diseño actual)

## Commands Reference
```bash
npm run dev        # servidor en localhost:3000
npx tsc --noEmit   # type check
```
