---
date: 2026-03-18T00:00:00-06:00
git_commit: 1ca4b113890ba23b8c999a873b226aa5b1dcf571
branch: main
repository: proyecto-piloto
topic: "Rediseño visual del calendario semanal del dashboard"
tags: [research, codebase, CalendarView, FullCalendar, CSS, globals, dark-mode]
status: complete
last_updated: 2026-03-18
---

# Research: Rediseño visual del calendario semanal del dashboard

**Date**: 2026-03-18
**Git Commit**: 1ca4b113890ba23b8c999a873b226aa5b1dcf571
**Branch**: main

## Research Question

Necesito rediseñar visualmente el calendario semanal del dashboard. No cambia la funcionalidad ni la lógica.
Investiga: dónde está el componente del calendario semanal, qué clases de Tailwind usa actualmente, cómo están
estructuradas las tarjetas de eventos, y qué variables CSS de tema existen en globals.css.

Referencia visual: calendario oscuro con tarjetas de evento con borde izquierdo de color acento, header de días
limpio, columna de horas en gris tenue, soporte dark/light mode.

## Summary

El calendario vive en `src/components/CalendarView.tsx` (montado vía `CalendarWithModal.tsx`) y usa FullCalendar
con renderizado de eventos completamente por defecto — solo se pasa `eventColor` y `eventBorderColor` como
colores planos, sin `eventContent` personalizado. `globals.css` tiene únicamente dos variables CSS propias
(`--background` y `--foreground`), el dark mode se activa por `prefers-color-scheme` (media query del SO), NO
por clase `.dark`. FullCalendar v6 expone 27 variables `--fc-*` sobreescribibles en CSS global, y acepta un
prop `eventContent` que recibe JSX para renderizar tarjetas de evento completamente custom.

## Detailed Findings

### Componente principal: `src/components/CalendarView.tsx`

- **Wrapper raíz** (`CalendarView.tsx:55`): `<div className="h-full relative">` — establece altura full y
  posicionamiento para el overlay de loading
- **Overlay de carga** (`CalendarView.tsx:57-63`): `absolute top-2 right-2 z-10` con span
  `text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 px-2 py-1 rounded shadow`
- **`<FullCalendar>`** (`CalendarView.tsx:64-96`): usa `height="100%"` para heredar la altura del wrapper
- **Tarjetas de evento**: **no hay `eventContent` personalizado**. Todo el renderizado lo hace FullCalendar
  por defecto. Los únicos controles de apariencia son:
  - `eventColor="#4f46e5"` (indigo-600)
  - `eventBorderColor="#4338ca"` (indigo-700)
- **Sin `eventClassNames`**: no se añaden clases personalizadas a los eventos

### Cadena de altura (cómo FullCalendar tiene altura real)

```
layout.tsx → <div class="flex h-screen ...">        ← 100vh
  → <main class="flex-1 overflow-auto">             ← espacio restante tras sidebar
    → page.tsx → <div class="h-full p-6">           ← hereda de main, 24px padding
      → CalendarWithModal (sin clases propias)
        → CalendarView → <div class="h-full relative"> ← hereda
          → <FullCalendar height="100%" />           ← hereda altura del div
```

El `overflow-auto` está en `<main>`, no en el wrapper del calendario. Si se agrega padding o header dentro
del área del calendario, la cadena de `h-full` se mantiene intacta.

### Clases Tailwind actuales (sólo las del área de calendario)

| Elemento | Clases |
|---|---|
| Wrapper de page | `h-full p-6` |
| Wrapper de CalendarView | `h-full relative` |
| Overlay loading | `absolute top-2 right-2 z-10` |
| Texto loading | `text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 px-2 py-1 rounded shadow` |

### Variables CSS existentes en `app/globals.css`

`globals.css` usa Tailwind v4 con `@import "tailwindcss"` (línea 1). Las variables propias del proyecto son
mínimas:

**`:root` (modo claro):**
| Variable | Valor |
|---|---|
| `--background` | `#ffffff` |
| `--foreground` | `#171717` |

**`@media (prefers-color-scheme: dark)`:**
| Variable | Valor |
|---|---|
| `--background` | `#0a0a0a` |
| `--foreground` | `#ededed` |

