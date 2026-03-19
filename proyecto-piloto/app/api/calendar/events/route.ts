import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { calendarRequest } from "@/src/lib/google-calendar"

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const timeMin = searchParams.get("timeMin")
    const timeMax = searchParams.get("timeMax")

    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin y timeMax son requeridos" }, { status: 400 })
    }

    const allEvents: unknown[] = []
    let pageToken: string | undefined = undefined

    while (true) {
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
        session.access_token
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

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const event = await calendarRequest(
      "/primary/events",
      "POST",
      session.access_token,
      body
    )
    return NextResponse.json(event, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Error creating event" }, { status: 500 })
  }
}
