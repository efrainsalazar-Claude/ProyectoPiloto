---
date: 2026-03-19T18:25:00-03:00
type: security
audit_ref: thoughts/shared/security/2026-03-19_security-audit.md
status: complete
---

# Plan: Security Fixes — 2026-03-19

## Objetivo
Cerrar 24 vulnerabilidades identificadas en la auditoría del 2026-03-19.

## Referencia
Auditoría: `thoughts/shared/security/2026-03-19_security-audit.md`

## Nota sobre CVEs de Next.js
La versión instalada `16.1.6` **sí existe en npm oficial** (la auditoría fue incorrecta en MED-06).
Como `16.1.6 > 15.4.7`, los CVEs CRIT-01, CRIT-02, HIGH-06 y HIGH-07 ya están parchados en
la versión actual. La Fase 1 actualiza a `16.2.0` (latest) para asegurar todos los parches.

---

## Fases (priorizadas por severidad)

---

### Fase 1: Actualizar Next.js a latest 🔴
**Hallazgos que resuelve**: CRIT-01, CRIT-02 (parcial), HIGH-06, HIGH-07, MED-06

**Contexto**: Next.js 16.1.6 ya tiene los CVEs parchados (> 15.4.7), pero 16.2.0 tiene
parches adicionales. La actualización es un one-liner de bajo riesgo.

**Archivos a modificar:**
- `package.json` — bumping `next` y `eslint-config-next` de `16.1.6` → `16.2.0`

**Implementación:**
1. Editar `package.json`: cambiar `"next": "16.1.6"` → `"next": "16.2.0"` y
   `"eslint-config-next": "16.1.6"` → `"eslint-config-next": "16.2.0"`
2. Correr `npm install` para actualizar `node_modules` y `package-lock.json`
3. Correr `npm run build` para verificar que no hay breaking changes

**Verificación:**
- [x] `node -e "console.log(require('./node_modules/next/package.json').version)"` imprime `16.2.0`
- [x] `npm run build` completa sin errores
- [ ] App carga en `localhost:3000` y login con Google funciona

---

### Fase 2: Remover access_token de la sesión del cliente 🔴
**Hallazgos que resuelve**: CRIT-04, LOW-04

**Contexto**: El callback `session` copia `token.access_token` al objeto de sesión, que Auth.js
expone en `/api/auth/session` (accesible desde el cliente). Los route handlers necesitan el token
para llamar a Google, pero pueden obtenerlo del JWT httpOnly usando `getToken()` sin exponerlo.

**Archivos a modificar:**
- `auth.ts` — remover `session.access_token` del callback session; limpiar type augmentation
- `app/api/calendar/events/route.ts` — usar `getToken()` en lugar de `session.access_token`
- `app/api/calendar/events/[eventId]/route.ts` — usar `getToken()` en lugar de `session.access_token`

**Implementación:**
1. En `auth.ts`, modificar el callback `session`:
   ```ts
   async session({ session, token }) {
     // NO copiar access_token al session — queda solo en el JWT (httpOnly cookie)
     session.error = token.error as "RefreshTokenError" | undefined
     return session
   }
   ```
2. En `auth.ts`, eliminar `access_token: string` de la augmentación del módulo `Session`
3. Crear helper server-side `src/lib/get-access-token.ts`:
   ```ts
   import { getToken } from 'next-auth/jwt'
   import { NextRequest } from 'next/server'

   export async function getAccessToken(req: NextRequest): Promise<string | null> {
     const token = await getToken({ req, secret: process.env.AUTH_SECRET })
     return (token?.access_token as string) ?? null
   }
   ```
4. En ambos route handlers, reemplazar:
   ```ts
   // Antes:
   const session = await auth()
   if (!session?.access_token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
   // usa session.access_token

   // Después:
   import { getAccessToken } from '@/src/lib/get-access-token'
   // en el handler, el segundo arg es el Request de Next.js:
   export async function GET(request: NextRequest) {
     const accessToken = await getAccessToken(request)
     if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
     // usa accessToken
   }
   ```

**Verificación:**
- [ ] `fetch('/api/auth/session')` en el navegador NO incluye `access_token` en la respuesta
- [ ] `useSession()` en el cliente NO tiene propiedad `access_token`
- [ ] Los endpoints `/api/calendar/events` siguen funcionando (carga el calendario)
- [x] `npm run build` sin errores de TypeScript

