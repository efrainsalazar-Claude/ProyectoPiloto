---
date: 2026-03-26T00:30:00-03:00
type: testing
research_ref: thoughts/shared/testing/2026-03-26_test-research.md
framework: Jest + ts-jest
status: in-progress
---

# Plan: Test Implementation — 2026-03-26

## Objetivo
Implementar tests unitarios para los 6 archivos de lógica crítica del proyecto,
cubriendo los flujos de seguridad, validación e integración con Google Calendar API.
Total estimado: ~45 tests distribuidos en 5 fases.

---

## Fase 0: Setup de Jest ⚙️
**Sin esto ninguna fase posterior puede ejecutarse**

### Paquetes a instalar
```bash
npm install -D jest @types/jest ts-jest jest-environment-jsdom
```
No se instala `@testing-library/*` en esta fase — los primeros tests son de Node
puro y no necesitan jsdom ni React Testing Library.

### Archivos a crear

**`jest.config.ts`** (raíz del proyecto):
```ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathPattern: '.*\\.test\\.ts$',
  setupFilesAfterFramework: [],
}

export default config
```

**`package.json`** — agregar scripts:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

### Verificación
- [x] `npm test` corre sin errores (output: `No tests found` o `0 tests passed`)
- [x] `npx jest --version` imprime la versión instalada (30.2.0)

---

## Fase 1: Tests unitarios puros — calendar-validation 🛡️
**Hallazgos que cubre**: HIGH-03, HIGH-04, HIGH-05 (validación de inputs)
**Archivo a testear**: `src/lib/calendar-validation.ts`
**Mocks necesarios**: Ninguno — funciones puras

**Archivo a crear**: `src/lib/__tests__/calendar-validation.test.ts`

### Tests a implementar (15 tests)

#### `isValidISO8601`
```
✓ acepta "2024-01-15T10:30:00Z"
✓ acepta "2024-01-15T10:30:00+03:00"
✓ acepta "2024-01-15T10:30:00-05:30"
✗ rechaza "2024-01-15" (sin hora)
✗ rechaza "2024-01-15T10:30:00" (sin timezone)
✗ rechaza "not-a-date"
✗ rechaza "" (string vacío)
```

#### `isValidEventId`
```
✓ acepta "abc12" (exactamente 5 chars)
✓ acepta "event_id-123" (con guiones y underscore)
✓ acepta "a".repeat(1024) (límite máximo)
✗ rechaza "ab12" (4 chars — bajo el mínimo)
✗ rechaza "abc#1" (carácter inválido)
✗ rechaza "" (vacío)
```

#### `sanitizeEventBody`
```
✓ permite campos del allowlist: summary, description, location,
  start, end, colorId, reminders, visibility, status
✓ elimina campos no permitidos: attendees, id, creator, organizer
✓ body mixto: solo pasan los campos del allowlist
✓ body vacío → objeto vacío
```

### Verificación
- [x] `npm test` — 17 tests en verde, 0 fallos (17 en lugar de 15: se agregaron 2 casos edge)
- [x] Ningún mock usado en esta fase

---

## Fase 2: Tests con mocks simples — rate-limiter y google-calendar 🔧
**Archivos a testear**: `src/lib/rate-limiter.ts`, `src/lib/google-calendar.ts`
**Mocks necesarios**: `Date.now()`, `fetch` global

### Archivo a crear: `src/lib/__tests__/rate-limiter.test.ts`

**Problema clave**: el Map de `requests` es estado de módulo — persiste entre tests.
Solución: `beforeEach(() => jest.resetModules())` o limpiar con `jest.isolateModules`.
En la práctica, es suficiente con llamar `checkRateLimit` con userId únicos por test.

#### Tests a implementar (7 tests)
```
✓ primer request de userId nuevo → true
✓ 30 requests consecutivos (en el límite) → todos true
✗ request 31 → false (rate limit excedido)
✓ userId distintos no se afectan entre sí
✓ después de vencer la ventana (mock Date.now + windowMs) → resetea a count=1, retorna true
✓ límite personalizado: checkRateLimit(id, 5) — el 6to request → false
✗ userId vacío "" — el límite se aplica igual (no explota)
```

