const BASE = "https://www.googleapis.com/calendar/v3/calendars"

export async function calendarRequest<T>(
  path: string,
  method: string,
  accessToken: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(
      new Error(err?.error?.message ?? `Calendar API error ${res.status}`),
      { status: res.status, reason: err?.error?.errors?.[0]?.reason }
    )
  }
  return res.json()
}
