# Flujo de Autenticación

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Describe cómo funciona el sistema completo de autenticación: Google OAuth, JWT strategy, refresh token rotation, y cómo los route handlers acceden al access_token sin exponerlo al cliente.

## Archivos involucrados

| Archivo | Rol |
|---------|-----|
| `auth.config.ts` | Configuración base — proveedor Google, scopes, redirect callback. Edge-compatible (sin Prisma). |
| `auth.ts` | Configuración completa — agrega Prisma adapter, callbacks JWT/session, lógica de refresh. |
| `middleware.ts` | Protección de rutas en Edge Runtime — usa solo `auth.config.ts`. |
| `src/lib/get-access-token.ts` | Lee el access_token del JWT cookie server-side para los route handlers. |

---

## Flujo completo

```
1. Usuario hace click en "Sign in with Google"
   └── signIn("google") → redirige a Google OAuth

2. Google redirige a /api/auth/callback/google con código OAuth
   └── auth.ts callback jwt (primer login):
       - Recibe account.access_token, account.expires_at, account.refresh_token
       - Los almacena en el JWT (NO en la BD — ver secureAdapter más abajo)
       - Retorna JWT firmado → se guarda en cookie httpOnly

3. Requests subsiguientes:
   └── middleware.ts verifica que el JWT existe y es válido (solo firma)
       - Si no hay JWT → redirect /login (páginas) o 401 (API routes)
       - Si hay JWT → deja pasar el request

4. Route handler recibe el request:
   └── getServerToken(req) llama a getToken() de next-auth/jwt
       - Lee el JWT del cookie httpOnly
       - Devuelve { accessToken, userId, error }
       - Verifica RefreshTokenError antes de usar el token
   └── calendarRequest(endpoint, method, accessToken) llama a Google Calendar API

5. Si el access_token está expirado (token.expires_at * 1000 < Date.now()):
   └── auth.ts callback jwt hace refresh automático:
       POST https://oauth2.googleapis.com/token con refresh_token
       - Si OK → actualiza access_token y expires_at en el JWT
       - Si falla → pone error: "RefreshTokenError" en el JWT
```

---

## Por qué JWT strategy (no database sessions)

Auth.js soporta dos estrategias de sesión: `"jwt"` y `"database"`.

**Con `"database"`**: la sesión se persiste en la tabla `Session` de PostgreSQL. El objeto de sesión accesible desde `getServerSession()` o `useSession()` contiene solo los campos que Auth.js decide incluir (nombre, email, imagen). El `access_token` de Google **no tiene forma de llegar** al session object — el callback `jwt` directamente no se ejecuta con esta strategy.

**Con `"jwt"`**: la sesión se almacena en un JWT firmado en una cookie httpOnly. El callback `jwt` se ejecuta en cada request y tiene acceso a `account` (en el primer login), que contiene el `access_token` de Google. Desde ahí puede almacenarlo en el token para usarlo en requests futuros.

**Conclusión**: JWT strategy es la única forma de acceder al `access_token` de Google Calendar desde los route handlers.

---

## Split config: `auth.config.ts` vs `auth.ts`

El middleware de Next.js corre en **Edge Runtime** (V8 isolates, sin acceso a APIs de Node.js). Prisma usa el driver `pg` de Node.js — incompatible con Edge Runtime.

Si el middleware importara `auth.ts` directamente, el build fallaría porque `PrismaAdapter` trae dependencias de Node.js.

La solución es el **split config pattern**:

```
auth.config.ts  ←  solo proveedor Google, redirect callback (Edge-compatible)
     ↑
auth.ts         ←  importa authConfig + agrega Prisma adapter + callbacks jwt/session
     ↑
middleware.ts   ←  importa solo authConfig, crea instancia Edge de NextAuth
                   (puede verificar firma JWT, NO puede hacer refresh de tokens)
```

> **Importante**: la instancia de NextAuth en `middleware.ts` solo puede verificar que el JWT existe y tiene firma válida. No ejecuta el callback `jwt` ni puede refrescar tokens. El refresh ocurre cuando el route handler llama a `getServerToken()`, que usa `getToken()` y desencadena el callback `jwt` de `auth.ts`.

---

## Por qué `prompt: "consent"` y `access_type: "offline"` son obligatorios

Definidos en `auth.config.ts`:

```ts
authorization: {
  params: {
    prompt: "consent",
    access_type: "offline",
    ...
  }
}
```

- **`access_type: "offline"`**: le dice a Google que queremos un `refresh_token`. Sin esto, Google devuelve solo un `access_token` de corta duración (1 hora) sin forma de renovarlo.

