# Componente: EventModal

<!-- generado: 2026-03-26 | commit: 6aac5aa -->

Modal para crear o editar un evento del calendario. Renderiza un formulario con título, fecha/hora de inicio y fin.

**Archivo fuente**: `src/components/EventModal.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Modal controlado externamente vía la prop `isOpen`. Sirve tanto para crear un nuevo evento (cuando `initialData` no tiene `id`) como para editar uno existente (cuando `initialData.id` está presente).

**No hace llamadas a la API directamente** — delega las operaciones de guardar y eliminar a los callbacks `onSave` y `onDelete` del padre.

---

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `isOpen` | `boolean` | ✅ | Controla si el modal está visible |
| `onClose` | `() => void` | ✅ | Callback para cerrar el modal (botón Cancelar, click en backdrop) |
| `onSave` | `(data: { title, start, end }) => Promise<void>` | ✅ | Callback para guardar. Recibe `title` (string), `start` y `end` (strings en formato `YYYY-MM-DDTHH:mm`) |
| `onDelete` | `() => Promise<void>` | ❌ | Si está presente, muestra el botón "Eliminar". Solo aplica cuando `initialData.id` existe. |
| `initialData` | `{ id?, title, start, end }` | ❌ | Pre-rellena el formulario. Si `id` está presente, el modal entra en modo edición. |

---

## Modos de operación

**Modo creación** (`initialData` sin `id`):
- Título del modal: "Nuevo evento"
- El formulario se pre-rellena con las fechas del slot seleccionado
- No muestra botón "Eliminar"
- `onSave` → el padre hace POST a `/api/calendar/events`

**Modo edición** (`initialData.id` presente):
- Título del modal: "Editar evento"
- El formulario se pre-rellena con los datos del evento existente
- Muestra botón "Eliminar" (solo si `onDelete` está definido)
- `onSave` → el padre hace PATCH a `/api/calendar/events/{id}`
- `onDelete` → el padre hace DELETE a `/api/calendar/events/{id}`

---

## Uso

```tsx
<EventModal
  isOpen={modal.isOpen}
  onClose={() => setModal(CLOSED)}
  onSave={async (data) => {
    await fetch("/api/calendar/events", {
      method: "POST",
      body: JSON.stringify({ summary: data.title, start: { dateTime: data.start }, end: { dateTime: data.end } })
    })
  }}
  onDelete={modal.eventId ? async () => {
    await fetch(`/api/calendar/events/${modal.eventId}`, { method: "DELETE" })
  } : undefined}
  initialData={modal.isOpen ? { id: modal.eventId, title: modal.title, start: modal.start, end: modal.end } : undefined}
/>
```

Para uso integrado con CalendarView, ver [`CalendarWithModal`](CalendarWithModal.md).

---

## Estado interno

| Estado | Tipo | Descripción |
|--------|------|-------------|
| `title` | `string` | Valor del campo título |
| `start` | `string` | Valor del campo inicio (`YYYY-MM-DDTHH:mm`) |
| `end` | `string` | Valor del campo fin (`YYYY-MM-DDTHH:mm`) |
| `saving` | `boolean` | `true` mientras `onSave` está en progreso |
| `deleting` | `boolean` | `true` mientras `onDelete` está en progreso |

---

## Formato de fechas

Los inputs de fecha son de tipo `datetime-local` (`<input type="datetime-local">`), que usa el formato `YYYY-MM-DDTHH:mm`.

Al pre-rellenar desde `initialData`, los valores se truncan a 16 caracteres (`.slice(0, 16)`) para eliminar segundos y milisegundos que el input no acepta:

```ts
setStart(initialData.start.slice(0, 16))  // "2024-01-15T10:00" ✓ (no "2024-01-15T10:00:00Z")
```

Los valores que llegan a `onSave` están en formato `YYYY-MM-DDTHH:mm` (sin timezone). El padre es responsable de agregar el timezone antes de enviar a la API.

---

## Validación

El botón "Guardar" está deshabilitado hasta que `title.trim()`, `start`, y `end` tengan valores. No hay validación de que `end > start`.

---

## Campos no disponibles en el formulario

El modal solo permite editar `title` (→ `summary`), `start`, y `end`. Campos como `description`, `location`, `colorId` no tienen inputs en el formulario — para editarlos habría que hacerlo directamente en Google Calendar.
