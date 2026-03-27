# API: Calendar Event por ID

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Endpoints para actualizar y eliminar un evento específico del calendario primario de Google.

**Archivo fuente**: `app/api/calendar/events/[eventId]/route.ts`

---

## Validación del eventId

Todos los endpoints de este archivo validan `eventId` antes de llamar a Google Calendar API:

- Solo caracteres alfanuméricos, guion (`-`) y guion bajo (`_`)
- Longitud: 5 a 1024 caracteres
- Ejemplos válidos: `abc12`, `event_id-123`, `abc12345678`
- Ejemplos inválidos: `ab` (muy corto), `../evil` (path traversal), `event#1` (carácter inválido)

---

## PATCH /api/calendar/events/[eventId]

Actualiza parcialmente un evento existente en el calendario primario.

### Autenticación
Requerida. Cookie de sesión Auth.js.

### Rate limit
30 requests por minuto por usuario.

### Path params

| Param | Tipo | Descripción |
|-------|------|-------------|
| `eventId` | string | ID del evento en Google Calendar. Alfanumérico + `_-`, 5-1024 chars. |

### Request body

`Content-Type: application/json`

Mismos campos permitidos que POST. Ver [calendar-events.md](calendar-events.md#campos-permitidos).

Los campos enviados **reemplazan** los campos correspondientes del evento existente. Los campos no incluidos en el body no se modifican (comportamiento PATCH de Google Calendar API).

### Responses

| Status | Cuándo | Body |
|--------|--------|------|
| `200` | Evento actualizado | Objeto del evento actualizado |
| `400` | `eventId` inválido | `{ "error": "Invalid event ID" }` |
| `401` | Sin sesión | `{ "error": "Unauthorized" }` |
| `401` | Token expirado y no renovable | `{ "error": "Session expired, please sign in again" }` |
| `429` | Rate limit excedido | `{ "error": "Too Many Requests" }` |
| `500` | Error de Google Calendar API u otro | `{ "error": "Failed to update event" }` |

### Ejemplo

```bash
curl -X PATCH "http://localhost:3000/api/calendar/events/abc12345" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{ "summary": "Nuevo título", "description": "Descripción actualizada" }'
```

```json
{
  "id": "abc12345",
  "summary": "Nuevo título",
  "description": "Descripción actualizada",
  "start": { "dateTime": "2024-01-15T10:00:00-03:00" },
  "end":   { "dateTime": "2024-01-15T11:00:00-03:00" }
}
```

### Notas técnicas

- **`params` es asíncrono en Next.js 15**: la firma del handler es `PATCH(request, { params })` donde `params` es `Promise<{ eventId: string }>`. Requiere `await params` antes de acceder a `eventId`. Esto es diferente de Next.js 14 donde era sincrónico.

- **PATCH parcial**: Google Calendar API implementa PATCH semántico — solo los campos enviados se actualizan. Sin embargo, si se envía `start` sin `end` (o viceversa), la API de Google puede retornar 400 porque el par es co-dependiente.

- **Errores de Google**: si el evento no existe, Google retorna 404, que este handler colapsa en 500 genérico.

---

## DELETE /api/calendar/events/[eventId]

Elimina un evento del calendario primario.

### Autenticación
Requerida. Cookie de sesión Auth.js.

### Rate limit
30 requests por minuto por usuario.

### Path params

| Param | Tipo | Descripción |
|-------|------|-------------|
| `eventId` | string | ID del evento a eliminar. Alfanumérico + `_-`, 5-1024 chars. |

### Responses

| Status | Cuándo | Body |
|--------|--------|------|
| `204` | Evento eliminado | Sin body |
| `400` | `eventId` inválido | `{ "error": "Invalid event ID" }` |
| `401` | Sin sesión | `{ "error": "Unauthorized" }` |
| `401` | Token expirado y no renovable | `{ "error": "Session expired, please sign in again" }` |
| `429` | Rate limit excedido | `{ "error": "Too Many Requests" }` |
| `500` | Error de Google Calendar API u otro | `{ "error": "Failed to delete event" }` |

### Ejemplo

```bash
curl -X DELETE "http://localhost:3000/api/calendar/events/abc12345" \
  -H "Cookie: next-auth.session-token=..."
# → HTTP 204 No Content (sin body)
```

### Notas técnicas

- **Response 204 sin body**: la respuesta usa `new Response(null, { status: 204 })` en lugar de `NextResponse.json(...)`. Esto es intencional — HTTP 204 por convención no debe tener body. `NextResponse.json(null)` enviaría `Content-Type: application/json` con body `null` serializado, que algunos clientes HTTP interpretan como error.

- **Sin verificación de existencia previa**: el handler no verifica si el evento existe antes de hacer el DELETE. Google Calendar retorna 404 si no existe, que este handler colapsa en 500. En el flujo normal del cliente esto no ocurre porque solo se puede eliminar un evento que se muestra en el calendario.
