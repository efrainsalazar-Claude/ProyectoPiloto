---
date: 2026-05-29T23:15:00-05:00
git_commit: 21e9b2d4e5532902ea9a0be92ef68d58d100d095
branch: main
topic: "Módulo de perfil de usuario"
status: in-progress
---

# Plan: Módulo de perfil de usuario

## Objective
Agregar una página `/dashboard/profile` donde el usuario autenticado pueda ver y editar sus datos de perfil (rol, empresa, puesto, departamento) guardados en la BD.

## Current State
- `prisma/schema.prisma:13–24` — modelo `User` con sólo campos de Auth.js; sin campos de perfil editables
- `src/components/Sidebar.tsx:28–52` — navegación con dos items (`/dashboard`, `/dashboard/stats`); sin link a perfil
- `src/components/Sidebar.tsx:138–184` — sección inferior muestra avatar + nombre + email (solo lectura) + botón logout
- `app/dashboard/layout.tsx` — pasa `session.user` (name, email, image) al Sidebar
- No existe `app/api/profile/`, `app/dashboard/profile/`, ni `src/components/ProfileClient.tsx`
- La estrategia de sesión es JWT: `userId` sólo disponible via `getToken()` de `next-auth/jwt` en API routes

## Assumptions
- **Nombre, email e imagen**: solo lectura — vienen de Google OAuth y se muestran informativamente en el perfil pero no son editables
- **`updatedAt`**: se agrega como `@updatedAt` en Prisma (se actualiza automáticamente en cada `prisma.user.update()`)
- **Auth en API de perfil**: se usa `getToken()` directamente (no `getServerToken()`) porque el perfil no necesita el access token de Google — sólo el `userId`. Esto evita bloquear el perfil si el token de Google expira
- **Campos a agregar**: `role`, `company`, `jobTitle`, `department`, `updatedAt` — todos nullable (`String?`) para no romper registros existentes
- **Sin librería de validación**: guards inline, igual que el resto del proyecto
- **Etiquetas en español** en la UI para consistencia con el idioma del proyecto
- **Ruta de la página**: `/dashboard/profile` — accesible desde el sidebar

---

## Implementation Phases

### Phase 1: Schema — agregar campos de perfil al modelo User

**Goal**: Extender el modelo `User` con los 4 campos editables + `updatedAt`, aplicar la migración y regenerar el cliente Prisma.

**Files to modify:**
- `prisma/schema.prisma` — agregar 5 campos al modelo `User`

**Implementation steps:**

1. Agregar al modelo `User` en `prisma/schema.prisma` (después del campo `createdAt`):

```prisma
role        String?
company     String?
jobTitle    String?   @map("job_title")
department  String?
updatedAt   DateTime? @updatedAt @map("updated_at")
```

2. Ejecutar la migración:
```bash
npx prisma migrate dev --name add_profile_fields
```

3. Verificar que el cliente se regeneró (el migrate dev lo hace automáticamente).

**Verification:**
- [x] Run: `npx prisma migrate dev --name add_profile_fields` — debe completar sin errores
- [ ] Run: `npx prisma studio` — abrir la tabla `users` y confirmar que aparecen las columnas `role`, `company`, `job_title`, `department`, `updated_at`

---

### Phase 2: API Route — GET y PATCH para `/api/profile`

**Goal**: Crear el endpoint que lee y actualiza los datos de perfil del usuario autenticado desde la BD.

**Files to create:**
- `app/api/profile/route.ts` — GET (leer perfil completo) y PATCH (actualizar los 4 campos editables)

**Implementation steps:**