---

### Fase 3: Defensa en profundidad en middleware 🔴
**Hallazgos que resuelve**: CRIT-02 (segunda línea), HIGH-02

**Contexto**: El middleware solo protege `/dashboard`. Las rutas `/api/calendar/*` no tienen
protección de middleware. Aunque el CVE-2025-29927 ya está parchado por la actualización de
Next.js, agregar `auth()` como guardia secundaria en Server Components del dashboard y
extender el middleware a las API routes establece defensa en profundidad.

**Archivos a modificar:**
- `middleware.ts` — extender protección a `/api/calendar/*`
- `app/dashboard/page.tsx` (y otros Server Components del dashboard) — agregar `auth()` check

**Implementación:**
1. En `middleware.ts`, extender el matcher y la lógica:
   ```ts
   const isProtected =
     req.nextUrl.pathname.startsWith("/dashboard") ||
     req.nextUrl.pathname.startsWith("/api/calendar")

   if (isProtected && !isLoggedIn) {
     // Para API routes, devolver 401 en lugar de redirect
     if (req.nextUrl.pathname.startsWith("/api/")) {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
     }
     return NextResponse.redirect(new URL("/login", req.url))
   }
   ```
2. En `app/dashboard/page.tsx`, agregar al inicio:
   ```ts
   import { auth } from '@/auth'
   import { redirect } from 'next/navigation'

   export default async function DashboardPage() {
     const session = await auth()
     if (!session) redirect('/login')
     // ... resto del componente
   }
   ```
3. Repetir el check de auth en cualquier otro Server Component bajo `/dashboard/`

**Verificación:**
- [x] Acceder a `/dashboard` sin sesión redirige a `/login` (middleware + layout auth guard)
- [x] Acceder a `/api/calendar/events` sin sesión retorna `{ "error": "Unauthorized" }` con status 401 (middleware)
- [ ] Con sesión válida, el calendario carga correctamente

---

### Fase 4: No almacenar tokens OAuth en la base de datos 🔴
**Hallazgos que resuelve**: CRIT-03, LOW-03

**Contexto**: El Prisma adapter almacena `access_token`, `refresh_token` e `id_token` en la tabla
`Account` durante el sign-in. Con JWT strategy, estos campos nunca se leen de vuelta — son
una copia muerta en texto plano. Se override el adapter para limpiarlos antes de persistir.

**Archivos a modificar:**
- `auth.ts` — override del Prisma adapter para no almacenar tokens sensibles

**Implementación:**
1. En `auth.ts`, reemplazar la instancia del adapter con una versión que limpia los tokens:
   ```ts
   import { PrismaAdapter } from '@auth/prisma-adapter'

   const baseAdapter = PrismaAdapter(prisma)
   const secureAdapter = {
     ...baseAdapter,
     createAccount: async (account: Parameters<typeof baseAdapter.createAccount>[0]) => {
       const { access_token, refresh_token, id_token, ...safeAccount } = account
       return baseAdapter.createAccount(safeAccount)
     },
   }

   export const { handlers, auth, signIn, signOut } = NextAuth({
     adapter: secureAdapter,
     // ... resto de la config
   })
   ```
2. Nota: NO es necesario migración de Prisma (los campos siguen siendo `String?` en el schema —
   simplemente quedarán como `null` para cuentas creadas después del fix).
3. Correr una query manual para limpiar tokens existentes (opcional, para usuarios ya registrados):
   ```sql
   UPDATE "Account" SET access_token = NULL, refresh_token = NULL, id_token = NULL;
   ```
   Esto se puede hacer desde Prisma Studio.

**Verificación:**
- [ ] Después de un sign-in nuevo, la tabla `Account` tiene `access_token = NULL`
- [ ] El login y el calendario siguen funcionando (los tokens se obtienen del JWT, no de la BD)
- [x] `npm run build` sin errores

---

### Fase 5: Headers de seguridad HTTP 🟠
**Hallazgos que resuelve**: HIGH-01

**Archivos a modificar:**
- `next.config.ts` — agregar `headers()` con security headers + `poweredByHeader: false`

