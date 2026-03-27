---
date: 2026-03-27T00:00:00-06:00
type: testing
framework: Jest + ts-jest
status: in-progress
---

# Plan: Test Implementation — Módulo de Estadísticas

## Objetivo
Implementar tests unitarios para los 4 archivos del módulo de estadísticas:
`app/api/calendar/stats/route.ts`, `src/components/StatsBackToBack.tsx`,
`src/components/StatsClient.tsx` y `src/components/StatsCharts.tsx`.
Total estimado: **~33 tests** en 4 fases.

## Setup Previo

### Ya instalado
- `jest`, `ts-jest`, `@types/jest` — framework base operativo (62 tests pasando)
- `jest-environment-jsdom` — disponible para tests de componentes
- `jest.config.ts` — configurado con `testEnvironment: 'node'` y `testMatch: ['**/__tests__/**/*.test.ts']`

### Necesita instalarse
- `@testing-library/react` — para montar componentes React en tests
- `@testing-library/jest-dom` — matchers adicionales (`toBeInTheDocument`, etc.)

### Cambios en jest.config.ts
- Añadir `'**/__tests__/**/*.test.tsx'` al `testMatch`
- Añadir `setupFilesAfterFramework: ['<rootDir>/jest.setup.ts']`

### jest.setup.ts a crear
```typescript
import '@testing-library/jest-dom'
```

---

## Convenciones del proyecto (replicar exactas)

```typescript
// 1. jest.mock() PRIMERO, luego imports
jest.mock('@/src/lib/get-access-token', () => ({ getServerToken: jest.fn() }))
import { getServerToken } from '@/src/lib/get-access-token'
const mockGetServerToken = getServerToken as jest.Mock

// 2. beforeEach: mockReset() + defaults seguros
beforeEach(() => {
  mockGetServerToken.mockReset()
  mockGetServerToken.mockResolvedValue({ accessToken: 'tok', userId: 'u1', error: null })
})

// 3. Factory de NextRequest
const makeGET = (params: string) =>
  new NextRequest(`http://localhost/api/calendar/stats?${params}`)

// 4. Assertions: res.status + await res.json()
expect(res.status).toBe(401)
expect(await res.json()).toEqual({ error: 'Unauthorized' })
```

---

## Fase 0: Setup para tests de componentes ⚙️

**Goal**: instalar dependencias, actualizar jest.config.ts y crear jest.setup.ts.
No se escribe ningún test en esta fase — solo verificar que `npm test` sigue en verde.

**Instalar:**
```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

**Modificar `jest.config.ts`:**
- Cambiar `testMatch` de `['**/__tests__/**/*.test.ts']` a `['**/__tests__/**/*.test.{ts,tsx}']`
- Añadir `setupFilesAfterFramework: ['<rootDir>/jest.setup.ts']`

**Crear `jest.setup.ts`** en la raíz:
```typescript
import '@testing-library/jest-dom'
```

**Añadir a `transformIgnorePatterns`** los módulos ESM de recharts si es necesario:
```
/node_modules/(?!(next-auth|@auth/core|@panva|preact|preact-render-to-string|recharts|d3-.*|victory-.*|internmap|robust-predicates)/)'
```

**Verificación:**
- [x] `npm install` sin errores
- [x] `npm test` — sigue con 62 tests en verde (0 nuevos aún)

---

## Fase 1: Tests de API route `/api/calendar/stats` 🛡️

**Goal**: cubrir auth, validación, cómputo de estadísticas y manejo de errores del GET handler.

**Archivo a crear:** `app/api/calendar/stats/__tests__/route.test.ts`

**Mocks necesarios** (misma estructura que `app/api/calendar/events/__tests__/route.test.ts`):
```typescript
jest.mock('@/src/lib/get-access-token', () => ({ getServerToken: jest.fn() }))
jest.mock('@/src/lib/google-calendar',  () => ({ calendarRequest: jest.fn() }))
jest.mock('@/src/lib/rate-limiter',     () => ({ checkRateLimit: jest.fn() }))
// calendar-validation NO se mockea — funciones puras, se dejan correr reales
```

