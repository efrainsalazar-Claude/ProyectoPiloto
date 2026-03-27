---
date: 2026-03-26T03:30:00-03:00
git_commit: 6aac5aaa09e761fcaf36af62d471ea903f74a5fb
branch: main
status: complete
---

# Doc Research: 2026-03-26

## Resumen
- Docs existentes: **0 archivos técnicos** (docs/ vacía, solo .gitkeep)
- README: existe pero es el **boilerplate genérico de create-next-app** — no describe el proyecto
- Archivos con decisiones de arquitectura en thoughts/: **17 documentos**
- Archivos de código sin documentación técnica: **24 archivos**
- Archivos que necesitan doc urgente (seguridad/auth): **8 archivos**

---

## Estado de Documentación Existente

### Docs al día ✅
- `CLAUDE.md` — instrucciones de workflow para Claude Code, stack, comandos. Refleja el estado actual.
- `thoughts/shared/research/2026-03-13_google-oauth-nextauth-v5-prisma.md` — research de OAuth/Auth.js
- `thoughts/shared/research/2026-03-18_dashboard-sidebar-google-calendar.md` — **documento más completo**: contiene la razón definitiva de JWT strategy, flujo del access_token, elección de FullCalendar, Google Calendar API con plain fetch
- `thoughts/shared/research/2026-03-19_mejoras-ui-dashboard.md` — sidebar colapsable, ConditionalNavbar
- `thoughts/shared/security/2026-03-19_security-audit.md` — 24 hallazgos (referencia histórica, ya cerrados)
- `thoughts/shared/security/2026-03-19_validation.md` — confirma cierre de todos los hallazgos, documenta los nuevos módulos de seguridad
- `thoughts/shared/testing/2026-03-26_coverage-report.md` — 62 tests, 97% cobertura

### Docs desactualizados ⚠️
- `README.md` — boilerplate de create-next-app, no menciona CalendarAI, Google OAuth, stack real ni cómo configurar `.env`
- `thoughts/shared/plans/2026-03-13-google-oauth-auth.md` — especificaba `strategy: "database"` pero la implementación usa `"jwt"`
- `thoughts/shared/progress/dashboard-calendario-google-progress.md` — dice "Phase 3 of 5 complete" pero el proyecto está al 100%

### Sin documentación técnica ❌

#### Alta prioridad — lógica crítica de seguridad y autenticación (8 archivos)
- `auth.ts` — configuración central de Auth.js v5: JWT strategy, refresh token rotation, secureAdapter que elimina tokens OAuth de la BD. **No deducible sin leer 4 archivos juntos.**
- `auth.config.ts` — split config para Edge Runtime, `prompt: "consent"` y `access_type: "offline"` son pre-requisitos no documentados para el refresh token
- `middleware.ts` — instancia Edge de NextAuth (sin Prisma, sin refresh). Protege `/dashboard` y `/api/calendar/*`. El split pattern no está explicado en el archivo.
- `src/lib/get-access-token.ts` — razón de existir vs `getServerSession` es fundamental y no está documentada en el código
- `src/lib/rate-limiter.ts` — implementación in-memory con limitaciones críticas (no persiste entre reinicios, no se comparte entre instancias, Map crece indefinidamente)
- `app/api/calendar/events/route.ts` — paginación con `MAX_PAGES=10` (truncamiento silencioso), co-dependencia `singleEvents+orderBy`
- `app/api/calendar/events/[eventId]/route.ts` — `params` asíncrono de Next.js 15 (sorprende a quien migra desde v14), 204 con `new Response(null)` en lugar de `NextResponse`
- `prisma/schema.prisma` — modelos para Auth.js v5, relaciones Account/User/Session

#### Media prioridad — componentes y utilidades importantes (8 archivos)
- `src/components/CalendarView.tsx` — mecanismo de re-fetch por `key` (refreshKey), hash de colores determinístico por event.id, `weekends: false` silencioso, `allDay: !e.start.dateTime`
- `src/components/EventModal.tsx` — formulario de creación/edición de eventos
- `src/components/CalendarWithModal.tsx` — orquesta CalendarView + EventModal con `refreshKey`
- `src/components/Sidebar.tsx` — sidebar colapsable con estado de sesión
- `src/lib/calendar-validation.ts` — regex ISO8601 no acepta milisegundos ni HH:mm (más estricto que Google Calendar). Allowlist excluye `attendees`/`recurrence` intencionalmente.
- `src/lib/google-calendar.ts` — wrapper de Google Calendar API con manejo de errores HTTP
- `src/lib/env.ts` — validación de variables de entorno en startup
- `app/page.tsx` — landing page CalendarAI

#### Baja prioridad — configuración simple o thin wrappers (8 archivos)
- `src/lib/prisma.ts` — singleton Prisma
- `next.config.ts` — headers de seguridad HTTP
- `src/components/Navbar.tsx`
- `src/components/ConditionalNavbar.tsx`
- `src/components/GoogleSignInButton.tsx`
- `app/layout.tsx`
- `app/login/page.tsx`
- `app/dashboard/page.tsx`, `app/dashboard/layout.tsx`

