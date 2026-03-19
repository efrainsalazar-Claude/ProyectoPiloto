---
date: 2026-03-18T00:00:00-06:00
git_commit: 1ca4b113890ba23b8c999a873b226aa5b1dcf571
branch: main
topic: "Rediseño visual del calendario semanal del dashboard"
status: in-progress
---

# Plan: Rediseño visual del calendario semanal del dashboard

## Objective
Rediseñar el aspecto visual del calendario semanal para que tenga fondo limpio, grid con líneas sutiles, header de días tipográfico, columna de horas en gris tenue, botones de toolbar minimalistas, y tarjetas de evento con borde izquierdo de color acento — sin tocar lógica de fetch, autenticación ni layout del sidebar.

## Current State
- `src/components/CalendarView.tsx:63-96` — `<FullCalendar>` sin `eventContent`, usa `eventColor="#4f46e5"` y `eventBorderColor="#4338ca"` globales. Todos los eventos son el mismo color indigo.
- `src/components/CalendarView.tsx:55` — wrapper `<div className="h-full relative">`. Sin clases adicionales.
- `app/globals.css:1-26` — solo dos variables CSS propias (`--background`, `--foreground`). Sin ningún override de FullCalendar.
- Dark mode: activado por `@media (prefers-color-scheme: dark)` en `globals.css`, **no** por clase `.dark`.
- FullCalendar usa su CSS por defecto: fondo blanco, bordes `#ddd`, botones navy `#2c3e50`, eventos fondo azul sólido, highlight amarillo en "hoy".

## Assumptions
1. **Dark mode via media query**: todos los overrides de FullCalendar para modo oscuro van dentro de `@media (prefers-color-scheme: dark) { .fc { ... } }`, no con clases `.dark:`.
2. **Tailwind `dark:` en JSX del eventContent sí funciona**: Tailwind v4 con strategy `media` (default) compila las clases `dark:*` como `@media (prefers-color-scheme: dark)` — por tanto se pueden usar en el JSX del `eventContent`.
3. **Paleta de 5 colores de acento por evento**: asignados determinísticamente con hash del `e.id`. Sin relación con los `colorId` de Google Calendar (no se fetchea ese campo).
4. **Botón "Nuevo evento" fuera de scope**: el reference image lo muestra, pero implementarlo requiere tocar `CalendarWithModal.tsx`. El drag-to-create existente es suficiente.
5. **Sin `!important` donde sea posible**: se usa doble especificidad `.fc .fc-*` para sobreescribir FullCalendar. Solo se usa `!important` donde FullCalendar lo aplique internamente (background del evento).
6. **La cadena de altura no se toca**: `h-screen → flex-1 → h-full → h-full → height="100%"` se mantiene intacta.
7. **Fuente**: FullCalendar hereda `Arial, Helvetica, sans-serif` del `body` en `globals.css`. No se cambia la fuente del body.

---

## Implementation Phases

### Phase 1: CSS global — grid, toolbar, header, horas
**Goal**: Transformar el aspecto visual del grid de FullCalendar (fondo, líneas, header de días, columna de horas, botones toolbar) solo con CSS en `globals.css`, sin tocar ningún archivo TypeScript/React.

**Files to modify:**
- `app/globals.css` — añadir sección de overrides de FullCalendar al final del archivo

**CSS a añadir al final de `app/globals.css`:**

