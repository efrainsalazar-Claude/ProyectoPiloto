import { NextRequest, NextResponse } from "next/server"
import { getServerToken } from "@/src/lib/get-access-token"
import { calendarRequest } from "@/src/lib/google-calendar"
import { isValidISO8601 } from "@/src/lib/calendar-validation"
import { checkRateLimit } from "@/src/lib/rate-limiter"

// ── Types ──────────────────────────────────────────────────────────────────

interface GCalEvent {
  id: string
  summary?: string
  status?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
}

// ── Fetch helper ───────────────────────────────────────────────────────────

const MAX_PAGES = 10

async function fetchAllEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GCalEvent[]> {
  const all: GCalEvent[] = []
  let pageToken: string | undefined = undefined
  let page = 0
  while (true) {
    if (++page > MAX_PAGES) break
    const qp = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    })
    if (pageToken) qp.set("pageToken", pageToken)
    const data = await calendarRequest<{ items?: GCalEvent[]; nextPageToken?: string }>(
      `/primary/events?${qp}`,
      "GET",
      accessToken
    )
    all.push(...(data.items ?? []))
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return all
}

// ── Computation helpers ────────────────────────────────────────────────────

function filterEvents(events: GCalEvent[]): GCalEvent[] {
  return events.filter((e) => e.status !== "cancelled")
}

function getDurationMinutes(event: GCalEvent): number {
  if (event.start.dateTime && event.end.dateTime) {
    return (
      (new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60000
    )
  }
  // all-day events count as 8 fixed hours
  return 480
}

// Extract date part from ISO string timezone-safely (avoids UTC conversion issues)
function getDatePart(dateStr: string): string {
  return dateStr.includes("T") ? dateStr.split("T")[0] : dateStr
}

// Returns 0=Mon … 4=Fri, or null for weekends
function getWeekdayIndex(dateStr: string): number | null {
  const [year, month, day] = getDatePart(dateStr).split("-").map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  const dow = d.getUTCDay() // 0=Sun … 6=Sat
  if (dow === 0 || dow === 6) return null
  return dow - 1 // Mon=0 … Fri=4
}

// Computes KPIs ──────────────────────────────────────────────────────────

function computeKpis(events: GCalEvent[]) {
  const totalMinutes = events.reduce((sum, e) => sum + getDurationMinutes(e), 0)
  const totalEvents = events.length
  return {
    totalHours: parseFloat((totalMinutes / 60).toFixed(2)),
    totalEvents,
    // occupancy: 5 days × 12h = 60h = 3600 min
    occupancyPercent: parseFloat(((totalMinutes / 3600) * 100).toFixed(1)),
    avgDurationMinutes: totalEvents > 0 ? Math.round(totalMinutes / totalEvents) : 0,
  }
}

// Hours per day ──────────────────────────────────────────────────────────

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie"]

function sumHoursByWeekday(events: GCalEvent[]): number[] {
  const hours = [0, 0, 0, 0, 0]
  for (const e of events) {
    const dateStr = e.start.dateTime ?? e.start.date
    if (!dateStr) continue
    const idx = getWeekdayIndex(dateStr)
    if (idx === null) continue
    hours[idx] += getDurationMinutes(e) / 60
  }
  return hours
}

function sumHoursByWeekBucket(events: GCalEvent[], rangeStart: Date): number[] {
  const hours = [0, 0, 0, 0]
  for (const e of events) {
    const dateStr = e.start.dateTime ?? e.start.date
    if (!dateStr) continue
    const [y, m, d] = getDatePart(dateStr).split("-").map(Number)
    const eventDate = new Date(Date.UTC(y, m - 1, d))
    const dayDiff = Math.floor(
      (eventDate.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
    )
    const weekIdx = Math.min(Math.max(Math.floor(dayDiff / 7), 0), 3)
    hours[weekIdx] += getDurationMinutes(e) / 60
  }
  return hours
}

function computeHoursPerDay(
  current: GCalEvent[],
  prev: GCalEvent[],
  groupBy: "day" | "week",
  timeMin: string,
  prevTimeMin: string | null
): Array<{ label: string; current: number; previous: number }> {
  if (groupBy === "day") {
    const cur = sumHoursByWeekday(current)
    const pre = sumHoursByWeekday(prev)
    return DAY_LABELS.map((label, i) => ({
      label,
      current: parseFloat(cur[i].toFixed(2)),
      previous: parseFloat(pre[i].toFixed(2)),
    }))
  }
  // groupBy === "week"
  const [y1, m1, d1] = getDatePart(timeMin).split("-").map(Number)
  const rangeStart = new Date(Date.UTC(y1, m1 - 1, d1))
  const cur = sumHoursByWeekBucket(current, rangeStart)

  let prevStart = rangeStart
  if (prevTimeMin) {
    const [y2, m2, d2] = getDatePart(prevTimeMin).split("-").map(Number)
    prevStart = new Date(Date.UTC(y2, m2 - 1, d2))
  }
  const pre = sumHoursByWeekBucket(prev, prevStart)

  return ["Sem 1", "Sem 2", "Sem 3", "Sem 4"].map((label, i) => ({
    label,
    current: parseFloat(cur[i].toFixed(2)),
    previous: parseFloat(pre[i].toFixed(2)),
  }))
}

// By category ────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "1:1":        ["1:1", "1on1", "one on one", "one-on-one"],
  "Planning":   ["planning", "sprint", "roadmap"],
  "Review":     ["review", "retro", "retrospectiva"],
  "Standup":    ["standup", "stand-up", "daily", "scrum"],
  "Entrevista": ["entrevista", "interview"],
  "Sync":       ["sync", "sincronización", "reunion", "reunión", "meeting"],
  "Formación":  ["training", "capacitación", "formación", "workshop"],
}

function categorize(event: GCalEvent): string {
  const title = (event.summary ?? "").toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => title.includes(kw))) return cat
  }
  return "Otro"
}

