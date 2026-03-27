---
date: 2026-03-26T03:45:00-03:00
type: documentation
research_ref: thoughts/shared/docs/2026-03-26_doc-research.md
status: in-progress
---

# Plan: Documentation — 2026-03-26

## Objetivo
Documentar los 16 archivos más críticos del proyecto en `docs/` y actualizar el `README.md`,
para que un desarrollador nuevo pueda entender el sistema sin necesidad de leer todo el código.
Énfasis en las decisiones de arquitectura no obvias que hoy solo viven en `thoughts/`.

## Audiencia
Desarrolladores internos del proyecto (no API pública).

## Estructura de carpetas a crear
```
docs/
├── architecture/
│   ├── auth-flow.md        ← JWT strategy, split config, refresh token rotation, secureAdapter
│   └── security.md         ← decisiones de seguridad: getServerToken, rate limiter, headers HTTP
├── api/
│   ├── calendar-events.md  ← GET/POST /api/calendar/events
│   └── calendar-eventid.md ← PATCH/DELETE /api/calendar/events/[eventId]
├── components/
│   ├── CalendarView.md     ← re-fetch por refreshKey, hash de colores, formato de fechas
│   ├── EventModal.md       ← formulario, validaciones, campos permitidos
│   └── CalendarWithModal.md ← orquestación con refreshKey
└── lib/
    ├── get-access-token.md  ← por qué vs getServerSession, userId = Google sub
    ├── rate-limiter.md      ← limitaciones in-memory, producción
    └── calendar-validation.md ← regex ISO8601, allowlist, campos excluidos

README.md (raíz) — reemplazar boilerplate
```

---

## Fase 1: README principal 📖
**Archivo a modificar**: `README.md` (raíz del proyecto)

**Contenido a incluir:**
- Nombre y descripción: CalendarAI — dashboard de calendario con Google Calendar integrado
- Stack con versiones: Next.js 16.2, TypeScript, Auth.js v5 beta, Prisma 7, PostgreSQL, Tailwind CSS 4
- Requisitos previos: Node.js 24+, PostgreSQL local en puerto 5432, cuenta de Google Cloud Console
- Setup paso a paso:
  1. `npm install`
  2. Copiar `.env.example` → `.env` y completar las 4 variables
  3. `npx prisma migrate dev`
  4. `npm run dev`
- Variables de entorno (con descripción de cómo obtener cada una):
  - `DATABASE_URL` — string de conexión a PostgreSQL
  - `AUTH_GOOGLE_ID` — Client ID de Google Cloud Console
  - `AUTH_GOOGLE_SECRET` — Client Secret de Google Cloud Console
  - `AUTH_SECRET` — string aleatorio (generar con `openssl rand -base64 32`)
- Comandos disponibles: `npm run dev`, `npm test`, `npm run build`, `npx prisma studio`
- Link a `docs/` para documentación técnica

**Verificación:**
- [ ] Un desarrollador nuevo puede levantar el proyecto siguiendo solo el README
- [ ] El archivo `.env.example` coincide con las variables documentadas

---

## Fase 2: Flujo de autenticación 🔐
**Archivo a crear**: `docs/architecture/auth-flow.md`

**Por qué es la doc más crítica**: el flujo JWT + refresh + split config involucra 4 archivos
(`auth.config.ts`, `auth.ts`, `middleware.ts`, `src/lib/get-access-token.ts`) y
ninguno de ellos explica el sistema completo.

**Contenido:**
- Diagrama textual del flujo completo:
  ```
  Login → Google OAuth → auth.ts callback jwt → JWT cookie (httpOnly)
       → Requests subsiguientes → middleware.ts verifica JWT (solo firma)
       → Route handler → getServerToken() → getToken() lee JWT cookie
       → calendarRequest() con access_token
  ```
- **Por qué JWT strategy (no database sessions)**: Con `strategy: "database"`, el `access_token`
  de Google no es accesible desde los route handlers. El callback `jwt` es la única forma de
  capturarlo — y ese callback solo existe en JWT strategy.
- **Split config pattern**: `auth.config.ts` (sin Prisma, Edge-compatible) vs `auth.ts` (con Prisma
  y todos los callbacks). Necesario porque el middleware corre en Edge Runtime donde Prisma no compila.
- **Refresh token rotation manual**: el callback `jwt` en `auth.ts` detecta expiración
  (`Date.now() >= token.expires_at * 1000`) y hace fetch a `https://oauth2.googleapis.com/token`.
  Si falla, pone `error: "RefreshTokenError"` en el token.
- **Por qué `prompt: "consent"` + `access_type: "offline"` son obligatorios**: Sin ellos, Google
  omite el `refresh_token` en logins subsiguientes, rompiendo el sistema silenciosamente.
