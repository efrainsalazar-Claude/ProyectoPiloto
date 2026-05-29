---
date: 2026-05-28T00:00:00-05:00
git_commit: b8c2993627f9dcf1f3f06267eda34612c1df5f76
branch: main
topic: "Sistema de alertas globales para eventos próximos del calendario"
status: in-progress
---

# Plan: Sistema de alertas globales para eventos próximos del calendario

## Objective
Crear un componente cliente global que haga polling cada 60 segundos y muestre un popup con sonido y notificación del OS cuando un evento del calendario esté a 15, 10, 5 o 2 minutos de comenzar.

## Current State
- `app/layout.tsx` — Server Component, llama `auth()`, envuelve la app con `<SessionProvider session={session}>` (línea 21)
- `GET /api/calendar/events?timeMin=...&timeMax=...` — retorna array de eventos ordenados por `startTime` ascendente, requiere sesión Auth.js (cookie automática)
- `src/components/Navbar.tsx:10` — patrón de `useSession()` de `next-auth/react` ya en uso
- No existe ningún componente de notificaciones, polling, o uso de Web Audio API en el proyecto

## Assumptions
- El beep sonará una vez por umbral por evento (no repetirá cada segundo)
- El popup muestra solo el evento más próximo que esté dentro del rango de alerta
- Si hay dos eventos en la misma ventana de alerta, se muestra el más próximo
- El polling comienza inmediatamente al montar el componente (no espera 60s el primer check)
- La ventana de fetch es `now` a `now + 20 minutos` para capturar todos los umbrales activos
- Los umbrales notificados se guardan en memoria (`useRef`) — se resetean al refrescar la página, lo cual es aceptable

---

## Implementation Phases

### Phase 1: Componente EventAlertPoller — lógica de polling y popup
**Goal**: Crear `src/components/EventAlertPoller.tsx` con toda la lógica: polling, detección de umbrales, popup UI, Web Audio beep y auto-dismiss.

**Files to create:**
- `src/components/EventAlertPoller.tsx` — componente cliente completo

**Implementation steps:**

1. Crear el archivo con `"use client"` y las siguientes importaciones:
   ```typescript
   import { useSession } from "next-auth/react"
   import { useEffect, useRef, useState, useCallback } from "react"
   ```

2. Definir el tipo del evento:
   ```typescript
   type CalendarEvent = {
     id: string
     summary?: string
     start: { dateTime?: string; date?: string }
     end: { dateTime?: string; date?: string }
   }
   ```

3. Definir los umbrales de alerta como constante:
   ```typescript
   const ALERT_THRESHOLDS = [15, 10, 5, 2] // minutos
   ```

4. Implementar la función `playBeep()` con Web Audio API:
   - Crear `AudioContext` efímero
   - `OscillatorNode` con frecuencia 880 Hz (La5), tipo `sine`
   - `GainNode` para envolvente: fade in 0→0.3 en 10ms, sostenido 200ms, fade out a 0 en 100ms
   - Duración total ~310ms
   - Conectar: `oscillator → gain → destination`

5. Implementar la función `requestNotificationPermission()`:
   - Llamar `Notification.requestPermission()` si `"Notification" in window` y el permiso no es `"denied"`
   - Llamar una sola vez al montar el componente (con `useEffect` vacío)

6. Implementar `showOSNotification(title: string, minutesLeft: number)`:
   - Solo si `Notification.permission === "granted"`
   - `new Notification("📅 CalendarAI", { body: \`"${title}" comienza en ${minutesLeft} minutos\`, icon: "/favicon.ico" })`

7. Estado del popup:
   ```typescript
   const [alert, setAlert] = useState<{
     title: string
     minutesLeft: number
     startTime: string
   } | null>(null)
   ```

8. Ref para rastrear umbrales ya notificados:
   ```typescript
   const notifiedRef = useRef<Set<string>>(new Set())
   ```

9. Ref para el timer de auto-dismiss:
   ```typescript
   const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
   ```

10. Implementar `checkUpcomingEvents()` con `useCallback`:
    ```typescript
    const checkUpcomingEvents = useCallback(async () => {
      const now = new Date()
      const timeMin = now.toISOString()
      const timeMax = new Date(now.getTime() + 20 * 60 * 1000).toISOString()
      
      const res = await fetch(`/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`)
      if (!res.ok) return
      
      const events: CalendarEvent[] = await res.json()
      
      // Solo eventos con hora (no todo el día)
      const timedEvent = events.find(e => e.start.dateTime)
      if (!timedEvent || !timedEvent.start.dateTime) return
      
      const eventTime = new Date(timedEvent.start.dateTime).getTime()
      const minutesLeft = Math.floor((eventTime - now.getTime()) / 60000)
      
      // Limpiar notificaciones de eventos que ya pasaron
      if (minutesLeft < 0) {
        notifiedRef.current.delete(`${timedEvent.id}-15`)
        notifiedRef.current.delete(`${timedEvent.id}-10`)
        notifiedRef.current.delete(`${timedEvent.id}-5`)
        notifiedRef.current.delete(`${timedEvent.id}-2`)
        return
      }
      
      // Verificar si el minuto actual coincide con algún umbral
      const threshold = ALERT_THRESHOLDS.find(t => minutesLeft === t)
      if (!threshold) return
      
      const key = `${timedEvent.id}-${threshold}`
      if (notifiedRef.current.has(key)) return
      
      // Notificar
      notifiedRef.current.add(key)
      playBeep()
      showOSNotification(timedEvent.summary ?? "(Sin título)", threshold)
      
      const startFormatted = new Date(timedEvent.start.dateTime).toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit"
      })
      
      setAlert({
        title: timedEvent.summary ?? "(Sin título)",
        minutesLeft: threshold,
        startTime: startFormatted
      })
      
      // Auto-dismiss a los 30 segundos
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => setAlert(null), 30000)
    }, [])
    ```

