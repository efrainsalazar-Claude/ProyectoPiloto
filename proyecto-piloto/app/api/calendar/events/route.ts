import { NextRequest, NextResponse } from "next/server"
import { getServerToken } from "@/src/lib/get-access-token"
import { calendarRequest } from "@/src/lib/google-calendar"
import { isValidISO8601, sanitizeEventBody } from "@/src/lib/calendar-validation"
import { checkRateLimit } from "@/src/lib/rate-limiter"

const MAX_PAGES = 10

export async function GET(request: NextRequest) {
  try {
    const { accessToken, userId, error } = await getServerToken(request)
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error === "RefreshTokenError") {
      return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 })
    }
    if (userId && !checkRateLimit(userId)) {
      return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const timeMin = searchParams.get("timeMin")
    const timeMax = searchParams.get("timeMax")

    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin y timeMax son requeridos" }, { status: 400 })
    }

    if (!isValidISO8601(timeMin) || !isValidISO8601(timeMax)) {
      return NextResponse.json({ error: "Invalid date format. Use ISO 8601." }, { status: 400 })
    }

    const allEvents: unknown[] = []
    let pageToken: string | undefined = undefined
    let pageCount = 0

    while (true) {
      if (++pageCount > MAX_PAGES) break

      const queryParams = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      })
      if (pageToken) queryParams.set("pageToken", pageToken)

      const data = await calendarRequest<{ items?: unknown[]; nextPageToken?: string }>(
        `/primary/events?${queryParams}`,
        "GET",
        accessToken
      )
      allEvents.push(...(data.items ?? []))
      if (!data.nextPageToken) break
      pageToken = data.nextPageToken
    }

    return NextResponse.json(allEvents)
  } catch {
    return NextResponse.json({ error: "Error fetching events" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, userId, error } = await getServerToken(request)
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error === "RefreshTokenError") {
      return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 })
    }
    if (userId && !checkRateLimit(userId)) {
      return NextResponse.json({ error: "Too Many Requests" }, { status: 429 })
    }

    const rawBody = await request.json()
    const body = sanitizeEventBody(rawBody)
    if (!body.summary || !body.start || !body.end) {
      return NextResponse.json({ error: "Missing required fields: summary, start, end" }, { status: 400 })
    }
    const event = await calendarRequest(
      "/primary/events",
      "POST",
      accessToken,
      body
    )
    return NextResponse.json(event, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Error creating event" }, { status: 500 })
  }
}