1. Crear `app/api/profile/route.ts` con este contenido:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { prisma } from "@/src/lib/prisma"

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: token.sub },
    select: {
      name: true,
      email: true,
      image: true,
      role: true,
      company: true,
      jobTitle: true,
      department: true,
      updatedAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function PATCH(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()

  // Solo campos editables — ignorar cualquier otra cosa del body
  const { role, company, jobTitle, department } = body

  const updated = await prisma.user.update({
    where: { id: token.sub },
    data: {
      role: typeof role === "string" ? role.trim() || null : undefined,
      company: typeof company === "string" ? company.trim() || null : undefined,
      jobTitle: typeof jobTitle === "string" ? jobTitle.trim() || null : undefined,
      department: typeof department === "string" ? department.trim() || null : undefined,
    },
    select: {
      role: true,
      company: true,
      jobTitle: true,
      department: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(updated)
}
```

**Notas de implementación:**
- `getToken({ req: request })` lee el JWT httpOnly cookie y devuelve `null` si no hay sesión válida — no requiere Google access token válido
- `role: typeof role === "string" ? role.trim() || null : undefined` — convierte string vacío a `null` (limpiar el campo), y `undefined` si no se envió el campo (Prisma ignora los campos `undefined`)
- `updatedAt` se actualiza automáticamente por Prisma gracias al decorator `@updatedAt`

**Verification:**
- [x] Run: `npm run dev`
- [ ] Test GET: abrir DevTools → Network → navegar a `/dashboard` y confirmar que `GET /api/profile` retorna `200` con los campos (vacíos inicialmente)
- [ ] Test PATCH: desde consola del navegador ejecutar:
  ```js
  fetch('/api/profile', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ role: 'Developer', company: 'SoftsVGroup' }) }).then(r => r.json()).then(console.log)
  ```
  Debe retornar `{ role: "Developer", company: "SoftsVGroup", ... }`
- [ ] Run: `npx prisma studio` — confirmar que la fila del usuario en `users` muestra los valores actualizados

---

### Phase 3: UI — Página de perfil y formulario

**Goal**: Crear la página `/dashboard/profile` con un formulario funcional que cargue los datos actuales del usuario y permita editarlos.

**Files to create:**
- `app/dashboard/profile/page.tsx` — Server Component shell (sigue el patrón de `app/dashboard/stats/page.tsx`)
- `src/components/ProfileClient.tsx` — Client Component con el formulario

**Implementation steps:**

1. Crear `app/dashboard/profile/page.tsx`:

```typescript
import ProfileClient from "@/src/components/ProfileClient"

export default function ProfilePage() {
  return (
    <div className="p-6">
      <ProfileClient />
    </div>
  )
}
```

2. Crear `src/components/ProfileClient.tsx`:

```typescript
"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Image from "next/image"

interface ProfileData {
  name: string | null
  email: string | null
  image: string | null
  role: string | null
  company: string | null
  jobTitle: string | null
  department: string | null
  updatedAt: string | null
}

export default function ProfileClient() {
  const { data: session } = useSession()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // campos editables en el form
  const [role, setRole] = useState("")
  const [company, setCompany] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [department, setDepartment] = useState("")

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setProfile(data)
        setRole(data.role ?? "")
        setCompany(data.company ?? "")
        setJobTitle(data.jobTitle ?? "")
        setDepartment(data.department ?? "")
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, company, jobTitle, department }),
      })
      if (res.ok) {
        const updated = await res.json()
        setProfile((prev) => prev ? { ...prev, ...updated } : prev)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-6 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi perfil</h1>

      {/* Sección de identidad (solo lectura — viene de Google) */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Cuenta</h2>
        <div className="flex items-center gap-4">
          {profile?.image && (
            <Image
              src={profile.image}
              alt={profile.name ?? "Avatar"}
              width={64}
              height={64}
              className="rounded-full flex-shrink-0"
            />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{profile?.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.email}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Nombre e imagen gestionados por Google</p>
          </div>
        </div>
      </div>

      {/* Sección de perfil editable */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Información profesional</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rol
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ej: Developer, Manager, Designer"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Empresa
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nombre de tu organización"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Puesto
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Ej: Senior Engineer, Product Lead"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Departamento
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Ej: Ingeniería, Marketing, Ventas"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          {profile?.updatedAt ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Última actualización: {new Date(profile.updatedAt).toLocaleDateString("es-MX", { dateStyle: "medium" })}
            </p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400">Guardado</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Verification:**
- [x] Run: `npm run dev`
- [ ] Navegar a `http://localhost:3000/dashboard/profile` — debe cargar el formulario con los campos vacíos (o con datos si ya se guardaron en Phase 2)
- [ ] Completar los 4 campos y hacer clic en "Guardar cambios" — debe aparecer "Guardado" brevemente
- [ ] Refrescar la página — los valores deben persistir (se cargan desde la BD)
- [ ] Verificar que la sección "Cuenta" muestra el avatar, nombre y email correctos (solo lectura)
- [ ] Verificar dark mode si aplica

---

### Phase 4: Navegación — agregar link "Perfil" en el Sidebar

**Goal**: Agregar un item de navegación "Mi perfil" en el Sidebar para que la página sea accesible desde el dashboard.

**Files to modify:**
- `src/components/Sidebar.tsx` — agregar entrada en el array `navItems` (línea 28)

**Implementation steps:**

1. En `src/components/Sidebar.tsx`, agregar un tercer item al array `navItems` (después del item de Estadísticas):

```typescript
{
  href: "/dashboard/profile",
  label: "Mi perfil",
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
},
```

**Verification:**
- [x] Run: `npm run dev`
- [ ] Verificar que el sidebar expandido muestra tres items: Calendario, Estadísticas, Mi perfil
- [ ] Verificar que el sidebar colapsado muestra el ícono de persona correctamente con tooltip "Mi perfil"
- [ ] Hacer clic en "Mi perfil" — debe navegar a `/dashboard/profile`
- [ ] Verificar que el item se resalta (active state) cuando se está en `/dashboard/profile`

---

## Edge Cases to Handle

- **Campos vacíos en PATCH**: el string vacío `""` se convierte a `null` en la BD (limpiar el campo) — implementado en el API route con `role.trim() || null`
- **Campos no enviados en PATCH**: `undefined` en Prisma `data:` hace que Prisma ignore ese campo — sólo se actualizan los campos incluidos en el body
- **Usuario no encontrado en GET**: retorna 404 (no debería ocurrir si está autenticado, pero se maneja defensivamente)
- **Token JWT expirado**: `getToken()` retorna `null` → 401. El middleware ya redirige a `/login` antes de llegar al cliente, por lo que en la práctica no llega a esta API route
- **Concurrencia**: si el usuario guarda dos veces rápido, el segundo PATCH sobreescribe al primero — aceptable para un formulario de perfil

## Out of Scope

- Cambiar nombre, email o avatar (gestionados por Google OAuth)
- Upload de foto de perfil personalizada
- Validaciones con Zod u otras librerías externas
- Tests unitarios para esta fase
- Configuración de notificaciones o preferencias adicionales

## Commands Reference

```bash
npm run dev                                          # servidor en localhost:3000
npx prisma migrate dev --name add_profile_fields    # Phase 1 — migración
npx prisma studio                                   # verificar datos en BD (localhost:5555)
npm test                                            # correr tests existentes
```