**Constantes de ayuda:**
```typescript
const VALID_TOKEN = { accessToken: 'tok-123', userId: 'u1', error: null }
const VALID_PARAMS = 'timeMin=2026-03-23T00:00:00-06:00&timeMax=2026-03-27T23:59:59-06:00'

const makeGET = (params = VALID_PARAMS) =>
  new NextRequest(`http://localhost/api/calendar/stats?${params}`)

// Evento con dateTime (60 min)
const makeEvent = (id: string, start: string, end: string, summary = 'Meeting') => ({
  id, summary, status: 'confirmed',
  start: { dateTime: start },
  end:   { dateTime: end },
})

// Evento all-day
const makeAllDayEvent = (id: string, date: string) => ({
  id, summary: 'All day', status: 'confirmed',
  start: { date },
  end:   { date },
})
```

**beforeEach:**
```typescript
beforeEach(() => {
  mockGetServerToken.mockReset()
  mockCalendarRequest.mockReset()
  mockCheckRateLimit.mockReset()
  mockGetServerToken.mockResolvedValue(VALID_TOKEN)
  mockCheckRateLimit.mockReturnValue(true)
  // Por defecto: calendarRequest retorna lista vacía
  mockCalendarRequest.mockResolvedValue({ items: [] })
})
```

### Tests a escribir (18 tests)

**Bloque: Autenticación y Rate Limit (4 tests)**

```
Test 1: sin accessToken → 401 { error: 'Unauthorized' }
  mockGetServerToken.mockResolvedValue({ accessToken: null, userId: null, error: null })

Test 2: error RefreshTokenError → 401 con mensaje 'Session expired'
  mockGetServerToken.mockResolvedValue({ accessToken: null, userId: 'u1', error: 'RefreshTokenError' })

Test 3: rate limit excedido → 429
  mockCheckRateLimit.mockReturnValue(false)

Test 4: userId null (sin rate limit) + accessToken válido → 200
  mockGetServerToken.mockResolvedValue({ accessToken: 'tok', userId: null, error: null })
  // calendarRequest retorna []
  // Resultado: 200 con kpis zeros
```

**Bloque: Validación de parámetros (4 tests)**

```
Test 5: sin timeMin → 400 { error: 'timeMin y timeMax son requeridos' }
  makeGET('timeMax=2026-03-27T23:59:59-06:00')

Test 6: sin timeMax → 400
  makeGET('timeMin=2026-03-23T00:00:00-06:00')

Test 7: timeMin con formato inválido → 400 { error: 'Invalid date format...' }
  makeGET('timeMin=2026-03-23&timeMax=2026-03-27T23:59:59-06:00')

Test 8: prevTimeMin presente con formato inválido → 400
  makeGET(VALID_PARAMS + '&prevTimeMin=not-a-date')
```

**Bloque: Respuesta exitosa — estructura (2 tests)**

```
Test 9: sin eventos → 200 con estructura correcta, kpis en cero
  // Verifica: res.status === 200
  // body tiene: kpis, hoursPerDay, byCategory, peakHours, backToBack
  // kpis.totalEvents === 0, kpis.totalHours === 0, avgDurationMinutes === 0

Test 10: groupBy=week → hoursPerDay tiene 4 entradas con labels 'Sem 1'..'Sem 4'
  makeGET(VALID_PARAMS + '&groupBy=week')
  // body.hoursPerDay.map(e => e.label) → ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4']

// groupBy=day es el default — cubierto en test 9 implícitamente
// Test extra opcional:
Test 10b: groupBy=day (default) → hoursPerDay tiene 5 entradas Lun..Vie
```

**Bloque: Cómputo de KPIs (3 tests)**

```
Test 11: evento de 60 min → totalHours=1, occupancyPercent=(60/3600*100)=1.7
  mockCalendarRequest.mockResolvedValue({
    items: [makeEvent('1', '2026-03-24T09:00:00-06:00', '2026-03-24T10:00:00-06:00')]
  })
  // body.kpis.totalHours === 1
  // body.kpis.totalEvents === 1
  // body.kpis.avgDurationMinutes === 60

Test 12: evento all-day → cuenta como 8h (480 min)
  mockCalendarRequest.mockResolvedValue({ items: [makeAllDayEvent('1', '2026-03-24')] })
  // body.kpis.totalHours === 8
  // body.kpis.avgDurationMinutes === 480

