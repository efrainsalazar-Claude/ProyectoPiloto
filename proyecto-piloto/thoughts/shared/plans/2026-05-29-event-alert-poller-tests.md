---
date: 2026-05-29T00:00:00-05:00
git_commit: bd76cd3e4c668c6f212575f775f3c584fb63bfe7
type: testing
research_ref: thoughts/shared/testing/2026-05-29_test-research.md
framework: Jest 30 + @testing-library/react 16
status: in-progress
---

# Plan: Tests de EventAlertPoller

## Objetivo
Implementar 17 tests unitarios para `src/components/EventAlertPoller.tsx` que cubran
la lógica de polling, detección de umbrales, alertas, sonido, notificaciones del OS y dismiss.

## Archivo a testear
`src/components/EventAlertPoller.tsx`

## Archivo de test a crear
`src/components/__tests__/EventAlertPoller.test.tsx`

## Setup Previo
No se requiere instalar nada nuevo — el framework ya está instalado.
Los mocks de `AudioContext`, `Notification` y `useSession` se definen dentro del propio test file.

---

## Mocks a configurar en el test file

### 1. `useSession` (next-auth/react)
```typescript
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}))
import { useSession } from "next-auth/react"
const mockUseSession = useSession as jest.Mock
```

### 2. `global.fetch`
```typescript
global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock
```

### 3. `AudioContext` (no implementado en jsdom)
```typescript
const mockOscillator = {
  frequency: { value: 880, setValueAtTime: jest.fn() },
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
const mockAudioContextInstance = {
  createOscillator: jest.fn(() => mockOscillator),
  createGain: jest.fn(() => mockGain),
  destination: {},
  currentTime: 0,
  close: jest.fn(),
}
const mockAudioContext = jest.fn(() => mockAudioContextInstance)
Object.defineProperty(window, "AudioContext", { writable: true, value: mockAudioContext })
```

### 4. `Notification` API (no implementada en jsdom)
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

### 5. Fake timers
```typescript
beforeAll(() => jest.useFakeTimers())
afterAll(() => jest.useRealTimers())
afterEach(() => jest.clearAllTimers())
```

### Helper: evento de ejemplo a N minutos del "ahora" mockeado
```typescript
// Se usa jest.setSystemTime() para fijar "ahora" = un timestamp conocido
const NOW = new Date("2026-05-29T12:00:00Z")

function makeEventInMinutes(minutes: number, allDay = false) {
  const eventTime = new Date(NOW.getTime() + minutes * 60 * 1000)
  return {
    id: "evt-test-1",
    summary: "Reunión de prueba",
    start: allDay
      ? { date: eventTime.toISOString().split("T")[0] }
      : { dateTime: eventTime.toISOString() },
    end: allDay
      ? { date: eventTime.toISOString().split("T")[0] }
      : { dateTime: new Date(eventTime.getTime() + 30 * 60 * 1000).toISOString() },
  }
}

function mockFetchSuccess(minutesAway: number) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [makeEventInMinutes(minutesAway)],
  })
}
```

### `beforeEach` global
```typescript
beforeEach(() => {
  jest.setSystemTime(NOW)
  mockFetch.mockReset()
  mockAudioContext.mockClear()
  mockNotificationConstructor.mockClear()
  mockUseSession.mockReturnValue({ status: "authenticated", data: { user: {} } })
  // fetch retorna vacío por defecto (sin evento próximo)
  mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
})
```

---

## Fases

### Fase 1: Autenticación y polling básico (6 tests)
**Goal**: Verificar que el componente respeta la sesión y hace polling correctamente.

**Archivo a crear:**
`src/components/__tests__/EventAlertPoller.test.tsx`
(con toda la estructura de mocks arriba, más los tests de esta fase)

**Tests:**

**describe("cuando el usuario no está autenticado")**

1. `no hace fetch si status === "unauthenticated"`
   ```
   mockUseSession → { status: "unauthenticated" }
   render(<EventAlertPoller />)
   await act(async () => {})
   expect(mockFetch).not.toHaveBeenCalled()
   ```

