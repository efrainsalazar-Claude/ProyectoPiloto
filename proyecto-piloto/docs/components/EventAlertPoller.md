# Componente: EventAlertPoller

<!-- generado: 2026-05-29 | commit: adf6069 -->

Componente global que monitorea el próximo evento del calendario y emite alertas cuando faltan 15, 10, 5 o 2 minutos para que comience.

**Archivo fuente**: `src/components/EventAlertPoller.tsx`  
**Tipo**: Client Component (`"use client"`)  
**Montado en**: `app/layout.tsx` — presente en todas las páginas de la app

---

## Descripción

Hace polling cada 30 segundos a `/api/calendar/events` para obtener el evento más próximo. Cuando los minutos restantes coinciden exactamente con uno de los umbrales configurados (`[15, 10, 5, 2]`), dispara tres mecanismos simultáneos:

1. **Popup visual** en la esquina inferior derecha con título, minutos restantes y hora de inicio
2. **Beep de audio** generado programáticamente con la Web Audio API
3. **Notificación nativa del OS** via la Browser Notification API

No recibe props. No expone ninguna API pública. Se activa solo cuando hay sesión autenticada.

---

## Props

Ninguna. El componente es autónomo — obtiene su propia sesión vía `useSession()`.

---

## Uso

```tsx
// app/layout.tsx — montado una sola vez, global
import EventAlertPoller from "@/src/components/EventAlertPoller"

<SessionProvider session={session}>
  <ConditionalNavbar />
  <EventAlertPoller />
  {children}
</SessionProvider>
```

No debe montarse en páginas individuales — solo en el layout raíz para evitar múltiples pollers corriendo en paralelo.

---

## Lógica de polling

```
Al montar (status === "authenticated"):
  → checkUpcomingEvents() inmediatamente
  → setInterval(checkUpcomingEvents, 30_000ms)

Al desmontar:
  → clearInterval()
  → clearTimeout(dismissTimer)
```

Cada ejecución de `checkUpcomingEvents`:

1. Calcula `timeMin = ahora` y `timeMax = ahora + 20 minutos` (sin milisegundos — requerimiento del API)
2. Hace `GET /api/calendar/events?timeMin=...&timeMax=...`
3. Toma el **primer evento con `start.dateTime`** (ignora eventos de todo el día)
4. Calcula `minutesLeft = Math.floor((eventTime - now) / 60_000)`
5. Si `minutesLeft ∈ {15, 10, 5, 2}` **y** ese umbral no fue notificado para ese evento → dispara alerta
6. Si `minutesLeft < 0` → limpia los umbrales del evento (ya terminó)

---

## Umbrales de alerta

```ts
const ALERT_THRESHOLDS = [15, 10, 5, 2] // minutos
```

El match es **exacto** (`minutesLeft === threshold`). Con polls cada 30 segundos, cada umbral de 60 segundos de duración tiene alta probabilidad de ser capturado. Si un poll salta un threshold por timing, ese aviso se pierde — diseño intencional para evitar alertas tardías que confundan al usuario.

---

## Tracking de umbrales notificados

```ts
const notifiedRef = useRef<Set<string>>(new Set())
// clave: `${event.id}-${threshold}` — ej: "evt-abc123-15"
```

Un `Set` en memoria evita repetir la misma alerta en el mismo umbral para el mismo evento. Se resetea al recargar la página (comportamiento aceptado — sin persistencia).

---

## Beep de audio (`playBeep`)

Genera un tono de 880 Hz (La5) usando la Web Audio API con envolvente de amplitud:

| Fase | Duración | Amplitud |
|------|----------|----------|
| Fade in | 10ms | 0 → 0.3 |
| Sostenido | 200ms | 0.3 |
| Fade out | 100ms | 0.3 → 0 |

El `AudioContext` se cierra automáticamente al terminar el tono (`oscillator.onended`). Si el browser bloquea el audio (política de autoplay — requiere interacción previa del usuario), la función falla silenciosamente dentro de un bloque `try/catch`.

---

## Notificación del OS (`showOSNotification`)

```ts
new Notification("📅 CalendarAI", {
  body: `"${title}" comienza en ${minutesLeft} minutos`,
  icon: "/favicon.ico",
})
```

Solo se ejecuta si `Notification.permission === "granted"`. Al montar el componente, si el permiso es `"default"`, se llama `Notification.requestPermission()` para solicitar permiso al usuario. Si el permiso fue denegado anteriormente, no se muestra el dialog y no se envían notificaciones del OS (el popup en la página sí aparece igualmente).

---

## Popup visual

Posición: `fixed bottom-6 right-6 z-50`  
Animación de entrada: `alert-slide-in` (definida en `app/globals.css`)

**Contenido del popup:**

```
🔔 EVENTO PRÓXIMO
[Título del evento]
Comienza en X min · a las HH:MM
                              [×]
━━━━━━━━━━━━━━━━━━━━ (barra ámbar)
```

La barra inferior es una animación CSS `alert-shrink` de 30 segundos que indica el tiempo restante antes del auto-dismiss.

**Dismiss:**
- **Auto**: 30 segundos via `setTimeout`
- **Manual**: botón `×` (`aria-label="Cerrar alerta"`) — cancela también el `setTimeout`

---

## Estado interno

| Estado / Ref | Tipo | Descripción |
|---|---|---|
| `alert` | `{ title, minutesLeft, startTime } \| null` | Datos del popup activo. `null` = popup oculto |
| `notifiedRef` | `useRef<Set<string>>` | Umbrales ya notificados en esta sesión |
| `dismissTimerRef` | `useRef<ReturnType<typeof setTimeout>>` | Timer del auto-dismiss activo |

---

## Manejo de errores

| Escenario | Comportamiento |
|---|---|
| `status !== "authenticated"` | No hace fetch, no muestra nada |
| Fetch retorna `!ok` (401, 400, 429…) | Retorna silenciosamente |
| Fetch lanza excepción (red) | Capturado en `try/catch`, retorna silenciosamente |
| No hay eventos en los próximos 20 min | No muestra popup |
| Evento es de todo el día (sin `dateTime`) | Ignorado |
| `Notification` no disponible en el browser | `showOSNotification` retorna silenciosamente |
| `AudioContext` bloqueado por autoplay policy | `playBeep` falla silenciosamente en `try/catch` |

---

## Animaciones CSS

Definidas en `app/globals.css`:

| Clase | Duración | Efecto |
|---|---|---|
| `alert-slide-in` | 300ms ease-out | Slide desde abajo + fade in |
| `alert-shrink` | 30s linear | Barra que encoge de 100% a 0% (indicador de dismiss) |

---

## Dependencias

- `next-auth/react` — `useSession()` para verificar sesión
- `Web Audio API` — generación del beep (browser nativo)
- `Notification API` — notificaciones del OS (browser nativo)
- `/api/calendar/events` — endpoint interno para obtener eventos

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-05-29 | Versión inicial |