Test 13: evento con status 'cancelled' → excluido
  mockCalendarRequest.mockResolvedValue({
    items: [{ ...makeEvent('1', ...), status: 'cancelled' }]
  })
  // body.kpis.totalEvents === 0
```

**Bloque: Categorización y back-to-back (3 tests)**

```
Test 14: evento con título 'standup diario' → aparece en byCategory como 'Standup'
  mockCalendarRequest.mockResolvedValue({
    items: [makeEvent('1', '...T09:00:00Z', '...T09:30:00Z', 'standup diario')]
  })
  // body.byCategory[0].name === 'Standup'

Test 15: dos eventos con gap de 10 min → detectados en backToBack
  mockCalendarRequest.mockResolvedValue({
    items: [
      makeEvent('1', '2026-03-24T09:00:00Z', '2026-03-24T10:00:00Z', 'Meeting 1'),
      makeEvent('2', '2026-03-24T10:10:00Z', '2026-03-24T11:00:00Z', 'Meeting 2'),
    ]
  })
  // body.backToBack.length === 1
  // body.backToBack[0].length === 2

Test 16: dos eventos con gap de 15 min exactos → NO detectados (condición es < 15)
  makeEvent('2', ...T10:15:00Z)
  // body.backToBack.length === 0
```

**Bloque: Fetch paralelo y errores (2 tests)**

```
Test 17: prevTimeMin + prevTimeMax presentes → calendarRequest llamado 2 veces
  makeGET(VALID_PARAMS + '&prevTimeMin=2026-03-16T00:00:00-06:00&prevTimeMax=2026-03-22T23:59:59-06:00')
  mockCalendarRequest.mockResolvedValue({ items: [] })  // aplica a ambas llamadas
  // expect(mockCalendarRequest).toHaveBeenCalledTimes(2)

Test 18: calendarRequest lanza excepción → 500
  mockCalendarRequest.mockRejectedValue(new Error('Network error'))
  // res.status === 500
```

**Verificación:**
- [x] `npm test -- --testPathPatterns=stats/.*route --verbose` — todos en verde (19 tests)
- [x] 0 llamadas reales a Google Calendar API

---

## Fase 2: Tests de `StatsBackToBack` 🎨

**Goal**: cubrir los 3 estados de render del componente más simple.

**Archivo a crear:** `src/components/__tests__/StatsBackToBack.test.tsx`

**Header obligatorio** (jsdom para este archivo):
```typescript
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import StatsBackToBack from '../StatsBackToBack'
```

**Datos de ayuda:**
```typescript
const makeEvent = (id: string, start: string, end: string, summary = 'Meeting') => ({
  id, summary, start, end
})

const GROUP_A = [
  makeEvent('1', '2026-03-24T09:00:00-06:00', '2026-03-24T10:00:00-06:00', 'Standup'),
  makeEvent('2', '2026-03-24T10:10:00-06:00', '2026-03-24T11:00:00-06:00', 'Planning'),
]

const GROUP_B = [
  makeEvent('3', '2026-03-25T14:00:00-06:00', '2026-03-25T15:00:00-06:00', 'Review'),
  makeEvent('4', '2026-03-25T15:05:00-06:00', '2026-03-25T16:00:00-06:00', 'Sync'),
]
```

### Tests a escribir (5 tests)

```
Test 1: groups=[] → muestra mensaje "No se detectaron reuniones consecutivas..."
  render(<StatsBackToBack groups={[]} />)
  expect(screen.getByText(/No se detectaron/i)).toBeInTheDocument()

Test 2: groups=[] → NO muestra badge rojo
  // expect(screen.queryByText(/detectadas/i)).not.toBeInTheDocument()

Test 3: 1 bloque → badge singular "bloque" (no "bloques")
  render(<StatsBackToBack groups={[GROUP_A]} />)
  expect(screen.getByText(/1 bloque$/)).toBeInTheDocument()

Test 4: 2 bloques → badge plural + cuenta total correcta
  render(<StatsBackToBack groups={[GROUP_A, GROUP_B]} />)
  expect(screen.getByText(/4 en 2 bloques/)).toBeInTheDocument()

