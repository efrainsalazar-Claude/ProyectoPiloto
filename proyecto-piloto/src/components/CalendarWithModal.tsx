"use client"

import { useState, useCallback } from "react"
import CalendarView from "./CalendarView"
import EventModal from "./EventModal"
import type { DateSelectArg, EventClickArg } from "@fullcalendar/core"

interface ModalState {
  isOpen: boolean
  eventId?: string
  title: string
  start: string
  end: string
}

const CLOSED: ModalState = { isOpen: false, title: "", start: "", end: "" }

export default function CalendarWithModal() {
  const [modal, setModal] = useState<ModalState>(CLOSED)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey((k) => k + 1)

  const handleSelectSlot = useCallback((arg: DateSelectArg) => {
    setModal({
      isOpen: true,
      title: "",
      start: arg.startStr,
      end: arg.endStr,
    })
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const { event } = arg
    setModal({
      isOpen: true,
      eventId: event.id,
      title: event.title,
      start: event.startStr,
      end: event.endStr,
    })
  }, [])

  const handleSave = async (data: { title: string; start: string; end: string }) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const body = {
      summary: data.title,
      start: { dateTime: new Date(data.start).toISOString(), timeZone: tz },
      end:   { dateTime: new Date(data.end).toISOString(), timeZone: tz },
    }

    if (modal.eventId) {
      await fetch(`/api/calendar/events/${modal.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } else {
      await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    }
    refresh()
  }

  const handleDelete = async () => {
    if (!modal.eventId) return
    await fetch(`/api/calendar/events/${modal.eventId}`, { method: "DELETE" })
    refresh()
  }

  return (
    <>
      <CalendarView
        key={refreshKey}
        onSelectSlot={handleSelectSlot}
        onEventClick={handleEventClick}
      />
      <EventModal
        isOpen={modal.isOpen}
        onClose={() => setModal(CLOSED)}
        onSave={handleSave}
        onDelete={modal.eventId ? handleDelete : undefined}
        initialData={modal.isOpen ? { id: modal.eventId, title: modal.title, start: modal.start, end: modal.end } : undefined}
      />
    </>
  )
}
