"use client"

import { useSession } from "next-auth/react"
import { useEffect, useRef, useState, useCallback } from "react"

type CalendarEvent = {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

const ALERT_THRESHOLDS = [15, 10, 5, 2] // minutos

function playBeep() {
  try {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = "sine"
    oscillator.frequency.value = 880

    const now = ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01)
    gain.gain.setValueAtTime(0.3, now + 0.21)
    gain.gain.linearRampToValueAtTime(0, now + 0.31)

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    oscillator.start(now)
    oscillator.stop(now + 0.31)

    oscillator.onended = () => ctx.close()
  } catch {
    // AudioContext bloqueado por política del browser — falla silenciosamente
  }
}

function showOSNotification(title: string, minutesLeft: number) {
  if (typeof window === "undefined") return
  if (!("Notification" in window)) return
  if (Notification.permission !== "granted") return
  new Notification("📅 CalendarAI", {
    body: `"${title}" comienza en ${minutesLeft} minutos`,
    icon: "/favicon.ico",
  })
}

export default function EventAlertPoller() {
  const { status } = useSession()

  const [alert, setAlert] = useState<{
    title: string
    minutesLeft: number
    startTime: string
  } | null>(null)

  const notifiedRef = useRef<Set<string>>(new Set())
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pedir permiso de notificaciones una sola vez al montar
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("Notification" in window)) return
    if (Notification.permission === "default") {
      Notification.requestPermission()
    }
  }, [])

  const checkUpcomingEvents = useCallback(async () => {
    const now = new Date()
    // La validación del API requiere ISO 8601 sin milisegundos (HH:mm:ssZ)
    const stripMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")
    const timeMin = stripMs(now)
    const timeMax = stripMs(new Date(now.getTime() + 20 * 60 * 1000))

    let events: CalendarEvent[]
    try {
      const res = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
      )
      if (!res.ok) return
      events = await res.json()
    } catch {
      return
    }

    // Solo el primer evento con hora (más próximo)
    const timedEvent = events.find((e) => e.start.dateTime)
    if (!timedEvent || !timedEvent.start.dateTime) return

    const eventTime = new Date(timedEvent.start.dateTime).getTime()
    const minutesLeft = Math.floor((eventTime - now.getTime()) / 60000)

    // Limpiar umbrales de eventos que ya pasaron
    if (minutesLeft < 0) {
      ALERT_THRESHOLDS.forEach((t) =>
        notifiedRef.current.delete(`${timedEvent.id}-${t}`)
      )
      return
    }

    // Match exacto: solo disparar en los minutos específicos (15, 10, 5, 2).
    // Con polling cada 30s la probabilidad de saltar un threshold es mínima.
    const threshold = ALERT_THRESHOLDS.find((t) => minutesLeft === t)
    if (threshold === undefined) return

    const key = `${timedEvent.id}-${threshold}`
    if (notifiedRef.current.has(key)) return
    notifiedRef.current.add(key)
    playBeep()
    showOSNotification(timedEvent.summary ?? "(Sin título)", minutesLeft)

    const startFormatted = new Date(timedEvent.start.dateTime).toLocaleTimeString(
      "es",
      { hour: "2-digit", minute: "2-digit" }
    )

    setAlert({
      title: timedEvent.summary ?? "(Sin título)",
      minutesLeft,
      startTime: startFormatted,
    })

    // Auto-dismiss a los 30 segundos
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => setAlert(null), 30000)
  }, [])

  useEffect(() => {
    if (status !== "authenticated") return

    checkUpcomingEvents()
    const interval = setInterval(checkUpcomingEvents, 30000)

    return () => {
      clearInterval(interval)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [status, checkUpcomingEvents])

  const handleDismiss = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    setAlert(null)
  }

  if (!alert) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 alert-slide-in">
      <div className="rounded-xl border-l-4 border-amber-500 bg-white shadow-2xl">
        <div className="flex items-start justify-between p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-xl">🔔</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                Evento próximo
              </p>
              <p className="mt-0.5 font-bold text-gray-900">{alert.title}</p>
              <p className="mt-1 text-sm text-gray-500">
                Comienza en{" "}
                <span className="font-semibold text-amber-700">
                  {alert.minutesLeft} min
                </span>{" "}
                · a las {alert.startTime}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-2 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar alerta"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {/* Barra de progreso del auto-dismiss */}
        <div className="h-1 rounded-b-xl bg-amber-100">
          <div className="alert-shrink h-1 rounded-b-xl bg-amber-400" />
        </div>
      </div>
    </div>
  )
}
