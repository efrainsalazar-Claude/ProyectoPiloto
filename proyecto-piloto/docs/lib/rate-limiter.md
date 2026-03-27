# Lib: rate-limiter

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Rate limiting en memoria por usuario para los endpoints de la Calendar API.

**Archivo fuente**: `src/lib/rate-limiter.ts`

---

## API

### `checkRateLimit(userId, limit?, windowMs?)`

```ts
function checkRateLimit(userId: string, limit?: number, windowMs?: number): boolean
```

Verifica si el usuario puede hacer una nueva request. Contabiliza la request si está dentro del límite.

**Parámetros:**
| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `userId` | `string` | — | Identificador del usuario. En la app se usa el Google Subject ID (`token.sub`) |
| `limit` | `number` | `30` | Máximo de requests permitidas por ventana |
| `windowMs` | `number` | `60000` | Duración de la ventana en milisegundos (default: 1 minuto) |

**Retorna:**
- `true` — request permitida (dentro del límite)
- `false` — rate limit excedido (no contabiliza la request)

**Side effect**: actualiza el contador interno para el `userId`.

---

## Uso

```ts
import { checkRateLimit } from "@/src/lib/rate-limiter"

if (userId && !checkRateLimit(userId)) {
  return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
}
```

---

## Implementación

```ts
const requests = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(userId: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = requests.get(userId)

  if (!entry || now > entry.resetAt) {
    // Primera request o ventana expirada: resetear contador
    requests.set(userId, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}
```

El algoritmo es **ventana fija** (no deslizante): el contador se resetea en bloque cuando `now > entry.resetAt`, independientemente de cuándo se hicieron las requests dentro de la ventana anterior.

---

## ⚠️ Limitaciones en producción

Esta implementación es adecuada para desarrollo y entornos de un solo proceso. Para producción, considerar estas limitaciones:

| Limitación | Descripción |
|------------|-------------|
| **In-memory** | El Map se pierde en cada reinicio del servidor o deploy |
| **Sin compartir entre instancias** | En Vercel serverless (múltiples workers), cada instancia tiene su propio Map. El límite efectivo es `30 × N_instancias`. |
| **Map sin eviction** | Las entradas para usuarios inactivos permanecen en memoria hasta que ese usuario hace una nueva request después de que vence la ventana. En teoría, con muchos usuarios únicos el Map crece indefinidamente. |
| **No distribuido** | No funciona como rate limiter global en arquitecturas con múltiples réplicas o workers. |

**Para producción con alta concurrencia**: reemplazar con un rate limiter basado en Redis (por ejemplo, `@upstash/ratelimit` para Vercel Edge, o `ioredis` para Node.js).

---

## Identificador de usuario

El `userId` es el campo `sub` del JWT de Auth.js — el **Google Subject ID** del usuario. Se elige sobre la IP porque:
- Más preciso: múltiples usuarios detrás del mismo proxy/NAT no se bloquean mutuamente
- Consistente: el mismo usuario tiene el mismo ID independientemente de su IP

El `sub` es el mismo valor que retorna `getServerToken(req).userId`.