**Implementación:**
1. Reemplazar el contenido de `next.config.ts`:
   ```ts
   import type { NextConfig } from 'next'

   const securityHeaders = [
     { key: 'X-Content-Type-Options', value: 'nosniff' },
     { key: 'X-Frame-Options', value: 'DENY' },
     { key: 'X-XSS-Protection', value: '1; mode=block' },
     { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
     { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
     {
       key: 'Strict-Transport-Security',
       value: 'max-age=63072000; includeSubDomains; preload',
     },
     {
       key: 'Content-Security-Policy',
       value: [
         "default-src 'self'",
         "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval necesario para Next.js dev
         "style-src 'self' 'unsafe-inline'",
         "img-src 'self' data: https://lh3.googleusercontent.com",
         "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
         "frame-ancestors 'none'",
       ].join('; '),
     },
   ]

   const nextConfig: NextConfig = {
     poweredByHeader: false,
     images: {
       remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }],
     },
     async headers() {
       return [{ source: '/(.*)', headers: securityHeaders }]
     },
   }

   export default nextConfig
   ```

**Verificación:**
- [ ] En DevTools > Network > Response Headers de cualquier página, aparecen `X-Frame-Options`, `Content-Security-Policy`, etc.
- [ ] NO aparece header `X-Powered-By`
- [ ] La app carga sin errores de CSP en la consola del navegador
- [x] `npm run build` sin errores

---

### Fase 6: Validación de inputs en endpoints de Calendar 🟠
**Hallazgos que resuelve**: HIGH-03, HIGH-04, HIGH-05

**Archivos a modificar:**
- `app/api/calendar/events/route.ts` — validar `timeMin`/`timeMax` y body del POST
- `app/api/calendar/events/[eventId]/route.ts` — validar `eventId` y body del PATCH

**Implementación:**

1. Crear helper de validación `src/lib/calendar-validation.ts`:
   ```ts
   // Formato ISO 8601: YYYY-MM-DDTHH:mm:ssZ o YYYY-MM-DDThh:mm:ss±HH:mm
   const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/

   // Google Calendar event IDs: 5–1024 caracteres alfanuméricos + guion bajo
   const EVENT_ID_REGEX = /^[a-zA-Z0-9_-]{5,1024}$/

   export function isValidISO8601(value: string): boolean {
     return ISO8601_REGEX.test(value)
   }

   export function isValidEventId(value: string): boolean {
     return EVENT_ID_REGEX.test(value)
   }

   // Campos permitidos en POST/PATCH (allowlist de la Google Calendar Event API)
   const ALLOWED_EVENT_FIELDS = new Set([
     'summary', 'description', 'location', 'start', 'end',
     'colorId', 'reminders', 'visibility', 'status',
   ])

   export function sanitizeEventBody(body: Record<string, unknown>): Record<string, unknown> {
     return Object.fromEntries(
       Object.entries(body).filter(([key]) => ALLOWED_EVENT_FIELDS.has(key))
     )
   }
   ```

2. En `app/api/calendar/events/route.ts`:
   - En GET: después de verificar presencia de `timeMin`/`timeMax`, agregar:
     ```ts
     if (!isValidISO8601(timeMin) || !isValidISO8601(timeMax)) {
       return NextResponse.json({ error: 'Invalid date format. Use ISO 8601.' }, { status: 400 })
     }
     ```
   - En POST: reemplazar `const body = await request.json()` con:
     ```ts
     const rawBody = await request.json()
     const body = sanitizeEventBody(rawBody)
     if (!body.summary || !body.start || !body.end) {
       return NextResponse.json({ error: 'Missing required fields: summary, start, end' }, { status: 400 })
     }
     ```

3. En `app/api/calendar/events/[eventId]/route.ts`:
   - Al inicio de PATCH y DELETE:
     ```ts
     if (!isValidEventId(eventId)) {
       return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 })
     }
     ```
   - En PATCH, reemplazar el deep-clone con:
     ```ts
     const rawBody = await request.json()
     const patch = sanitizeEventBody(rawBody)
     ```

**Verificación:**
- [x] `GET /api/calendar/events?timeMin=notadate&timeMax=notadate` retorna 400
- [x] `POST /api/calendar/events` con body `{ "attendees": [...] }` no pasa el campo `attendees` a Google
- [x] `PATCH /api/calendar/events/../../etc` retorna 400 por invalid event ID
- [ ] Crear y editar eventos normalmente sigue funcionando

---