- **secureAdapter**: `linkAccount` sobreescrito para eliminar `access_token`, `refresh_token`,
  `id_token` antes del INSERT. Con JWT strategy estos tokens en la BD son datos sensibles sin
  utilidad (el sistema nunca los lee de ahí).
- Qué pasa cuando llega `RefreshTokenError` al cliente (el componente debe redirigir a `/login`)

**Archivos fuente a leer**: `auth.ts`, `auth.config.ts`, `middleware.ts`, `src/lib/get-access-token.ts`

**Verificación:**
- [ ] El diagrama refleja exactamente el código actual
- [ ] Las 5 decisiones de diseño están explicadas con su "por qué"

---

## Fase 3: Decisiones de seguridad 🛡️
**Archivo a crear**: `docs/architecture/security.md`

**Contenido:**
- **getServerToken vs getServerSession**: `getServerSession()` no expone el `access_token` al
  servidor (fue removido intencionalmente del session callback). `getServerToken()` lee el JWT
  cookie directamente via `getToken()` de `next-auth/jwt`. El token nunca llega al cliente.
- **Rate limiter — limitaciones en producción**:
  - In-memory: el Map se pierde en cada reinicio del servidor
  - No se comparte entre instancias serverless (Vercel): en producción el límite efectivo es
    `30 req/min * N_instancias`
  - El Map crece sin eviction de entradas expiradas (solo se sobreescriben cuando llega una nueva
    petición del mismo userId después de que venció la ventana)
  - Límite aplica por `userId` (Google Subject ID), no por IP
- **Doble verificación de autenticación**: el middleware rechaza requests no autenticados, Y los
  route handlers también llaman a `getServerToken()`. La redundancia es defensa en profundidad,
  no duplicación accidental.
- **Resumen de los 8 headers HTTP de seguridad** configurados en `next.config.ts` (CSP, HSTS,
  X-Frame-Options, etc.) y su propósito
- **Actualizaciones de Next.js**: versión 16.2.0 cierra CVE-2025-55182 (RCE via cache poisoning),
  CVE-2025-29927 (middleware bypass via x-middleware-subrequest), CVE-2025-57822

**Archivos fuente a leer**: `src/lib/get-access-token.ts`, `src/lib/rate-limiter.ts`,
`middleware.ts`, `next.config.ts`

**Verificación:**
- [ ] Las limitaciones del rate limiter están documentadas claramente
- [ ] Los headers HTTP en `next.config.ts` coinciden con los documentados

---

## Fase 4: API Reference — Calendar Events 🔌
**Archivos a crear**:
- `docs/api/calendar-events.md` — GET y POST
- `docs/api/calendar-eventid.md` — PATCH y DELETE

**Contenido por endpoint (formato estándar):**
```
## GET /api/calendar/events
**Auth requerida**: sí (cookie de sesión Auth.js)
**Rate limit**: 30 req/min por usuario

### Query params
| Param | Tipo | Requerido | Descripción |
...

### Responses
| Status | Cuándo | Body |
...

### Notas
- Paginación automática hasta MAX_PAGES=10 (25.000 eventos máximo, truncamiento silencioso)
- singleEvents=true expande recurrentes en instancias individuales
- orderBy=startTime requiere singleEvents=true
```

**Puntos no obvios a incluir en cada doc:**
- GET: truncamiento silencioso al llegar a MAX_PAGES=10
- GET: todos los errores de Google Calendar colapsan en 500 genérico
- POST: qué campos acepta el body (allowlist de 9 campos de `calendar-validation.ts`)
- PATCH: `params` es `Promise<{eventId}>` en Next.js 15 (breaking change vs v14)
- DELETE: usa `new Response(null, {status: 204})` en lugar de `NextResponse` (204 no debe tener body)
- Ambos: validación de `eventId`: alfanumérico + `_-`, 5-1024 chars

**Archivos fuente a leer**: `app/api/calendar/events/route.ts`,
`app/api/calendar/events/[eventId]/route.ts`, `src/lib/calendar-validation.ts`

**Verificación:**
- [ ] Todos los status codes posibles de cada endpoint están documentados
- [ ] El formato de `timeMin`/`timeMax` (ISO 8601 con timezone obligatorio) está documentado
- [ ] El allowlist de campos para POST/PATCH está completo

---

## Fase 5: Componentes del calendario 🗓️
**Archivos a crear**:
- `docs/components/CalendarView.md`
- `docs/components/EventModal.md`
- `docs/components/CalendarWithModal.md`

**CalendarView.md — puntos clave:**
- Props: `onSelectSlot?`, `onEventClick?`
- Re-fetch automático al cambiar el rango visible (datesSet de FullCalendar)
- **Patrón refreshKey**: CalendarView no expone un método de re-fetch. Para forzar un re-fetch
  externo, el padre debe cambiar la `key` del componente (así lo hace CalendarWithModal)