- **`prompt: "consent"`**: fuerza la pantalla de consentimiento de Google en cada login. Sin esto, en logins subsiguientes (usuario que ya otorgó permisos antes) Google puede omitir el `refresh_token` de la respuesta, ya que asume que el que tiene guardado el servidor sigue siendo válido. Si ese token se perdió (por ejemplo, al rotar el `AUTH_SECRET`), el sistema queda roto silenciosamente hasta que el usuario haga logout y login de nuevo.

> **Si se quitan estos parámetros**: el primer login funciona, pero después de que expira el access_token (1 hora) el sistema no puede renovarlo y todos los requests a Google Calendar fallan con 401.

---

## secureAdapter: por qué los tokens OAuth no se almacenan en la BD

```ts
// auth.ts
const secureAdapter = {
  ...baseAdapter,
  linkAccount: (data) => {
    const { access_token, refresh_token, id_token, ...safeData } = data
    return baseAdapter.linkAccount!(safeData)
  },
}
```

Cuando un usuario hace login por primera vez, Auth.js llama a `linkAccount` para persistir el `Account` en la BD. El objeto incluye `access_token`, `refresh_token`, e `id_token`.

Con JWT strategy, el sistema **nunca lee estos tokens de la BD** — los lee del JWT cookie (donde los almacena el callback `jwt`). Tenerlos en la BD sería datos sensibles sin utilidad.

`secureAdapter` sobrescribe `linkAccount` para eliminar esos tres campos antes del INSERT.

---

## El access_token no llega al cliente

```ts
// auth.ts — callback session
async session({ session, token }) {
  // access_token NO se copia al session — queda solo en el JWT (httpOnly cookie)
  session.error = token.error as "RefreshTokenError" | undefined
  return session
}
```

El session object es el que llega al cliente vía `useSession()` y al endpoint `/api/auth/session`. Si el `access_token` se copiara aquí, cualquier JavaScript del cliente podría leerlo.

El token solo vive en el JWT de la cookie httpOnly — accesible únicamente server-side via `getToken()`.

---

## getServerToken: cómo acceden los route handlers al token

```ts
// src/lib/get-access-token.ts
export async function getServerToken(req: NextRequest): Promise<TokenResult> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  if (!token) return { accessToken: null, userId: null, error: null }
  return {
    accessToken: (token.access_token as string) ?? null,
    userId: (token.sub as string) ?? null,
    error: (token.error as string) ?? null,
  }
}
```

`getToken()` de `next-auth/jwt` lee y verifica el JWT directamente del cookie httpOnly. No pasa por el session object del cliente.

**Notas importantes:**
- `userId` es el campo `sub` del JWT — el **Google Subject ID** (algo como `"1234567890"`), **no** el `id` autogenerado por Prisma en la tabla `User`.
- El campo `error` puede ser `"RefreshTokenError"` si el refresh falló. Los route handlers deben checar esto **antes** de usar el accessToken.

### Orden de guards obligatorio en los route handlers

```ts
const { accessToken, userId, error } = await getServerToken(request)

// 1. Primero chequear RefreshTokenError
if (error === "RefreshTokenError") {
  return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 })
}

// 2. Luego verificar que hay token
if (!accessToken) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

Si se invierte el orden: cuando hay `RefreshTokenError`, el `accessToken` es `null`. El guard `!accessToken` retornaría "Unauthorized" en lugar del mensaje descriptivo de sesión expirada.

---

## Refresh token rotation

```ts
// auth.ts — callback jwt cuando el token está expirado
if (Date.now() < (token.expires_at as number) * 1000) return token  // aún válido

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({
    client_id: env.AUTH_GOOGLE_ID,
    client_secret: env.AUTH_GOOGLE_SECRET,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token as string,
  }),
})
const newTokens = await response.json()
return {
  ...token,
  access_token: newTokens.access_token,
  expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_in),
  refresh_token: newTokens.refresh_token ?? token.refresh_token,  // ← rotation
}
```

- El refresh se dispara cuando `Date.now() >= token.expires_at * 1000` (el access_token de Google dura ~1 hora).
- `newTokens.refresh_token ?? token.refresh_token`: Google a veces rota el refresh_token (envía uno nuevo), a veces no. Esta línea maneja ambos casos.
- Si el refresh falla (token revocado, usuario desconectó la app, etc.): se pone `error: "RefreshTokenError"` en el JWT y se deja que el route handler lo detecte y retorne 401.

---

## Qué hace el cliente cuando llega RefreshTokenError

El campo `error` llega al cliente vía `session.error` (ver session callback en `auth.ts`). El componente que usa `useSession()` debe detectarlo y redirigir al usuario a `/login`.

Ver implementación en `src/components/CalendarWithModal.tsx` o similares.
