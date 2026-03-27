# API: Calendar Stats

<!-- generado: 2026-03-27 | commit: 789645c -->

Endpoint para calcular estadísticas de uso del calendario primario de Google del usuario autenticado en un rango de fechas dado.

**Archivo fuente**: `app/api/calendar/stats/route.ts`

---

## GET /api/calendar/stats

Procesa todos los eventos del rango indicado y devuelve KPIs de ocupación, distribución de horas por día o semana, desglose por categoría, horas pico y grupos de reuniones consecutivas.

### Autenticación

Requerida. Cookie de sesión Auth.js (`next-auth.session-token` httpOnly).

### Rate limit

30 requests por minuto por usuario.

### Query params

| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `timeMin` | string | ✅ | Inicio del rango actual. Formato ISO 8601: `2024-01-15T00:00:00Z` o `2024-01-15T00:00:00-03:00` |
| `timeMax` | string | ✅ | Fin del rango actual. Mismo formato que `timeMin` |
| `prevTimeMin` | string | ❌ | Inicio del rango anterior (período de comparación). Mismo formato ISO 8601 |
| `prevTimeMax` | string | ❌ | Fin del rango anterior. Requerido si se pasa `prevTimeMin` |
| `groupBy` | string | ❌ | Agrupación temporal del gráfico de horas. Valores: `"day"` (default) o `"week"` |

**Formato ISO 8601 aceptado**: `YYYY-MM-DDTHH:mm:ssZ` o `YYYY-MM-DDTHH:mm:ss±HH:mm`

> ⚠️ El formato **no acepta milisegundos** (`2024-01-15T00:00:00.000Z` retorna 400).
> ⚠️ El formato **no acepta fechas sin hora** (`2024-01-15` retorna 400).
> ⚠️ `prevTimeMin` y `prevTimeMax` se validan de forma independiente: si uno tiene formato inválido retorna 400 aunque el otro sea correcto.

### Responses

| Status | Cuándo | Body |
|--------|--------|------|
| `200` | Éxito | Objeto con `kpis`, `hoursPerDay`, `byCategory`, `peakHours`, `backToBack` (ver estructura abajo) |
| `400` | Faltan `timeMin` o `timeMax` | `{ "error": "timeMin y timeMax son requeridos" }` |
| `400` | `timeMin` o `timeMax` con formato inválido | `{ "error": "Invalid date format. Use ISO 8601." }` |
| `400` | `prevTimeMin` con formato inválido | `{ "error": "Invalid prevTimeMin format. Use ISO 8601." }` |
| `400` | `prevTimeMax` con formato inválido | `{ "error": "Invalid prevTimeMax format. Use ISO 8601." }` |
| `401` | Sin sesión | `{ "error": "Unauthorized" }` |
| `401` | Token de Google expirado y no renovable | `{ "error": "Session expired, please sign in again" }` |
| `429` | Rate limit excedido | `{ "error": "Too Many Requests" }` |
| `500` | Error de Google Calendar API u otro | `{ "error": "Error computing stats" }` |

### Estructura de la respuesta 200

```ts
{
  kpis: {
    totalHours:          number   // horas totales en el rango (2 decimales)
    totalEvents:         number   // cantidad de eventos no cancelados
    occupancyPercent:    number   // % sobre una semana laboral de 60h (1 decimal)
    avgDurationMinutes:  number   // duración promedio por evento, redondeado a entero
  }
  hoursPerDay: Array<{
    label:    string   // "Lun"/"Mar"/"Mié"/"Jue"/"Vie" (groupBy=day) o "Sem 1"–"Sem 4" (groupBy=week)
    current:  number   // horas en el período actual (2 decimales)
    previous: number   // horas en el período anterior (2 decimales); 0 si no se pasó prevTimeMin/Max
  }>
  byCategory: Array<{
    name:    string   // nombre de la categoría (ver tabla de categorías)
    hours:   number   // horas totales en esa categoría (2 decimales)
    percent: number   // porcentaje sobre el total de horas (1 decimal)
  }>
  peakHours: Array<{
    hour:  string   // franja horaria en formato "HH:00", de "08:00" a "19:00"
    count: number   // cantidad de eventos que comienzan en esa hora
  }>
  backToBack: Array<Array<{
    id:      string   // ID del evento en Google Calendar
    summary: string   // título del evento; "(Sin título)" si no tiene
    start:   string   // dateTime ISO 8601
    end:     string   // dateTime ISO 8601
  }>>
}
```

### Categorías reconocidas

La categoría se detecta buscando las keywords en el título del evento (case-insensitive). Se evalúan en orden y se asigna la primera que coincida. Si ninguna coincide, el evento queda en `"Otro"`.

| Categoría | Keywords que activan la categoría |
|-----------|-----------------------------------|
| `1:1` | `1:1`, `1on1`, `one on one`, `one-on-one` |
| `Planning` | `planning`, `sprint`, `roadmap` |
| `Review` | `review`, `retro`, `retrospectiva` |
| `Standup` | `standup`, `stand-up`, `daily`, `scrum` |
| `Entrevista` | `entrevista`, `interview` |
| `Sync` | `sync`, `sincronización`, `reunion`, `reunión`, `meeting` |
| `Formación` | `training`, `capacitación`, `formación`, `workshop` |
| `Otro` | (todos los eventos que no coinciden con ninguna categoría anterior) |

