---
date: 2026-03-26T00:00:00-03:00
git_commit: 7891df9
branch: main
framework: ninguno
status: complete
---

# Test Research: 2026-03-26

## Resumen
- Framework instalado: **No** — requiere fase de setup antes de escribir tests
- Tests existentes: 0 archivos, 0 tests
- Archivos sin cobertura: 19 archivos testeables identificados
- Setup necesario: **Sí** (Jest + Testing Library)

---

## Estado Actual

No hay ningún archivo de test en el proyecto. No hay configuración de Jest, Vitest, ni
ningún otro framework. No existen carpetas `__tests__/`, `*.test.ts`, ni `*.spec.ts`.

---

## Archivos Que Necesitan Tests

### Alta Prioridad (lógica crítica de seguridad y negocio)

| Archivo | Descripción | Por qué es crítico |
|---------|-------------|-------------------|
| `src/lib/calendar-validation.ts` | Validaciones ISO 8601, eventId, sanitizeEventBody | Funciones puras, sin mocks, son la barrera contra injection hacia Google API |
| `src/lib/rate-limiter.ts` | Rate limiting in-memory por usuario | Lógica con estado + ventana de tiempo, fácil de testear con mock de Date.now() |
| `src/lib/get-access-token.ts` | Extrae access_token del JWT httpOnly | Puente entre sesión y endpoints; fallo aquí bloquea toda la app |
| `app/api/calendar/events/route.ts` | GET y POST de eventos | Orquesta auth + rate limit + validación + paginación + Google API |
| `app/api/calendar/events/[eventId]/route.ts` | PATCH y DELETE de eventos | Misma cadena de seguridad + validación de eventId |
| `middleware.ts` | Protección de rutas `/dashboard` y `/api/calendar/*` | Primera línea de defensa; un bug aquí expone todo |
| `src/lib/google-calendar.ts` | Wrapper fetch → Google Calendar API | Manejo de errores HTTP tipados, caso especial 204 |

### Media Prioridad

| Archivo | Descripción |
|---------|-------------|
| `src/lib/env.ts` | Validación de variables de entorno en startup |
| `src/components/CalendarWithModal.tsx` | Lógica handleSave (POST vs PATCH), handleDelete, timezone |
| `src/components/EventModal.tsx` | Formulario con validación inline, useEffect de sincronización |
| `src/components/ConditionalNavbar.tsx` | Lógica condicional de visibilidad por ruta |
| `auth.config.ts` | Callback redirect con validación de mismo origen |

### Baja Prioridad

| Archivo | Descripción |
|---------|-------------|
| `src/components/CalendarView.tsx` | Función pura `getEventAccentColor` (hash) es testeable; componente depende de FullCalendar |
| `src/components/Sidebar.tsx` | UI con estado de colapso |
| `src/components/Navbar.tsx` | UI con `useSession` |
| `src/components/GoogleSignInButton.tsx` | UI puro, sin lógica |
| `src/lib/prisma.ts` | Singleton de infraestructura — testear indirectamente |
| `auth.ts` | Callbacks JWT complejos, difíciles de testear en aislamiento |
| `app/api/auth/[...nextauth]/route.ts` | Solo re-exporta handlers, sin lógica propia |

---

## Mocks Necesarios

| Módulo | Qué mockear | Método |
|--------|-------------|--------|
| `next-auth/jwt` | `getToken()` | `jest.mock('next-auth/jwt')` |
| `@/src/lib/google-calendar` | `calendarRequest()` | `jest.mock('@/src/lib/google-calendar')` |
| `@/src/lib/get-access-token` | `getServerToken()` | `jest.mock('@/src/lib/get-access-token')` |
| `@/src/lib/rate-limiter` | `checkRateLimit()` | `jest.mock('@/src/lib/rate-limiter')` |
| `fetch` global | Llamadas HTTP a Google | `jest.spyOn(global, 'fetch')` o `msw` |
| `process.env` | Variables de entorno | `process.env.X = '...'` + `jest.resetModules()` |
| `Date.now()` | Control de tiempo en rate limiter | `jest.spyOn(Date, 'now')` |

---

## Setup Recomendado

**Framework: Jest + Testing Library** (estándar para Next.js App Router)

### Paquetes a instalar
```bash
npm install -D jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest @types/jest
```

### Configuración mínima necesaria
- `jest.config.ts` — con `testEnvironment: 'node'` para routes/libs, `jsdom` para componentes
- `jest.setup.ts` — `import '@testing-library/jest-dom'`
- `tsconfig.json` — incluir paths de `@/*` en el moduleNameMapper de Jest
- Scripts en `package.json`: `"test": "jest"`, `"test:watch": "jest --watch"`

### Estructura de carpetas propuesta
```
src/
└── lib/
    ├── __tests__/
    │   ├── calendar-validation.test.ts   ← tests unitarios puros
    │   ├── rate-limiter.test.ts
    │   ├── get-access-token.test.ts
    │   └── google-calendar.test.ts
app/
└── api/
    └── calendar/
        └── __tests__/
            ├── events.test.ts            ← GET y POST
            └── events-eventId.test.ts    ← PATCH y DELETE
```

---

## Gaps en Research

- Web search de best practices no completada (tiempo excesivo) — se usó conocimiento
  del stack (Jest es el estándar documentado en Next.js official docs para App Router)
- No se investigaron alternativas como Vitest (más rápido, mejor DX, compatible con Next.js)
- No se analizaron los componentes `CalendarWithModal` y `EventModal` en detalle

---

## Priorización sugerida para el plan de tests

1. **Setup** — instalar Jest + TS config (sin esto nada funciona)
2. **Unitarios puros** — `calendar-validation.ts` (sin mocks, máximo ROI)
3. **Unitarios con mocks simples** — `rate-limiter.ts`, `env.ts`, `google-calendar.ts`
4. **Unitarios con mocks de auth** — `get-access-token.ts`
5. **Tests de API routes** — `events/route.ts` y `[eventId]/route.ts` (mayor cobertura de seguridad)
6. **Middleware** — si el tiempo lo permite
