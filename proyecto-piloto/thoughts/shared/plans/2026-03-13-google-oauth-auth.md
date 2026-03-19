---
date: 2026-03-13T00:00:00-06:00
git_commit: a71e1cf5102b534de9fb7afe86826f106c502f03
branch: main
topic: "Google OAuth Login con Auth.js v5 + Prisma + Next.js 15"
status: in-progress
---

# Plan: Google OAuth Login con Auth.js v5 + Prisma + Next.js 15

## Objective
Implementar login con Google OAuth usando Auth.js v5, persistiendo usuarios y sesiones en PostgreSQL, con la Navbar mostrando el estado de sesión dinámicamente.

## Current State
- `prisma/schema.prisma:13-18` — solo existe el modelo `User` con `id Int`, `email String`, `name String?`, `createdAt`. Sin relaciones ni campos de auth.
- `app/layout.tsx` — Server Component, monta `<Navbar />` globalmente. Sin SessionProvider.
- `src/components/Navbar.tsx:38-43, 72-78` — Client Component con links estáticos `href="/login"` en desktop y mobile. Sin lógica de sesión.
- `app/page.tsx:16-21` — CTA "Empezar gratis" enlaza a `/login` (da 404).
- No existe: `middleware.ts`, `auth.ts`, `app/api/`, `app/login/`.
- `.env` solo tiene `DATABASE_URL`.

## Assumptions
1. **Redirect post-login**: Después del login exitoso, el usuario es redirigido a `/` (landing page), ya que no existe un dashboard todavía.
2. **Rutas públicas**: La landing page `/` es pública. Solo rutas bajo `/dashboard` (futura) requerirán autenticación — el middleware se configura así como base para cuando existan.
3. **Login page pública**: `/login` es accesible sin autenticación (obviamente).
4. **Navbar autenticada**: Cuando el usuario está logueado, la Navbar muestra su foto/nombre de Google y un botón "Cerrar sesión". Cuando no está logueado, muestra el botón "Login" actual.
5. **Tabla User**: La tabla `users` en PostgreSQL está vacía (entorno de desarrollo), por lo que el cambio de `id Int` a `id String @cuid()` no rompe datos existentes.

---

## Implementation Phases

### Phase 1: Instalación de paquetes y setup manual de Google Cloud
**Goal**: Tener los paquetes instalados y las credenciales de Google listas.

**Pasos manuales (tú los haces, no Claude):**
1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear un proyecto (o usar uno existente)
3. Habilitar "Google+ API" o "Google Identity"
4. En "Credenciales" → "Crear credenciales" → "ID de cliente OAuth 2.0"
   - Tipo: Aplicación web
   - Orígenes autorizados: `http://localhost:3000`
   - URIs de redirección autorizados: `http://localhost:3000/api/auth/callback/google`
5. Copiar `Client ID` y `Client Secret`

**Comando de instalación:**
```bash
npm install next-auth@beta @auth/prisma-adapter
```

**Variables de entorno — agregar a `.env`:**
```env
AUTH_SECRET="<generar con: npx auth secret>"
AUTH_GOOGLE_ID="<tu-client-id>.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="<tu-client-secret>"
```

**Generar AUTH_SECRET:**
```bash
npx auth secret
```

**Verification:**
- [x] `npm install` completa sin errores
- [x] `.env` tiene las 4 variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- [x] Google Cloud Console tiene la URI de callback registrada

---

### Phase 2: Schema de BD + Migración
**Goal**: Actualizar el esquema de Prisma con todos los modelos requeridos por Auth.js v5 y aplicar la migración.

**Files to modify:**
- `prisma/schema.prisma` — reemplazar modelo `User` y agregar `Account`, `Session`, `VerificationToken`

**Nuevo contenido completo de `prisma/schema.prisma`:**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

**Nota sobre el campo `url` en datasource**: El schema actual no tiene `url = env("DATABASE_URL")` explícito — se agrega aquí.

