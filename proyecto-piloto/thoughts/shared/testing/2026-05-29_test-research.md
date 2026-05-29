---
date: 2026-05-29T23:45:00-05:00
git_commit: e2a5b7263d6785db97a8caf4d6d38c5b4c09662b
branch: main
framework: Jest 30.3.0 + ts-jest + Testing Library
status: complete
---

# Test Research: 2026-05-29

## Resumen
- **Framework instalado**: Sí — Jest 30.3.0, ts-jest 29.4.6, @testing-library/react 16.3.2, jest-environment-jsdom
- **Tests existentes**: 11 suites, **117 tests** — todos pasan
- **Archivos sin cobertura**: 14 de 25 archivos testeables
- **Setup necesario**: No — el framework ya está configurado. Única adición recomendada: `jest-mock-extended` para mockear Prisma en los tests de `app/api/profile/`

---

## Estado Actual

### Configuración

| Elemento | Valor |
|---|---|
| Config principal | `jest.config.ts` |
| Setup file | `jest.setup.ts` — importa `@testing-library/jest-dom` |
| Test environment default | `node` |
| Override por archivo | docblock `/** @jest-environment jsdom */` en tests de componentes |
| Pattern de descubrimiento | `**/__tests__/**/*.test.{ts,tsx}` |
| Alias `@/*` | `<rootDir>/$1` |
| transformIgnorePatterns | excluye `next-auth`, `@auth/core`, `recharts`, `d3-*` del transform CJS |

### Tests Existentes — 11 suites, 117 tests (todos pasan)

| Archivo de test | Qué testea | Tests |
|---|---|---|
| `src/lib/__tests__/calendar-validation.test.ts` | `isValidISO8601`, `isValidEventId`, `sanitizeEventBody` | 17 |
| `src/lib/__tests__/rate-limiter.test.ts` | `checkRateLimit` — sliding window | 7 |
| `src/lib/__tests__/google-calendar.test.ts` | `calendarRequest` — fetch wrapper | 6 |
| `src/lib/__tests__/get-access-token.test.ts` | `getServerToken`, `getAccessToken` | 5 |
| `src/components/__tests__/EventAlertPoller.test.tsx` | Auth, polling, umbrales, sonido, notificaciones OS, dismiss | 21 |
| `src/components/__tests__/StatsClient.test.tsx` | Skeleton, error, empty state, KPI cards, selector de rango | 7 |
| `src/components/__tests__/StatsBackToBack.test.tsx` | Grupos vacíos, badge singular/plural, títulos | 5 |
| `src/components/__tests__/StatsCharts.test.tsx` | Empty state, render con datos, bar-charts | 3 |
| `app/api/calendar/events/__tests__/route.test.ts` | GET paginado + POST crear evento | 15 |
| `app/api/calendar/events/[eventId]/__tests__/route.test.ts` | PATCH + DELETE por ID | 12 |
| `app/api/calendar/stats/__tests__/route.test.ts` | Auth, rate limit, validación, KPIs, categorización, back-to-back | 19 |

---

## Archivos Que Necesitan Tests

### Alta Prioridad (lógica crítica, sin cobertura)

- `app/api/profile/route.ts` — GET + PATCH del perfil con auth guard y Prisma. Es el único route que usa Prisma directamente; requiere mock de `prisma.user.findUnique` y `prisma.user.update`.

### Media Prioridad (componentes con lógica propia)

- `src/components/ProfileClient.tsx` — formulario con carga via fetch, 4 inputs controlados, loading/saving/error states, feedback "Guardado"
- `src/components/EventModal.tsx` — formulario modal create/edit con validación inline y estados async
- `src/components/CalendarWithModal.tsx` — orquesta CalendarView + EventModal; llama a 3 endpoints (POST/PATCH/DELETE)
- `src/components/Sidebar.tsx` — navegación con active state por pathname y signOut

### Baja Prioridad (thin wrappers / sin lógica propia)

