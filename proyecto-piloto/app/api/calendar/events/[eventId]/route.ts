import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { calendarRequest } from "@/src/lib/google-calendar"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { eventId } = await params
  const body = await request.json()
  const patch = JSON.parse(JSON.stringify(body))
  const event = await calendarRequest(
    `/primary/events/${eventId}`,
    "PATCH",
    session.access_token,
    patch
  )
  return NextResponse.json(event)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth()
  if (!session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { eventId } = await params
  await calendarRequest(
    `/primary/events/${eventId}`,
    "DELETE",
    session.access_token
  )
  return new Response(null, { status: 204 })
}
