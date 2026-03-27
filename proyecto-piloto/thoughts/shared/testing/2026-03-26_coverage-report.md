---
date: 2026-03-26T03:00:00-03:00
plan_ref: thoughts/shared/plans/2026-03-26-test-implementation.md
research_ref: thoughts/shared/testing/2026-03-26_test-research.md
status: complete
---

# Coverage Report: 2026-03-26

## Resumen Ejecutivo
- Tests totales: **62**
- Tests pasando: **62 ✅**
- Tests fallando: **0 ❌**
- Archivos con cobertura nueva: **6**
- Tiempo de ejecución: ~1s

---

## Resultados por Fase del Plan

### Fase 0: Setup de Jest ⚙️ — ✅ COMPLETA
- Jest 30 + ts-jest instalado
- `jest.config.ts` creado con `transformIgnorePatterns` para ESM de next-auth
- Scripts `test`, `test:watch`, `test:coverage` en `package.json`

### Fase 1: calendar-validation — ✅ COMPLETA
- Tests planificados: 15 (plan original) → implementados: **17** (2 casos edge extra)
- Tests pasando: 17/17
- Cobertura: **100% statements / 100% branches / 100% functions**

### Fase 2: rate-limiter y google-calendar — ✅ COMPLETA
- Tests planificados: 13 → implementados: **13**
- Tests pasando: 13/13
  - `rate-limiter.ts`: 7 tests — **100% cobertura**
  - `google-calendar.ts`: 6 tests — **100% statements, 91% branches**

### Fase 3: get-access-token — ✅ COMPLETA
- Tests planificados: 5 → implementados: **5**
- Tests pasando: 5/5
- Cobertura: **100% statements / 93% branches**

### Fase 4: API Route events (GET y POST) — ✅ COMPLETA
- Tests planificados: 15 → implementados: **15**
- Tests pasando: 15/15
- Cobertura: **96% statements / 92% branches / 100% functions**
- Fix adicional: orden de guards `RefreshTokenError → !accessToken` corregido

### Fase 5: API Route [eventId] (PATCH y DELETE) — ✅ COMPLETA
- Tests planificados: 12 → implementados: **12**
- Tests pasando: 12/12
- Cobertura: **95% statements / 90% branches / 100% functions**
- Fix adicional: mismo orden de guards corregido en ambos handlers

---

## Cobertura por Área

| Archivo | Statements | Branches | Functions | Lines | Líneas sin cubrir |
|---------|-----------|----------|-----------|-------|-------------------|
| `events/route.ts` | 96% | 92% | 100% | 96% | 70, 76 |
| `[eventId]/route.ts` | 95% | 90% | 100% | 95% | 50, 56 |
| `calendar-validation.ts` | **100%** | **100%** | **100%** | **100%** | — |
| `get-access-token.ts` | **100%** | 93% | **100%** | **100%** | 19 |
| `google-calendar.ts` | **100%** | 91% | **100%** | **100%** | 15, 21-22 |
| `rate-limiter.ts` | **100%** | **100%** | **100%** | **100%** | — |
| **TOTAL** | **97%** | **92%** | **100%** | **97%** | |

### Notas sobre líneas sin cubrir

- `events/route.ts:70,76` — branches de `!data.nextPageToken` y `pageToken` en el loop de paginación (cubiertos por los tests de paginación, la rama específica no es alcanzable en el mock actual)
- `[eventId]/route.ts:50,56` — branches similares en el try/catch de PATCH
- `get-access-token.ts:19` — branch del operador `??` en `token.error ?? null` cuando `error` es explícitamente `undefined`
- `google-calendar.ts:15,21-22` — branch de `body` opcional en `calendarRequest` y encabezado `Content-Type` condicional

Todas son ramas secundarias de bajo riesgo. Las rutas críticas de seguridad (auth guard, rate limit, validación de inputs) tienen **cobertura del 100%**.

---

## Tests Implementados

| Archivo | Tests | Estado |
|---------|-------|--------|
| `src/lib/__tests__/calendar-validation.test.ts` | 17 | ✅ todos verdes |
| `src/lib/__tests__/rate-limiter.test.ts` | 7 | ✅ todos verdes |
| `src/lib/__tests__/google-calendar.test.ts` | 6 | ✅ todos verdes |
| `src/lib/__tests__/get-access-token.test.ts` | 5 | ✅ todos verdes |
| `app/api/calendar/events/__tests__/route.test.ts` | 15 | ✅ todos verdes |
| `app/api/calendar/events/[eventId]/__tests__/route.test.ts` | 12 | ✅ todos verdes |
| **Total** | **62** | **62/62 ✅** |

---

## Archivos Sin Tests (Out of Scope del plan)

- `src/components/CalendarView.tsx` — requiere jsdom + React Testing Library
- `src/components/EventModal.tsx` — idem
- `middleware.ts` — difícil en aislamiento con Next.js App Router
- `auth.ts` — callbacks JWT complejos, baja relación esfuerzo/valor
- `src/lib/env.ts` — startup validation, lógica trivial

---

## Output de Cobertura (jest --coverage)

```
-----------------------------------|---------|----------|---------|---------|-------------------
File                               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------------------------|---------|----------|---------|---------|-------------------
All files                          |   96.99 |    92.17 |     100 |   96.82 |
 app/api/calendar/events           |   96.29 |     92.3 |     100 |   96.07 |
  route.ts                         |   96.29 |     92.3 |     100 |   96.07 | 70,76
 app/api/calendar/events/[eventId] |   94.87 |       90 |     100 |   94.87 |
  route.ts                         |   94.87 |       90 |     100 |   94.87 | 50,56
 src/lib                           |     100 |    92.85 |     100 |     100 |
  calendar-validation.ts           |     100 |      100 |     100 |     100 |
  get-access-token.ts              |     100 |    92.85 |     100 |     100 | 19
  google-calendar.ts               |     100 |    91.17 |     100 |     100 | 15,21-22
  rate-limiter.ts                  |     100 |      100 |     100 |     100 |
-----------------------------------|---------|----------|---------|---------|-------------------

Test Suites: 6 passed, 6 total
Tests:       62 passed, 62 total
Time:        1.039 s
```

---

## Hallazgos Adicionales Durante la Implementación

1. **Bug corregido (orden de guards)**: En ambas routes (`events/route.ts` y `[eventId]/route.ts`), el guard `!accessToken` aparecía antes que el check de `RefreshTokenError`. Cuando el token expirado tiene `accessToken: null`, la primera guard retornaba "Unauthorized" en lugar del mensaje descriptivo. Corregido invirtiendo el orden.

2. **ESM compatibility**: `next-auth/jwt` es ESM puro (`export *`), incompatible con Jest/CommonJS. Resuelto usando factory functions explícitas en todos los `jest.mock()` de las routes, evitando que Jest importe el módulo real.

---

## Recomendación

✅ **LISTO — suite completa y commiteada**

62/62 tests en verde. Cobertura del 97% en archivos críticos.
Las rutas de seguridad (autenticación, rate limiting, validación de inputs) tienen cobertura del 100%.
