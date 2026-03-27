# Lib: get-access-token

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Utilidades para leer el access_token de Google desde el JWT cookie server-side.

**Archivo fuente**: `src/lib/get-access-token.ts`
**Runtime**: solo Node.js (no Edge Runtime)

---

## Por qué existe este módulo

Auth.js v5 con JWT strategy almacena el access_token de Google en el JWT (cookie httpOnly). Para proteger el token, el callback `session` en `auth.ts` deliberadamente **no copia** el access_token al session object:

```ts
async session({ session, token }) {
  // access_token NO se copia al session
  session.error = token.error as "RefreshTokenError" | undefined
  return session
}
```

Como resultado, `getServerSession()` retorna un objeto de sesión **sin** el access_token. Para leer el token, hay que acceder al JWT directamente usando `getToken()` de `next-auth/jwt`.

Este módulo encapsula esa lógica para que los route handlers no necesiten importar `next-auth/jwt` directamente.

---

## API

### `getServerToken(req)`

```ts
async function getServerToken(req: NextRequest): Promise<TokenResult>

interface TokenResult {
  accessToken: string | null
  userId: string | null
  error: string | null
}
```

Lee el JWT del cookie httpOnly y retorna el access_token, el userId, y el campo error.

**Parámetros:**
- `req: NextRequest` — el request entrante al route handler

**Retorna:**
- `accessToken` — el access_token de Google, o `null` si no hay sesión
- `userId` — el campo `sub` del JWT (Google Subject ID), o `null` si no hay sesión
- `error` — `"RefreshTokenError"` si el refresh falló, `null` en cualquier otro caso

> **`userId` es el Google Subject ID** — un número como `"1234567890"`. Es distinto del `id` autogenerado por Prisma en la tabla `User` (UUID). No usar como foreign key hacia tablas de la app.

---

### `getAccessToken(req)`

```ts
async function getAccessToken(req: NextRequest): Promise<string | null>
```

Wrapper de conveniencia que retorna solo el access_token o `null`. Usar cuando no se necesita el userId ni el error.

---

## Uso en route handlers

**Patrón obligatorio** — el orden de los guards importa:

```ts
import { getServerToken } from "@/src/lib/get-access-token"

export async function GET(request: NextRequest) {
  const { accessToken, userId, error } = await getServerToken(request)

  // 1. Primero: verificar RefreshTokenError
  if (error === "RefreshTokenError") {
    return NextResponse.json(
      { error: "Session expired, please sign in again" },
      { status: 401 }
    )
  }

  // 2. Después: verificar que hay token
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 3. Rate limit
  if (userId && !checkRateLimit(userId)) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
  }

  // ... usar accessToken para llamar a Google Calendar API
}
```

**Por qué el orden importa**: cuando hay `RefreshTokenError`, el `accessToken` es `null`. Si se chequea `!accessToken` primero, retorna "Unauthorized" en lugar del mensaje descriptivo de sesión expirada. El usuario no sabría que tiene que hacer login de nuevo.

---

## No usar en Edge Runtime

Este módulo importa `next-auth/jwt` que a su vez usa crypto de Node.js — no compatible con Edge Runtime. Solo usar en:
- Route handlers de App Router (`app/api/**/route.ts`)
- Server Components
- Server Actions

El `middleware.ts` usa su propia instancia de NextAuth (Edge-compatible) y no puede importar este módulo.
