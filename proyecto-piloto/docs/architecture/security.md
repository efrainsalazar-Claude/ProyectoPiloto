# Decisiones de Seguridad

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Documenta las decisiones de seguridad implementadas: protección del access_token, rate limiting, headers HTTP, y la defensa en profundidad de las rutas de API.

---

## 1. El access_token nunca llega al cliente

El access_token de Google Calendar es el dato más sensible del sistema — permite crear, editar y eliminar eventos en el calendario del usuario.

**Problema original**: el diseño inicial copiaba `access_token` al session object (`session.access_token = token.access_token`), haciéndolo accesible desde `useSession()` en el cliente y desde el endpoint público `/api/auth/session`.

**Solución implementada**: `src/lib/get-access-token.ts`

```ts
export async function getServerToken(req: NextRequest): Promise<TokenResult> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  // ...
}
```

`getToken()` de `next-auth/jwt` lee el JWT directamente del cookie httpOnly server-side. El access_token nunca sale del servidor. El session callback en `auth.ts` explícitamente NO copia el token:

```ts
async session({ session, token }) {
  // access_token NO se copia al session — queda solo en el JWT (httpOnly cookie)
  session.error = token.error as "RefreshTokenError" | undefined
  return session
}
```

**Usar `getServerToken()` (no `getServerSession()`)** en cualquier server-side code que necesite llamar a Google Calendar API. `getServerSession()` no expone el access_token.

---

## 2. Tokens OAuth no se almacenan en la BD

El `PrismaAdapter` estándar persiste `access_token`, `refresh_token`, e `id_token` en la tabla `Account`. Con JWT strategy, el sistema nunca los lee de la BD (los lee del cookie), así que almacenarlos sería datos sensibles sin utilidad.

`secureAdapter` en `auth.ts` elimina estos campos antes del INSERT:

```ts
const secureAdapter = {
  ...baseAdapter,
  linkAccount: (data) => {
    const { access_token, refresh_token, id_token, ...safeData } = data
    return baseAdapter.linkAccount!(safeData)
  },
}
```

---

## 3. Rate limiting

**Archivo**: `src/lib/rate-limiter.ts`

**Comportamiento**: 30 requests por minuto por usuario. Se aplica en todos los endpoints de `/api/calendar/*`.

```ts
if (userId && !checkRateLimit(userId)) {
  return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
}
```

El `userId` usado es el Google Subject ID (`token.sub`) — no la IP ni el ID interno de Prisma.

### ⚠️ Limitaciones importantes en producción

La implementación es **in-memory** (un `Map` a nivel de módulo):

| Limitación | Impacto |
|------------|---------|
| Se pierde en cada reinicio del servidor | En deploys frecuentes, el contador se resetea |
| No se comparte entre instancias serverless | En Vercel con múltiples workers, el límite efectivo es `30 × N_instancias` |
| El Map crece sin límite | Entradas viejas no se eliminan hasta que el usuario hace un nuevo request pasada la ventana |
| No es distribuido | No sirve como rate limiter en ambientes con múltiples réplicas |

Para producción con alta concurrencia se necesita Redis u otro almacenamiento compartido.

---

## 4. Defensa en profundidad: doble verificación de autenticación

Las rutas `/api/calendar/*` tienen **dos capas de verificación de autenticación**:

**Capa 1 — Middleware** (`middleware.ts`):
```ts
if (isProtected && !isLoggedIn) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
```

**Capa 2 — Route handlers** (`app/api/calendar/events/route.ts`, etc.):
```ts
const { accessToken, userId, error } = await getServerToken(request)
if (error === "RefreshTokenError") { ... return 401 }
if (!accessToken) { ... return 401 }
```

La redundancia es **intencional** — no es duplicación accidental. El middleware puede ser bypaseado en algunos contextos (testing, proxies, CDNs mal configurados). Los route handlers son la segunda línea de defensa.

---

## 5. Validación y sanitización de inputs

Todos los inputs de usuario se validan antes de llegar a Google Calendar API. Ver [`docs/lib/calendar-validation.md`](../lib/calendar-validation.md) para detalles.

**Resumen**:
- `timeMin`/`timeMax` (query params): deben ser ISO 8601 con timezone explícito
- `eventId` (path param): alfanumérico + `_-`, 5-1024 caracteres
- Body de POST/PATCH: pasa por allowlist de 9 campos — campos no permitidos se eliminan silenciosamente

---

## 6. Headers HTTP de seguridad

Configurados en `next.config.ts` para todas las rutas (`/(.*)`):

| Header | Valor | Propósito |
|--------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Previene MIME type sniffing |
| `X-Frame-Options` | `DENY` | Previene clickjacking (la app no puede ser embebida en iframes) |
| `X-XSS-Protection` | `1; mode=block` | Activa filtro XSS en browsers legacy |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limita información de referrer en requests cross-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Desactiva APIs de hardware innecesarias |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Fuerza HTTPS por 2 años, incluye subdominios |
| `Content-Security-Policy` | ver abajo | Restringe orígenes de recursos |

**Content-Security-Policy detallada**:
```
default-src 'self'                                          ← solo recursos del mismo origen por defecto
script-src 'self' 'unsafe-inline' 'unsafe-eval'            ← necesario para Next.js/React
style-src 'self' 'unsafe-inline'                            ← necesario para Tailwind CSS inline
img-src 'self' data: https://lh3.googleusercontent.com     ← avatares de Google
connect-src 'self' https://accounts.google.com https://www.googleapis.com  ← OAuth + Calendar API
frame-ancestors 'none'                                      ← refuerza X-Frame-Options
```

Además, `poweredByHeader: false` elimina el header `X-Powered-By: Next.js` para no revelar el stack.

---

## 7. Versiones de Next.js y CVEs cerrados

La versión 16.2.0 cierra tres vulnerabilidades críticas:

| CVE | Severidad | Descripción |
|-----|-----------|-------------|
| CVE-2025-55182 | Crítica | RCE via cache poisoning en Server Actions |
| CVE-2025-29927 | Crítica | Bypass del middleware via header `x-middleware-subrequest` |
| CVE-2025-57822 | Alta | Exposición de datos en Server Components bajo ciertos patrones |

Todas afectan versiones anteriores a ~15.4.7 / 16.1.x. Next.js 16.2.0 las corrige.

**No usar `^` en la versión de `next` y `next-auth` en `package.json`** para evitar upgrades automáticos que puedan romper compatibilidades. Las versiones están fijadas (`"next": "16.2.0"`, `"next-auth": "5.0.0-beta.30"`).
