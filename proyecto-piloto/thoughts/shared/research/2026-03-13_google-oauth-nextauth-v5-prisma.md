---
date: 2026-03-13T00:00:00-06:00
git_commit: a71e1cf5102b534de9fb7afe86826f106c502f03
branch: main
repository: proyecto-piloto
topic: "Login con OAuth de Google — Next.js 15 App Router + Prisma + Auth.js v5"
tags: [research, codebase, auth, nextauth, google-oauth, prisma, nextjs15]
status: complete
last_updated: 2026-03-13
---

# Research: Login con OAuth de Google — Next.js 15 App Router + Prisma + Auth.js v5

**Date**: 2026-03-13
**Git Commit**: a71e1cf5102b534de9fb7afe86826f106c502f03
**Branch**: main

## Research Question
Quiero agregar login con OAuth de Google.
¿Qué necesito, cómo se integra con Next.js 15 App Router y Prisma,
y qué patrones existen en el proyecto actualmente?

## Summary
El proyecto no tiene ninguna infraestructura de autenticación implementada: no existen rutas de API, middleware, ni páginas de login, aunque la Navbar y el landing page ya enlazan a `/login`. La librería estándar para esta integración es Auth.js v5 (`next-auth@beta`) con el adaptador `@auth/prisma-adapter`, que persiste sesiones, cuentas OAuth y tokens en PostgreSQL. El modelo `User` existente en Prisma debe ser ampliado (cambio de `id` a `cuid`, agregar `emailVerified` e `image`, hacer `email` nullable) y se deben añadir tres modelos nuevos (`Account`, `Session`, `VerificationToken`). La integración requiere crear 4 archivos nuevos y modificar 3 existentes.

---

## Detailed Findings

### Estado actual del proyecto (codebase)

**Modelo `User` en `prisma/schema.prisma:13-18`** — estado actual:
```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
```
- `id` es `Int` con autoincrement — Auth.js v5 requiere `String` con `cuid()`
- No tiene `emailVerified`, `image`, ni relaciones con `Account`/`Session`
- `email` es `String` (no nullable) — Auth.js requiere `String?`

**`src/lib/prisma.ts`** — singleton de Prisma, sin cambios requeridos. Se importa como `@/src/lib/prisma`.

**`app/layout.tsx:4`** — importa y monta `<Navbar />` globalmente. Requiere modificación para agregar `SessionProvider`.

**`src/components/Navbar.tsx`** — Client Component (`"use client"`). Tiene links `href="/login"` en:
- Desktop: `Navbar.tsx:38-43`
- Mobile: `Navbar.tsx:72-78`
Estos links deben reemplazarse con lógica de `signIn`/`signOut` de Auth.js.

**`app/page.tsx:16-21`** — botón CTA `"Empezar gratis"` enlaza a `/login`.

**Lo que NO existe:**
- `middleware.ts` — no hay protección de rutas
- `app/api/` — ningún endpoint de API
- `app/login/` — la ruta `/login` da 404
- Variables de entorno de auth (`.env` solo tiene `DATABASE_URL`)

---

### Paquetes npm requeridos

```bash
npm install next-auth@beta @auth/prisma-adapter
```

| Paquete | Versión | Propósito |
|---|---|---|
| `next-auth` | `@beta` (v5.x) | Auth.js core para Next.js 15 |
| `@auth/prisma-adapter` | latest | Adaptador para persistir sesiones en PostgreSQL |

> NO usar `@next-auth/prisma-adapter` (v4) — es incompatible con Auth.js v5.

---

### Cambios en `prisma/schema.prisma`

El esquema completo requerido por Auth.js v5 (merger con el User existente):

```prisma
model User {
  id            String    @id @default(cuid())   // cambia de Int a String
  name          String?
  email         String?   @unique                // cambia a nullable
  emailVerified DateTime? @map("email_verified") // nuevo
  image         String?                          // nuevo
  createdAt     DateTime  @default(now())        // se mantiene
  accounts      Account[]                        // nuevo
  sessions      Session[]                        // nuevo

  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

Notas:
- `@db.Text` en tokens OAuth es necesario en PostgreSQL para tokens largos
- `onDelete: Cascade` elimina cuentas/sesiones cuando se borra un usuario
- `email` pasa a `String?` porque algunos proveedores OAuth no devuelven email

---

### Variables de entorno requeridas

Agregar a `.env` (existente, ya tiene `DATABASE_URL`):

```env
# Auth.js — generar con: npx auth secret
AUTH_SECRET="..."

# Google OAuth (desde Google Cloud Console)
AUTH_GOOGLE_ID="...apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="..."
```

Auth.js v5 mapea automáticamente `AUTH_GOOGLE_ID` → `clientId` y `AUTH_GOOGLE_SECRET` → `clientSecret`. No se necesita pasarlos manualmente en el código. **No agregar `NEXTAUTH_URL`** — causa conflictos con Next.js 15.

Callback URL para registrar en Google Cloud Console:
- Desarrollo: `http://localhost:3000/api/auth/callback/google`