Test 5: títulos de eventos visibles
  render(<StatsBackToBack groups={[GROUP_A]} />)
  expect(screen.getByText('Standup')).toBeInTheDocument()
  expect(screen.getByText('Planning')).toBeInTheDocument()
```

**Verificación:**
- [x] `npm test -- --testPathPatterns=StatsBackToBack --verbose` — 5 tests en verde

---

## Fase 3: Tests de `StatsClient` 🔄

**Goal**: cubrir los estados de UI (loading, error, empty, con datos) y el selector de rango.

**Archivo a crear:** `src/components/__tests__/StatsClient.test.tsx`

**Mocks necesarios:**
```typescript
/** @jest-environment jsdom */

// Mockear subcomponentes para aislar StatsClient
jest.mock('@/src/components/StatsCharts', () => ({
  __esModule: true,
  default: () => <div data-testid="stats-charts" />,
}))
jest.mock('@/src/components/StatsBackToBack', () => ({
  __esModule: true,
  default: () => <div data-testid="stats-back-to-back" />,
}))

// fetch global
global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock
```

**Datos de ayuda:**
```typescript
const MOCK_DATA = {
  kpis: { totalHours: 5.5, totalEvents: 8, occupancyPercent: 9.2, avgDurationMinutes: 41 },
  hoursPerDay: [
    { label: 'Lun', current: 1, previous: 0.5 },
    { label: 'Mar', current: 2, previous: 1 },
    { label: 'Mié', current: 0, previous: 0 },
    { label: 'Jue', current: 1.5, previous: 2 },
    { label: 'Vie', current: 1, previous: 0 },
  ],
  byCategory: [{ name: 'Sync', hours: 5.5, percent: 100 }],
  peakHours: [{ hour: '09:00', count: 3 }],
  backToBack: [],
}

const EMPTY_DATA = {
  ...MOCK_DATA,
  kpis: { totalHours: 0, totalEvents: 0, occupancyPercent: 0, avgDurationMinutes: 0 },
}
```

**beforeEach:**
```typescript
beforeEach(() => {
  mockFetch.mockReset()
})
```

**Nota sobre `act`**: Usar `await act(async () => { render(...) })` o `waitFor` de RTL para manejar el `useEffect` asíncrono.

### Tests a escribir (7 tests)

```
Test 1: muestra skeleton mientras fetch está pendiente
  // fetch que nunca resuelve
  mockFetch.mockImplementation(() => new Promise(() => {}))
  render(<StatsClient />)
  expect(screen.getByTestId('stats-loading-skeleton') o animate-pulse element).toBeInTheDocument()
  // Alternativa: verificar ausencia de las KPI cards

Test 2: muestra error cuando fetch retorna !ok
  mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) })
  render(<StatsClient />)
  await waitFor(() => {
    expect(screen.getByText(/No se pudieron cargar/i)).toBeInTheDocument()
  })

Test 3: muestra empty state cuando totalEvents=0
  mockFetch.mockResolvedValue({ ok: true, json: async () => EMPTY_DATA })
  render(<StatsClient />)
  await waitFor(() => {
    expect(screen.getByText(/No hay eventos en este rango/i)).toBeInTheDocument()
  })

Test 4: muestra KPI cards con datos reales
  mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
  render(<StatsClient />)
  await waitFor(() => {
    expect(screen.getByText('5.5h')).toBeInTheDocument()  // totalHours
    expect(screen.getByText('8')).toBeInTheDocument()     // totalEvents
    expect(screen.getByText('9%')).toBeInTheDocument()    // occupancyPercent
    expect(screen.getByText('41min')).toBeInTheDocument() // avgDurationMinutes
  })

Test 5: StatsCharts y StatsBackToBack reciben las props (se renderizan)
  mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
  render(<StatsClient />)
  await waitFor(() => {
    expect(screen.getByTestId('stats-charts')).toBeInTheDocument()
    expect(screen.getByTestId('stats-back-to-back')).toBeInTheDocument()
  })

Test 6: selector de rango tiene 3 botones visibles
  mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
  render(<StatsClient />)
  expect(screen.getByText('Esta semana')).toBeInTheDocument()
  expect(screen.getByText('Semana anterior')).toBeInTheDocument()
  expect(screen.getByText('Últimas 4 semanas')).toBeInTheDocument()

