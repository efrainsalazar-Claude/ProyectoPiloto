# Lib: calendar-validation

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Funciones puras de validación y sanitización para inputs de la Google Calendar API.

**Archivo fuente**: `src/lib/calendar-validation.ts`

---

## Funciones

### `isValidISO8601(value)`

```ts
function isValidISO8601(value: string): boolean
```

Valida que un string sea una fecha ISO 8601 con hora y timezone explícito.

**Regex**: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$`

| Input | Resultado | Motivo |
|-------|-----------|--------|
| `"2024-01-15T10:30:00Z"` | ✅ `true` | Formato correcto con UTC |
| `"2024-01-15T10:30:00-03:00"` | ✅ `true` | Formato correcto con offset |
| `"2024-01-15T10:30:00+05:30"` | ✅ `true` | Offset positivo válido |
| `"2024-01-15T10:30:00.000Z"` | ❌ `false` | **No acepta milisegundos** |
| `"2024-01-15T10:30Z"` | ❌ `false` | **Requiere segundos** (`HH:mm:ss`) |
| `"2024-01-15"` | ❌ `false` | Solo fecha, sin hora |
| `"2024-01-15T10:30:00"` | ❌ `false` | Sin timezone |
| `""` | ❌ `false` | String vacío |

> ⚠️ **`new Date().toISOString()`** en JavaScript produce `"2024-01-15T10:30:00.000Z"` (con milisegundos) — este formato **no pasa** esta validación. Solo se usa para `timeMin`/`timeMax` (query params del GET), no para el body del POST/PATCH.
>
> ⚠️ El formato `"YYYY-MM-DDTHH:mm"` (sin segundos) que produce `<input type="datetime-local">` tampoco pasa.

Se usa en `GET /api/calendar/events` para validar los query params `timeMin` y `timeMax`.

---

### `isValidEventId(value)`

```ts
function isValidEventId(value: string): boolean
```

Valida que un string sea un eventId válido de Google Calendar.

**Regex**: `^[a-zA-Z0-9_-]{5,1024}$`

| Input | Resultado | Motivo |
|-------|-----------|--------|
| `"abc12"` | ✅ `true` | Mínimo de 5 caracteres |
| `"event_id-123"` | ✅ `true` | Guiones y underscore permitidos |
| `"ab12"` | ❌ `false` | Menos de 5 caracteres |
| `"../evil"` | ❌ `false` | Caracteres de path traversal |
| `"event#1"` | ❌ `false` | `#` no permitido |
| `""` | ❌ `false` | Vacío |

Se usa en `PATCH` y `DELETE /api/calendar/events/[eventId]` para validar el path param.

---

### `sanitizeEventBody(body)`

```ts
function sanitizeEventBody(body: Record<string, unknown>): Record<string, unknown>
```

Filtra un objeto dejando solo los campos del allowlist. Los campos fuera de la lista se eliminan silenciosamente.

**Allowlist de campos permitidos:**

| Campo | Tipo Google Calendar |
|-------|---------------------|
| `summary` | string — título del evento |
| `description` | string — descripción/notas |
| `location` | string — ubicación |
| `start` | object — `{ dateTime, timeZone }` o `{ date }` |
| `end` | object — igual que `start` |
| `colorId` | string — "1" a "11" |
| `reminders` | object — configuración de recordatorios |
| `visibility` | string — "default", "public", "private", "confidential" |
| `status` | string — "confirmed", "tentative", "cancelled" |

**Campos excluidos intencionalmente:**
- `attendees` — invitar participantes está fuera del scope del MVP
- `recurrence` — eventos recurrentes no están soportados
- `id`, `creator`, `organizer`, `recurringEventId`, `htmlLink` — campos de solo lectura de la API
- Cualquier otro campo no listado arriba

**Ejemplos:**

```ts
sanitizeEventBody({ summary: "Meeting", attendees: [{ email: "x@y.com" }] })
// → { summary: "Meeting" }  (attendees eliminado)

sanitizeEventBody({ summary: "Meeting", start: {...}, end: {...}, description: "Notes" })
// → { summary: "Meeting", start: {...}, end: {...}, description: "Notes" }  (todos permitidos)

sanitizeEventBody({ creator: { email: "evil" }, id: "override" })
// → {}  (todos eliminados)
```

Se usa en `POST /api/calendar/events` y `PATCH /api/calendar/events/[eventId]`.

---

## Tests

Las tres funciones tienen cobertura del **100%** (statements, branches, functions, lines).

Ver tests en `src/lib/__tests__/calendar-validation.test.ts` — 17 tests.
