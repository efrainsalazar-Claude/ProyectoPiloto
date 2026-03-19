"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import type { DateSelectArg, EventClickArg, DatesSetArg, EventInput, EventContentArg } from "@fullcalendar/core"

// Lazy load FullCalendar para evitar SSR issues y reducir bundle inicial
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false })

// Plugins se importan de forma dinámica dentro del componente
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"

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
          color: getEventAccentColor(e.id),
        }))
      )
    } catch (err) {
      console.error("Error fetching calendar events")
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
    <div className="relative">
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
        height="auto"
        scrollTime="08:00:00"
        stickyHeaderDates={true}
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
    </div>
  )
}
