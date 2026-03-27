import { NextRequest } from 'next/server'

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
import { PATCH, DELETE } from '../route'

const mockGetServerToken = getServerToken as jest.Mock
const mockCalendarRequest = calendarRequest as jest.Mock
const mockCheckRateLimit = checkRateLimit as jest.Mock

const VALID_TOKEN = { accessToken: 'tok-123', userId: 'user-1', error: null }
const VALID_EVENT_ID = 'event123'

const makePATCH = (eventId: string, body: object) =>
  new NextRequest(`http://localhost/api/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

const makeDELETE = (eventId: string) =>
  new NextRequest(`http://localhost/api/calendar/events/${eventId}`, {
    method: 'DELETE',
  })

const makeParams = (eventId: string) => ({ params: Promise.resolve({ eventId }) })

beforeEach(() => {
  mockGetServerToken.mockReset()
  mockCalendarRequest.mockReset()
  mockCheckRateLimit.mockReset()
  mockGetServerToken.mockResolvedValue(VALID_TOKEN)
  mockCheckRateLimit.mockReturnValue(true)
})

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/calendar/events/[eventId]', () => {
  it('retorna 401 cuando no hay token', async () => {
    mockGetServerToken.mockResolvedValueOnce({ accessToken: null, userId: null, error: null })

    const res = await PATCH(makePATCH(VALID_EVENT_ID, { summary: 'Test' }), makeParams(VALID_EVENT_ID))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('retorna 401 con mensaje de sesión expirada en RefreshTokenError', async () => {
    mockGetServerToken.mockResolvedValueOnce({ accessToken: null, userId: 'u1', error: 'RefreshTokenError' })

    const res = await PATCH(makePATCH(VALID_EVENT_ID, { summary: 'Test' }), makeParams(VALID_EVENT_ID))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Session expired') })
  })

  it('retorna 429 cuando el rate limit está excedido', async () => {
    mockCheckRateLimit.mockReturnValueOnce(false)

    const res = await PATCH(makePATCH(VALID_EVENT_ID, { summary: 'Test' }), makeParams(VALID_EVENT_ID))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too Many Requests' })
  })

  it('retorna 400 cuando eventId es muy corto (4 chars)', async () => {
    const res = await PATCH(makePATCH('ab12', { summary: 'Test' }), makeParams('ab12'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Invalid event ID') })
  })

  it('retorna 400 cuando eventId contiene caracteres inválidos', async () => {
    const res = await PATCH(makePATCH('../evil', { summary: 'Test' }), makeParams('../evil'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Invalid event ID') })
  })

  it('llama a calendarRequest con la ruta correcta y retorna 200', async () => {
    const updated = { id: VALID_EVENT_ID, summary: 'Updated' }
    mockCalendarRequest.mockResolvedValueOnce(updated)

    const res = await PATCH(
      makePATCH(VALID_EVENT_ID, { summary: 'Updated' }),
      makeParams(VALID_EVENT_ID)
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
    expect(mockCalendarRequest).toHaveBeenCalledWith(
      `/primary/events/${VALID_EVENT_ID}`,
      'PATCH',
      VALID_TOKEN.accessToken,
      expect.objectContaining({ summary: 'Updated' })
    )
  })

  it('retorna 500 cuando calendarRequest lanza', async () => {
    mockCalendarRequest.mockRejectedValueOnce(new Error('Google error'))

    const res = await PATCH(
      makePATCH(VALID_EVENT_ID, { summary: 'Test' }),
      makeParams(VALID_EVENT_ID)
    )
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to update event' })
  })
})

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /api/calendar/events/[eventId]', () => {
  it('retorna 401 cuando no hay token', async () => {
    mockGetServerToken.mockResolvedValueOnce({ accessToken: null, userId: null, error: null })

    const res = await DELETE(makeDELETE(VALID_EVENT_ID), makeParams(VALID_EVENT_ID))
    expect(res.status).toBe(401)
  })

  it('retorna 400 cuando eventId es inválido', async () => {
    const res = await DELETE(makeDELETE('bad!'), makeParams('bad!'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Invalid event ID') })
  })

  it('llama a calendarRequest con DELETE y retorna 204', async () => {
    mockCalendarRequest.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeDELETE(VALID_EVENT_ID), makeParams(VALID_EVENT_ID))

    expect(res.status).toBe(204)
    expect(mockCalendarRequest).toHaveBeenCalledWith(
      `/primary/events/${VALID_EVENT_ID}`,
      'DELETE',
      VALID_TOKEN.accessToken
    )
  })

  it('retorna 204 sin body cuando calendarRequest devuelve undefined', async () => {
    mockCalendarRequest.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeDELETE(VALID_EVENT_ID), makeParams(VALID_EVENT_ID))
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
  })

  it('retorna 500 cuando calendarRequest lanza', async () => {
    mockCalendarRequest.mockRejectedValueOnce(new Error('Google error'))

    const res = await DELETE(makeDELETE(VALID_EVENT_ID), makeParams(VALID_EVENT_ID))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to delete event' })
  })
})
