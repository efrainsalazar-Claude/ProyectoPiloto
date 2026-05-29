---
date: 2026-05-29T00:00:00-05:00
git_commit: bd76cd3e4c668c6f212575f775f3c584fb63bfe7
branch: main
framework: Jest 30 + ts-jest + @testing-library/react
status: complete
---

# Test Research: 2026-05-29

## Resumen
- **Framework instalado**: Sí — Jest 30.3.0, ts-jest 29.4.6, @testing-library/react 16.3.2, jest-environment-jsdom
- **Tests existentes**: 10 archivos, ~92 tests totales
- **Archivos sin cobertura**: 13 archivos (11 componentes/lib + 2 root files)
- **Setup necesario**: No — solo agregar mocks de browser APIs para EventAlertPoller
- **Prioridad inmediata**: `EventAlertPoller.tsx` — componente nuevo sin tests

---

## Estado Actual

### Configuración
- `jest.config.ts` — preset ts-jest, ambiente default `node`, alias `@/*` → raíz
- `jest.setup.ts` — solo importa `@testing-library/jest-dom`
- Patrón de búsqueda: `**/__tests__/**/*.test.{ts,tsx}`
- Componentes React usan `/** @jest-environment jsdom */` docblock

### Tests Existentes (~92 tests en 10 archivos)

| Archivo de test | Tests (aprox.) | Qué cubre |
|---|---|---|
| `app/api/calendar/events/__tests__/route.test.ts` | 14 | GET y POST /api/calendar/events |
| `app/api/calendar/events/[eventId]/__tests__/route.test.ts` | 11 | PATCH y DELETE por eventId |
| `app/api/calendar/stats/__tests__/route.test.ts` | 17 | Estadísticas agregadas del calendario |
| `src/lib/__tests__/calendar-validation.test.ts` | 17 | isValidISO8601, isValidEventId, sanitizeEventBody |
| `src/lib/__tests__/rate-limiter.test.ts` | 7 | checkRateLimit con ventana deslizante |
| `src/lib/__tests__/google-calendar.test.ts` | 6 | calendarRequest (respuestas, headers, errores) |
| `src/lib/__tests__/get-access-token.test.ts` | 5 | getServerToken y getAccessToken |
| `src/components/__tests__/StatsClient.test.tsx` | 7 | Fetch, loading, error, empty, KPIs |
| `src/components/__tests__/StatsCharts.test.tsx` | 3 | CategoryChart y bar-charts |
| `src/components/__tests__/StatsBackToBack.test.tsx` | 5 | Lista vacía, badge, títulos |

---

## Archivos Sin Cobertura

### Alta Prioridad
- `src/components/EventAlertPoller.tsx` — **componente nuevo**, lógica de polling, umbrales, beep, notificaciones OS
- `middleware.ts` — protege todas las rutas autenticadas, crítico para seguridad

### Media Prioridad
- `src/components/EventModal.tsx` — modal de crear/editar eventos con validación de campos
- `src/components/CalendarWithModal.tsx` — orquesta save/delete de eventos, lógica de refresh
- `src/components/GoogleSignInButton.tsx` — llama `signIn()` de NextAuth
- `src/components/ConditionalNavbar.tsx` — oculta navbar en rutas específicas
- `src/lib/env.ts` — valida variables de entorno requeridas

### Baja Prioridad (difícil ROI en tests)
- `src/components/CalendarView.tsx` — depende de FullCalendar (librería externa compleja)
- `src/components/Navbar.tsx` — UI con useSession, renderea avatar y menú
- `src/components/Sidebar.tsx` — UI con navegación y avatar
- `src/lib/prisma.ts` — singleton, no tiene lógica testeable
- `app/api/auth/[...nextauth]/route.ts` — re-export de Auth.js, sin lógica propia
- `auth.ts` — configuración de Auth.js, no tiene lógica de negocio

---

## Mocks Necesarios para EventAlertPoller

### 1. `useSession` de next-auth/react
```typescript
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}))
import { useSession } from "next-auth/react"
const mockUseSession = useSession as jest.Mock

// Default en beforeEach:
mockUseSession.mockReturnValue({ status: "authenticated", data: { user: {} } })

// Override por test:
mockUseSession.mockReturnValue({ status: "unauthenticated", data: null })
```

### 2. `global.fetch` (para el poll a /api/calendar/events)
Mismo patrón que `StatsClient.test.tsx`:
```typescript
global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock
// beforeEach: mockFetch.mockReset()
```