```css
/* ============================================================
   FullCalendar — overrides visuales
   Light mode (default), dark mode dentro de media query
   ============================================================ */

/* --- Variables globales del calendario --- */
.fc {
  --fc-page-bg-color: transparent;
  --fc-border-color: #e5e7eb;           /* gray-200 */
  --fc-today-bg-color: rgba(99, 102, 241, 0.04);
  --fc-non-business-color: transparent;
  --fc-now-indicator-color: #6366f1;    /* indigo-500 */
  --fc-small-font-size: 0.75rem;
  --fc-highlight-color: rgba(99, 102, 241, 0.12);
  --fc-neutral-text-color: #6b7280;     /* gray-500 */
  /* Botones toolbar — light mode */
  --fc-button-bg-color: #ffffff;
  --fc-button-border-color: #e5e7eb;
  --fc-button-text-color: #111827;
  --fc-button-hover-bg-color: #f3f4f6;
  --fc-button-hover-border-color: #d1d5db;
  --fc-button-active-bg-color: #e5e7eb;
  --fc-button-active-border-color: #d1d5db;
}

@media (prefers-color-scheme: dark) {
  .fc {
    --fc-page-bg-color: transparent;
    --fc-border-color: #1f2937;         /* gray-800 */
    --fc-today-bg-color: rgba(99, 102, 241, 0.06);
    --fc-non-business-color: transparent;
    --fc-now-indicator-color: #818cf8;  /* indigo-400 */
    --fc-neutral-text-color: #4b5563;   /* gray-600 */
    /* Botones toolbar — dark mode */
    --fc-button-bg-color: #111827;
    --fc-button-border-color: #374151;
    --fc-button-text-color: #f9fafb;
    --fc-button-hover-bg-color: #1f2937;
    --fc-button-hover-border-color: #4b5563;
    --fc-button-active-bg-color: #374151;
    --fc-button-active-border-color: #4b5563;
  }
}

/* --- Toolbar (título + botones prev/next/hoy) --- */
.fc .fc-toolbar {
  margin-bottom: 16px;
  align-items: center;
}

.fc .fc-toolbar-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #111827;
}

@media (prefers-color-scheme: dark) {
  .fc .fc-toolbar-title {
    color: #f9fafb;
  }
}

.fc .fc-button {
  font-size: 0.78rem;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  box-shadow: none;
  text-transform: none;
  letter-spacing: 0;
}

.fc .fc-button:focus {
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4);
  outline: none;
}

.fc .fc-button-group .fc-button {
  border-radius: 0;
}
.fc .fc-button-group .fc-button:first-child {
  border-radius: 6px 0 0 6px;
}
.fc .fc-button-group .fc-button:last-child {
  border-radius: 0 6px 6px 0;
}

/* --- Header de días (fila con Mon 18, Tue 19, etc.) --- */
.fc .fc-col-header-cell {
  border-color: var(--fc-border-color);
  padding: 6px 0;
  background: transparent;
}

.fc .fc-col-header-cell-cushion {
  font-size: 0.72rem;
  font-weight: 500;
  color: #9ca3af;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
}

@media (prefers-color-scheme: dark) {
  .fc .fc-col-header-cell-cushion {
    color: #6b7280;
  }
}

/* --- Columna izquierda de horas --- */
.fc .fc-timegrid-slot-label-cushion {
  font-size: 0.68rem;
  font-weight: 400;
  color: #9ca3af;
  padding-right: 10px;
  padding-top: 0;
}

@media (prefers-color-scheme: dark) {
  .fc .fc-timegrid-slot-label-cushion {
    color: #374151;
  }
}

/* Quitar línea punteada de los half-slots (:30) */
.fc .fc-timegrid-slot-minor {
  border-top-style: dashed;
  border-top-color: transparent;
}

@media (prefers-color-scheme: dark) {
  .fc .fc-timegrid-slot-minor {
    border-top-color: transparent;
  }
}

/* --- Línea "ahora" --- */
.fc .fc-timegrid-now-indicator-line {
  border-color: var(--fc-now-indicator-color);
  border-width: 1.5px;
}

.fc .fc-timegrid-now-indicator-arrow {
  border-top-color: var(--fc-now-indicator-color);
  border-bottom-color: var(--fc-now-indicator-color);
}

/* --- Grid scrollable — borde exterior --- */
.fc .fc-scrollgrid {
  border-color: var(--fc-border-color);
  border-radius: 8px;
  overflow: hidden;
}

/* --- Quitar estilos default del bloque de evento ---
   (la tarjeta custom en Phase 2 los reemplaza por completo) */
.fc .fc-timegrid-event {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 4px;
  margin: 1px 2px;
}

.fc .fc-event-main {
  padding: 0;
  height: 100%;
}

/* Slot "all day" */
.fc .fc-daygrid-event {
  border-radius: 4px;
}

/* Quitar el outline azul por defecto al seleccionar */
.fc .fc-highlight {
  background: var(--fc-highlight-color);
  border: none;
}
```

**Verification:**
- [x] `npm run dev` inicia sin errores en consola
- [ ] `http://localhost:3000/dashboard` (logueado): el fondo del calendario es transparente (hereda el gris del layout)
- [ ] Las líneas del grid son sutiles (gray-200 en light, gray-800 en dark)
- [ ] El header de días muestra texto en mayúsculas pequeño en gris tenue
- [ ] La columna de horas izquierda tiene texto pequeño en gris muy tenue
- [ ] Los botones prev/next/Hoy tienen fondo blanco con borde gris (light) o fondo gray-900 (dark)
- [ ] La línea "ahora" es indigo, no roja
- [ ] El highlight de "hoy" es indigo muy tenue, no amarillo
- [ ] Los eventos aún se muestran (aunque con apariencia default o transparente — Phase 2 los arregla)

---

### Phase 2: Tarjetas de evento custom + paleta de colores de acento
**Goal**: Cada evento muestra una tarjeta con borde izquierdo de color acento único (basado en el ID del evento), hora en gris tenue arriba, y título en negro/blanco abajo. 5 colores desaturados rotan determinísticamente.

**Files to modify:**
- `src/components/CalendarView.tsx` — añadir paleta, función hash, mapeo de `color`, prop `eventContent`, importar `EventContentArg`. Remover `eventColor` y `eventBorderColor`.

**Cambios en `CalendarView.tsx`:**

1. **Nuevo import** al inicio (añadir `EventContentArg` a los tipos de `@fullcalendar/core`):
```typescript
import type { DateSelectArg, EventClickArg, DatesSetArg, EventInput, EventContentArg } from "@fullcalendar/core"
```