### Fase 7: Validación de variables de entorno y manejo de errores 🟠
**Hallazgos que resuelve**: HIGH-08, MED-01

**Archivos a modificar:**
- `src/lib/env.ts` (nuevo) — validación de variables en startup
- `src/lib/prisma.ts` — usar env validado
- `auth.ts` — usar env validado
- `app/api/calendar/events/[eventId]/route.ts` — agregar try/catch en PATCH y DELETE

**Implementación:**
1. Crear `src/lib/env.ts`:
   ```ts
   function requireEnv(name: string): string {
     const value = process.env[name]
     if (!value) throw new Error(`Missing required environment variable: ${name}`)
     return value
   }

   export const env = {
     DATABASE_URL: requireEnv('DATABASE_URL'),
     AUTH_GOOGLE_ID: requireEnv('AUTH_GOOGLE_ID'),
     AUTH_GOOGLE_SECRET: requireEnv('AUTH_GOOGLE_SECRET'),
     AUTH_SECRET: requireEnv('AUTH_SECRET'),
   }
   ```

2. En `src/lib/prisma.ts`, reemplazar `process.env.DATABASE_URL!` con `env.DATABASE_URL`
3. En `auth.ts`, reemplazar `process.env.AUTH_GOOGLE_ID!` y `process.env.AUTH_GOOGLE_SECRET!`
   con `env.AUTH_GOOGLE_ID` y `env.AUTH_GOOGLE_SECRET`

4. En `app/api/calendar/events/[eventId]/route.ts`, envolver PATCH y DELETE en try/catch:
   ```ts
   // PATCH:
   try {
     const event = await calendarRequest(...)
     return NextResponse.json(event)
   } catch (err) {
     console.error('[PATCH /api/calendar/events/:id]', err)
     return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
   }

   // DELETE:
   try {
     await calendarRequest(...)
     return new Response(null, { status: 204 })
   } catch (err) {
     console.error('[DELETE /api/calendar/events/:id]', err)
     return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
   }
   ```

**Verificación:**
- [ ] Si se elimina `DATABASE_URL` del `.env`, el servidor arranca y lanza un error claro en consola
- [x] Un PATCH a un eventId inexistente retorna 500 con `{ "error": "Failed to update event" }` (no un stack trace)
- [x] `npm run build` sin errores de TypeScript

---

### Fase 8: Fixes medios 🟡
**Hallazgos que resuelve**: MED-02, MED-03, MED-04, MED-05, MED-07

#### MED-02 — Rate limiting básico
**Archivos**: `app/api/calendar/events/route.ts`, `app/api/calendar/events/[eventId]/route.ts`
- Implementar rate limiting in-memory por usuario usando un Map (simple, sin dependencias):
  ```ts
  // src/lib/rate-limiter.ts
  const requests = new Map<string, { count: number; resetAt: number }>()

  export function checkRateLimit(userId: string, limit = 30, windowMs = 60_000): boolean {
    const now = Date.now()
    const entry = requests.get(userId)
    if (!entry || now > entry.resetAt) {
      requests.set(userId, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= limit) return false
    entry.count++
    return true
  }
  ```
- En cada handler, verificar después del auth check:
  ```ts
  if (!checkRateLimit(session.user.id)) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
  }
  ```
- **Nota**: Este rate limiter es in-memory y se resetea al reiniciar. Para producción real,
  considerar Upstash Redis o similar. Incluir en `## Out of Scope` la versión con persistencia.

#### MED-03 — Límite de paginación
**Archivo**: `app/api/calendar/events/route.ts`
- Agregar contador al bucle `while(true)`:
  ```ts
  let pageCount = 0
  const MAX_PAGES = 10  // máximo 2500 eventos (250 por página × 10)
  while (true) {
    if (++pageCount > MAX_PAGES) break
    // ... resto del loop
  }
  ```

#### MED-04 — Verificar RefreshTokenError en guards
**Archivos**: `app/api/calendar/events/route.ts`, `app/api/calendar/events/[eventId]/route.ts`
- Después del auth check, agregar:
  ```ts
  if (session?.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Session expired, please sign in again' }, { status: 401 })
  }
  ```
- **Nota**: Con la Fase 2, el guard usa `getToken()` directamente. Verificar que
  `token.error === 'RefreshTokenError'` se chequea en el helper o en los handlers.

