---
date: 2026-03-19T00:00:00-06:00
git_commit: e23734d366665745ac0e22e027ef079b09b3a252
branch: main
repository: proyecto-piloto
topic: "Mejoras UI/UX del dashboard: sidebar desplegable, header duplicado, footer, redirección autenticado"
tags: [research, codebase, Sidebar, Navbar, dashboard, layout, auth, landing]
status: complete
last_updated: 2026-03-19
---

# Research: Mejoras UI/UX del dashboard

**Date**: 2026-03-19
**Git Commit**: e23734d366665745ac0e22e027ef079b09b3a252
**Branch**: main

## Research Question

Mejoras UI/UX al dashboard: sidebar desplegable con toggle, eliminar header duplicado, footer del dashboard, redirección de usuario autenticado desde landing, y mejoras visuales generales.

## Summary

El dashboard actual muestra tanto el `<Navbar />` global (con nombre + botón logout) como el `<Sidebar>` (con nombre + email + botón logout) simultáneamente — duplicación confirmada. El `<Sidebar>` es un componente estático sin `useState` ni toggle de colapso. La landing page (`app/page.tsx`) es un Server Component síncrono sin ninguna verificación de sesión. El middleware solo protege `/dashboard/*` para redirigir a `/login`, pero no existe lógica inversa para redirigir usuarios autenticados que visiten `/`.

## Detailed Findings

### 1. Árbol de layout completo (cómo se anidan los componentes)

```
app/layout.tsx (Server Component, async)
  ├── calls auth() → passes session to SessionProvider
  ├── <SessionProvider session={session}>
  │     ├── <Navbar />          ← se renderiza en TODAS las rutas
  │     └── {children}
  │           └── app/dashboard/layout.tsx (Server Component, async)
  │                 ├── calls auth() independientemente → redirect si no hay sesión
  │                 ├── <div class="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
  │                 │     ├── <Sidebar user={session.user ?? {}} />
  │                 │     └── <main class="flex-1 overflow-auto">
  │                 │           └── {children}
  │                 │                 └── app/dashboard/page.tsx
  │                 │                       └── <div class="p-6">
  │                 │                             └── <CalendarWithModal />
```

**Consecuencia**: En `/dashboard`, el usuario ve: Navbar global arriba + Sidebar a la izquierda. Ambos muestran nombre/avatar/logout.

### 2. Navbar global (`src/components/Navbar.tsx`)

- **Tipo**: `"use client"`, no recibe props
- **Estado**: `useState(false)` para el menú hamburguesa móvil (`isOpen`)
- **Sesión**: lee via `useSession()` de `next-auth/react`
- **Contenido en desktop**: logo "CalendarAI" + `<AuthButton />` (avatar + nombre + botón signOut)
- **Contenido en mobile**: hamburger toggle → `<AuthButton mobile />` en dropdown
- **Clases contenedor**: `bg-white dark:bg-gray-900 border-b border-indigo-100 dark:border-indigo-900`
- **AuthButton** (componente interno): muestra skeleton si `status === "loading"`, nombre del usuario (solo primer nombre) + signOut si hay sesión, o botón "Login" si no hay sesión
- **Se renderiza en**: TODAS las rutas, incluyendo `/dashboard`, `/login`

### 3. Sidebar (`src/components/Sidebar.tsx`)

- **Tipo**: `"use client"`, recibe `user: { name?, email?, image? }`
- **Estado**: **ningún `useState`** — es completamente estático
- **Ancho fijo**: `w-64` (256px), `flex-shrink-0`
- **No tiene toggle de colapso**
- **Nav items**:
  - `/dashboard` — Calendario (SVG calendario inline)
  - `/dashboard/stats` — Estadísticas (SVG barras inline, `disabled: true`)
- **Active state** (`pathname === item.href`):
  - Activo: `bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300`
  - **Sin borde izquierdo de color** en estado activo
- **Separador**: `border-t border-indigo-100 dark:border-indigo-900` entre nav y área de usuario
- **Área de usuario** (siempre visible): avatar 32×32 + name + email + botón "Cerrar sesión"
- **Logout**: `signOut({ callbackUrl: "/" })` → redirige a landing

### 4. Landing page (`app/page.tsx`)

- **Tipo**: Server Component **síncrono** (sin `async`)
- **Sin importación de `auth`** — no verifica sesión en absoluto
- **Secciones**:
  1. Hero: `bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-900 dark:to-indigo-950`, links a `/login` y `#features`
  2. Features: 3 cards en grid, `id="features"`
  3. **Footer**: `<footer className="bg-gray-50 dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-8">` con `<p className="text-center text-gray-500 dark:text-gray-400 text-sm">© 2026 CalendarAI</p>`
- **Resultado**: usuarios autenticados que navegan a `/` ven la landing completa, sin redirección

### 5. Login page (`app/login/page.tsx`)