2. `no hace fetch si status === "loading"`
   ```
   mockUseSession → { status: "loading" }
   render + await act
   expect(mockFetch).not.toHaveBeenCalled()
   ```

**describe("polling")**

3. `hace fetch inmediatamente al montar (sin esperar 30s)`
   ```
   render(<EventAlertPoller />)
   await act(async () => {})
   expect(mockFetch).toHaveBeenCalledTimes(1)
   expect(mockFetch.mock.calls[0][0]).toContain("/api/calendar/events?timeMin=")
   ```

4. `hace fetch adicional cada 30 segundos`
   ```
   render(<EventAlertPoller />)
   await act(async () => {})                         // poll inicial
   await act(async () => jest.advanceTimersByTime(30000)) // poll #2
   await act(async () => jest.advanceTimersByTime(30000)) // poll #3
   expect(mockFetch).toHaveBeenCalledTimes(3)
   ```

5. `limpia el intervalo al desmontar`
   ```
   const clearIntervalSpy = jest.spyOn(global, "clearInterval")
   const { unmount } = render(<EventAlertPoller />)
   await act(async () => {})
   unmount()
   expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
   clearIntervalSpy.mockRestore()
   ```

6. `falla silenciosamente si fetch retorna !ok (no lanza error)`
   ```
   mockFetch.mockResolvedValue({ ok: false })
   render(<EventAlertPoller />)
   await act(async () => {})
   // No popup, no error visible
   expect(screen.queryByText("Evento próximo")).not.toBeInTheDocument()
   ```

**Verificación Fase 1:**
- [x] `npm test -- --testPathPattern=EventAlertPoller --verbose` → 6 tests en verde
- [x] 0 llamadas reales a APIs externas

---

### Fase 2: Detección de umbrales y popup (7 tests)
**Goal**: Verificar la lógica core — cuándo se muestra y cuándo no se muestra el popup.

**Tests (agregar al mismo archivo):**

**describe("detección de eventos")**

7. `ignora eventos de todo el día (sin start.dateTime)`
   ```
   mockFetch → [makeEventInMinutes(15, allDay=true)]
   render + await act
   expect(screen.queryByText("Evento próximo")).not.toBeInTheDocument()
   ```

8. `no muestra popup si minutesLeft no es un threshold (ej: 8 minutos)`
   ```
   mockFetchSuccess(8)
   render + await act
   expect(screen.queryByText("Evento próximo")).not.toBeInTheDocument()
   ```

9. `no muestra popup si el evento ya pasó (minutesLeft < 0)`
   ```
   mockFetchSuccess(-5)
   render + await act
   expect(screen.queryByText("Evento próximo")).not.toBeInTheDocument()
   ```

**describe("alertas en thresholds exactos")**

10. `muestra popup cuando faltan exactamente 15 minutos`
    ```
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText("Evento próximo")).toBeInTheDocument()
    expect(screen.getByText("Reunión de prueba")).toBeInTheDocument()
    expect(screen.getByText(/15 min/)).toBeInTheDocument()
    ```

11. `muestra popup cuando faltan exactamente 10 minutos`
    ```
    mockFetchSuccess(10) → expect popup con "10 min"
    ```

12. `muestra popup cuando faltan exactamente 5 minutos`
    ```
    mockFetchSuccess(5) → expect popup con "5 min"
    ```

13. `muestra popup cuando faltan exactamente 2 minutos`
    ```
    mockFetchSuccess(2) → expect popup con "2 min"
    ```

14. `no repite la alerta del mismo threshold para el mismo evento`
    ```
    mockFetchSuccess(15)
    render + await act (primer poll → popup aparece)
    await act(async () => jest.advanceTimersByTime(30000)) (segundo poll → mismo evento, mismo threshold)
    // AudioContext solo debe haberse llamado 1 vez (no 2)
    expect(mockAudioContext).toHaveBeenCalledTimes(1)
    ```

