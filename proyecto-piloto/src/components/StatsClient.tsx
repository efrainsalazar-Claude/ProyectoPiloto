"use client"

import { useState, useEffect } from "react"
import StatsCharts from "@/src/components/StatsCharts"
import StatsBackToBack from "@/src/components/StatsBackToBack"

// ── Types ──────────────────────────────────────────────────────────────────

type RangeOption = "current" | "previous" | "last4weeks"

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

// ── Date range helper ──────────────────────────────────────────────────────

function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const absOffset = Math.abs(offset)
  const oh = pad(Math.floor(absOffset / 60))
  const om = pad(absOffset % 60)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${oh}:${om}`
  )
}

// Returns Monday of the week containing `date`
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day // adjust so Monday=0
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function getRangeDates(range: RangeOption): {
  timeMin: string
  timeMax: string
  prevTimeMin: string
  prevTimeMax: string
  groupBy: "day" | "week"
} {
  const now = new Date()

  if (range === "current") {
    const mon = getMonday(now)
    const sun = addDays(mon, 6)
    sun.setHours(23, 59, 59, 999)
    const prevMon = addDays(mon, -7)
    const prevSun = addDays(prevMon, 6)
    prevSun.setHours(23, 59, 59, 999)
    return {
      timeMin: toLocalISO(mon),
      timeMax: toLocalISO(sun),
      prevTimeMin: toLocalISO(prevMon),
      prevTimeMax: toLocalISO(prevSun),
      groupBy: "day",
    }
  }

  if (range === "previous") {
    const thisMonday = getMonday(now)
    const mon = addDays(thisMonday, -7)
    const sun = addDays(mon, 6)
    sun.setHours(23, 59, 59, 999)
    const prevMon = addDays(mon, -7)
    const prevSun = addDays(prevMon, 6)
    prevSun.setHours(23, 59, 59, 999)
    return {
      timeMin: toLocalISO(mon),
      timeMax: toLocalISO(sun),
      prevTimeMin: toLocalISO(prevMon),
      prevTimeMax: toLocalISO(prevSun),
      groupBy: "day",
    }
  }

  // last4weeks
  const thisMonday = getMonday(now)
  const mon = addDays(thisMonday, -28) // 4 weeks back
  const sun = addDays(thisMonday, -1)  // last Sunday
  sun.setHours(23, 59, 59, 999)
  const prevMon = addDays(mon, -28)
  const prevSun = addDays(mon, -1)
  prevSun.setHours(23, 59, 59, 999)
  return {
    timeMin: toLocalISO(mon),
    timeMax: toLocalISO(sun),
    prevTimeMin: toLocalISO(prevMon),
    prevTimeMax: toLocalISO(prevSun),
    groupBy: "week",
  }
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-indigo-600 dark:text-indigo-400">{icon}</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function StatsClient() {
  const [range, setRange] = useState<RangeOption>("current")
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const { timeMin, timeMax, prevTimeMin, prevTimeMax, groupBy } = getRangeDates(range)
    const params = new URLSearchParams({ timeMin, timeMax, groupBy })
    if (prevTimeMin) params.set("prevTimeMin", prevTimeMin)
    if (prevTimeMax) params.set("prevTimeMax", prevTimeMax)

    setLoading(true)
    setError(null)
    fetch(`/api/calendar/stats?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Error")
        return res.json() as Promise<StatsData>
      })
      .then(setData)
      .catch(() => setError("No se pudieron cargar las estadísticas"))
      .finally(() => setLoading(false))
  }, [range])

  const rangeOptions: Array<{ value: RangeOption; label: string }> = [
    { value: "current",    label: "Esta semana" },
    { value: "previous",   label: "Semana anterior" },
    { value: "last4weeks", label: "Últimas 4 semanas" },
  ]

  return (
    <div className="space-y-6">
      {/* Header + selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estadísticas</h1>
        <div className="flex flex-wrap gap-2">
          {rangeOptions.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                range === value
                  ? "bg-indigo-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-indigo-100 dark:border-indigo-900 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-6 animate-pulse"
              >
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-6 animate-pulse h-64"
              />
            ))}
          </div>
        </div>
      ) : data?.kpis.totalEvents === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-300 dark:text-gray-600"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 mt-4 text-sm">
            No hay eventos en este rango
          </p>
        </div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Horas en reuniones"
              value={`${data.kpis.totalHours.toFixed(1)}h`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
            />
            <KpiCard
              label="Total de eventos"
              value={data.kpis.totalEvents.toString()}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              }
            />
            <KpiCard
              label="Tiempo ocupado"
              value={`${data.kpis.occupancyPercent.toFixed(0)}%`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              }
            />
            <KpiCard
              label="Duración promedio"
              value={`${data.kpis.avgDurationMinutes}min`}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              }
            />
          </div>
          <StatsCharts
            hoursPerDay={data.hoursPerDay}
            byCategory={data.byCategory}
            peakHours={data.peakHours}
          />
          <StatsBackToBack groups={data.backToBack} />
        </>
      ) : null}
    </div>
  )
}
