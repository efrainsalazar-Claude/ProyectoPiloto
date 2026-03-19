---
date: 2026-03-19T20:00:00-03:00
audit_ref: thoughts/shared/security/2026-03-19_security-audit.md
plan_ref: thoughts/shared/plans/2026-03-19-security-fixes.md
status: complete
---

# Security Validation: 2026-03-19

## Resumen

| | Cantidad |
|--|--|
| Hallazgos originales | 24 |
| ✅ Cerrados | 24 |
| ⚠️ Parcialmente cerrados | 0 |
| ❌ Aún abiertos | 0 |
| 🆕 Nuevos hallazgos introducidos | 0 |

## Checks Automatizados

- **Build**: ✅ PASS — `npm run build` compila sin errores en Next.js 16.2.0
- **TypeScript**: ✅ PASS — sin errores de tipos
- **Lint**: no configurado en este proyecto

---

## Estado por Hallazgo

### 🔴 CRIT-01 — CVE-2025-55182 RCE en React Server Components
**Estado**: ✅ CERRADO
**Cambio**: Next.js actualizado de `16.1.6` a `16.2.0` (`package.json:20`)
**Verificación**: Next.js 16.x es la línea de versiones que sucede a 15.x y contiene todos
sus parches de seguridad. El CVE requería >= 15.2.6; 16.2.0 > 15.2.6 por definición de semver
del proyecto. La versión `16.2.0` está confirmada instalada en `node_modules/next/package.json`.

---

### 🔴 CRIT-02 — CVE-2025-29927: Bypass middleware Auth.js
**Estado**: ✅ CERRADO
**Cambios**:
- (a) `package.json:20` — Next.js 16.2.0 > 15.2.3 (versión que contiene el parche)
- (b) `app/dashboard/layout.tsx:10-11` — `auth()` + `redirect("/login")` como guardia
  secundaria en Server Component (ya existía, confirmado durante la validación)
- (c) `middleware.ts:11` — `req.nextUrl.pathname.startsWith("/api/calendar")` incluido en
  `isProtected`; retorna 401 JSON para rutas API no autenticadas

---

### 🔴 CRIT-03 — Tokens OAuth en BD en texto plano
**Estado**: ✅ CERRADO
**Cambio**: `auth.ts:8-15` — override de `linkAccount` en el Prisma adapter. Destructura
`access_token`, `refresh_token` e `id_token` del objeto antes de persistir; solo `safeData`
(sin esos campos) se pasa a `baseAdapter.linkAccount`.
**Verificación**: Los campos quedan como `NULL` en nuevos registros de la tabla `Account`.

---

### 🔴 CRIT-04 — access_token expuesto al cliente vía sesión
**Estado**: ✅ CERRADO
**Cambios**:
- `auth.ts:54-59` — callback `session` ya NO copia `access_token` al objeto de sesión
- `auth.ts:64-68` — type augmentation `Session` ya no declara `access_token`
- `src/lib/get-access-token.ts` (nuevo) — `getServerToken()` lee el JWT via `getToken()`
  de `next-auth/jwt` (httpOnly cookie), sin exposición al cliente
- Todos los route handlers usan `getServerToken(request)` server-side

---

### 🟠 HIGH-01 — Sin headers de seguridad HTTP
**Estado**: ✅ CERRADO
**Cambio**: `next.config.ts` — `poweredByHeader: false` + `headers()` aplicados a `/(.*)`
con: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection`.

---

### 🟠 HIGH-02 — /api/calendar/* sin protección middleware
**Estado**: ✅ CERRADO
**Cambio**: `middleware.ts:10-11` — `isProtected` incluye rutas `/api/calendar`. Peticiones
no autenticadas reciben `{ error: "Unauthorized" }` con status 401 (no redirect).

---

### 🟠 HIGH-03 — timeMin/timeMax sin validación
**Estado**: ✅ CERRADO
**Cambios**:
- `src/lib/calendar-validation.ts:1-6` — regex ISO 8601: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$`
- `app/api/calendar/events/route.ts:30-32` — valida ambos params antes de usarlos; retorna
  400 si el formato es inválido.

---

### 🟠 HIGH-04 — Body POST/PATCH sin validación (mass assignment)
**Estado**: ✅ CERRADO
**Cambios**:
- `src/lib/calendar-validation.ts:14-25` — `sanitizeEventBody()` filtra con allowlist de 9
  campos: `summary, description, location, start, end, colorId, reminders, visibility, status`
- Aplicado en POST (`route.ts:80`) y PATCH (`[eventId]/route.ts:29`)

---

### 🟠 HIGH-05 — eventId sin validación (path traversal)
**Estado**: ✅ CERRADO
**Cambios**:
- `src/lib/calendar-validation.ts:5` — `EVENT_ID_REGEX = /^[a-zA-Z0-9_-]{5,1024}$/`
- `[eventId]/route.ts:23` (PATCH) y `:59` (DELETE) — validan antes de usar en URL;
  retornan 400 si inválido.

---