**Cómo mockear el tiempo:**
```ts
const mockNow = jest.spyOn(Date, 'now')
mockNow.mockReturnValue(1000)
// ... hacer requests hasta llegar al límite
mockNow.mockReturnValue(1000 + 60_001) // avanzar ventana
// ahora el próximo request debería ser true
```

### Archivo a crear: `src/lib/__tests__/google-calendar.test.ts`

#### Tests a implementar (6 tests)
```
✓ respuesta 200 → retorna los datos parseados del JSON
✓ respuesta 204 → retorna undefined (sin intentar parsear JSON)
✗ respuesta 403 → lanza Error con .status=403 y .reason del body
✗ respuesta 500 con body JSON parseables → lanza con mensaje del error
✗ respuesta 500 con body no parseable → lanza "Calendar API error 500"
✓ incluye header Authorization: Bearer <token> en la request
```

**Cómo mockear fetch:**
```ts
global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock

mockFetch.mockResolvedValueOnce({
  ok: true,
  status: 200,
  json: async () => ({ items: [] }),
})
```

### Verificación
- [x] `npm test` — 13 tests nuevos en verde (17 de Fase 1 + 13 nuevos = 30 total)
- [x] Ningún test hace llamadas reales a googleapis.com

---

## Fase 3: Tests con mock de next-auth/jwt — get-access-token 🔑
**Archivo a testear**: `src/lib/get-access-token.ts`
**Mocks necesarios**: `next-auth/jwt` → `getToken`

### Archivo a crear: `src/lib/__tests__/get-access-token.test.ts`

**Cómo crear el mock de next-auth/jwt:**
```ts
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))
import { getToken } from 'next-auth/jwt'
const mockGetToken = getToken as jest.Mock
```

**Cómo construir un NextRequest mock:**
```ts
import { NextRequest } from 'next/server'
const makeRequest = () => new NextRequest('http://localhost/api/test')
```

#### Tests a implementar (5 tests)
```
✓ getToken retorna token completo → getServerToken retorna
  { accessToken: "tok", userId: "user123", error: null }
✓ getToken retorna null (sin sesión) →
  { accessToken: null, userId: null, error: null }
✓ getToken retorna token con error: "RefreshTokenError" →
  { accessToken: null, userId: "user123", error: "RefreshTokenError" }
✓ getAccessToken (wrapper) con token válido → retorna solo el string del token
✓ getAccessToken con getToken=null → retorna null
```

### Verificación
- [x] `npm test` — 35 tests en verde (30 anteriores + 5 nuevos)
- [x] No se llama a `getToken` real en ningún test

---

## Fase 4: Tests de API Routes — events (GET y POST) 🌐
**Archivo a testear**: `app/api/calendar/events/route.ts`
**Mocks necesarios**: `@/src/lib/get-access-token`, `@/src/lib/google-calendar`,
`@/src/lib/rate-limiter` (las funciones de calendar-validation NO se mockean — son puras)

### Archivo a crear: `app/api/calendar/events/__tests__/route.test.ts`

**Setup de mocks al inicio del archivo:**
```ts
jest.mock('@/src/lib/get-access-token')
jest.mock('@/src/lib/google-calendar')
jest.mock('@/src/lib/rate-limiter')

import { getServerToken } from '@/src/lib/get-access-token'
import { calendarRequest } from '@/src/lib/google-calendar'
import { checkRateLimit } from '@/src/lib/rate-limiter'

const mockGetServerToken = getServerToken as jest.Mock
const mockCalendarRequest = calendarRequest as jest.Mock
const mockCheckRateLimit = checkRateLimit as jest.Mock
```

**Helper para construir requests:**
```ts
const makeGET = (params = '') =>
  new NextRequest(`http://localhost/api/calendar/events?${params}`)