Test 7: clicar "Semana anterior" dispara un nuevo fetch
  mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
  render(<StatsClient />)
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

  const btn = screen.getByText('Semana anterior')
  fireEvent.click(btn)
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
  // El segundo fetch lleva parámetros diferentes al primero
  const firstUrl  = mockFetch.mock.calls[0][0] as string
  const secondUrl = mockFetch.mock.calls[1][0] as string
  expect(firstUrl).not.toBe(secondUrl)
```

**Verificación:**
- [x] `npm test -- --testPathPatterns=StatsClient --verbose` — 7 tests en verde

---

## Fase 4: Tests de `StatsCharts` 📊

**Goal**: verificar el caso vacío de `CategoryChart` y que el componente completo monta sin errores.

**Archivo a crear:** `src/components/__tests__/StatsCharts.test.tsx`

**Mock de Recharts** (necesario porque `ResponsiveContainer` usa `ResizeObserver` que no existe en jsdom):
```typescript
/** @jest-environment jsdom */

jest.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    BarChart:   ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    PieChart:   ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Bar:        () => null,
    Pie:        ({ children }: any) => <div>{children}</div>,
    Cell:       () => null,
    XAxis:      () => null,
    YAxis:      () => null,
    CartesianGrid: () => null,
    Tooltip:    () => null,
    Legend:     () => null,
  }
})

import { render, screen } from '@testing-library/react'
import StatsCharts from '../StatsCharts'
```

**Datos de ayuda:**
```typescript
const HOURS_PER_DAY = [
  { label: 'Lun', current: 1, previous: 0.5 },
  { label: 'Mar', current: 2, previous: 1 },
  { label: 'Mié', current: 0, previous: 0 },
  { label: 'Jue', current: 1.5, previous: 2 },
  { label: 'Vie', current: 1, previous: 0 },
]

const PEAK_HOURS = [
  { hour: '08:00', count: 1 },
  { hour: '09:00', count: 3 },
  { hour: '10:00', count: 2 },
]

const BY_CATEGORY = [
  { name: 'Sync', hours: 3, percent: 60 },
  { name: 'Standup', hours: 2, percent: 40 },
]
```

### Tests a escribir (3 tests)

```
Test 1: CategoryChart con byCategory=[] → muestra "Sin datos"
  render(<StatsCharts hoursPerDay={HOURS_PER_DAY} byCategory={[]} peakHours={PEAK_HOURS} />)
  expect(screen.getByText('Sin datos')).toBeInTheDocument()

Test 2: CategoryChart con datos → NO muestra "Sin datos"
  render(<StatsCharts hoursPerDay={HOURS_PER_DAY} byCategory={BY_CATEGORY} peakHours={PEAK_HOURS} />)
  expect(screen.queryByText('Sin datos')).not.toBeInTheDocument()

Test 3: render completo con todos los datos → 2 bar-charts (días y horas pico)
  render(<StatsCharts hoursPerDay={HOURS_PER_DAY} byCategory={BY_CATEGORY} peakHours={PEAK_HOURS} />)
  const barCharts = screen.getAllByTestId('bar-chart')
  expect(barCharts).toHaveLength(2)  // HoursPerDayChart + PeakHoursChart
```

**Verificación:**
- [x] `npm test -- --testPathPatterns=StatsCharts --verbose` — 3 tests en verde

---

## Criterios de Éxito
- [x] `npm test` — suite completa pasa (62 existentes + 34 nuevos = 96 total)
- [x] 0 tests hacen llamadas reales a Google Calendar API
- [x] 0 tests hacen llamadas reales a NextAuth/JWT
- [x] Todos los tests de componentes usan `/** @jest-environment jsdom */`

## Out of Scope
- Tests de `getRangeDates()` y `toLocalISO()` (lógica de fecha client-side — requeriría mockear `Date` globalmente de forma compleja; riesgo de contaminar otros tests)
- Tests de las funciones internas no-exportadas de `route.ts` de forma aislada (solo se testean via el GET handler)
- Tests e2e (Playwright/Cypress)
- Tests de integración con Google Calendar API real
