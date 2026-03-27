# Componente: StatsCharts

<!--
  Generado automáticamente por doc-writer
  Última actualización: 2026-03-27
  Commit: 789645c
  NO editar manualmente — usar /update_docs para actualizar
-->

Conjunto de tres gráficos de estadísticas que visualizan horas trabajadas por día, distribución por categoría y horas pico de actividad.

**Archivo fuente**: `src/components/StatsCharts.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Renderiza tres gráficos en un layout de grilla usando la librería Recharts. Cada gráfico es un sub-componente interno independiente. El componente recibe todos los datos como props — no hace fetch ni tiene efectos secundarios propios.

La directiva `"use client"` es obligatoria porque Recharts es una librería ESM que requiere APIs del navegador y no puede ejecutarse en el servidor.

---

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `hoursPerDay` | `Array<{ label: string; current: number; previous: number }>` | Si | Datos para el gráfico de barras agrupado. `label` es el nombre del día, `current` son las horas de la semana actual y `previous` de la semana anterior. |
| `byCategory` | `Array<{ name: string; hours: number; percent: number }>` | Si | Datos para el gráfico donut. `name` es el nombre de la categoría, `hours` es el total de horas y `percent` es el porcentaje sobre el total (0–100). |
| `peakHours` | `Array<{ hour: string; count: number }>` | Si | Datos para el gráfico de horas pico. `hour` es la etiqueta de la hora (ej. `"09:00"`) y `count` es la cantidad de eventos en ese rango. |

---

## Uso básico

```tsx
<StatsCharts
  hoursPerDay={[
    { label: "Lun", current: 6.5, previous: 5.0 },
    { label: "Mar", current: 7.0, previous: 6.5 },
    { label: "Mié", current: 4.5, previous: 8.0 },
  ]}
  byCategory={[
    { name: "Trabajo", hours: 32.5, percent: 72 },
    { name: "Personal", hours: 12.5, percent: 28 },
  ]}
  peakHours={[
    { hour: "08:00", count: 3 },
    { hour: "09:00", count: 8 },
    { hour: "10:00", count: 12 },
  ]}
/>
```

---

## Layout

El componente raíz usa `grid grid-cols-1 lg:grid-cols-2 gap-6`:

- En pantallas menores que `lg` (< 1024px): los tres gráficos se apilan verticalmente, uno por fila.
- En pantallas `lg` y mayores: `HoursPerDayChart` y `CategoryChart` ocupan una columna cada uno en la primera fila. `PeakHoursChart` tiene `lg:col-span-2` y ocupa toda la segunda fila.

---

## Sub-componentes internos

Los tres sub-componentes son funciones privadas del módulo — no se exportan y no se usan fuera de `StatsCharts`.

### `HoursPerDayChart`

Gráfico de barras agrupado que compara las horas diarias de la semana actual frente a la semana anterior.

- **Tipo**: `BarChart` de Recharts
- **Altura**: `220px`
- **Barras**:
  - `"Esta semana"` — usa `COLORS.current` (`#6366f1`, indigo-500), `dataKey="current"`
  - `"Sem. anterior"` — usa `COLORS.previous` (`#a5b4fc`, indigo-300), `dataKey="previous"`
- **Eje X**: `dataKey="label"`, sin línea de eje ni marcas de tick
- **Eje Y**: sin línea de eje ni marcas de tick
- **Tooltip**: formatea valores numéricos como `"6.5h"` usando `value.toFixed(1)`
- **Leyenda**: visible, texto con `var(--stats-axis-text)`
- Cada barra tiene bordes superiores redondeados (`radius={[4, 4, 0, 0]}`)

### `CategoryChart`

Gráfico donut que muestra la distribución de horas por categoría, con una leyenda manual a la derecha.

- **Tipo**: `PieChart` de Recharts con `Pie` en modo donut
- **Dimensiones del donut**: `innerRadius={45}`, `outerRadius={72}`, `paddingAngle={3}`, sin borde (`strokeWidth={0}`)
- **Contenedor del donut**: `160px × 160px` fijo
- **Colores**: cicla sobre `COLORS.pie` (8 colores), asignando `COLORS.pie[i % 8]` a cada segmento por índice
- **Leyenda manual**: lista `<ul>` con un punto de color, el nombre de la categoría (truncado si es largo) y el porcentaje formateado como entero (`percent.toFixed(0)`)
- **Estado vacío**: cuando `byCategory` es un array vacío (`[]`), el componente no renderiza el gráfico sino el texto `"Sin datos"` en gris
- **Tooltip**: formatea valores numéricos como `"6.5h"`, sin etiqueta de serie

### `PeakHoursChart`

Gráfico de barras simple que muestra la cantidad de eventos por franja horaria (normalmente 08:00–19:00).

- **Tipo**: `BarChart` de Recharts
- **Altura**: `180px`
- **Columna CSS**: `lg:col-span-2` — ocupa toda la fila en layout de dos columnas
- **Barra**: `dataKey="count"`, `name="Eventos"`, color `COLORS.peakBar` (`#6366f1`)
- **Eje X**: `dataKey="hour"`, `fontSize: 11`
- **Eje Y**: solo enteros (`allowDecimals={false}`), `fontSize: 11`
- **Tooltip**: etiqueta el valor como `"Eventos"` sin formateo adicional (muestra el número entero directamente)

---

## Paleta de colores

El objeto `COLORS` centraliza todos los colores usados en los tres gráficos:

| Clave | Valor hex | Uso |
|-------|-----------|-----|
| `current` | `#6366f1` | Barras "Esta semana" en `HoursPerDayChart` |
| `previous` | `#a5b4fc` | Barras "Sem. anterior" en `HoursPerDayChart` |
| `peakBar` | `#6366f1` | Barras de `PeakHoursChart` |
| `pie[0]` | `#6366f1` | Segmento 1 del donut |
| `pie[1]` | `#8b5cf6` | Segmento 2 del donut |
| `pie[2]` | `#ec4899` | Segmento 3 del donut |
| `pie[3]` | `#f59e0b` | Segmento 4 del donut |
| `pie[4]` | `#10b981` | Segmento 5 del donut |
| `pie[5]` | `#3b82f6` | Segmento 6 del donut |
| `pie[6]` | `#ef4444` | Segmento 7 del donut |
| `pie[7]` | `#14b8a6` | Segmento 8 del donut |

Si `byCategory` tiene más de 8 entradas, los colores del donut se repiten por módulo (`i % 8`).

---

## Dark mode

Los tres gráficos no usan clases de Tailwind para los colores de las líneas de grilla, los ejes y el fondo del tooltip. En su lugar usan CSS custom properties definidas en `app/globals.css`:

| Propiedad CSS | Usada en |
|---------------|----------|
| `var(--stats-grid)` | Color del `CartesianGrid` y borde del tooltip |
| `var(--stats-axis-text)` | Color de los ticks de ejes X e Y, y texto de la leyenda |
| `var(--stats-tooltip-bg)` | Fondo del tooltip de todos los gráficos |

Los contenedores de cada gráfico usan `bg-white dark:bg-gray-900` y `border-indigo-100 dark:border-indigo-900` de Tailwind para el fondo y borde de la tarjeta.

---

## Dependencias

- `recharts` v3 — compatible con React 19. Requiere `"use client"` porque usa APIs del DOM.

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-03-27 | Versión inicial |