### 3. `AudioContext` (Web Audio API — no en jsdom)
Mock manual con `Object.defineProperty` en el test file:
```typescript
const mockOscillator = {
  frequency: { value: 440, setValueAtTime: jest.fn() },
  type: "sine",
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  onended: null as (() => void) | null,
}
const mockGain = {
  gain: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() },
  connect: jest.fn(),
}
const mockAudioContext = jest.fn(() => ({
  createOscillator: jest.fn(() => mockOscillator),
  createGain: jest.fn(() => mockGain),
  destination: {},
  currentTime: 0,
  close: jest.fn(),
}))
Object.defineProperty(window, "AudioContext", { writable: true, value: mockAudioContext })
```

### 4. `Notification` API (no en jsdom)
```typescript
const mockNotificationConstructor = jest.fn()
Object.defineProperty(mockNotificationConstructor, "permission", {
  get: jest.fn(() => "granted"),
  configurable: true,
})
mockNotificationConstructor.requestPermission = jest.fn().mockResolvedValue("granted")
Object.defineProperty(window, "Notification", {
  writable: true,
  configurable: true,
  value: mockNotificationConstructor,
})
```

### 5. `setInterval` / `setTimeout` (para polling y auto-dismiss)
```typescript
beforeAll(() => jest.useFakeTimers())
afterAll(() => jest.useRealTimers())
afterEach(() => jest.clearAllTimers())

// Avanzar el polling:
act(() => { jest.advanceTimersByTime(30000) })  // un poll

// Avanzar el auto-dismiss:
act(() => { jest.advanceTimersByTime(30000) })  // 30s de dismiss
```

---

## Patrones Existentes Clave (para modelar tests de EventAlertPoller)

| Patrón | Archivo de referencia |
|---|---|
| Mock de `global.fetch` en componente React | `src/components/__tests__/StatsClient.test.tsx` |
| `useSession` mock (ver web research) | Nuevo — no existe en el proyecto todavía |
| `Date.now` spy para tiempo | `src/lib/__tests__/rate-limiter.test.ts` |
| `/** @jest-environment jsdom */` docblock | `src/components/__tests__/StatsClient.test.tsx` |
| `beforeEach` con reset + defaults | `app/api/calendar/events/__tests__/route.test.ts` |

---

## Qué Testear en EventAlertPoller

### Tests críticos (lógica de negocio)
1. No hace fetch si `status !== "authenticated"`
2. Hace fetch inmediatamente al montar (primer poll sin esperar 30s)
3. Hace fetch cada 30 segundos
4. Ignora eventos de todo el día (sin `start.dateTime`)
5. No muestra popup si `minutesLeft` no coincide exactamente con un threshold (15, 10, 5, 2)
6. Muestra popup cuando `minutesLeft === 15`
7. No repite la alerta del mismo threshold en el mismo evento (notifiedRef)
8. Llama a `AudioContext` cuando se dispara una alerta
9. Llama a `new Notification()` cuando el permiso es "granted"
10. No llama a `new Notification()` cuando el permiso es "denied"
11. Limpia el intervalo y setTimeout al desmontar (cleanup)
12. Auto-dismiss: el popup desaparece después de 30s
13. Cierre manual: al hacer click en X, el popup desaparece

### Tests de edge cases
14. Fetch retorna 400/401/500 — falla silenciosamente, no muestra error
15. `minutesLeft < 0` (evento ya pasó) — no muestra popup

---

## Referencias Web
- [How to mock useSession — nextauthjs/next-auth Discussion #4185](https://github.com/nextauthjs/next-auth/discussions/4185)
- [standardized-audio-context-mock](https://www.npmjs.com/package/standardized-audio-context-mock)
- [Mocking Browser APIs in Jest](https://jsschools.com/javascript/mocking-browser-apis-in-jest-advanced-techniques-/)
- [Jest 30 release notes](https://jestjs.io/blog/2025/06/04/jest-30)
- [useInterval test patterns — react-use](https://github.com/streamich/react-use/blob/master/tests/useInterval.test.ts)

## Gaps en Research
- No se analizó qué hace exactamente `middleware.ts` (para saber si vale la pena testearlo)
- No se verificó el estado de `env.ts` (si tiene lógica testeable)
- No se buscó si hay un `__mocks__/` directory a nivel raíz
