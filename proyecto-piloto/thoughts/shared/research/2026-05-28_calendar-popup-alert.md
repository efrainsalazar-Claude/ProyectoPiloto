---
date: 2026-05-28T00:00:00-05:00
git_commit: b8c2993627f9dcf1f3f06267eda34612c1df5f76
branch: main
repository: proyecto-piloto
topic: "Popup alert con sonido cuando el siguiente evento del calendario está a 15 minutos"
tags: [research, codebase, calendar, notification, alert, sound]
status: complete
last_updated: 2026-05-28
---

# Research: Popup alert con sonido — evento próximo a 15 minutos

**Date**: 2026-05-28  
**Git Commit**: b8c2993627f9dcf1f3f06267eda34612c1df5f76  
**Branch**: main

## Research Question
> Quiero implementar una alerta pop up cuando mi siguiente evento en el calendario según la hora sea en 15 mins y que haga un sonido y me salga algo ahí.

## Summary
El proyecto tiene un sistema de calendario completamente funcional: eventos vienen de Google Calendar vía `/api/calendar/events`, están ordenados por `startTime` ascendente, y el frontend es un Client Component (`CalendarWithModal.tsx` + `CalendarView.tsx`). Para implementar la alerta de 15 minutos se necesita un componente cliente global que haga polling periódico a la API, compare la hora del próximo evento con la hora actual, y cuando la diferencia sea ≤ 15 minutos muestre un popup y reproduzca un sonido. No existe ninguna infraestructura de notificaciones en el proyecto actualmente.

## Detailed Findings

### Estructura del evento (data shape)
Los eventos retornados por `GET /api/calendar/events` son objetos crudos de Google Calendar v3 con estos campos relevantes:

- `id` — string, ID único del evento
- `summary` — string opcional, título del evento
- `start.dateTime` — ISO 8601 con timezone (eventos con hora)
- `start.date` — `YYYY-MM-DD` (eventos de todo el día, sin hora)
- `end.dateTime` / `end.date` — igual que `start`

**Importante:** Los eventos vienen ordenados por `startTime` ascendente porque el route pasa `orderBy=startTime&singleEvents=true` a la API de Google (`app/api/calendar/events/route.ts:41-47`).

### API de eventos — GET /api/calendar/events
- **Archivo:** `app/api/calendar/events/route.ts`
- Requiere query params `timeMin` y `timeMax` (ISO 8601)
- Requiere autenticación — llama `getServerToken(request)`, retorna 401 si no hay sesión
- Retorna array plano de todos los eventos en el rango, ordenados por startTime

Para la alerta: se puede llamar con `timeMin = ahora` y `timeMax = ahora + 30 minutos`, y el primer elemento del array será el próximo evento más cercano.

### CalendarView.tsx — Client Component
- **Archivo:** `src/components/CalendarView.tsx`
- `"use client"` en línea 1
- Usa FullCalendar (lazy-loaded con `next/dynamic`, `ssr: false`)
- Fetch de eventos via `GET /api/calendar/events?timeMin=...&timeMax=...`
- El fetch se dispara en `handleDatesSet` (callback de FullCalendar) cuando el usuario navega

### CalendarWithModal.tsx — Client Component
- **Archivo:** `src/components/CalendarWithModal.tsx`
- `"use client"` en línea 1
- Orquesta `CalendarView` + `EventModal`
- Maneja crear, editar y borrar eventos vía la API

### Infraestructura de notificaciones existente
**No existe ninguna.** No hay:
- Componente de toast/notificación
- Sistema de polling
- Web Audio API usage
- Notification API usage
- Ningún `setInterval` o `useInterval` en el proyecto

## Code References
- `app/api/calendar/events/route.ts:7` — `MAX_PAGES = 10`
- `app/api/calendar/events/route.ts:23-28` — validación de `timeMin`/`timeMax`
- `app/api/calendar/events/route.ts:41-47` — params enviados a Google: `singleEvents=true`, `orderBy=startTime`
- `app/api/calendar/events/route.ts:50-55` — acumulación de `items` en `allEvents`
- `src/components/CalendarView.tsx:1` — `"use client"`
- `src/components/CalendarView.tsx:56-80` — `fetchEvents` con `useCallback`
- `src/components/CalendarView.tsx:65` — tipo explícito del evento: `{ id, summary?, start: { dateTime?, date? }, end: { dateTime?, date? } }`
- `src/components/CalendarWithModal.tsx:1` — `"use client"`
- `src/components/CalendarWithModal.tsx:44-66` — lógica de save con `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `src/lib/google-calendar.ts:3` — `calendarRequest<T>` — wrapper HTTP genérico, sin lógica de eventos próximos

## Key Architectural Decisions Found
1. **Eventos vienen de Google Calendar, no de Prisma** — La BD local no almacena eventos. Toda consulta pasa por la API de Google via el route de Next.js.
2. **Todos los componentes de calendario son Client Components** — El runtime de browser está disponible para polling, `setInterval`, Web Audio API, etc.
3. **Autenticación requerida en el route** — `getServerToken` extrae la sesión de la cookie de Auth.js. El polling desde el cliente reutilizará automáticamente la cookie de sesión activa.
4. **Eventos de todo el día no tienen `dateTime`** — Solo tienen `date`. Para la alerta de 15 minutos solo interesan eventos con `start.dateTime`.

## Gaps in Research
- No se analizó `src/components/EventModal.tsx` (irrelevante para notificaciones)
- No se analizó `app/layout.tsx` para ver dónde se monta el componente global (necesario para el plan de implementación)
- No se investigó si el proyecto ya tiene alguna librería de UI de toasts (ej. `react-hot-toast`, `sonner`) en `package.json`

## Preguntas y recomendaciones para el usuario

### Decisiones de diseño que el usuario debe tomar:

**1. ¿Global o solo en la página del calendario?**
- **Global (recomendado):** El componente vive en `app/layout.tsx` — la alerta suena aunque estés en otra página de la app.
- **Solo en calendario:** El componente vive en la página del calendario — solo alerta si estás viendo el calendario.

**2. ¿Qué sonido quieres?**
- **Web Audio API (sin archivos):** Se genera un beep programáticamente. Funciona sin subir ningún archivo de audio.
- **Archivo de audio:** Subes un `.mp3`/`.wav` a `public/sounds/` y se reproduce con `<audio>`. Más personalizable.

**3. ¿Cuánto dura la ventana de alerta?**
- El polling más práctico es cada 60 segundos. ¿Quieres que solo avise una vez por evento o que recuerde cada minuto hasta que el evento empiece?

**4. ¿Dismiss automático o manual?**
- ¿El popup desaparece solo después de X segundos o el usuario debe cerrarlo?

**5. ¿Notificación del navegador además del popup?**
- La Browser Notification API puede mostrar una notificación nativa del OS aunque la pestaña esté en segundo plano. ¿Te interesa?