**`@theme inline` — tokens Tailwind v4:**
| Token | Referencia |
|---|---|
| `--color-background` | `var(--background)` |
| `--color-foreground` | `var(--foreground)` |
| `--font-sans` | `var(--font-geist-sans)` |
| `--font-mono` | `var(--font-geist-mono)` |

**CRÍTICO — Dark mode es por media query, NO por clase `.dark`:**
El modo oscuro se activa vía `@media (prefers-color-scheme: dark)` en `globals.css`. No hay clase `.dark`
aplicada en ningún elemento del DOM. Las clases `dark:*` de Tailwind v4 siguen funcionando si Tailwind
está configurado para usar `media` strategy (que es el default cuando no hay config de `darkMode` explícita).
Para sobreescribir variables CSS de FullCalendar en dark mode, se puede usar también `@media (prefers-color-scheme: dark)`.

### Variables CSS de FullCalendar v6 (`--fc-*`)

FullCalendar v6 expone 27 custom properties en el elemento `.fc`. Todas sobreescribibles en `globals.css`
con selector `.fc { ... }` o dentro de media queries.

**Variables relevantes para el rediseño:**

| Variable | Default | Controla |
|---|---|---|
| `--fc-page-bg-color` | `#fff` | Fondo general del calendario |
| `--fc-border-color` | `#ddd` | Todas las líneas internas del grid |
| `--fc-neutral-text-color` | `grey` | Textos neutros |
| `--fc-button-text-color` | `#fff` | Texto de botones toolbar |
| `--fc-button-bg-color` | `#2c3e50` | Fondo de botones toolbar |
| `--fc-button-hover-bg-color` | `#1e2b37` | Fondo hover de botones toolbar |
| `--fc-button-active-bg-color` | `#1a252f` | Fondo active de botones |
| `--fc-event-bg-color` | `#3788d8` | Fondo por defecto de eventos |
| `--fc-event-border-color` | `#3788d8` | Borde por defecto de eventos |
| `--fc-event-text-color` | `#fff` | Texto de eventos |
| `--fc-today-bg-color` | `rgba(255,220,40,.15)` | Columna del día de hoy |
| `--fc-non-business-color` | `hsla(0,0%,84%,.3)` | Horas fuera de negocio |
| `--fc-highlight-color` | `rgba(188,232,241,.3)` | Selección al arrastrar |
| `--fc-now-indicator-color` | `red` | Línea de hora actual |
| `--fc-small-font-size` | `.85em` | Tamaño fuente pequeño (slot labels) |

### Selectores CSS internos de FullCalendar timegrid

**Header de días:**
- `.fc-col-header` — tabla que envuelve todos los headers de días
- `.fc-col-header-cell` — cada `<th>` de día
- `.fc-col-header-cell-cushion` — texto del nombre del día (link interno)

**Columna de horas (izquierda):**
- `.fc-timegrid-slot` — cada fila de slot
- `.fc-timegrid-slot-label` — fila con etiqueta de hora
- `.fc-timegrid-slot-minor` — fila sin etiqueta (marcas de :30)
- `.fc-timegrid-slot-label-cushion` — texto de la hora

**Columnas de días (grid body):**
- `.fc-timegrid-col` — cada columna de día
- `.fc-timegrid-slot-lane` — las celdas horizontales del grid

**Eventos:**
- `.fc-timegrid-event` — bloque de evento
- `.fc-timegrid-event-harness` — wrapper de posicionamiento del evento
- `.fc-event-main` — contenido interior del evento (donde va el texto)

**Línea "ahora":**
- `.fc-timegrid-now-indicator-line` — la línea horizontal
- `.fc-timegrid-now-indicator-arrow` — la flecha en el eje de horas

### Mecanismo de `eventContent` para tarjetas custom

FullCalendar acepta el prop `eventContent` que recibe una función `(arg) => JSX`. El argumento `arg`
incluye:
- `arg.timeText` — hora formateada (e.g. "9:00")
- `arg.event.title` — título del evento
- `arg.event.id` — ID del evento
- `arg.backgroundColor`, `arg.borderColor` — colores resueltos del evento
- `arg.event.startStr`, `arg.event.endStr` — fechas ISO