const makePOST = (body: object) =>
  new NextRequest('http://localhost/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
```

#### Tests GET a implementar (9 tests)
```
✗ sin token → 401 { error: "Unauthorized" }
✗ RefreshTokenError → 401 { error: "Session expired..." }
✗ rate limit excedido → 429 { error: "Too Many Requests" }
✗ sin timeMin ni timeMax → 400
✗ fecha con formato inválido (ej: "2024-01-15") → 400
✓ request válida, una página → 200 con array de eventos
✓ paginación: calendarRequest retorna nextPageToken en 1ra llamada, no en 2da
  → se llama 2 veces, devuelve eventos concatenados
✓ calendarRequest lanza → 500 { error: "Error fetching events" }
✓ paginación corta en MAX_PAGES=10 (calendarRequest siempre devuelve nextPageToken
  → se llama exactamente 10 veces, no 11)
```

#### Tests POST a implementar (6 tests)
```
✗ sin token → 401
✗ body sin summary → 400 "Missing required fields"
✗ body con attendees (campo no permitido) → attendees no llega a calendarRequest
✓ body válido {summary, start, end} → calendarRequest llamado con body sanitizado, retorna 201
✓ body con campos extras permitidos + no permitidos → solo pasan los permitidos
✓ calendarRequest lanza → 500 { error: "Error creating event" }
```

### Verificación
- [x] `npm test` — 50 tests en verde (35 anteriores + 15 nuevos)
- [x] Verificar con `--verbose` que todos los nombres de test son descriptivos

---

## Fase 5: Tests de API Routes — [eventId] (PATCH y DELETE) 🌐
**Archivo a testear**: `app/api/calendar/events/[eventId]/route.ts`
**Mocks necesarios**: mismos que Fase 4

### Archivo a crear: `app/api/calendar/events/[eventId]/__tests__/route.test.ts`

**Helper para construir requests con params:**
```ts
const makePATCH = (eventId: string, body: object) =>
  new NextRequest(`http://localhost/api/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
// params se pasa como segundo argumento al handler:
await PATCH(req, { params: Promise.resolve({ eventId }) })
```

#### Tests PATCH a implementar (7 tests)
```
✗ sin token → 401
✗ RefreshTokenError → 401
✗ rate limit excedido → 429
✗ eventId inválido "ab" (4 chars) → 400 "Invalid event ID"
✗ eventId con caracteres inválidos "../evil" → 400
✓ body válido + eventId válido → calendarRequest llamado con /primary/events/{id}, retorna 200
✓ calendarRequest lanza → 500 { error: "Failed to update event" }
```

#### Tests DELETE a implementar (5 tests)
```
✗ sin token → 401
✗ eventId inválido → 400
✓ eventId válido → calendarRequest llamado con DELETE, retorna 204
✓ calendarRequest retorna 204 (undefined) → Response con status 204
✓ calendarRequest lanza → 500 { error: "Failed to delete event" }
```

### Verificación
- [x] `npm test` — 62 tests en verde
- [ ] `npm run test:coverage` — revisar % de cobertura en rutas críticas

---

## Criterios de Éxito
- [x] `npm test` corre toda la suite sin errores
- [x] ~60 tests en total (62)
- [x] 0 tests hacen llamadas reales a googleapis.com ni a la BD
- [ ] Cobertura de las rutas críticas de seguridad: auth guard, rate limit, validación inputs

## Comandos de referencia
```bash
npm test                  # correr todos los tests
npm run test:watch        # modo watch para desarrollo
npx jest --coverage       # ver cobertura
npx jest src/lib          # solo tests de lib
npx jest --verbose        # ver nombre de cada test
```

## Out of Scope
- Tests de componentes React (CalendarWithModal, EventModal) — requieren jsdom + RTL
- Tests de middleware.ts — difícil en aislamiento con Next.js App Router
- Tests de auth.ts — callbacks JWT complejos, baja relación esfuerzo/valor
- Tests e2e (Playwright)
- Tests de integración con BD o Google Calendar API reales