- **Tipo**: Server Component async
- Llama `auth()` y si hay sesión → `redirect("/")` (redirige a **root**, no a `/dashboard`)
- Renderiza: card centrado con `<GoogleSignInButton />`

### 6. Middleware (`middleware.ts`)

- Importa `authConfig` de `auth.config.ts` (no importa `auth.ts` — evita Prisma en Edge Runtime)
- **Lógica**: si `isOnDashboard && !isLoggedIn` → `redirect("/login")`
- **NO** redirige usuarios autenticados en `/` ni en `/login` hacia `/dashboard`
- **Matcher**: corre en todas las rutas excepto `api/auth/*`, `_next/*`, `favicon.ico`

### 7. Auth redirect callback (`auth.config.ts:25-29`)

```typescript
async redirect({ url, baseUrl }) {
  return baseUrl   // SIEMPRE retorna la raíz "/"
}
```

Después del login con Google OAuth, el usuario siempre atterriza en `/`, nunca en `/dashboard` directamente.

### 8. Componentes existentes en `src/components/`

| Componente | Tipo | Relevante para mejoras |
|---|---|---|
| `Navbar.tsx` | use client | Sí — es el "header duplicado" |
| `Sidebar.tsx` | use client | Sí — necesita estado de colapso |
| `GoogleSignInButton.tsx` | use client | No |
| `EventModal.tsx` | use client | No |
| `CalendarWithModal.tsx` | use client | No |
| `CalendarView.tsx` | use client | No |

### 9. Footer de la landing (referencia para dashboard)

Clases del footer de `app/page.tsx`:
```html
<footer class="bg-gray-50 dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-8">
  <p class="text-center text-gray-500 dark:text-gray-400 text-sm">© 2026 CalendarAI</p>
</footer>
```

## Code References

- `app/layout.tsx:21` — `<Navbar />` renderizado globalmente para todas las rutas
- `app/layout.tsx:17` — `auth()` llamado para pasar sesión a `SessionProvider`
- `app/dashboard/layout.tsx:14-17` — estructura `flex h-screen` con Sidebar + main
- `app/dashboard/layout.tsx:15` — `<Sidebar user={session.user ?? {}} />`
- `app/dashboard/page.tsx:5` — `<div className="p-6">` wrapper del calendario
- `src/components/Sidebar.tsx:17` — `usePathname()` para active state, sin useState propio
- `src/components/Sidebar.tsx:19-44` — array `navItems` con 2 items (uno disabled)
- `src/components/Sidebar.tsx:64` — `pathname === item.href` para active state
- `src/components/Navbar.tsx:9-10` — `useState(false)` para menú mobile + `useSession()`
- `app/page.tsx:1-2` — Server Component síncrono sin verificación de sesión
- `app/page.tsx:95-99` — footer de la landing con estilos exactos
- `app/login/page.tsx:6-7` — `auth()` + `redirect("/")` si hay sesión (va a `/`, no `/dashboard`)
- `middleware.ts:8-14` — solo protege `/dashboard/*`, no redirige autenticados desde `/`
- `auth.config.ts:25-29` — redirect callback siempre retorna `baseUrl`

## Key Architectural Decisions Found

1. **Navbar global en root layout**: `app/layout.tsx` monta `<Navbar />` antes de `{children}`. No existe mecanismo para suprimirlo en rutas específicas desde el layout anidado. Para ocultarlo en `/dashboard`, la solución en Next.js App Router es crear un Client Component `ConditionalNavbar` que use `usePathname()` y renderice `null` en rutas de dashboard.

2. **Sidebar sin estado de colapso**: El Sidebar actual es un componente puramente presentacional con props. Para agregar colapso/expansión, se necesita añadir `useState` interno o mover el estado al layout del dashboard y pasarlo como prop.

3. **Verificación de sesión en landing**: Para redirigir usuarios autenticados, `app/page.tsx` debe convertirse en `async` e importar `auth()` de `@/auth`, igual que hace `app/login/page.tsx`.

4. **Footer del dashboard**: El layout actual (`app/dashboard/layout.tsx`) no tiene footer. El `<main>` tiene `overflow-auto`, por lo que un footer añadido al final del `<main>` aparecería debajo del scroll del calendario — requiere que el footer esté fuera del `<main>` o dentro pero al final del contenido de la página.

5. **Responsive**: El sidebar actual no tiene breakpoints responsive. Un inicio en estado colapsado en pantallas pequeñas requeriría detectar el ancho de ventana (`useEffect` + `window.innerWidth`) o usar CSS para ocultar el texto.

## Gaps in Research

- No se leyó el contenido de `app/api/auth/[...nextauth]/route.ts` (no relevante para UI).
- No se verificó el comportamiento exacto del `redirect callback` en Auth.js v5 cuando hay un `callbackUrl` en la URL de login (podría sobreescribirse fácilmente).
- No se investigó si existen breakpoints configurados en Tailwind para el sidebar responsive.