11. Montar el polling con `useEffect`:
    - Solo si `status === "authenticated"`
    - Llamar `checkUpcomingEvents()` inmediatamente
    - Luego `setInterval(checkUpcomingEvents, 60000)`
    - Cleanup: `clearInterval` + `clearTimeout(dismissTimerRef.current)`

12. Render del popup (mostrar solo cuando `alert !== null`):
    ```tsx
    // Posición: fixed, bottom-right, z-50
    // Fondo: blanco con sombra grande, borde izquierdo colored (amber/orange)
    // Contenido:
    //   - Icono 🔔 + texto "Evento próximo"
    //   - Título del evento (negrita)
    //   - "Comienza en X minutos · a las HH:MM"
    //   - Botón X (cierre manual) → setAlert(null) + clearTimeout
    // Animación: slide-in desde abajo (Tailwind translate-y)
    ```

**Verification:**
- [x] No hay errores de TypeScript en el archivo
- [x] El componente se exporta como `export default function EventAlertPoller()`

---

### Phase 2: Montar en layout + prueba manual
**Goal**: Agregar `<EventAlertPoller />` al layout global y verificar que la alerta aparece correctamente.

**Files to modify:**
- `app/layout.tsx` — agregar import y el componente dentro de `<SessionProvider>`

**Implementation steps:**

1. En `app/layout.tsx`, agregar el import:
   ```typescript
   import EventAlertPoller from "@/src/components/EventAlertPoller"
   ```

2. Montar el componente dentro de `<SessionProvider>`, después de `<ConditionalNavbar />`:
   ```tsx
   <SessionProvider session={session}>
     <ConditionalNavbar />
     <EventAlertPoller />
     {children}
   </SessionProvider>
   ```

3. Verificar en dev que no hay errores de SSR (el componente tiene `"use client"` y no usa APIs del browser en el cuerpo del módulo).

**Verification:**
- [x] Correr `npm run dev` sin errores en consola
- [ ] En el navegador, abrir DevTools → Console: no hay errores de hidratación
- [ ] El navegador pide permiso para notificaciones al cargar (o ya fue aceptado)
- [ ] **Prueba manual del popup:** Crear un evento en Google Calendar con hora = `ahora + 15 minutos`. Esperar al próximo poll. El popup debe aparecer en la esquina inferior derecha.
- [ ] El popup desaparece solo a los 30 segundos
- [ ] El botón X cierra el popup manualmente
- [ ] Una notificación del OS aparece cuando el popup aparece
- [ ] El sonido de beep se escucha (puede requerir interacción previa del usuario en el tab por política de browsers)

---

## Edge Cases to Handle
- **Evento sin título:** Mostrar `"(Sin título)"` en lugar de `undefined`
- **Sin sesión:** El componente retorna `null` si `status !== "authenticated"` — no hace ningún fetch
- **Notificaciones bloqueadas por el browser:** Si el usuario bloqueó los permisos, el popup en la página sí aparece pero no la notificación del OS
- **AudioContext bloqueado:** Los browsers modernos requieren interacción del usuario antes de reproducir audio. El beep puede no sonar en el primer poll si el usuario no ha interactuado con la página. No es un error — es política del browser.
- **Fetch falla (red, 401, 429):** El `checkUpcomingEvents` hace `if (!res.ok) return` — falla silenciosamente sin mostrar error al usuario
- **Evento de todo el día:** Ignorado porque no tiene `start.dateTime`
- **Varios eventos en la ventana de 20 min:** Solo se alerta del primero (más próximo) — el `find()` toma el primero del array que ya viene ordenado por startTime

## Out of Scope
- Persistencia de umbrales notificados entre recargas de página
- Alertas para múltiples eventos simultáneos
- Configuración del usuario para cambiar umbrales o silenciar alertas
- Sonido personalizable
- Tests unitarios para este componente (la interacción con Web Audio API y Notification API es difícil de testear)

## Commands Reference
- `npm run dev` — servidor de desarrollo en localhost:3000
- `npm test` — correr tests existentes (no hay tests nuevos en este plan)