---

## Decisiones de Arquitectura Encontradas en thoughts/

### 1. Por qué JWT strategy (no database sessions)
**Fuente**: `thoughts/shared/research/2026-03-18_dashboard-sidebar-google-calendar.md`

Con `strategy: "database"`, Auth.js no tiene mecanismo para adjuntar el `access_token` de Google al objeto de sesión. El `account.access_token` solo es accesible en el callback `jwt`, que solo existe en JWT strategy. Sin JWT strategy no hay forma de llamar a Google Calendar API en nombre del usuario.

### 2. Por qué el access_token no se expone al cliente
**Fuente**: `thoughts/shared/security/2026-03-19_security-audit.md` (CRIT-04) + `thoughts/shared/security/2026-03-19_validation.md`

El diseño original sí exponía `session.access_token` (accesible desde `useSession()` y `/api/auth/session`). La auditoría lo marcó como crítico. La solución fue crear `getServerToken()` en `src/lib/get-access-token.ts`, que lee el JWT desde la cookie httpOnly server-side usando `getToken()` de `next-auth/jwt`. El token nunca sale del servidor.

### 3. Por qué existe el split config (auth.ts vs auth.config.ts)
**Fuente**: `thoughts/shared/research/2026-03-13_google-oauth-nextauth-v5-prisma.md`

El middleware de Next.js corre en Edge Runtime, que no es compatible con Prisma (nativo de Node.js). Auth.js v5 requiere separar la configuración base (sin Prisma) en `auth.config.ts` para que el middleware pueda importarla. `auth.ts` importa `auth.config.ts` y agrega Prisma y los callbacks completos.

### 4. Por qué `prompt: "consent"` y `access_type: "offline"` son obligatorios
**Fuente**: `thoughts/shared/research/2026-03-18_dashboard-sidebar-google-calendar.md`

Sin `access_type: "offline"`, Google no devuelve `refresh_token`. Sin `prompt: "consent"`, en logins subsiguientes Google puede omitir el `refresh_token` (ya fue concedido antes). Si se quitan estos parámetros, el sistema funciona en el primer login pero rompe silenciosamente después de que expira el access_token.

### 5. Por qué `secureAdapter` elimina tokens OAuth antes de persistirlos
**Fuente**: `thoughts/shared/security/2026-03-19_validation.md` (hallazgo CRIT-03)

Con JWT strategy, los tokens OAuth en la tabla `Account` son datos sensibles sin utilidad: el sistema nunca los lee de la BD (los lee del JWT cookie). La corrección fue un override de `linkAccount` en el PrismaAdapter que elimina `access_token`, `refresh_token`, `id_token` antes del INSERT.

### 6. Limitaciones del rate limiter en producción
**Fuente**: análisis del código (sin documentar en thoughts/)

El rate limiter es in-memory: el Map se pierde en cada reinicio del servidor, no se comparte entre instancias de Vercel serverless. En producción con múltiples workers, cada instancia tiene su propio conteo independiente — el límite efectivo es `30 * N_instancias`.

### 7. Por qué `MAX_PAGES = 10` en la paginación de eventos
**Fuente**: `thoughts/shared/security/2026-03-19_security-audit.md` (MED-04)

Sin límite, un calendario con miles de eventos podría causar bucles de paginación que agotan memoria o exceden cuotas de la API de Google. El límite silencioso (25.000 eventos máximo) no se reporta al cliente.

---

## Estructura docs/ Recomendada

```
docs/
├── README.md              ← (mover contenido del README raíz o linkar)
├── architecture/
│   ├── overview.md        ← flujo general: login → token → calendar API
│   ├── auth-flow.md       ← JWT strategy, split config, refresh token rotation
│   └── security.md        ← decisiones de seguridad: secureAdapter, getServerToken, rate limiter
├── api/
│   ├── calendar-events.md ← GET/POST /api/calendar/events
│   └── calendar-event-id.md ← PATCH/DELETE /api/calendar/events/[eventId]
├── components/
│   ├── CalendarView.md    ← re-fetch por refreshKey, hash de colores, formato de fechas
│   ├── EventModal.md      ← formulario, validaciones, campos permitidos
│   └── CalendarWithModal.md ← orquestación, estado compartido
└── lib/
    ├── get-access-token.md ← por qué vs getServerSession, userId = Google sub
    ├── rate-limiter.md     ← limitaciones in-memory, defaults, producción
    └── calendar-validation.md ← regex ISO8601, allowlist, campos excluidos
```

**Actualizar también:**
- `README.md` (raíz) — reemplazar boilerplate con descripción real del proyecto, stack, setup, variables de entorno

---

## Gaps en Research
- No se revisó `src/lib/google-calendar.ts` en detalle (complejidad del manejo de errores HTTP)
- No se inspeccionó `EventModal.tsx` internamente (se conoce su propósito pero no sus detalles)
- No se verificó si hay docs en `src/` (JSDoc inline en los archivos actuales)
- No se analizó `next.config.ts` para documentar los headers de seguridad específicos configurados