function computeByCategory(events: GCalEvent[]) {
  const map: Record<string, number> = {}
  for (const e of events) {
    const cat = categorize(e)
    map[cat] = (map[cat] ?? 0) + getDurationMinutes(e) / 60
  }
  const totalHours = Object.values(map).reduce((s, h) => s + h, 0)
  return Object.entries(map)
    .filter(([, hours]) => hours > 0)
    .map(([name, hours]) => ({
      name,
      hours: parseFloat(hours.toFixed(2)),
      percent: parseFloat(((hours / (totalHours || 1)) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.hours - a.hours)
}

// Peak hours ─────────────────────────────────────────────────────────────

function computePeakHours(events: GCalEvent[]) {
  const counts: Record<number, number> = {}
  for (let h = 8; h < 20; h++) counts[h] = 0

  for (const e of events) {
    if (!e.start.dateTime) continue
    // Extract hour from local time portion of ISO string: "...T10:30:00-06:00"
    const timePart = e.start.dateTime.split("T")[1]
    const startHour = parseInt(timePart.split(":")[0], 10)
    if (startHour >= 8 && startHour < 20) {
      counts[startHour]++
    }
  }

  return Object.entries(counts).map(([h, count]) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    count,
  }))
}

// Back-to-back detection ─────────────────────────────────────────────────

function detectBackToBack(
  events: GCalEvent[]
): Array<Array<{ id: string; summary: string; start: string; end: string }>> {
  const timed = events
    .filter((e) => e.start.dateTime && e.end.dateTime)
    .sort(
      (a, b) =>
        new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime()
    )

  if (timed.length === 0) return []

  const toEntry = (e: GCalEvent) => ({
    id: e.id,
    summary: e.summary ?? "(Sin título)",
    start: e.start.dateTime!,
    end: e.end.dateTime!,
  })

  const groups: Array<Array<{ id: string; summary: string; start: string; end: string }>> = []
  let current = [toEntry(timed[0])]

  for (let i = 1; i < timed.length; i++) {
    const prevEnd = new Date(timed[i - 1].end.dateTime!).getTime()
    const currStart = new Date(timed[i].start.dateTime!).getTime()
    const gapMinutes = (currStart - prevEnd) / 60000

    if (gapMinutes < 15) {
      current.push(toEntry(timed[i]))
    } else {
      if (current.length >= 2) groups.push(current)
      current = [toEntry(timed[i])]
    }
  }
  if (current.length >= 2) groups.push(current)

  return groups
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { accessToken, userId, error } = await getServerToken(request)
    if (error === "RefreshTokenError") {
      return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 })
    }
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (userId && !checkRateLimit(userId)) {
      return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const timeMin     = searchParams.get("timeMin")
    const timeMax     = searchParams.get("timeMax")
    const prevTimeMin = searchParams.get("prevTimeMin")
    const prevTimeMax = searchParams.get("prevTimeMax")
    const groupBy     = (searchParams.get("groupBy") ?? "day") as "day" | "week"

    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin y timeMax son requeridos" }, { status: 400 })
    }
    if (!isValidISO8601(timeMin) || !isValidISO8601(timeMax)) {
      return NextResponse.json({ error: "Invalid date format. Use ISO 8601." }, { status: 400 })
    }
    if (prevTimeMin && !isValidISO8601(prevTimeMin)) {
      return NextResponse.json({ error: "Invalid prevTimeMin format. Use ISO 8601." }, { status: 400 })
    }
    if (prevTimeMax && !isValidISO8601(prevTimeMax)) {
      return NextResponse.json({ error: "Invalid prevTimeMax format. Use ISO 8601." }, { status: 400 })
    }

    const [rawCurrent, rawPrev] = await Promise.all([
      fetchAllEvents(accessToken, timeMin, timeMax),
      prevTimeMin && prevTimeMax
        ? fetchAllEvents(accessToken, prevTimeMin, prevTimeMax)
        : Promise.resolve([]),
    ])

    const current = filterEvents(rawCurrent)
    const prev    = filterEvents(rawPrev)

    return NextResponse.json({
      kpis:        computeKpis(current),
      hoursPerDay: computeHoursPerDay(current, prev, groupBy, timeMin, prevTimeMin),
      byCategory:  computeByCategory(current),
      peakHours:   computePeakHours(current),
      backToBack:  detectBackToBack(current),
    })
  } catch {
    return NextResponse.json({ error: "Error computing stats" }, { status: 500 })
  }
}
