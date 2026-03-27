import { NextRequest } from 'next/server'

// Factory functions explícitas para evitar que Jest importe los módulos reales
// (next-auth/jwt es ESM puro y no puede ser parseado por Jest/CommonJS)
jest.mock('@/src/lib/get-access-token', () => ({
  getServerToken: jest.fn(),
  getAccessToken: jest.fn(),
}))
jest.mock('@/src/lib/google-calendar', () => ({
  calendarRequest: jest.fn(),
}))
jest.mock('@/src/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn(),
}))

import { getServerToken } from '@/src/lib/get-access-token'
import { calendarRequest } from '@/src/lib/google-calendar'
import { checkRateLimit } from '@/src/lib/rate-limiter'
import { GET, POST } from '../route'

const mockGetServerToken = getServerToken as jest.Mock
const mockCalendarRequest = calendarRequest as jest.Mock
const mockCheckRateLimit = checkRateLimit as jest.Mock

const VALID_TOKEN = { accessToken: 'tok-123', userId: 'user-1', error: null }
const VALID_DATES = 'timeMin=2024-01-01T00:00:00Z&timeMax=2024-01-31T23:59:59Z'

const makeGET = (params = VALID_DATES) =>
  new NextRequest(`http://localhost/api/calendar/events?${params}`)

const makePOST = (body: object) =>
  new NextRequest('http://localhost/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  mockGetServerToken.mockReset()
  mockCalendarRequest.mockReset()
  mockCheckRateLimit.mockReset()
  // Defaults seguros para la mayoría de tests
  mockGetServerToken.mockResolvedValue(VALID_TOKEN)
  mockCheckRateLimit.mockReturnValue(true)
})

// ── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/calendar/events', () => {
  it('retorna 401 cuando no hay token', async () => {
    mockGetServerToken.mockResolvedValueOnce({ accessToken: null, userId: null, error: null })

    const res = await GET(makeGET())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('retorna 401 con mensaje de sesión expirada en RefreshTokenError', async () => {
    mockGetServerToken.mockResolvedValueOnce({
      accessToken: null, userId: 'u1', error: 'RefreshTokenError',
    })

    const res = await GET(makeGET())
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Session expired') })
  })

  it('retorna 429 cuando el rate limit está excedido', async () => {
    mockCheckRateLimit.mockReturnValueOnce(false)

    const res = await GET(makeGET())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too Many Requests' })
  })

  it('retorna 400 cuando faltan timeMin y timeMax', async () => {
    const res = await GET(makeGET(''))
    expect(res.status).toBe(400)
  })

  it('retorna 400 cuando las fechas tienen formato inválido', async () => {
    const res = await GET(makeGET('timeMin=2024-01-01&timeMax=2024-01-31'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('ISO 8601') })
  })

  it('retorna 200 con array de eventos en request válida (una página)', async () => {
    const events = [{ id: 'evt1', summary: 'Meeting' }]
    mockCalendarRequest.mockResolvedValueOnce({ items: events, nextPageToken: undefined })

    const res = await GET(makeGET())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(events)
  })

  it('concatena eventos de múltiples páginas', async () => {
    mockCalendarRequest
      .mockResolvedValueOnce({ items: [{ id: 'e1' }], nextPageToken: 'page2' })
      .mockResolvedValueOnce({ items: [{ id: 'e2' }], nextPageToken: undefined })

    const res = await GET(makeGET())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'e1' }, { id: 'e2' }])
    expect(mockCalendarRequest).toHaveBeenCalledTimes(2)
  })

  it('retorna 500 cuando calendarRequest lanza', async () => {
    mockCalendarRequest.mockRejectedValueOnce(new Error('Google error'))

    const res = await GET(makeGET())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Error fetching events' })
  })

  it('corta la paginación en MAX_PAGES=10', async () => {
    // Siempre devuelve nextPageToken → debería cortar en 10 llamadas
    mockCalendarRequest.mockResolvedValue({ items: [], nextPageToken: 'always' })

    await GET(makeGET())
    expect(mockCalendarRequest).toHaveBeenCalledTimes(10)
  })
})

// ── POST ─────────────────────────────────────────────────────────────────────

describe('POST /api/calendar/events', () => {
  it('retorna 401 cuando no hay token', async () => {
    mockGetServerToken.mockResolvedValueOnce({ accessToken: null, userId: null, error: null })

    const res = await POST(makePOST({ summary: 'Test', start: {}, end: {} }))
    expect(res.status).toBe(401)
  })

  it('retorna 400 cuando falta summary en el body', async () => {
    const res = await POST(makePOST({ start: { dateTime: '2024-01-15T10:00:00Z' }, end: { dateTime: '2024-01-15T11:00:00Z' } }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('summary') })
  })

  it('no envía campos no permitidos (attendees) a calendarRequest', async () => {
    mockCalendarRequest.mockResolvedValueOnce({ id: 'new-evt' })

    await POST(makePOST({
      summary: 'Test',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' },
      attendees: [{ email: 'evil@example.com' }],
    }))

    const sentBody = mockCalendarRequest.mock.calls[0][3]
    expect(sentBody).not.toHaveProperty('attendees')
    expect(sentBody).toHaveProperty('summary', 'Test')
  })

  it('retorna 201 con el evento creado en request válida', async () => {
    const created = { id: 'new-evt', summary: 'Meeting' }
    mockCalendarRequest.mockResolvedValueOnce(created)

    const res = await POST(makePOST({
      summary: 'Meeting',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' },
    }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)
  })

  it('solo pasan campos del allowlist cuando el body tiene extras', async () => {
    mockCalendarRequest.mockResolvedValueOnce({ id: 'evt' })

    await POST(makePOST({
      summary: 'Test',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' },
      description: 'OK',
      recurringEventId: 'should-be-stripped',
      creator: { email: 'evil@example.com' },
    }))

    const sentBody = mockCalendarRequest.mock.calls[0][3]
    expect(Object.keys(sentBody)).toEqual(['summary', 'start', 'end', 'description'])
  })

  it('retorna 500 cuando calendarRequest lanza', async () => {
    mockCalendarRequest.mockRejectedValueOnce(new Error('Google error'))

    const res = await POST(makePOST({
      summary: 'Test',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' },
    }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Error creating event' })
  })
})