**Limitación importante**: No se pueden usar hooks de React (`useState`, `useEffect`) dentro de la función
de `eventContent` porque FullCalendar la ejecuta fuera del árbol de React.

**Cuando se provee `eventContent`**, el renderizado por defecto de FullCalendar (tiempo + título) se reemplaza
completamente. Se debe renderizar manualmente `arg.timeText` y `arg.event.title`.

### `eventClassNames` para clases custom por evento

El prop `eventClassNames` acepta `(arg) => string[]` y añade clases CSS al wrapper más externo del evento.
Se puede combinar con `eventContent` para control total. Útil para asignar clases de color de acento por evento.

## Code References

- `src/components/CalendarView.tsx:55` — wrapper raíz `h-full relative`
- `src/components/CalendarView.tsx:64-96` — props de `<FullCalendar>` (sin `eventContent`)
- `src/components/CalendarWithModal.tsx:77` — `<CalendarView key={refreshKey} ...>` con `refreshKey`
- `app/dashboard/page.tsx:5` — `<div className="h-full p-6">` wrapper de page
- `app/dashboard/layout.tsx:14-17` — cadena `h-screen → flex-1 overflow-auto`
- `app/globals.css:3-6` — variables `--background` y `--foreground` en `:root`
- `app/globals.css:8-13` — `@theme inline` con tokens Tailwind v4
- `app/globals.css:15-20` — dark mode via `@media (prefers-color-scheme: dark)`
- `app/layout.tsx:20` — `body` con clases de fuentes y `antialiased`, sin clase `.dark`

## Key Architectural Decisions Found

1. **Dark mode por media query**: el proyecto NO usa la estrategia de clase `.dark`. Los estilos de FullCalendar
   para dark mode deben ir dentro de `@media (prefers-color-scheme: dark) { .fc { ... } }`.

2. **Sin `eventContent` custom actualmente**: todas las tarjetas de evento usan el renderizado por defecto
   de FullCalendar. Un rediseño de tarjetas requiere añadir el prop `eventContent` a `<FullCalendar>`.

3. **Colores de eventos son planos**: actualmente todos los eventos tienen el mismo color indigo. Para
   implementar colores de acento por evento, se necesita asignar `color` o `backgroundColor` en el objeto
   `EventInput` al hacer el mapeo en `fetchEvents`.

4. **`globals.css` es el lugar correcto para sobreescribir FullCalendar**: los selectores `.fc .fc-*`
   en `globals.css` tienen la especificidad correcta y se cargan después del CSS de FullCalendar.

5. **Fuente actual del body**: `app/globals.css:25` declara `font-family: Arial, Helvetica, sans-serif`
   directamente, no el token `--font-sans` (que apunta a Geist). El calendario hereda esta fuente.

## Gaps in Research

- No se inspeccionaron los CSS variables adicionales dentro del bundle de `@fullcalendar/timegrid`
  (pueden existir variables adicionales no documentadas en la guía oficial).
- No se verificó el comportamiento de `refreshKey` al abrir/cerrar el modal y si un remount completo
  de FullCalendar afecta la transición visual al rediseñar con animaciones.
- No se investigó si FullCalendar aplica `!important` en alguna de sus reglas CSS internas (podría
  requerir mayor especificidad en las sobreescrituras).

## Links

- [fullcalendar.io/docs/css-customization](https://fullcalendar.io/docs/css-customization) — guía oficial de variables `--fc-*`
- [fullcalendar.io/docs/event-render-hooks](https://fullcalendar.io/docs/event-render-hooks) — `eventContent`, `eventClassNames`, `eventDidMount`
- [fullcalendar.io/docs/react](https://fullcalendar.io/docs/react) — JSX en `eventContent` con `@fullcalendar/react`
- [github.com/fullcalendar/fullcalendar/blob/main/packages/core/src/styles/vars.css](https://github.com/fullcalendar/fullcalendar/blob/main/packages/core/src/styles/vars.css) — fuente de las 27 variables `--fc-*`
