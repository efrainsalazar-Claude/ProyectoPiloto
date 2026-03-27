# Componente: StatsClient

<!-- generado: 2026-03-27 | commit: 789645c -->

Muestra estadísticas de uso del calendario para un rango de tiempo seleccionado por el usuario. Incluye KPIs, gráficas y análisis de reuniones consecutivas.

**Archivo fuente**: `src/components/StatsClient.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Componente principal de la página de estadísticas. Permite al usuario seleccionar entre tres rangos de tiempo (`current`, `previous`, `last4weeks`), consulta el endpoint `/api/calendar/stats` con los parámetros de fecha calculados, y renderiza:

1. Cuatro tarjetas KPI con métricas resumidas
2. Gráficas de horas por día, distribución por categoría y horas pico (`StatsCharts`)
3. Tabla de reuniones consecutivas (`StatsBackToBack`)

---

## Props

Sin props — es un componente standalone usado directamente en `app/dashboard/stats/page.tsx`.

---

## Uso

```tsx
// app/dashboard/stats/page.tsx
import StatsClient from "@/src/components/StatsClient"

export default function StatsPage() {
  return (
    <div className="p-6">
      <StatsClient />
    </div>
  )
}
```

`StatsPage` es un Server Component trivial que solo envuelve `StatsClient` con padding.

---

## Estado interno

| Estado | Tipo | Valor inicial | Descripción |
|--------|------|---------------|-------------|
| `range` | `RangeOption` | `"current"` | Rango de tiempo activo seleccionado por el usuario |
| `data` | `StatsData \| null` | `null` | Datos devueltos por la API para el rango activo |
| `loading` | `boolean` | `true` | `true` mientras se realiza el fetch |
| `error` | `string \| null` | `null` | Mensaje de error si el fetch falla |

```ts
type RangeOption = "current" | "previous" | "last4weeks"
```

---

## Interface StatsData

Estructura esperada en la respuesta de la API:

```ts
interface StatsData {
  kpis: {
    totalHours: number
    totalEvents: number
    occupancyPercent: number
    avgDurationMinutes: number
  }
  hoursPerDay: Array<{ label: string; current: number; previous: number }>
  byCategory: Array<{ name: string; hours: number; percent: number }>
  peakHours: Array<{ hour: string; count: number }>
  backToBack: Array<Array<{ id: string; summary: string; start: string; end: string }>>
}
```

---

## Funciones internas

### `toLocalISO(date: Date): string`

Convierte un objeto `Date` a una cadena ISO 8601 que incluye el offset de timezone local del navegador. A diferencia de `.toISOString()`, que siempre produce `Z` (UTC), esta función preserva la hora local más el offset explícito.

**Formato de salida**: `YYYY-MM-DDTHH:mm:ss+HH:MM`

**Ejemplo**: para un navegador en UTC-6, `new Date("2026-03-27T09:00:00")` produce `"2026-03-27T09:00:00-06:00"`.

---

### `getMonday(date: Date): Date`

Devuelve el lunes de la semana que contiene `date`, con hora establecida a `00:00:00.000`. Los domingos se tratan como parte de la semana previa (el lunes anterior).

---

### `addDays(date: Date, days: number): Date`

Devuelve una nueva `Date` sumando `days` días al valor de `date`. Acepta valores negativos para restar días.

---

### `getRangeDates(range: RangeOption)`

Calcula los parámetros de fecha a enviar a la API según el rango seleccionado. Devuelve:

```ts
{
  timeMin: string      // inicio del período principal (ISO con timezone)
  timeMax: string      // fin del período principal (ISO con timezone)
  prevTimeMin: string  // inicio del período de comparación
  prevTimeMax: string  // fin del período de comparación
  groupBy: "day" | "week"
}
```

Comportamiento por opción:

| `range` | Período principal | Período de comparación | `groupBy` |
|---------|------------------|------------------------|-----------|
| `"current"` | Lunes a domingo de la semana actual | Mismos días de la semana anterior | `"day"` |
| `"previous"` | Lunes a domingo de la semana pasada | Mismos días de la semana anterior a esa | `"day"` |
| `"last4weeks"` | Las 4 semanas completas anteriores a la semana actual (lunes de hace 28 días hasta el domingo pasado) | Las 4 semanas anteriores a ese período | `"week"` |

Para `"current"` y `"previous"`, el `timeMax` de cada período se establece a `23:59:59.999` del domingo correspondiente.

Para `"last4weeks"`, `timeMin` es `getMonday(now) - 28 días` y `timeMax` es `getMonday(now) - 1 día` (domingo pasado a `23:59:59.999`).

---

## useEffect: fetch de datos

Se ejecuta cada vez que `range` cambia. Construye los query params llamando a `getRangeDates(range)` y realiza un fetch a:

```
GET /api/calendar/stats?timeMin=...&timeMax=...&groupBy=...&prevTimeMin=...&prevTimeMax=...
```

Secuencia:
1. Establece `loading = true` y `error = null`
2. Realiza el fetch
3. Si la respuesta no es `ok`, lanza `Error("Error")`
4. En caso de éxito, guarda el resultado en `data`
5. En caso de error, establece `error = "No se pudieron cargar las estadísticas"`
6. Siempre establece `loading = false` al terminar

---

## Sub-componente: KpiCard

Definido inline en el mismo archivo. Renderiza una tarjeta de métrica individual.

**Props**:

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `label` | `string` | Sí | Etiqueta descriptiva de la métrica |
| `value` | `string` | Sí | Valor formateado a mostrar |
| `icon` | `React.ReactNode` | Sí | Icono SVG que acompaña al label |

Renderiza el `icon` y el `label` en la parte superior, y el `value` en grande (`text-3xl font-bold`) en la parte inferior.

---

## KPIs mostrados

| Label | Campo de `data.kpis` | Formato aplicado |
|-------|----------------------|------------------|
| Horas en reuniones | `totalHours` | `toFixed(1)` + sufijo `h` |
| Total de eventos | `totalEvents` | `toString()` (sin decimales) |
| Tiempo ocupado | `occupancyPercent` | `toFixed(0)` + sufijo `%` |
| Duración promedio | `avgDurationMinutes` | sin decimales + sufijo `min` |

---

## Estados de render

### Loading

Mientras `loading === true`, se muestra un skeleton con `animate-pulse`:
- 4 tarjetas KPI simuladas en grid `2 col / 4 col (lg)`
- 3 bloques de gráficas simulados en grid `1 col / 2 col (lg)`, altura fija `h-64`

### Error

Si `error` tiene valor, se muestra el mensaje de error en texto rojo (`text-red-500`) antes del área de contenido. El error se muestra simultáneamente con el estado de loading si ambos coexisten durante un re-fetch (aunque en la práctica `loading` se resetea antes de mostrar el error).

### Empty (sin eventos)

Si `data.kpis.totalEvents === 0`, se muestra un estado vacío centrado con un icono de calendario y el texto "No hay eventos en este rango".

### Datos disponibles

Si `data` tiene eventos, se renderiza en este orden:
1. Grid de 4 `KpiCard`
2. `<StatsCharts>` con `hoursPerDay`, `byCategory` y `peakHours`
3. `<StatsBackToBack>` con `backToBack`

---

## Selector de rango

El header incluye tres botones para cambiar `range`. El botón activo recibe estilos `bg-indigo-600 text-white`. Al hacer click, se actualiza `range`, lo que dispara el `useEffect`.

| Valor | Label visible |
|-------|---------------|
| `"current"` | Esta semana |
| `"previous"` | Semana anterior |
| `"last4weeks"` | Últimas 4 semanas |

---

## Dependencias

- [`StatsCharts`](StatsCharts.md) — gráficas de horas por día, categorías y horas pico
- [`StatsBackToBack`](StatsBackToBack.md) — tabla de grupos de reuniones consecutivas
- `fetch` nativo del browser para las llamadas a la API

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-03-27 | Versión inicial |