### Ejemplo

```bash
curl "http://localhost:3000/api/calendar/stats?\
timeMin=2024-01-01T00:00:00Z&\
timeMax=2024-01-31T23:59:59Z&\
prevTimeMin=2023-12-01T00:00:00Z&\
prevTimeMax=2023-12-31T23:59:59Z&\
groupBy=day" \
  -H "Cookie: next-auth.session-token=..."
```

```json
{
  "kpis": {
    "totalHours": 34.5,
    "totalEvents": 22,
    "occupancyPercent": 57.5,
    "avgDurationMinutes": 94
  },
  "hoursPerDay": [
    { "label": "Lun", "current": 8.5,  "previous": 6.0  },
    { "label": "Mar", "current": 7.0,  "previous": 5.5  },
    { "label": "Mié", "current": 6.25, "previous": 7.0  },
    { "label": "Jue", "current": 9.0,  "previous": 4.5  },
    { "label": "Vie", "current": 3.75, "previous": 3.0  }
  ],
  "byCategory": [
    { "name": "Sync",       "hours": 12.0, "percent": 34.8 },
    { "name": "Planning",   "hours": 8.5,  "percent": 24.6 },
    { "name": "1:1",        "hours": 6.0,  "percent": 17.4 },
    { "name": "Standup",    "hours": 4.5,  "percent": 13.0 },
    { "name": "Otro",       "hours": 3.5,  "percent": 10.1 }
  ],
  "peakHours": [
    { "hour": "08:00", "count": 1 },
    { "hour": "09:00", "count": 5 },
    { "hour": "10:00", "count": 7 },
    { "hour": "11:00", "count": 3 },
    { "hour": "12:00", "count": 2 },
    { "hour": "13:00", "count": 0 },
    { "hour": "14:00", "count": 1 },
    { "hour": "15:00", "count": 2 },
    { "hour": "16:00", "count": 1 },
    { "hour": "17:00", "count": 0 },
    { "hour": "18:00", "count": 0 },
    { "hour": "19:00", "count": 0 }
  ],
  "backToBack": [
    [
      { "id": "abc1", "summary": "Standup diario",   "start": "2024-01-15T09:00:00-03:00", "end": "2024-01-15T09:30:00-03:00" },
      { "id": "abc2", "summary": "Planning de sprint","start": "2024-01-15T09:35:00-03:00", "end": "2024-01-15T10:30:00-03:00" }
    ]
  ]
}
```

### Notas técnicas

- **Paginación automática**: igual que `/api/calendar/events`, pagina hasta `MAX_PAGES = 10` páginas de 2.500 eventos (máximo 25.000 por rango). Los eventos adicionales se truncan silenciosamente.

- **Eventos cancelados**: los eventos con `status = "cancelled"` se descartan antes de cualquier cómputo. No aparecen en ninguno de los campos de la respuesta.

- **Eventos de todo el día**: los eventos sin `dateTime` (solo con `date`) se cuentan como **480 minutos fijos (8 horas)** en todos los cálculos. No se incluyen en `peakHours` ni en `backToBack` porque no tienen hora de inicio precisa.

- **Período de comparación**: si `prevTimeMin` y `prevTimeMax` no se envían, el campo `previous` en cada elemento de `hoursPerDay` vale `0`. Los `kpis` y el resto de campos siempre corresponden solo al período actual.

- **groupBy=week**: agrupa los eventos en 4 buckets ("Sem 1" a "Sem 4") calculando a cuántos días de distancia está cada evento desde `timeMin` (o `prevTimeMin` para el período anterior), y dividiéndolo por 7. Los eventos más allá del día 28 caen en el bucket "Sem 4".

- **Horas pico**: el análisis cubre únicamente la franja 08:00–19:00 (12 slots). La hora se extrae directamente de la porción local del string ISO 8601 (los caracteres `HH` después de la `T`), sin conversión a UTC. Los eventos sin `dateTime` (todo el día) no se incluyen.

- **Back-to-back**: dos eventos consecutivos se consideran back-to-back si el gap entre el fin del primero y el inicio del segundo es **menor a 15 minutos**. El resultado es una lista de grupos (arrays), donde cada grupo tiene al menos 2 eventos. Solo se consideran eventos con `dateTime` (los eventos de todo el día se excluyen).

- **occupancyPercent**: se calcula sobre una semana laboral teórica de **3.600 minutos (5 días × 12 horas)**. Valores superiores a 100% son posibles si el rango contiene múltiples semanas o eventos fuera del horario laboral estándar.

- **Errores de Google Calendar**: cualquier error de la API de Google retorna 500 con `{ "error": "Error computing stats" }`. Los detalles no se exponen al cliente.

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-03-27 | Versión inicial |