2. **Paleta de colores y función hash** (añadir antes del componente, después de los imports):
```typescript
const ACCENT_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
]

function getEventAccentColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length]
}
```

3. **Añadir `color` al mapeo de eventos** en `fetchEvents`:
```typescript
setEvents(
  data.map((e: { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }) => ({
    id: e.id,
    title: e.summary ?? "(Sin título)",
    start: e.start.dateTime ?? e.start.date,
    end: e.end.dateTime ?? e.end.date,
    allDay: !e.start.dateTime,
    color: getEventAccentColor(e.id),      // ← nuevo
  }))
)
```

4. **Función `renderEventContent`** (añadir antes del return del componente):
```typescript
function renderEventContent(arg: EventContentArg) {
  const accentColor = arg.backgroundColor
  return (
    <div
      className="h-full w-full overflow-hidden rounded px-2 py-1 bg-indigo-50/80 dark:bg-slate-800/70"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <p className="text-[10px] leading-none text-gray-400 dark:text-slate-500 mb-0.5">
        {arg.timeText}
      </p>
      <p className="text-xs font-medium leading-tight text-gray-800 dark:text-white truncate">
        {arg.event.title}
      </p>
    </div>
  )
}
```

5. **Actualizar `<FullCalendar>`**: añadir `eventContent={renderEventContent}`, remover `eventColor` y `eventBorderColor`:
```typescript
// Remover estas dos líneas:
//   eventColor="#4f46e5"
//   eventBorderColor="#4338ca"

// Añadir:
//   eventContent={renderEventContent}
```

**Resultado final del componente `<FullCalendar>` con los cambios:**
```typescript
<FullCalendar
  plugins={[timeGridPlugin, interactionPlugin]}
  initialView="timeGridWeek"
  headerToolbar={{
    left: "prev,next today",
    center: "title",
    right: "",
  }}
  locale="es"
  slotMinTime="08:00:00"
  slotMaxTime="20:00:00"
  weekends={false}
  allDaySlot={true}
  selectable={true}
  selectMirror={true}
  height="100%"
  events={events}
  datesSet={handleDatesSet}
  select={onSelectSlot}
  eventClick={onEventClick}
  buttonText={{
    today: "Hoy",
    prev: "←",
    next: "→",
  }}
  nowIndicator={true}
  eventContent={renderEventContent}
  slotLabelFormat={{
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }}
/>
```

**Verification:**
- [x] `npx tsc --noEmit` sin errores
- [ ] `http://localhost:3000/dashboard` (logueado): los eventos muestran tarjetas con borde izquierdo de color (azul/verde/amarillo/rojo/violeta)
- [ ] Cada evento tiene una hora en gris tenue arriba y el título en negro (light) o blanco (dark)
- [ ] Eventos distintos pueden tener colores de acento distintos (si tienes ≥ 2 eventos en la semana)
- [ ] El mismo evento siempre tiene el mismo color de acento al navegar entre semanas
- [ ] En dark mode: fondo de tarjeta gris oscuro, título blanco, hora gris tenue
- [ ] En light mode: fondo de tarjeta indigo muy claro, título gris oscuro, hora gris
- [ ] Eventos de todo el día (allDay) siguen apareciendo en el slot "All day"
- [ ] Drag-to-create (arrastar en celda vacía) aún muestra el highlight indigo y abre el modal
- [ ] Click en evento existente aún abre el modal de edición

---

## Edge Cases to Handle

- **Evento sin ID**: `getEventAccentColor("")` — el hash de string vacía devuelve `0`, por tanto color `ACCENT_COLORS[0]` (azul). Sin crash.
- **`arg.timeText` vacío en eventos de todo el día**: la línea de hora muestra string vacío — visualmente correcto (eventos allDay no tienen hora).
- **Título muy largo**: `truncate` en la clase del título previene overflow. Para eventos cortos (< 30min altura), el texto se corta visualmente — comportamiento aceptable.
- **`arg.backgroundColor` puede ser un color CSS cualquiera** (incluyendo nombres CSS o hex): el `border-left` acepta cualquier valor CSS válido — sin problema.
- **`!important` en `.fc-timegrid-event`**: necesario porque FullCalendar aplica background inline o con alta especificidad en el elemento evento. Si en el browser los eventos siguen teniendo fondo azul, verificar con DevTools si hay inline style y añadir `!important` también a `background-color`.

## Out of Scope
- Botón "Crear nuevo evento" en la esquina superior derecha (requeriría modificar `CalendarWithModal.tsx`)
- Drag-to-move de eventos existentes en el calendario
- Animaciones de transición entre semanas
- Header de días con número de fecha en color diferente al nombre (requeriría hook de col-header custom)
- Responsividad mobile del calendario
- Colores basados en el `colorId` real de Google Calendar (requeriría cambios en el API route y el fetch)
- Toast notifications de error al fallar el fetch

## Commands Reference
```bash
npm run dev                # servidor en localhost:3000
npx tsc --noEmit           # type check sin compilar
```