---

### Estructura de archivos a crear/modificar

```
proyecto-piloto/
├── auth.ts                                ← CREAR (raíz del proyecto)
├── middleware.ts                          ← CREAR (raíz del proyecto)
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts              ← CREAR
│   ├── login/
│   │   └── page.tsx                      ← CREAR (página con botón "Sign in with Google")
│   └── layout.tsx                        ← MODIFICAR (agregar SessionProvider)
├── src/
│   └── components/
│       └── Navbar.tsx                    ← MODIFICAR (signIn/signOut según sesión)
└── prisma/
    └── schema.prisma                     ← MODIFICAR (nuevos modelos + User ampliado)
```

---

### Contenido de archivos nuevos

**`auth.ts`** (raíz del proyecto):
```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/src/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
  },
})
```

**`app/api/auth/[...nextauth]/route.ts`**:
```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

**`middleware.ts`** (raíz):
```typescript
export { auth as middleware } from "./auth"

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

---

### Acceso a la sesión: Server vs Client Components

| Contexto | Función | Import | Requiere Provider |
|---|---|---|---|
| Server Component / Page | `await auth()` | `from "@/auth"` | No |
| Client Component | `useSession()` | `from "next-auth/react"` | Sí (`SessionProvider`) |

`SessionProvider` se agrega una vez en `app/layout.tsx` envolviendo `{children}`.

**En Server Component:**
```typescript
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function ProtectedPage() {
  const session = await auth()
  if (!session) redirect("/login")
  return <p>Bienvenido, {session.user?.name}</p>
}
```

**En Client Component (Navbar):**
```typescript
"use client"
import { useSession, signIn, signOut } from "next-auth/react"

const { data: session, status } = useSession()
// status: "loading" | "authenticated" | "unauthenticated"
```

---

## Code References
- `prisma/schema.prisma:13-18` — modelo `User` actual (a ampliar)
- `src/lib/prisma.ts` — singleton Prisma, importar en `auth.ts` como `@/src/lib/prisma`
- `app/layout.tsx:4` — import de `Navbar`, punto donde agregar `SessionProvider`
- `src/components/Navbar.tsx:38-43` — link desktop a `/login` (a reemplazar con auth)
- `src/components/Navbar.tsx:72-78` — link mobile a `/login` (a reemplazar con auth)
- `app/page.tsx:16-21` — CTA "Empezar gratis" → `/login`

## Key Architectural Decisions Found

1. **Auth.js v5 con adaptador Prisma** — exporta `handlers`, `auth`, `signIn`, `signOut` desde `auth.ts` en la raíz del proyecto.
2. **Estrategia `"database"`** — cada request valida la sesión contra PostgreSQL via la tabla `sessions`.
3. **`middleware.ts` en la raíz** — Next.js 15 requiere que el middleware esté en la raíz del proyecto.
4. **Import alias `@/auth`** — con `tsconfig.json` actual (`@/*` → raíz), `auth.ts` en la raíz se importa como `@/auth`.
5. **`SessionProvider` en layout** — necesario una sola vez para que todos los Client Components puedan usar `useSession()`.
6. **`cuid()` vs `autoincrement()`** — el modelo `User` actual usa `Int` con autoincrement; Auth.js v5 requiere `String` con `cuid()`. Esto implica una migración que cambia el tipo de la PK.

## Gaps in Research
- No se verificó la compatibilidad exacta del `@auth/prisma-adapter` con Prisma 7 (se encontró "compatible con Prisma 2.26.0+").
- No se investigó manejo de errores en el flujo OAuth (e.g., email ya registrado con otro proveedor).
- No se investigó la estrategia `"jwt"` como alternativa a `"database"`.
- No se investigó si el cambio de `id` de `Int` a `String` en `User` requiere limpiar la tabla existente o si hay datos que preservar.

## Links
- [Auth.js Installation](https://authjs.dev/getting-started/installation)
- [Auth.js Prisma Adapter](https://authjs.dev/getting-started/adapters/prisma)
- [Auth.js Google Provider](https://authjs.dev/getting-started/providers/google)
- [Auth.js Environment Variables](https://authjs.dev/guides/environment-variables)
- [Auth.js Protecting Routes](https://authjs.dev/getting-started/session-management/protecting)
- [Auth.js Next.js Reference](https://authjs.dev/reference/nextjs)
- [Prisma + Auth.js + Next.js Guide](https://www.prisma.io/docs/guides/authjs-nextjs)
- [Auth.js Migrating to v5](https://authjs.dev/getting-started/migrating-to-v5)
