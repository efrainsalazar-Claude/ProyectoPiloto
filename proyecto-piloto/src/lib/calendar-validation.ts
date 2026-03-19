// ISO 8601 datetime: YYYY-MM-DDTHH:mm:ssZ o YYYY-MM-DDTHH:mm:ss±HH:mm
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/

// Google Calendar event IDs: alfanuméricos + guion bajo/guion, 5-1024 chars
const EVENT_ID_REGEX = /^[a-zA-Z0-9_-]{5,1024}$/

export function isValidISO8601(value: string): boolean {
  return ISO8601_REGEX.test(value)
}

export function isValidEventId(value: string): boolean {
  return EVENT_ID_REGEX.test(value)
}

// Allowlist de campos permitidos para POST/PATCH hacia Google Calendar Event API
const ALLOWED_EVENT_FIELDS = new Set([
  "summary", "description", "location", "start", "end",
  "colorId", "reminders", "visibility", "status",
])

export function sanitizeEventBody(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => ALLOWED_EVENT_FIELDS.has(key))
  )
}