#### MED-05 — Fijar next-auth en versión no-beta
**Archivo**: `package.json`
- Cambiar `"next-auth": "^5.0.0-beta.30"` por la versión beta más estable disponible con
  pin exacto, o esperar el release estable de Auth.js v5.
- Verificar en npm: `npm view next-auth dist-tags` para encontrar la versión recomendada.
- Cambiar `^` por `~` o pin exacto para evitar actualizaciones automáticas de breaking changes.

#### MED-07 — Singleton Prisma en producción
**Archivo**: `src/lib/prisma.ts`
- El código actual omite el singleton en producción deliberadamente (patrón Next.js estándar).
  Next.js en producción no hace hot-reload, así que cada worker de Node.js crea un cliente
  (lo cual es correcto para serverless). El riesgo real solo aplica si se usa un servidor
  persistente (ej: `node server.js`). Cambio: agregar el singleton también en producción:
  ```ts
  export const prisma = globalForPrisma.prisma ?? createPrismaClient()
  globalForPrisma.prisma = prisma  // siempre, incluyendo producción
  ```

**Verificación de Fase 8:**
- [x] 31 requests en 60 segundos al mismo endpoint retornan 429 en la 31°
- [x] Un usuario con más de 2500 eventos no causa OOM (el loop corta en página 10)
- [x] Un token revocado recibe 401 en lugar de pasar el guard
- [x] `npm run build` sin errores

---

### Fase 9: Fixes bajos 🔵
**Hallazgos que resuelve**: LOW-01, LOW-02, LOW-05

#### LOW-01 — Sanitizar console.error en cliente
**Archivo**: `src/components/CalendarView.tsx:75`
- Reemplazar:
  ```ts
  console.error("Error fetching calendar events:", err)
  ```
  con:
  ```ts
  console.error("Error fetching calendar events")  // sin el objeto de error
  ```

#### LOW-02 — Mejorar callback redirect (callbackUrl)
**Archivo**: `auth.config.ts:25-28`
- Cambiar el callback para respetar redirects internos pero bloquear externos:
  ```ts
  async redirect({ url, baseUrl }) {
    // Permitir redirects relativos o del mismo origen
    if (url.startsWith('/')) return `${baseUrl}${url}`
    if (new URL(url).origin === baseUrl) return url
    return baseUrl
  }
  ```

#### LOW-05 — Crear .env.example
**Archivo**: `.env.example` (nuevo)
- Crear con todas las variables requeridas sin valores:
  ```
  DATABASE_URL=postgresql://user:password@localhost:5432/proyecto_piloto_db
  AUTH_SECRET=generate-with-openssl-rand-base64-32
  AUTH_GOOGLE_ID=your-google-client-id.apps.googleusercontent.com
  AUTH_GOOGLE_SECRET=your-google-client-secret
  ```

**Verificación de Fase 9:**
- [x] En producción, `console.error` de fetches fallidos no incluye el objeto de error
- [ ] Login con `?callbackUrl=/dashboard` redirige a `/dashboard` post-login
- [x] El archivo `.env.example` existe y documenta todas las variables necesarias
- [x] `npm run build` sin errores

---

## Comandos de referencia
```bash
npm install                             # después de cambios en package.json
npm run build                           # verificar compilación después de cada fase
npm run dev                             # probar en localhost:3000
npx prisma studio                       # inspeccionar tabla Account para Fase 4
```

## Out of Scope
- **Cifrado de tokens en BD**: con JWT strategy los tokens en DB son copia muerta — la Fase 4
  opta por no almacenarlos en lugar de cifrarlos (más simple y igualmente seguro).
- **Rate limiting con persistencia**: la Fase 8 usa in-memory; para producción multi-instancia
  se necesitaría Upstash Redis u otro store distribuido.
- **XSS en componentes React**: no auditado — verificar que datos de Google Calendar API
  se renderizan via JSX (React escapa automáticamente) y no via `dangerouslySetInnerHTML`.
- **Configuración de PostgreSQL**: permisos de usuario de BD, firewall, SSL — fuera del scope
  de la app.
- **Tests de seguridad automatizados**: el proyecto no tiene suite de tests.
- **Dependencias transitivas**: `npm audit` en profundidad para FullCalendar y otras.
- **LOW-03** (id_token en BD): cubierto implícitamente por Fase 4 (el adapter override
  también limpia `id_token`).