- `src/components/CalendarView.tsx` — wrappea FullCalendar (lazy); difícil de testear por dependencia externa
- `src/components/Navbar.tsx` — nav responsive con useSession
- `src/components/ConditionalNavbar.tsx` — renderiza Navbar solo en rutas non-dashboard
- `src/components/GoogleSignInButton.tsx` — botón que llama `signIn("google")`
- `src/lib/env.ts` — valida variables de entorno
- `middleware.ts` — protege rutas con Edge-compatible authConfig
- `auth.ts` — configuración NextAuth con JWT callbacks
- `app/api/auth/[...nextauth]/route.ts` — thin handler que re-exporta handlers

---

## Mocks Necesarios

| Dependencia | Cómo se mockea | Usado en |
|---|---|---|
| `@/src/lib/prisma` (Prisma Client) | `jest.mock` con `jest-mock-extended` — `mockDeep<PrismaClient>()` | `app/api/profile/route.ts` |
| `@/src/lib/get-access-token` (`getServerToken`) | `jest.mock(...)` factory — patrón ya existente en calendar routes | `app/api/profile/route.ts` |
| `next-auth/react` (`useSession`) | `jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))` — ya existe en EventAlertPoller | `ProfileClient.tsx` |
| `global.fetch` | `global.fetch = jest.fn()` — patrón ya existente | `ProfileClient.tsx` |

---

## Patrones de Test Establecidos en el Proyecto

### Mock de `getServerToken` (patrón existente en calendar routes)
```typescript
jest.mock('@/src/lib/get-access-token', () => ({
  getServerToken: jest.fn(),
}))
const mockGetServerToken = getServerToken as jest.Mock
beforeEach(() => {
  mockGetServerToken.mockReset()
  mockGetServerToken.mockResolvedValue({ userId: 'user-123', error: null })
})
```

### Mock de Prisma (nuevo — requiere jest-mock-extended)
```typescript
// src/lib/__mocks__/prisma.ts
import { PrismaClient } from '@prisma/client'
import { mockDeep, DeepMockProxy } from 'jest-mock-extended'
import { prisma } from '@/src/lib/prisma'

jest.mock('@/src/lib/prisma', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}))

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>
```

### Request factory (patrón existente en calendar routes)
```typescript
const makeGET = () => new NextRequest('http://localhost/api/profile')
const makePATCH = (body: object) =>
  new NextRequest('http://localhost/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
```

---

## Setup Adicional Necesario

Solo una instalación nueva:

```bash
npm install --save-dev jest-mock-extended@2.0.4
```

Luego crear `src/lib/__mocks__/prisma.ts` con el mock profundo de Prisma.

---

## Cobertura por Área

| Área | Archivos totales | Con tests | Sin tests |
|---|---|---|---|
| API Routes (`app/api/**/route.ts`) | 5 | 3 | 2 (`profile`, `auth/nextauth`) |
| Componentes React (`src/components/`) | 12 | 4 | 8 |
| Lib/Utils (`src/lib/`) | 6 | 4 | 2 (`env`, `prisma`) |
| Páginas (`app/**/page.tsx`) | 5 | 0 | 5 (thin shells) |
| Middleware + Auth | 3 | 0 | 3 |

---

## Referencias

- [Next.js 15 Jest setup oficial](https://nextjs.org/docs/app/guides/testing/jest)
- [Prisma unit testing con jest-mock-extended](https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing)
- [next-test-api-route-handler](https://github.com/Xunnamius/next-test-api-route-handler)
- [NextAuth v5 + Jest — Discussion #10188](https://github.com/nextauthjs/next-auth/discussions/10188)
- [Mocking useSession — NextAuth #775](https://github.com/nextauthjs/next-auth/issues/775)
- [App Router API testing — Arcjet Blog](https://blog.arcjet.com/testing-next-js-app-router-api-routes/)

## Gaps en Research

- No se midió cobertura porcentual real — se infirió por presencia/ausencia de archivos de test
- Testing de `middleware.ts` con Edge Runtime requiere mocks especiales no investigados
- Async Server Components no están soportados por Jest (limitación oficial)
