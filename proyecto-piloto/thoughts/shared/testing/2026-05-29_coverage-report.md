---
date: 2026-05-29T00:00:00-05:00
plan_ref: thoughts/shared/plans/2026-05-29-event-alert-poller-tests.md
research_ref: thoughts/shared/testing/2026-05-29_test-research.md
status: complete
---

# Coverage Report: 2026-05-29

## Resumen Ejecutivo
- **Tests totales**: 117 ✅ (96 preexistentes + 21 nuevos)
- **Tests pasando**: 117 ✅
- **Tests fallando**: 0 ❌
- **Archivos con cobertura nueva**: 1 (`EventAlertPoller.tsx`)
- **Cobertura global**: 91.19% statements · 84.94% branches · 93.9% functions · 93.38% lines

---

## Resultados por Fase del Plan

### Fase 1: Autenticación y polling básico — ✅ COMPLETA
- Tests planificados: 6
- Tests implementados: 6
- Tests pasando: 6 ✅
- Cubre: no-fetch sin sesión (unauthenticated/loading), fetch inmediato al montar, polling cada 30s, cleanup del intervalo, fetch !ok silencioso

### Fase 2: Detección de umbrales y popup — ✅ COMPLETA
- Tests planificados: 8
- Tests implementados: 8
- Tests pasando: 8 ✅
- Cubre: eventos de todo el día ignorados, minutesLeft fuera de threshold, evento pasado, los 4 thresholds exactos (15/10/5/2 min), no repetición del mismo umbral

### Fase 3: Sonido, notificaciones OS y dismiss — ✅ COMPLETA
- Tests planificados: 7
- Tests implementados: 7
- Tests pasando: 7 ✅
- Cubre: AudioContext al disparar alerta, Notification con permission=granted, no Notification con permission=denied, auto-dismiss 30s, cierre manual con X, sin título, requestPermission al montar

---

## Cobertura de EventAlertPoller.tsx

| Métrica | Resultado | Objetivo |
|---------|-----------|---------|
| Statements | 91.39% | — |
| Branches | 83.33% | — |
| Functions | 92.85% | — |
| Lines | **98.64%** | — |

**Única línea no cubierta: línea 88** — el `return` dentro del bloque `catch` del fetch (cuando fetch lanza una excepción de red, no cuando retorna !ok). Este path requeriría `mockFetch.mockRejectedValue(new Error(...))` y es un edge case de baja prioridad (la funcionalidad !ok sí está cubierta).

---

## Cobertura por Área (suite completa)

| Área | Statements | Branches | Functions | Lines |
|------|-----------|---------|-----------|-------|
| app/api/calendar/events | 96.29% | 92.30% | 100% | 96.07% |
| app/api/calendar/events/[eventId] | 94.87% | 90.00% | 100% | 94.87% |
| app/api/calendar/stats | 87.66% | 80.76% | 96.29% | 90.83% |
| src/components (todos) | 90.00% | 80.00% | 90.47% | 92.77% |
| src/lib (todos) | 100% | 92.85% | 100% | 100% |
| **TOTAL** | **91.19%** | **84.94%** | **93.90%** | **93.38%** |

---

## Tests Implementados en Esta Sesión

- `src/components/__tests__/EventAlertPoller.test.tsx` — **21 tests**, todos ✅
  - 6 tests de autenticación y polling
  - 8 tests de detección de umbrales y popup
  - 7 tests de sonido, notificaciones OS y dismiss

---

## Archivos Aún Sin Tests (fuera de scope de este plan)

Del research original, estos siguen sin cobertura:
- `middleware.ts` — alta prioridad para próxima iteración
- `src/components/EventModal.tsx` — media prioridad
- `src/components/CalendarWithModal.tsx` — media prioridad
- `src/components/GoogleSignInButton.tsx` — media prioridad
- `src/components/ConditionalNavbar.tsx` — media prioridad
- `src/lib/env.ts` — media prioridad
- `src/components/CalendarView.tsx` — baja prioridad (FullCalendar)
- `src/components/Navbar.tsx` / `Sidebar.tsx` — baja prioridad (UI pura)

---

## Output de Cobertura (jest --coverage)

```
-----------------------------------|---------|----------|---------|---------|----------------------------
File                               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------------------------|---------|----------|---------|---------|----------------------------
All files                          |   91.19 |    84.94 |    93.9 |   93.38 |
 app/api/calendar/events           |   96.29 |     92.3 |     100 |   96.07 |
  route.ts                         |   96.29 |     92.3 |     100 |   96.07 | 70,76
 app/api/calendar/events/[eventId] |   94.87 |       90 |     100 |   94.87 |
  route.ts                         |   94.87 |       90 |     100 |   94.87 | 50,56
 app/api/calendar/stats            |   87.66 |    80.76 |   96.29 |   90.83 |
  route.ts                         |   87.66 |    80.76 |   96.29 |   90.83 | 47,115-123,151-152,197,295
 src/components                    |      90 |       80 |   90.47 |   92.77 |
  EventAlertPoller.tsx             |   91.39 |    83.33 |   92.85 |   98.64 | 88
  StatsBackToBack.tsx              |     100 |      100 |     100 |     100 |
  StatsCharts.tsx                  |   78.57 |    33.33 |   66.66 |   78.57 | 70,145,210
  StatsClient.tsx                  |   89.04 |    82.14 |     100 |    88.4 | 99-106
 src/lib                           |     100 |    92.85 |     100 |     100 |
  calendar-validation.ts           |     100 |      100 |     100 |     100 |
  get-access-token.ts              |     100 |    92.85 |     100 |     100 | 19
  google-calendar.ts               |     100 |    91.17 |     100 |     100 | 15,21-22
  rate-limiter.ts                  |     100 |      100 |     100 |     100 |
-----------------------------------|---------|----------|---------|---------|----------------------------
Test Suites: 11 passed, 11 total
Tests:       117 passed, 117 total
```

---

## Recomendación

**✅ LISTO PARA COMMIT**

Los 21 tests planificados están implementados y pasando. La cobertura de líneas de `EventAlertPoller.tsx` es 98.64%. La única línea sin cubrir (88) es el `catch` de excepciones de red en el fetch, un edge case de baja prioridad que no afecta la lógica de negocio cubierta. Suite completa en verde sin regresiones.