- `weekends: false` oculta sábado y domingo (no hay indicador en UI)
- `allDay: !e.start.dateTime` — detección de eventos de día completo de Google Calendar
- Hash de colores determinístico por `event.id`: el mismo evento siempre tiene el mismo color

**EventModal.md — puntos clave:**
- Casos: crear nuevo evento (slot vacío) vs editar existente (click en evento)
- Campos del formulario y cuáles son requeridos
- Qué campos envía al API y cuáles omite (solo los del allowlist)

**CalendarWithModal.md — puntos clave:**
- Orquesta CalendarView + EventModal
- Estado `refreshKey` (número): se incrementa después de crear/editar para forzar re-fetch
- Cómo maneja `onSelectSlot` (abrir modal vacío) vs `onEventClick` (abrir modal con datos)

**Archivos fuente a leer**: `src/components/CalendarView.tsx`,
`src/components/EventModal.tsx`, `src/components/CalendarWithModal.tsx`

**Verificación:**
- [ ] El patrón refreshKey está explicado con ejemplo
- [ ] Los campos del formulario de EventModal coinciden con el allowlist de calendar-validation

---

## Fase 6: Lib utilities 🔧
**Archivos a crear**:
- `docs/lib/get-access-token.md`
- `docs/lib/rate-limiter.md`
- `docs/lib/calendar-validation.md`

**get-access-token.md:**
- Por qué no usar `getServerSession()` (no expone access_token — removido por seguridad)
- `getServerToken(req)` → `{accessToken, userId, error}` desde JWT cookie httpOnly
- `getAccessToken(req)` → string | null (wrapper simplificado)
- `userId` es el `sub` del JWT (Google Subject ID), NO el `id` de la tabla `User` de Prisma
- Verificar `error === "RefreshTokenError"` es obligatorio en cada caller

**rate-limiter.md:**
- Interface: `checkRateLimit(userId, limit=30, windowMs=60_000): boolean`
- Defaults: 30 req/min por userId
- ⚠️ Limitaciones de producción (ver docs/architecture/security.md)
- No lanza — devuelve `false` silenciosamente cuando se excede el límite

**calendar-validation.md:**
- `isValidISO8601(value)`: requiere segundos y timezone explícito. **No acepta milisegundos**
  (`2024-01-01T10:00:00.000Z` falla). No acepta `HH:mm` sin segundos.
- `isValidEventId(value)`: alfanumérico + `_-`, 5-1024 chars
- `sanitizeEventBody(body)`: allowlist de 9 campos:
  `summary, description, location, start, end, colorId, reminders, visibility, status`
  — `attendees` y `recurrence` están excluidos intencionalmente (fuera de scope del MVP)

**Archivos fuente a leer**: `src/lib/get-access-token.ts`, `src/lib/rate-limiter.ts`,
`src/lib/calendar-validation.ts`

**Verificación:**
- [ ] El allowlist de `sanitizeEventBody` coincide con el código actual
- [ ] Las restricciones del regex ISO8601 están documentadas con ejemplos de qué acepta y rechaza

---

## Criterios de Éxito
- [x] `README.md` actualizado — cubre setup completo del proyecto
- [x] `docs/architecture/auth-flow.md` — explica el sistema completo de auth en un solo lugar
- [x] `docs/architecture/security.md` — documenta limitaciones del rate limiter y decisiones de seguridad
- [x] `docs/api/calendar-events.md` y `docs/api/calendar-eventid.md` — todos los endpoints con todos los status codes
- [x] `docs/components/` — los 3 componentes del calendario documentados
- [x] `docs/lib/` — los 3 módulos de lib con sus gotchas documentados
- [x] Ningún doc referencia archivos que no existen
- [x] Total: **10 archivos de documentación** (1 README + 9 en docs/)

## Comandos de verificación
```bash
# Verificar que todos los archivos existen
ls docs/architecture/ docs/api/ docs/components/ docs/lib/

# Verificar que el README menciona las 4 variables de entorno
grep -E "DATABASE_URL|AUTH_GOOGLE_ID|AUTH_GOOGLE_SECRET|AUTH_SECRET" README.md
```

## Out of Scope
- Documentación de páginas simples (`app/layout.tsx`, `app/login/page.tsx`, etc.)
- JSDoc inline en archivos de código
- Documentación del sistema de agentes Claude Code (`.claude/`)
- Schema de Prisma (los modelos están bien nombrados y son estándar de Auth.js)
- Tests — la suite está documentada en `thoughts/shared/testing/2026-03-26_coverage-report.md`
- CHANGELOG del proyecto
- Guía de deployment en producción