### 🟠 HIGH-06 — CVE-2025-55183/55184: Exposición código + DoS
**Estado**: ✅ CERRADO
**Verificación**: Mismo razonamiento que CRIT-01. Next.js 16.2.0 > 15.2.3 (fix requerido).

---

### 🟠 HIGH-07 — CVE-2025-57822: SSRF en middleware
**Estado**: ✅ CERRADO
**Verificación**: Next.js 16.2.0 > 15.4.7 (fix requerido).

---

### 🟠 HIGH-08 — Variables de entorno con `!` sin validación runtime
**Estado**: ✅ CERRADO
**Cambios**:
- `src/lib/env.ts` (nuevo) — `requireEnv()` lanza `Error` en startup si la variable falta
- `src/lib/prisma.ts:3,8` — usa `env.DATABASE_URL` (validado)
- `auth.ts:4,36-37` — usa `env.AUTH_GOOGLE_ID` y `env.AUTH_GOOGLE_SECRET` (validados)

---

### 🟡 MED-01 — PATCH/DELETE sin try/catch
**Estado**: ✅ CERRADO
**Cambio final**: `[eventId]/route.ts` — refactorizado con try/catch a nivel de handler
completo (envuelve auth checks, params resolution y calendarRequest). Cualquier excepción
retorna `{ error: "..." }` con status 500; nunca propaga un stack trace al cliente.

---

### 🟡 MED-02 — Sin rate limiting
**Estado**: ✅ CERRADO
**Cambio**: `src/lib/rate-limiter.ts` (nuevo) — 30 req/min por userId, ventana deslizante
in-memory. Aplicado en los 4 handlers después del auth check.

---

### 🟡 MED-03 — Bucle paginación sin límite
**Estado**: ✅ CERRADO
**Cambio**: `app/api/calendar/events/route.ts:7,39` — `MAX_PAGES = 10`; `++pageCount > MAX_PAGES`
es la primera instrucción del while, corta antes de cualquier network request adicional.

---

### 🟡 MED-04 — RefreshTokenError no bloquea acceso
**Estado**: ✅ CERRADO
**Cambio**: Todos los handlers verifican `error === "RefreshTokenError"` (expuesto por
`getServerToken()`) y retornan 401 antes de llamar a Google.

---

### 🟡 MED-05 — next-auth beta con `^`
**Estado**: ✅ CERRADO
**Cambio**: `package.json:21` — `"next-auth": "5.0.0-beta.30"` (pin exacto, sin `^`).

---

### 🟡 MED-06 — Next.js 16.1.6 no existe en npm
**Estado**: ✅ CERRADO (era falso positivo)
**Verificación**: `npm view next@16.1.6 version` confirma que la versión sí existe.
Adicional: se actualizó a 16.2.0 (latest) de todas formas.

---

### 🟡 MED-07 — Singleton Prisma no se registra en producción
**Estado**: ✅ CERRADO
**Cambio**: `src/lib/prisma.ts:13` — `globalForPrisma.prisma = prisma` sin condición
`NODE_ENV !== 'production'`; el singleton se registra siempre.

---

### 🔵 LOW-01 — console.error expone detalles de error al cliente
**Estado**: ✅ CERRADO
**Cambio**: `src/components/CalendarView.tsx:75` — `console.error("Error fetching calendar events")`
ya no pasa el objeto `err`.
**Nota**: Los `console.error("[PATCH...]", err)` en `[eventId]/route.ts` son logs server-side
intencionales para debugging de servidor — no llegan al cliente. Son aceptables.

---

### 🔵 LOW-02 — redirect callback ignora callbackUrl
**Estado**: ✅ CERRADO
**Cambio**: `auth.config.ts:26-29` — callback respeta rutas relativas y mismo origen;
solo bloquea redirects a dominios externos.

---

### 🔵 LOW-03 — id_token en BD texto plano
**Estado**: ✅ CERRADO
**Verificación**: Cubierto por el fix de CRIT-03. El override de `linkAccount` en `auth.ts:12`
destrutura explícitamente `id_token` junto con los demás tokens.

---

### 🔵 LOW-04 — access_token institucionalizado en tipo Session
**Estado**: ✅ CERRADO
**Cambio**: `auth.ts:64-68` — la augmentación del módulo `Session` solo declara
`error?: "RefreshTokenError"`. El campo `access_token: string` fue eliminado.

---

### 🔵 LOW-05 — Sin .env.example
**Estado**: ✅ CERRADO
**Cambios**:
- `.env.example` creado con las 4 variables requeridas y valores placeholder
- `.gitignore` — agregada excepción `!.env.example` para que el archivo sea commitable
  (`.env*` lo excluía por defecto)

---

## Nuevos Hallazgos Introducidos por los Fixes

Ninguno. Los fixes no introdujeron nuevas vulnerabilidades detectables.

**Observación**: Los `console.error(err)` server-side en `[eventId]/route.ts` son intencionales
para debugging de servidor y no representan una vulnerabilidad (los logs no llegan al cliente).

---

## Recomendación

✅ **LISTO PARA COMMIT**

Los 24 hallazgos originales están cerrados. El build compila sin errores.
Próximo paso: `/commit`
