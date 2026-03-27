# API: Calendar Events

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Endpoints para listar y crear eventos en el calendario primario de Google del usuario autenticado.

**Archivo fuente**: `app/api/calendar/events/route.ts`

---

## GET /api/calendar/events

Lista los eventos del calendario primario en un rango de fechas. Aplica paginación automática.

### Autenticación
Requerida. Cookie de sesión Auth.js (`next-auth.session-token` httpOnly).

### Rate limit
30 requests por minuto por usuario.

### Query params

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `timeMin` | string | ✅ | Inicio del rango. Formato ISO 8601 con timezone: `2024-01-15T00:00:00Z` o `2024-01-15T00:00:00-03:00` |
| `timeMax` | string | ✅ | Fin del rango. Mismo formato que `timeMin` |

**Formato ISO 8601 aceptado**: `YYYY-MM-DDTHH:mm:ssZ` o `YYYY-MM-DDTHH:mm:ss±HH:mm`

> ⚠️ El formato **no acepta milisegundos** (`2024-01-15T00:00:00.000Z` retorna 400).
> ⚠️ El formato **no acepta fechas sin hora** (`2024-01-15` retorna 400).

### Responses

| Status | Cuándo | Body |
|--------|--------|------|
| `200` | Éxito | Array de [Google Calendar Event objects](https://developers.google.com/calendar/api/v3/reference/events#resource) |
| `400` | Faltan `timeMin` o `timeMax` | `{ "error": "timeMin y timeMax son requeridos" }` |
| `400` | Formato de fecha inválido | `{ "error": "Invalid date format. Use ISO 8601." }` |
| `401` | Sin sesión | `{ "error": "Unauthorized" }` |
| `401` | Token de Google expirado y no renovable | `{ "error": "Session expired, please sign in again" }` |
| `429` | Rate limit excedido | `{ "error": "Too Many Requests" }` |
| `500` | Error de Google Calendar API u otro | `{ "error": "Error fetching events" }` |

### Ejemplo

```bash
curl "http://localhost:3000/api/calendar/events?\
timeMin=2024-01-01T00:00:00Z&\
timeMax=2024-01-31T23:59:59Z" \
  -H "Cookie: next-auth.session-token=..."
```

```json
[
  {
    "id": "abc123def456",
    "summary": "Reunión de equipo",
    "start": { "dateTime": "2024-01-15T10:00:00-03:00", "timeZone": "America/Argentina/Buenos_Aires" },
    "end":   { "dateTime": "2024-01-15T11:00:00-03:00", "timeZone": "America/Argentina/Buenos_Aires" }
  }
]
```

### Notas técnicas

- **Paginación automática**: el endpoint pagina automáticamente hasta `MAX_PAGES = 10` páginas de 2.500 eventos cada una (máximo 25.000 eventos por request). Si el calendario tiene más de 25.000 eventos en el rango, los adicionales se **truncan silenciosamente** — el cliente no recibe aviso.

- **`singleEvents=true`**: los eventos recurrentes se expanden en instancias individuales. Sin esto, un evento que se repite semanalmente aparecería como un único objeto con regla RRULE.

- **`orderBy=startTime`**: requiere `singleEvents=true`. Si se quitara `singleEvents`, esta combinación produciría un error 400 de la API de Google.

- **Errores de Google Calendar**: cualquier error de la API de Google (403 forbidden, quota exceeded, 503, etc.) retorna 500 con `{ "error": "Error fetching events" }`. Los detalles del error de Google no se exponen al cliente.

---

## POST /api/calendar/events

Crea un nuevo evento en el calendario primario del usuario.

### Autenticación
Requerida. Cookie de sesión Auth.js.

### Rate limit
30 requests por minuto por usuario. Comparte el conteo con GET.

### Request body

`Content-Type: application/json`

**Campos permitidos** (campos fuera de esta lista se eliminan silenciosamente antes de enviar a Google):

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `summary` | string | ✅ | Título del evento |
| `start` | object | ✅ | Inicio: `{ dateTime: string, timeZone?: string }` o `{ date: string }` para todo el día |
| `end` | object | ✅ | Fin: mismo formato que `start` |
| `description` | string | ❌ | Descripción/notas del evento |
| `location` | string | ❌ | Ubicación del evento |
| `colorId` | string | ❌ | ID de color de Google Calendar (1-11) |
| `reminders` | object | ❌ | Configuración de recordatorios |
| `visibility` | string | ❌ | `"default"`, `"public"`, `"private"`, `"confidential"` |
| `status` | string | ❌ | `"confirmed"`, `"tentative"`, `"cancelled"` |

> **Campos ignorados**: `id`, `attendees`, `recurrence`, `creator`, `organizer`, `recurringEventId`, `htmlLink`, y cualquier otro campo no en la lista anterior se elimina antes de llamar a Google.

### Responses

| Status | Cuándo | Body |
|--------|--------|------|
| `201` | Evento creado | Objeto del evento creado (Google Calendar Event resource) |
| `400` | Falta `summary`, `start` o `end` | `{ "error": "Missing required fields: summary, start, end" }` |
| `401` | Sin sesión | `{ "error": "Unauthorized" }` |
| `401` | Token de Google expirado y no renovable | `{ "error": "Session expired, please sign in again" }` |
| `429` | Rate limit excedido | `{ "error": "Too Many Requests" }` |
| `500` | Error de Google Calendar API u otro | `{ "error": "Error creating event" }` |

### Ejemplo

```bash
curl -X POST "http://localhost:3000/api/calendar/events" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "summary": "Standup diario",
    "start": { "dateTime": "2024-01-15T09:00:00-03:00", "timeZone": "America/Argentina/Buenos_Aires" },
    "end":   { "dateTime": "2024-01-15T09:30:00-03:00", "timeZone": "America/Argentina/Buenos_Aires" },
    "description": "Revisión del sprint"
  }'
```

```json
{
  "id": "xyz789abc",
  "summary": "Standup diario",
  "start": { "dateTime": "2024-01-15T09:00:00-03:00" },
  "end":   { "dateTime": "2024-01-15T09:30:00-03:00" },
  "htmlLink": "https://www.google.com/calendar/event?eid=..."
}
```

### Notas técnicas

- La sanitización del body ocurre **antes** de la validación de campos requeridos. Si el cliente envía un campo requerido con un nombre no permitido (por ejemplo, `title` en lugar de `summary`), será eliminado por `sanitizeEventBody` y luego la validación fallará con 400.

- Para crear eventos de **todo el día**, usar `{ "date": "2024-01-15" }` en lugar de `dateTime`.