**Verificación Fase 2:**
- [x] `npm test -- --testPathPattern=EventAlertPoller --verbose` → 14 tests en verde

---

### Fase 3: Sonido, notificaciones OS y dismiss (7 tests - nota: 3 tests son de un describe separado)
**Goal**: Verificar sonido, notificación del OS, y comportamiento del dismiss.

**Tests (agregar al mismo archivo):**

**describe("sonido y notificación OS")**

15. `llama a AudioContext cuando se dispara una alerta`
    ```
    mockFetchSuccess(15)
    render + await act
    expect(mockAudioContext).toHaveBeenCalledTimes(1)
    expect(mockAudioContextInstance.createOscillator).toHaveBeenCalledTimes(1)
    ```

16. `crea una Notification del OS cuando permission === "granted"`
    ```
    // permission mock ya devuelve "granted" por defecto
    mockFetchSuccess(15)
    render + await act
    expect(mockNotificationConstructor).toHaveBeenCalledWith(
      "📅 CalendarAI",
      expect.objectContaining({ body: expect.stringContaining("Reunión de prueba") })
    )
    ```

17. `NO crea Notification si permission === "denied"`
    ```
    Object.defineProperty(Notification, "permission", { get: () => "denied", configurable: true })
    mockFetchSuccess(15)
    render + await act
    expect(mockNotificationConstructor).not.toHaveBeenCalled()
    ```

**describe("dismiss del popup")**

18. `el popup desaparece automáticamente después de 30 segundos`
    ```
    mockFetchSuccess(15)
    render + await act
    expect(screen.getByText("Evento próximo")).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(30000))
    expect(screen.queryByText("Evento próximo")).not.toBeInTheDocument()
    ```

19. `el botón X cierra el popup manualmente`
    ```
    mockFetchSuccess(15)
    render + await act
    expect(screen.getByText("Evento próximo")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /cerrar alerta/i }))
    expect(screen.queryByText("Evento próximo")).not.toBeInTheDocument()
    ```

20. `el popup muestra "(Sin título)" cuando el evento no tiene summary`
    ```
    mockFetch → [{ id: "evt-1", start: { dateTime: eventIn15min }, end: { dateTime: ... } }]
    render + await act
    expect(screen.getByText("(Sin título)")).toBeInTheDocument()
    ```

**Nota sobre `requestPermission`** — este test requiere que Notification.permission sea "default":

21. `llama requestPermission al montar si permission === "default"`
    ```
    Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
    ```

**Verificación Fase 3:**
- [x] `npm test -- --testPathPattern=EventAlertPoller --verbose` → todos en verde
- [x] `npm test` — suite completa sin regresiones

---

## Criterios de Éxito
- [x] 21 tests en total, todos en verde
- [x] 0 llamadas reales a Google Calendar API
- [x] 0 llamadas reales a NextAuth
- [x] `npm test` (suite completa) pasa sin regresiones

## Consideración técnica: fake timers + async en Jest 30
El componente usa `fetch` (async) dentro de un `setInterval`. En Jest 30, la forma
correcta de avanzar timers que disparan código async es:

```typescript
await act(async () => {
  await jest.advanceTimersByTimeAsync(30000)
})
```

`jest.advanceTimersByTimeAsync` (nuevo en Jest 30) avanza el tiempo Y espera
que las promises disparadas por los timers se resuelvan. Esto evita el problema
clásico de `waitFor` colgándose con fake timers.

Si `advanceTimersByTimeAsync` no está disponible con la versión de ts-jest/types,
alternativa: `await act(async () => { jest.advanceTimersByTime(30000) })` + `flushPromises`.

## Out of Scope
- Tests de integración con Google Calendar API real
- Tests de `playBeep()` con audio real (no comprobable en jsdom)
- Tests visuales de la animación CSS (alert-slide-in, alert-shrink)
- Tests del comportamiento de la barra de progreso (puramente visual)
