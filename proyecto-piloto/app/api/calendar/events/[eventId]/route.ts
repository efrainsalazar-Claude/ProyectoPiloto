import { NextRequest, NextResponse } from "next/server"
import { getServerToken } from "@/src/lib/get-access-token"
import { calendarRequest } from "@/src/lib/google-calendar"
import { isValidEventId, sanitizeEventBody } from "@/src/lib/calendar-validation"
import { checkRateLimit } from "@/src/lib/rate-limiter"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
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

    const { eventId } = await params
    if (!isValidEventId(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 })
    }

    const rawBody = await request.json()
    const patch = sanitizeEventBody(rawBody)
    const event = await calendarRequest(
      `/primary/events/${eventId}`,
      "PATCH",
      accessToken,
      patch
    )
    return NextResponse.json(event)
  } catch (err) {
    console.error("[PATCH /api/calendar/events/:id]", err)
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
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

    const { eventId } = await params
    if (!isValidEventId(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 })
    }

    await calendarRequest(
      `/primary/events/${eventId}`,
      "DELETE",
      accessToken
    )
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error("[DELETE /api/calendar/events/:id]", err)
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 })
  }
}
