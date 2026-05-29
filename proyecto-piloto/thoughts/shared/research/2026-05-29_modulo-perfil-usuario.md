---
date: 2026-05-29T22:59:00-05:00
git_commit: 21e9b2d4e5532902ea9a0be92ef68d58d100d095
branch: main
repository: proyecto-piloto
topic: "Módulo de perfil de usuario — edición de datos personales en BD"
tags: [research, codebase, profile, user, prisma, auth, form]
status: complete
last_updated: 2026-05-29
---

# Research: Módulo de perfil de usuario — edición de datos personales en BD

**Date**: 2026-05-29  
**Git Commit**: 21e9b2d4e5532902ea9a0be92ef68d58d100d095  
**Branch**: main

## Research Question
Quiero desarrollar el módulo de perfil donde yo pueda editar información mía que se guarde en BD como puede ser mi rol, mi empresa, etc. lo que consideres relevante.

## Summary
El proyecto tiene un modelo `User` en Prisma con sólo los campos estándar de Auth.js (`id`, `name`, `email`, `emailVerified`, `image`, `createdAt`). No existe ninguna página de perfil ni API route para editar datos del usuario. La estrategia de sesión es JWT, por lo que los datos extra del perfil no están en la sesión y deben leerse directamente desde la BD vía una API route. El Sidebar ya muestra `name`, `email` e `image` del usuario (obtenidos de Google OAuth) y es el lugar natural para agregar un link a la nueva página de perfil.

## Detailed Findings

### Modelo User actual en Prisma