**Comando:**
```bash
npx prisma migrate dev --name add-auth-models
```

**Verification:**
- [x] `migrate dev` completa sin errores
- [x] `npx prisma studio` (localhost:5555) muestra las tablas: `users`, `accounts`, `sessions`, `verification_tokens`
- [x] La tabla `users` tiene las columnas: `id` (text), `name`, `email`, `email_verified`, `image`, `created_at`

---

### Phase 3: Configuración de Auth.js
**Goal**: Crear el archivo central de Auth.js y el route handler para que los endpoints `/api/auth/*` funcionen.

**Files to create:**
- `auth.ts` (raíz del proyecto) — configuración central
- `app/api/auth/[...nextauth]/route.ts` — HTTP handler

**`auth.ts`:**
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
  callbacks: {
    async redirect({ url, baseUrl }) {
      return baseUrl  // siempre redirige a "/" después del login
    },
  },
})
```

**`app/api/auth/[...nextauth]/route.ts`:**
```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

**Verification:**
- [x] `npm run dev` inicia sin errores de TypeScript
- [x] `GET http://localhost:3000/api/auth/providers` responde con JSON que incluye `"google"`
- [x] `GET http://localhost:3000/api/auth/csrf` responde con un token

---

### Phase 4: Página de Login
**Goal**: Crear la página `/login` con el botón "Continuar con Google".

**Files to create:**
- `app/login/page.tsx` — página de login (Server Component que verifica sesión + Client Component para el botón)
- `src/components/GoogleSignInButton.tsx` — Client Component con `signIn("google")`

**`app/login/page.tsx`:**
```typescript
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import GoogleSignInButton from "@/src/components/GoogleSignInButton"

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect("/")

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-900 dark:to-indigo-950 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="flex justify-center mb-4 text-indigo-600 dark:text-indigo-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Bienvenido a CalendarAI</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">Inicia sesión para gestionar tu calendario con inteligencia</p>
        <GoogleSignInButton />
      </div>
    </main>
  )
}
```

**`src/components/GoogleSignInButton.tsx`:**
```typescript
"use client"

import { signIn } from "next-auth/react"

export default function GoogleSignInButton() {
  return (
    <button
      onClick={() => signIn("google")}
      className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium rounded-lg px-4 py-3 text-sm transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
        <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
        <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
        <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/>
      </svg>
      Continuar con Google
    </button>
  )
}
```

**Verification:**
- [x] `http://localhost:3000/login` carga sin errores (muestra el card con el botón)
- [x] El botón "Continuar con Google" redirige a la pantalla de selección de cuenta de Google
- [x] Después de seleccionar cuenta, redirige de vuelta a `http://localhost:3000/`
- [x] `npx prisma studio` muestra el usuario creado en la tabla `users` y su cuenta en `accounts`

---

### Phase 5: Navbar con estado de sesión + SessionProvider
**Goal**: La Navbar muestra el estado real de la sesión: botón "Login" si no autenticado, foto + nombre + "Cerrar sesión" si autenticado.

**Files to modify:**
- `app/layout.tsx` — agregar `SessionProvider` con la sesión inicial del servidor
- `src/components/Navbar.tsx` — reemplazar links estáticos con lógica de sesión dinámica

**`app/layout.tsx` modificado:**
```typescript
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import Navbar from "@/src/components/Navbar"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CalendarAI — Gestiona tu calendario con inteligencia",
  description: "CalendarAI te ayuda a organizar tu tiempo, priorizar tareas y gestionar tu calendario de forma inteligente.",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider session={session}>
          <Navbar />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
```

