---
date: 2026-05-29T23:55:00-05:00
git_commit: e2a5b7263d6785db97a8caf4d6d38c5b4c09662b
branch: main
type: testing
research_ref: thoughts/shared/testing/2026-05-29_test-research.md
framework: Jest 30.3.0
status: in-progress
---

# Plan: Tests del Módulo de Perfil de Usuario

## Objetivo
Agregar 21 tests unitarios para los dos archivos del módulo de perfil sin cobertura: `app/api/profile/route.ts` (12 tests) y `src/components/ProfileClient.tsx` (9 tests), siguiendo los patrones exactos ya establecidos en el proyecto.

## Estado Actual
- 11 suites, 117 tests — todos pasan
- `app/api/profile/route.ts` — sin tests (alta prioridad: auth guard + Prisma)
- `src/components/ProfileClient.tsx` — sin tests (media prioridad: loading/saving states, error handling)
- Framework Jest 30.3.0 completamente configurado — **no requiere instalaciones nuevas**

## Assumptions
- **Sin `jest-mock-extended`**: El patrón existente usa `jest.fn()` factory plana en todos los routes tests. Se sigue el mismo patrón para Prisma — no se introduce `jest-mock-extended` como nueva dependencia.
- **Prisma mock local en cada test file**: `jest.mock('@/src/lib/prisma', ...)` con factory inline, igual que `jest.mock('@/src/lib/get-access-token', ...)` en los tests de calendar.
- **117 tests existentes deben seguir pasando** tras agregar los nuevos.
- **Scope**: Solo `profile/route.ts` y `ProfileClient.tsx`. Los demás archivos sin cobertura quedan fuera de este plan.

---

## Fases

### Fase 1: Tests de `app/api/profile/route.ts` — 12 tests

**Goal**: Cubrir todos los branches de GET y PATCH: auth guards, respuestas de Prisma, transformación de campos, y errores.

**Archivos a crear:**
- `app/api/profile/__tests__/route.test.ts`

**Mocks necesarios** (inline en el test file, patrón existente):
```typescript
jest.mock('@/src/lib/get-access-token', () => ({
  getServerToken: jest.fn(),
}))
jest.mock('@/src/lib/prisma', () => ({
  __esModule: true,
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))
```

**Tests a implementar:**

```
describe('GET /api/profile')
  describe('Auth')
    ✦ retorna 401 { error: "Unauthorized" } cuando userId es null
    ✦ retorna 401 { error: "Session expired..." } cuando error === "RefreshTokenError"
  describe('Prisma')
    ✦ retorna 404 { error: "User not found" } cuando findUnique devuelve null
    ✦ retorna 500 cuando findUnique lanza una excepción
  describe('Happy path')
    ✦ retorna 200 con los 8 campos seleccionados (name, email, image, role, company, jobTitle, department, updatedAt)

describe('PATCH /api/profile')
  describe('Auth')
    ✦ retorna 401 { error: "Unauthorized" } cuando userId es null
    ✦ retorna 401 { error: "Session expired..." } cuando error === "RefreshTokenError"
  describe('Transformación de campos')
    ✦ convierte string vacío "" a null en el data de Prisma
    ✦ campo ausente del body resulta en undefined (Prisma no actualiza esa columna)
    ✦ campo no-string (ej: número 42) resulta en undefined
  describe('Happy path')
    ✦ retorna 200 con { role, company, jobTitle, department, updatedAt }
    ✦ retorna 500 con el mensaje del error cuando Prisma lanza excepción
```

**Helpers a definir al inicio del test file:**
```typescript
const USER_ID = 'test-user-id'
const VALID_TOKEN = { userId: USER_ID, error: null }
const MOCK_USER = {
  name: 'Test User', email: 'test@test.com', image: null,
  role: 'Dev', company: 'Acme', jobTitle: 'Engineer',
  department: 'Tech', updatedAt: new Date('2026-05-29'),
}

const makeGET = () => new NextRequest('http://localhost/api/profile')
const makePATCH = (body: object) =>
  new NextRequest('http://localhost/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
```

**Verificación:**
- [x] Correr: `npx jest app/api/profile` — 12 tests en verde, 0 en rojo
- [x] Correr: `npm test` — los 117 tests existentes siguen pasando (129 total)

---

### Fase 2: Tests de `src/components/ProfileClient.tsx` — 9 tests

**Goal**: Cubrir los estados de la UI: skeleton de carga, render del formulario con datos, guardado exitoso, errores de API y de red, y la fecha `updatedAt`.

**Archivos a crear:**
- `src/components/__tests__/ProfileClient.test.tsx`

**Mocks necesarios** (patrón de `StatsClient.test.tsx`):
```typescript
/** @jest-environment jsdom */   // línea 1 obligatoria

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock
```

No se necesita mock de `useSession` porque `ProfileClient.tsx` no usa `useSession`.

**Mock data:**
```typescript
const MOCK_PROFILE = {
  name: 'Test User',
  email: 'test@example.com',
  image: null,
  role: 'Developer',
  company: 'SoftsVGroup',
  jobTitle: 'Engineer',
  department: 'Tech',
  updatedAt: '2026-05-29T00:00:00.000Z',
}
```

**Tests a implementar:**

```
describe('ProfileClient')
  describe('Estado de carga')
    ✦ muestra skeleton (animate-pulse) mientras fetch está pendiente
    ✦ no muestra el formulario durante la carga
  describe('Formulario cargado')
    ✦ muestra los campos del perfil con los valores del GET (role, company, jobTitle, department)
    ✦ campos null en el perfil se muestran como string vacío en los inputs
    ✦ muestra la fecha "Última actualización" cuando updatedAt tiene valor
    ✦ no muestra la fecha cuando updatedAt es null
  describe('Guardar cambios')
    ✦ click en "Guardar cambios" dispara PATCH con el body correcto
    ✦ muestra "Guardado" cuando el PATCH es exitoso
    ✦ muestra el mensaje de error cuando el PATCH falla (res.ok === false)
```

**Verificación:**
- [x] Correr: `npx jest ProfileClient` — 9 tests en verde, 0 en rojo
- [x] Correr: `npm test` — todos los tests pasan (138 total: 117 + 12 + 9)

---

## Criterios de Éxito
- [x] `npm test` corre toda la suite sin errores (138 tests)
- [x] 0 tests hacen llamadas reales a BD, NextAuth, ni fetch externo
- [x] Los 12 tests del route cubren todos los branches de auth, Prisma, y transformación de campos
- [x] Los 9 tests del componente cubren loading, render, save exitoso, y errores

## Out of Scope
- Tests para `Sidebar.tsx`, `EventModal.tsx`, `CalendarWithModal.tsx` — siguiente iteración
- Tests para `middleware.ts` y `auth.ts` — requieren setup de Edge Runtime
- Tests E2E — Playwright/Cypress para otra iteración
- Medición de cobertura porcentual (`npm run test:coverage`)

## Commands Reference
```bash
npx jest app/api/profile          # correr solo tests del route
npx jest ProfileClient            # correr solo tests del componente
npm test                          # toda la suite
npm run test:watch                # modo watch durante desarrollo
```