**Archivo**: `prisma/schema.prisma:13–24`

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime? @map("email_verified")
  image         String?
  createdAt     DateTime  @default(now())
  accounts      Account[]
  sessions      Session[]

  @@map("users")
}
```

Campos actuales y quién los controla:
| Campo | Origen | Editable por usuario |
|---|---|---|
| `id` | Prisma cuid() en insert | No |
| `name` | Auth.js desde Google | No (sobrescrito por OAuth) |
| `email` | Auth.js desde Google | No (único + OAuth) |
| `emailVerified` | Auth.js | No |
| `image` | Auth.js desde Google | No |
| `createdAt` | PostgreSQL `now()` en insert | No |

**No existen campos de perfil editables por el usuario.** Los campos nuevos que se agreguen al modelo (`role`, `company`, etc.) sí serán editables porque Auth.js no los conoce ni los sobreescribe.

### Estrategia de autenticación — JWT

**Archivo**: `auth.ts:17–62`

La sesión usa `strategy: "jwt"`. El objeto `session.user` que llega a los componentes y layouts contiene únicamente los campos estándar de Auth.js:
- `session.user.name` — del JWT (viene de Google)
- `session.user.email` — del JWT
- `session.user.image` — del JWT

El callback `session` en `auth.ts:55–60` sólo copia `token.error` a la sesión; no copia `token.sub` (user ID) al objeto `session.user`. El `userId` sólo está disponible server-side via `getServerToken(request)` que lee el JWT desde la cookie httpOnly (`token.sub`).

**Implicación para el módulo de perfil**: Los datos extra del perfil (role, company, etc.) NO pueden leerse desde `session.user` porque no están en el JWT. La página de perfil necesita una API route que busque el usuario en la BD usando `userId` obtenido del JWT.

### Token utility — cómo obtener el userId en API routes

**Archivo**: `src/lib/get-access-token.ts`

```typescript
// patrón usado en todas las API routes existentes
const { accessToken, userId, error } = await getServerToken(request)
```

`userId` corresponde a `token.sub` del JWT, que es el `User.id` en la BD. Este es el mecanismo para identificar al usuario en cualquier API route.

### Componente Sidebar — área actual de perfil

**Archivo**: `src/components/Sidebar.tsx:138–184`

La sección inferior del sidebar muestra:
- Avatar (`user.image`) como `<Image>` 32×32 con `rounded-full`
- `user.name` en texto `text-sm font-medium`
- `user.email` en texto `text-xs text-gray-500`
- Botón "Cerrar sesión"

La prop que recibe el Sidebar es:
```typescript
interface SidebarProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}
```

Los datos vienen de `session.user` en `app/dashboard/layout.tsx`. No hay ningún link a página de perfil en este componente actualmente.

### Estructura de la sesión propagada al Sidebar

**Archivo**: `app/dashboard/layout.tsx`

```typescript
const session = await auth()
if (!session) redirect("/login")
return (
  <Sidebar user={session.user ?? {}} />
  ...
)
```

### Patrones de código existentes para el módulo nuevo

#### Patrón de página (Server Component shell)
**Archivos**: `app/dashboard/page.tsx`, `app/dashboard/stats/page.tsx`

```typescript
// app/dashboard/[feature]/page.tsx
import FeatureClient from "@/src/components/FeatureClient"
export default function FeaturePage() {
  return (
    <div className="p-6">
      <FeatureClient />
    </div>
  )
}
```

#### Patrón de formulario (Client Component)
**Archivo**: `src/components/EventModal.tsx:1–50`

Controlled inputs con `useState` por cada campo, handler `async` con `setSaving(true)/finally`, guard de validación inline antes de submit.

Clase de input estandarizada:
```
w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400
focus:outline-none focus:ring-2 focus:ring-indigo-500
```

Clase de label estandarizada:
```
block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1
```

#### Patrón de API route con PATCH
**Archivo**: `app/api/calendar/events/[eventId]/route.ts:7–41`

```typescript
export async function PATCH(request: NextRequest) {
  const { accessToken, userId, error } = await getServerToken(request)
  if (error === "RefreshTokenError") return NextResponse.json({ error: "..." }, { status: 401 })
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  // validar → actualizar en BD → devolver resultado
}
```

#### Patrón de card/panel visual
**Archivo**: `src/components/StatsClient.tsx:117–135`

```
bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6
```

### Archivos inexistentes que el módulo necesitará crear

| Archivo a crear | Propósito |
|---|---|
| `prisma/schema.prisma` (modificar) | Agregar campos de perfil al modelo `User` |
| `app/api/profile/route.ts` | GET (leer perfil) y PATCH (actualizar perfil) |
| `app/dashboard/profile/page.tsx` | Página shell (Server Component) |
| `src/components/ProfileClient.tsx` | Formulario de edición (Client Component) |
| `src/components/Sidebar.tsx` (modificar) | Agregar link "Mi perfil" en navegación |

### Campos de perfil candidatos (no existen en BD)

Campos que tiene sentido agregar al modelo `User` porque Auth.js nunca los sobreescribe:

| Campo sugerido | Tipo Prisma | Descripción |
|---|---|---|
| `role` | `String?` | Rol en la organización (ej. "Developer", "Manager") |
| `company` | `String?` | Empresa u organización |
| `department` | `String?` | Área o departamento |
| `phone` | `String?` | Teléfono de contacto |
| `bio` | `String?` (`@db.Text`) | Descripción o biografía corta |
| `jobTitle` | `String?` | Puesto o cargo |
| `location` | `String?` | Ciudad/país |
| `updatedAt` | `DateTime?` | Fecha de última actualización del perfil |

Todos serían `String?` (nullable) para no romper registros existentes en la BD. Auth.js no lee ni escribe ninguno de estos campos.

## Code References

- `prisma/schema.prisma:13–24` — modelo `User` con campos actuales
- `auth.ts:17–62` — configuración JWT, callbacks de sesión, acceso a tokens
- `auth.ts:55–60` — callback `session` — sólo copia `token.error`, no el userId
- `src/lib/get-access-token.ts` — exporta `getServerToken(request)` que devuelve `{ userId, accessToken, error }`
- `src/lib/prisma.ts:1–13` — singleton Prisma 7 con `PrismaPg` adapter
- `src/components/Sidebar.tsx:9–15` — interfaz `SidebarProps` con `name`, `email`, `image`
- `src/components/Sidebar.tsx:138–184` — sección de perfil y logout en sidebar
- `app/dashboard/layout.tsx` — pasa `session.user` al `<Sidebar>`
- `src/components/EventModal.tsx:1–50` — patrón de formulario cliente con estado controlado
- `app/api/calendar/events/[eventId]/route.ts:7–41` — patrón de PATCH con auth guard
- `app/dashboard/stats/page.tsx` — patrón de página shell + client component
- `src/components/StatsClient.tsx:117–135` — patrón visual de cards con dark mode

## Key Architectural Decisions Found

1. **JWT strategy**: La sesión no persiste en BD, por lo que datos extra del perfil no se pueden poner en `session.user` sin modificar los callbacks JWT. La forma más directa es que la página de perfil los obtenga de la BD vía API route.

2. **PrismaAdapter customizado**: `auth.ts:8–15` usa un `secureAdapter` que omite almacenar tokens OAuth en la BD. Cualquier cambio al schema `User` no afecta este adaptador.

3. **`userId` sólo vía JWT cookie**: No hay forma de obtener el `userId` del usuario autenticado desde un Server Component directamente (no está en `session.user`). Sólo está en `token.sub` del JWT, accesible via `getServerToken(request)` en API routes.

4. **Separación Server/Client**: Las páginas del dashboard son Server Components thin que delegan toda interactividad a un único Client Component importado. El formulario de perfil debe seguir este patrón.

5. **Sin validación externa**: El proyecto no usa Zod ni ninguna librería de validación. La validación es inline con guards simples (`if (!field.trim()) return`).

## Gaps in Research

- No se investigó si `token.sub` está disponible en `auth()` desde Server Components (podría simplificar obtener userId sin pasar por API route). Requeriría revisar el tipo del objeto retornado por `auth()`.
- No se revisó si existe alguna configuración de `next.config.ts` relevante para nuevas rutas.
- No se investigó el comportamiento del PrismaAdapter cuando se actualizan campos custom en `User` — el adapter sólo hace upsert en `name`, `email`, `image` durante login.