**`src/components/Navbar.tsx` modificado** — reemplazar la sección del Desktop menu y Mobile menu para mostrar estado de sesión:
```typescript
"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSession, signIn, signOut } from "next-auth/react"

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { data: session, status } = useSession()

  const AuthButton = ({ mobile = false }: { mobile?: boolean }) => {
    const baseClass = mobile
      ? "block w-full text-center rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      : "rounded-lg px-4 py-2 text-sm font-medium transition-colors"

    if (status === "loading") {
      return <div className={`${baseClass} bg-gray-100 dark:bg-gray-800 text-transparent`}>...</div>
    }

    if (session) {
      return (
        <div className={`flex ${mobile ? "flex-col" : "items-center"} gap-2`}>
          <div className="flex items-center gap-2">
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name ?? "Usuario"}
                width={28}
                height={28}
                className="rounded-full"
              />
            )}
            <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
              {session.user?.name?.split(" ")[0]}
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className={`${baseClass} bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200`}
          >
            Cerrar sesión
          </button>
        </div>
      )
    }

    return (
      <button
        onClick={() => { signIn(); if (mobile) setIsOpen(false) }}
        className={`${baseClass} bg-indigo-600 hover:bg-indigo-700 text-white`}
      >
        Login
      </button>
    )
  }

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-indigo-100 dark:border-indigo-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            CalendarAI
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center gap-4">
            <AuthButton />
          </div>

          {/* Hamburger button */}
          <button
            className="md:hidden flex items-center justify-center p-2 rounded-md text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Abrir menú"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden bg-white dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-3">
          <AuthButton mobile />
        </div>
      )}
    </nav>
  )
}
```

**Verification:**
- [x] `npm run dev` inicia sin errores
- [x] Sin sesión: Navbar muestra botón "Login" (igual que antes)
- [x] Al hacer login con Google: Navbar muestra foto + primer nombre + botón "Cerrar sesión"
- [x] Al hacer click en "Cerrar sesión": Navbar vuelve a mostrar "Login"
- [x] En mobile: el menú hamburguesa muestra el estado correcto según la sesión

---

### Phase 6: Middleware para protección de rutas
**Goal**: Agregar `middleware.ts` que proteja rutas futuras (e.g., `/dashboard`) y deje públicas la landing page y la página de login.

**Files to create:**
- `middleware.ts` (raíz del proyecto)

**`middleware.ts`:**
```typescript
import { auth } from "./auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard")

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}
```

**Verification:**
- [x] `npm run dev` inicia sin errores
- [x] `http://localhost:3000/` carga normalmente (no redirige)
- [x] `http://localhost:3000/login` carga normalmente (no redirige)
- [x] `http://localhost:3000/dashboard` (aunque da 404) redirige a `/login` si no hay sesión — confirmar en Network tab que hay un 307 a `/login` antes del 404

---

## Edge Cases to Handle

- **Email ya registrado con Google en otro proveedor futuro**: Auth.js maneja esto automáticamente — crea un nuevo `Account` vinculado al `User` existente si el email coincide.
- **Avatar de Google nulo**: `session.user?.image` puede ser `null` — el componente `AuthButton` ya lo maneja con el conditional `{session.user?.image && ...}`.
- **Sesión expirada**: Auth.js renueva automáticamente la sesión via la tabla `sessions` en cada request.
- **`/login` cuando ya está autenticado**: La página `/login/page.tsx` hace `redirect("/")` si ya hay sesión activa.
- **`signOut()` sin argumento**: Redirige a `/` por defecto en Auth.js v5 — no necesita configuración extra.

## Out of Scope
- Registro manual con email/password (solo OAuth de Google en este plan)
- Página de `/dashboard` o rutas protegidas con contenido real
- Roles de usuario o permisos granulares
- Manejo de errores de autenticación con páginas de error custom
- Provider adicionales (GitHub, etc.)
- Tests automatizados para el flujo de auth

## Commands Reference
```bash
npm run dev                              # servidor de desarrollo en localhost:3000
npx prisma migrate dev --name [nombre]  # aplicar cambios del schema a la BD
npx prisma studio                       # UI visual de la BD en localhost:5555
npx prisma generate                     # regenerar cliente tras cambios en schema
npx auth secret                         # generar AUTH_SECRET
```
