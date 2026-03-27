# Componente: CalendarWithModal

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Orquesta `CalendarView` y `EventModal`: maneja el estado del modal, conecta los eventos del calendario con el formulario, y hace las llamadas a la API.

**Archivo fuente**: `src/components/CalendarWithModal.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Componente contenedor que une las dos piezas principales de la UI del dashboard:

1. **`CalendarView`** — renderiza el calendario y emite eventos cuando el usuario selecciona un slot o hace click en un evento
2. **`EventModal`** — formulario para crear/editar/eliminar eventos

`CalendarWithModal` contiene toda la lógica de estado compartido y las llamadas fetch a la API.

---

## Props

Sin props — es un componente standalone usado directamente en `app/dashboard/page.tsx`.

---

## Uso

```tsx
// app/dashboard/page.tsx
import CalendarWithModal from "@/src/components/CalendarWithModal"

export default function DashboardPage() {
  return <CalendarWithModal />
}
```

---

## Estado interno

| Estado | Tipo | Descripción |
|--------|------|-------------|
| `modal` | `ModalState` | Estado completo del modal: `isOpen`, `eventId?`, `title`, `start`, `end` |
| `refreshKey` | `number` | Número que se incrementa para forzar un re-mount de `CalendarView` |

```ts
interface ModalState {
  isOpen: boolean
  eventId?: string   // presente solo en modo edición
  title: string
  start: string
  end: string
}
```

---

## Patrón refreshKey

`CalendarView` no expone un método imperativo para recargar eventos. En su lugar, `CalendarWithModal` usa la prop `key` de React:

```tsx
<CalendarView key={refreshKey} ... />
```

Cuando `refreshKey` cambia, React desmonta y remonta `CalendarView`, triggereando el fetch inicial de eventos. Este patrón se activa después de guardar o eliminar un evento:

```ts
const refresh = () => setRefreshKey(k => k + 1)

const handleSave = async (data) => {
  await fetch(...)   // POST o PATCH
  refresh()          // incrementa refreshKey → CalendarView se remonta → re-fetch
}

const handleDelete = async () => {
  await fetch(...)   // DELETE
  refresh()
}
```

---

## Flujo: crear un evento

1. Usuario arrastra en el calendario → `CalendarView.onSelectSlot` dispara
2. `handleSelectSlot` abre el modal con `isOpen: true`, sin `eventId`, con `start`/`end` del slot seleccionado
3. Usuario completa el formulario y hace click en "Guardar"
4. `handleSave` recibe `{ title, start, end }` del modal
5. Convierte `start`/`end` a ISO 8601 con timezone del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
6. POST a `/api/calendar/events`
7. `refresh()` → `CalendarView` se remonta y recarga los eventos

---

## Flujo: editar un evento

1. Usuario hace click en un evento del calendario → `CalendarView.onEventClick` dispara
2. `handleEventClick` abre el modal con `eventId` del evento, título, start y end pre-rellenados
3. Usuario modifica el formulario y hace click en "Guardar"
4. `handleSave` hace PATCH a `/api/calendar/events/{eventId}`
5. `refresh()` → recarga

---

## Flujo: eliminar un evento

1. Modal abierto en modo edición (con `eventId`)
2. Usuario hace click en "Eliminar"
3. `handleDelete` hace DELETE a `/api/calendar/events/{eventId}`
4. `refresh()` → recarga

---

## Conversión de fechas

```ts
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

const body = {
  summary: data.title,
  start: { dateTime: new Date(data.start).toISOString(), timeZone: tz },
  end:   { dateTime: new Date(data.end).toISOString(),   timeZone: tz },
}
```

`data.start` viene del modal en formato `YYYY-MM-DDTHH:mm` (del input `datetime-local`). `new Date(data.start).toISOString()` produce `YYYY-MM-DDTHH:mm:ss.mmmZ` — con milisegundos.

> **Nota**: este formato con milisegundos no pasa la validación `isValidISO8601` del servidor, pero esos valores van en el **body** del POST/PATCH (no en query params del GET), y la validación ISO8601 solo se aplica a `timeMin`/`timeMax`. El body va a Google Calendar API directamente (previa sanitización de allowlist).

---

## Dependencias

- [`CalendarView`](CalendarView.md) — vista del calendario
- [`EventModal`](EventModal.md) — formulario de evento
- `fetch` nativo del browser para las llamadas a la API
