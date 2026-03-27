# CalendarAI

Dashboard de calendario personal con integración de Google Calendar. Permite visualizar, crear, editar y eliminar eventos del calendario primario de Google desde una interfaz web.

## Stack

| Tecnología | Versión |
|------------|---------|
| Next.js | 16.2.0 |
| React | 19.2.3 |
| TypeScript | 5.x |
| Auth.js (NextAuth) | 5.0.0-beta.30 |
| Prisma | 7.5.0 |
| PostgreSQL | local (puerto 5432) |
| Tailwind CSS | 4.x |
| FullCalendar | 6.1.20 |

## Requisitos previos

- **Node.js** v24+
- **PostgreSQL** corriendo localmente en el puerto 5432
- **Cuenta de Google Cloud Console** con OAuth 2.0 configurado (ver setup abajo)

## Levantar en local

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
```

Editar `.env` y completar los 4 valores (ver tabla abajo).

### 3. Crear la base de datos y aplicar el schema
```bash
npx prisma migrate dev
```

Esto crea la base de datos `proyecto_piloto_db` y aplica todas las migraciones.

### 4. Iniciar el servidor de desarrollo
```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | ✅ | String de conexión a PostgreSQL. Ej: `postgresql://user:pass@localhost:5432/proyecto_piloto_db` |
| `AUTH_SECRET` | ✅ | String aleatorio para firmar los JWT de sesión. Generar con: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | ✅ | Client ID de Google OAuth 2.0. Obtener en Google Cloud Console → APIs & Services → Credentials |
| `AUTH_GOOGLE_SECRET` | ✅ | Client Secret del mismo OAuth 2.0 client |

### Configurar Google OAuth

1. Ir a [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Crear un **OAuth 2.0 Client ID** de tipo "Web application"
3. En **Authorized redirect URIs** agregar: `http://localhost:3000/api/auth/callback/google`
4. En **OAuth consent screen** agregar el scope: `https://www.googleapis.com/auth/calendar.events`
5. Copiar Client ID y Client Secret al `.env`

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo en localhost:3000 (Turbopack) |
| `npm run build` | Compilar para producción |
| `npm start` | Servidor de producción |
| `npm test` | Correr suite de tests (62 tests) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npx prisma migrate dev --name [nombre]` | Aplicar cambios del schema a la BD |
| `npx prisma studio` | UI visual de la BD en localhost:5555 |
| `npx prisma generate` | Regenerar cliente tras cambios en schema |

## Documentación técnica

Ver [`docs/`](docs/) para documentación detallada:

- [`docs/architecture/auth-flow.md`](docs/architecture/auth-flow.md) — flujo de autenticación con Google OAuth, JWT strategy, refresh token rotation
- [`docs/architecture/security.md`](docs/architecture/security.md) — decisiones de seguridad, rate limiter, headers HTTP
- [`docs/api/calendar-events.md`](docs/api/calendar-events.md) — endpoints GET y POST de eventos
- [`docs/api/calendar-eventid.md`](docs/api/calendar-eventid.md) — endpoints PATCH y DELETE por eventId
- [`docs/components/`](docs/components/) — componentes del calendario (CalendarView, EventModal, CalendarWithModal)
- [`docs/lib/`](docs/lib/) — utilidades del servidor (get-access-token, rate-limiter, calendar-validation)

## Estructura del proyecto

```
app/                    ← Next.js App Router
├── api/
│   └── calendar/
│       └── events/     ← GET, POST, PATCH, DELETE de eventos de Google Calendar
├── dashboard/          ← página principal (requiere autenticación)
├── login/              ← página de login con Google
└── page.tsx            ← landing page pública

src/
├── components/         ← componentes React (Client Components)
│   ├── CalendarView.tsx        ← vista semanal con FullCalendar
│   ├── EventModal.tsx          ← modal crear/editar eventos
│   ├── CalendarWithModal.tsx   ← orquesta CalendarView + EventModal
│   └── Sidebar.tsx             ← sidebar colapsable del dashboard
└── lib/                ← utilidades del servidor (solo Node.js)
    ├── get-access-token.ts     ← lee el access_token de Google del JWT cookie
    ├── rate-limiter.ts         ← rate limiting por usuario (in-memory)
    ├── calendar-validation.ts  ← validación ISO8601, eventId, allowlist de campos
    ├── google-calendar.ts      ← wrapper de Google Calendar API
    ├── env.ts                  ← validación de variables de entorno al startup
    └── prisma.ts               ← singleton del cliente Prisma

prisma/
├── schema.prisma       ← modelos User, Account, Session, VerificationToken
└── migrations/         ← historial de migraciones (no editar manualmente)

auth.ts                 ← configuración principal de Auth.js v5 (con Prisma)
auth.config.ts          ← configuración Edge-compatible (para middleware, sin Prisma)
middleware.ts           ← protección de rutas /dashboard y /api/calendar/*
```
