<!--
  Generado automáticamente por doc-writer
  Última actualización: 2026-03-27
  Commit: 789645c
  NO editar manualmente — usar /update_docs para actualizar
-->

# Componente: StatsBackToBack

<!-- generado: 2026-03-27 | commit: 789645c -->

Tarjeta de estadísticas que muestra los grupos de reuniones back-to-back detectados en un rango de tiempo dado. Una reunión back-to-back es aquella que comienza inmediatamente cuando termina otra, sin buffer entre ellas.

**Archivo fuente**: `src/components/StatsBackToBack.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Renderiza una tarjeta con bordes redondeados que lista los bloques de reuniones consecutivas sin pausa. Cada bloque agrupa dos o más eventos que se encadenan sin tiempo libre entre ellos.

El componente tiene dos estados posibles:

- **Estado vacío**: cuando `groups` no contiene ningún bloque, muestra un mensaje informativo.
- **Estado con datos**: cuando hay al menos un bloque, muestra un badge con el conteo total y lista cada bloque con sus eventos.

El componente no hace llamadas a la API ni maneja estado propio — recibe los datos calculados externamente a través de props.

---

## Interfaces

### `BackToBackEvent`

Representa un único evento de calendario dentro de un bloque back-to-back.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | Identificador único del evento |
| `summary` | `string` | Título del evento |
| `start` | `string` | Fecha y hora de inicio en formato ISO 8601 |
| `end` | `string` | Fecha y hora de fin en formato ISO 8601 |

---

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `groups` | `BackToBackEvent[][]` | ✅ | Array de grupos. Cada elemento es un array de eventos que forman un bloque back-to-back. Un array vacío activa el estado vacío. |

---

## Estado vacío

Cuando `groups.length === 0`, el componente renderiza la tarjeta con el encabezado y el siguiente mensaje:

```
No se detectaron reuniones consecutivas sin buffer en este rango.
```

No se muestra el badge ni ninguna lista de eventos.

---

## Estado con datos

### Badge de resumen

En el encabezado aparece un badge rojo con el conteo total de reuniones y el número de bloques:

```
{totalMeetings} en {groups.length} bloque(s)
```

- `totalMeetings` se calcula como `groups.reduce((sum, g) => sum + g.length, 0)`.
- El texto "bloque" va en plural ("bloques") cuando `groups.length > 1`, y en singular ("bloque") cuando `groups.length === 1`.

Ejemplos:

| `groups` | Badge mostrado |
|----------|---------------|
| `[[A, B], [C, D, E]]` | `5 en 2 bloques` |
| `[[A, B]]` | `2 en 1 bloque` |

### Bloques de eventos

Cada grupo se renderiza como una sección con borde izquierdo rojo (`border-l-2 border-red-400`). Dentro del bloque, cada evento ocupa una fila con:

- **Título** (`event.summary`): texto a la izquierda, truncado si es demasiado largo.
- **Horario**: texto a la derecha en formato `HH:MM–HH:MM`, generado con `toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })` aplicado tanto a `event.start` como a `event.end`.

---

## Formato de horarios

Los strings ISO de `start` y `end` se convierten a objetos `Date` antes de formatear:

```ts
const start = new Date(event.start).toLocaleTimeString("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
})
```

El locale `"es-MX"` produce horas en formato de 24 horas con ceros a la izquierda, por ejemplo `09:00` o `14:30`.

---

## Dark mode

El componente aplica variantes `dark:` en todas sus clases de color:

| Elemento | Light | Dark |
|----------|-------|------|
| Fondo de tarjeta | `bg-white` | `dark:bg-gray-900` |
| Borde de tarjeta | `border-indigo-100` | `dark:border-indigo-900` |
| Encabezado | `text-gray-900` | `dark:text-white` |
| Mensaje vacío | `text-gray-500` | `dark:text-gray-400` |
| Badge fondo | `bg-red-100` | `dark:bg-red-900/40` |
| Badge texto | `text-red-600` | `dark:text-red-400` |
| Borde de bloque | `border-red-400` | `dark:border-red-600` |
| Título de evento | `text-gray-700` | `dark:text-gray-300` |
| Horario de evento | `text-gray-400` | `dark:text-gray-500` |

---

## Uso

```tsx
const groups: BackToBackEvent[][] = [
  [
    { id: "1", summary: "Standup", start: "2026-03-27T09:00:00Z", end: "2026-03-27T09:30:00Z" },
    { id: "2", summary: "1:1 con equipo", start: "2026-03-27T09:30:00Z", end: "2026-03-27T10:00:00Z" },
  ],
  [
    { id: "3", summary: "Revisión de sprint", start: "2026-03-27T14:00:00Z", end: "2026-03-27T14:45:00Z" },
    { id: "4", summary: "Demo con cliente", start: "2026-03-27T14:45:00Z", end: "2026-03-27T15:30:00Z" },
    { id: "5", summary: "Retrospectiva", start: "2026-03-27T15:30:00Z", end: "2026-03-27T16:00:00Z" },
  ],
]

<StatsBackToBack groups={groups} />
```

El badge mostraría: `5 en 2 bloques`.

Para el estado vacío:

```tsx
<StatsBackToBack groups={[]} />
// Renderiza: "No se detectaron reuniones consecutivas sin buffer en este rango."
```

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-03-27 | Versión inicial |
