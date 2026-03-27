# Componente: CalendarView

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Vista semanal del calendario que obtiene y renderiza eventos de Google Calendar usando FullCalendar.

**Archivo fuente**: `src/components/CalendarView.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Renderiza una grilla semanal (lunes a viernes, 08:00–20:00) usando FullCalendar con el plugin `timeGrid`. Al montarse y al navegar entre semanas, hace fetch a `/api/calendar/events` y mapea la respuesta al formato `EventInput` de FullCalendar.

**No tiene lógica de mutación** — solo lee y muestra eventos. Las acciones de crear/editar/eliminar se manejan externamente a través de callbacks.

---

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `onSelectSlot` | `(arg: DateSelectArg) => void` | ❌ | Callback cuando el usuario arrastra para seleccionar un slot vacío |
| `onEventClick` | `(arg: EventClickArg) => void` | ❌ | Callback cuando el usuario hace click en un evento existente |

Ambas props son del tipo de FullCalendar (`@fullcalendar/core`).

---

## Uso básico

```tsx
// Uso standalone (solo lectura)
<CalendarView />

// Con handlers para crear/editar
<CalendarView
  onSelectSlot={(arg) => openModal({ start: arg.startStr, end: arg.endStr })}
  onEventClick={(arg) => openModal({ id: arg.event.id, title: arg.event.title })}
/>
```

Para uso con modal integrado, ver [`CalendarWithModal`](CalendarWithModal.md).

---

## Estado interno

| Estado | Tipo | Descripción |
|--------|------|-------------|
| `events` | `EventInput[]` | Lista de eventos mapeados al formato de FullCalendar |
| `loading` | `boolean` | `true` mientras se hace fetch a la API |

---

## Comportamiento de re-fetch

El re-fetch se dispara automáticamente cuando FullCalendar emite el evento `datesSet` — esto ocurre al montar el componente y al navegar entre semanas con los botones prev/next/today.

> **Patrón refreshKey**: `CalendarView` no expone un método para forzar un re-fetch externo. Si el padre necesita refrescar los eventos (por ejemplo, después de crear uno nuevo), debe cambiar la prop `key` del componente. Esto desmonta y remonta el componente, triggereando el fetch inicial.

```tsx
// CalendarWithModal usa este patrón:
const [refreshKey, setRefreshKey] = useState(0)
const refresh = () => setRefreshKey(k => k + 1)

<CalendarView key={refreshKey} ... />
// Llamar refresh() después de crear/editar/eliminar un evento
```

---

## Configuración de FullCalendar

| Opción | Valor | Efecto |
|--------|-------|--------|
| `initialView` | `"timeGridWeek"` | Vista semanal por defecto |
| `weekends` | `false` | Sábado y domingo **no se muestran** (sin indicador en la UI) |
| `slotMinTime` | `"08:00:00"` | El horario comienza a las 8am |
| `slotMaxTime` | `"20:00:00"` | El horario termina a las 8pm |
| `scrollTime` | `"08:00:00"` | La vista hace scroll automático a las 8am al montar |
| `locale` | `"es"` | Nombres de días y meses en español |
| `selectable` | `true` | Permite arrastrar para seleccionar slots vacíos |

---

## Mapeo de eventos Google Calendar → FullCalendar

```ts
{
  id:     e.id,
  title:  e.summary ?? "(Sin título)",
  start:  e.start.dateTime ?? e.start.date,   // dateTime para eventos con hora, date para todo el día
  end:    e.end.dateTime   ?? e.end.date,
  allDay: !e.start.dateTime,                   // true si no tiene dateTime (evento de todo el día)
  color:  getEventAccentColor(e.id),
}
```

`allDay: !e.start.dateTime` es la forma correcta de detectar eventos de día completo en Google Calendar API. Los eventos de todo el día tienen `date` pero no `dateTime`.

---

## Colores de eventos

`getEventAccentColor(id)` asigna un color a cada evento usando un hash de Bernstein sobre el `event.id`:

```ts
let hash = 0
for (let i = 0; i < id.length; i++) {
  hash = (hash * 31 + id.charCodeAt(i)) | 0
}
return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length]
```

**Colores disponibles**: azul, esmeralda, ámbar, rojo, violeta.

El color es **determinístico** — el mismo `event.id` siempre produce el mismo color, entre re-renders y entre sesiones.

---

## Manejo de errores

Los errores del fetch se silencian con `console.error`. El usuario no ve ningún mensaje de error — el calendario simplemente queda vacío si el fetch falla. La UI muestra "Cargando..." mientras el fetch está en progreso.

---

## Dependencias

- `@fullcalendar/react` — cargado con `dynamic(..., { ssr: false })` para evitar SSR issues
- `@fullcalendar/timegrid` — plugin de vista semanal/diaria
- `@fullcalendar/interaction` — plugin para selección de slots y clicks en eventos
