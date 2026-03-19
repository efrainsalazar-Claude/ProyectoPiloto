"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import type { DateSelectArg, EventClickArg, DatesSetArg, EventInput } from "@fullcalendar/core"

// Lazy load FullCalendar para evitar SSR issues y reducir bundle inicial
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false })

// Plugins se importan de forma dinámica dentro del componente
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"

interface CalendarViewProps {
  onSelectSlot?: (arg: DateSelectArg) => void
  onEventClick?: (arg: EventClickArg) => void
}

export default function CalendarView({ onSelectSlot, onEventClick }: CalendarViewProps) {
  const [events, setEvents] = useState<EventInput[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEvents = useCallback(async (timeMin: string, timeMax: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ timeMin, timeMax })
      const res = await fetch(`/api/calendar/events?${params}`)
      if (!res.ok) throw new Error("Error fetching events")
      const data = await res.json()
      // Mapear al formato de FullCalendar
      setEvents(
        data.map((e: { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }) => ({
          id: e.id,
          title: e.summary ?? "(Sin título)",
          start: e.start.dateTime ?? e.start.date,
          end: e.end.dateTime ?? e.end.date,
          allDay: !e.start.dateTime,
        }))
      )
    } catch (err) {
      console.error("Error fetching calendar events:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      fetchEvents(arg.startStr, arg.endStr)
    },
    [fetchEvents]
  )

  return (
    <div className="h-full relative">
      {loading && (
        <div className="absolute top-2 right-2 z-10">
          <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 px-2 py-1 rounded shadow">
            Cargando...
          </span>
        </div>
      )}
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
        eventColor="#4f46e5"
        eventBorderColor="#4338ca"
        slotLabelFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
      />
    </div>
  )
}
