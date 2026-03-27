import { NextRequest } from 'next/server'

jest.mock('@/src/lib/get-access-token', () => ({
  getServerToken: jest.fn(),
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
import { GET } from '../route'

const mockGetServerToken = getServerToken as jest.Mock
const mockCalendarRequest = calendarRequest as jest.Mock
const mockCheckRateLimit = checkRateLimit as jest.Mock

const VALID_TOKEN = { accessToken: 'tok-123', userId: 'u1', error: null }
const VALID_PARAMS = 'timeMin=2026-03-23T00:00:00-06:00&timeMax=2026-03-27T23:59:59-06:00'

const makeGET = (params = VALID_PARAMS) =>
  new NextRequest(`http://localhost/api/calendar/stats?${params}`)

const makeEvent = (id: string, start: string, end: string, summary = 'Meeting') => ({
  id,
  summary,
  status: 'confirmed',
  start: { dateTime: start },
  end: { dateTime: end },
})

const makeAllDayEvent = (id: string, date: string) => ({
  id,
  summary: 'All day',
  status: 'confirmed',
  start: { date },
  end: { date },
})

beforeEach(() => {
  mockGetServerToken.mockReset()
  mockCalendarRequest.mockReset()
  mockCheckRateLimit.mockReset()
  mockGetServerToken.mockResolvedValue(VALID_TOKEN)
  mockCheckRateLimit.mockReturnValue(true)
  mockCalendarRequest.mockResolvedValue({ items: [] })
})

// ── Auth y Rate Limit ────────────────────────────────────────────────────────

describe('GET /api/calendar/stats — Auth y Rate Limit', () => {
  it('retorna 401 cuando no hay accessToken', async () => {
    mockGetServerToken.mockResolvedValue({ accessToken: null, userId: null, error: null })
    const res = await GET(makeGET())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('retorna 401 con mensaje Session expired si error es RefreshTokenError', async () => {
    mockGetServerToken.mockResolvedValue({ accessToken: null, userId: 'u1', error: 'RefreshTokenError' })
    const res = await GET(makeGET())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Session expired, please sign in again' })
  })

  it('retorna 429 cuando rate limit está excedido', async () => {
    mockCheckRateLimit.mockReturnValue(false)
    const res = await GET(makeGET())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Too Many Requests' })
  })

  it('retorna 200 cuando userId es null (sin rate limit) y accessToken es válido', async () => {
    mockGetServerToken.mockResolvedValue({ accessToken: 'tok', userId: null, error: null })
    const res = await GET(makeGET())
    expect(res.status).toBe(200)
  })
})

// ── Validación de parámetros ─────────────────────────────────────────────────

describe('GET /api/calendar/stats — Validación de parámetros', () => {
  it('retorna 400 cuando falta timeMin', async () => {
    const res = await GET(makeGET('timeMax=2026-03-27T23:59:59-06:00'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'timeMin y timeMax son requeridos' })
  })

  it('retorna 400 cuando falta timeMax', async () => {
    const res = await GET(makeGET('timeMin=2026-03-23T00:00:00-06:00'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'timeMin y timeMax son requeridos' })
  })

  it('retorna 400 cuando timeMin tiene formato inválido', async () => {
    const res = await GET(makeGET('timeMin=2026-03-23&timeMax=2026-03-27T23:59:59-06:00'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid date format. Use ISO 8601.' })
  })

  it('retorna 400 cuando prevTimeMin tiene formato inválido', async () => {
    const res = await GET(makeGET(`${VALID_PARAMS}&prevTimeMin=not-a-date`))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid prevTimeMin format. Use ISO 8601.' })
  })
})

// ── Respuesta exitosa — estructura ───────────────────────────────────────────

describe('GET /api/calendar/stats — Estructura de respuesta', () => {
  it('retorna 200 con estructura correcta y KPIs en cero cuando no hay eventos', async () => {
    const res = await GET(makeGET())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('kpis')
    expect(body).toHaveProperty('hoursPerDay')
    expect(body).toHaveProperty('byCategory')
    expect(body).toHaveProperty('peakHours')
    expect(body).toHaveProperty('backToBack')
    expect(body.kpis.totalEvents).toBe(0)
    expect(body.kpis.totalHours).toBe(0)
    expect(body.kpis.avgDurationMinutes).toBe(0)
  })

  it('groupBy=week → hoursPerDay tiene 4 entradas con labels Sem 1..Sem 4', async () => {
    const res = await GET(makeGET(`${VALID_PARAMS}&groupBy=week`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hoursPerDay).toHaveLength(4)
    expect(body.hoursPerDay.map((e: { label: string }) => e.label)).toEqual(['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'])
  })

  it('groupBy=day (default) → hoursPerDay tiene 5 entradas Lun..Vie', async () => {
    const res = await GET(makeGET())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hoursPerDay).toHaveLength(5)
    expect(body.hoursPerDay.map((e: { label: string }) => e.label)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie'])
  })
})

// ── Cómputo de KPIs ──────────────────────────────────────────────────────────

describe('GET /api/calendar/stats — Cómputo de KPIs', () => {
  it('evento de 60 min → totalHours=1, totalEvents=1, avgDurationMinutes=60', async () => {
    mockCalendarRequest.mockResolvedValue({
      items: [makeEvent('1', '2026-03-24T09:00:00-06:00', '2026-03-24T10:00:00-06:00')],
    })
    const res = await GET(makeGET())
    const body = await res.json()
    expect(body.kpis.totalHours).toBe(1)
    expect(body.kpis.totalEvents).toBe(1)
    expect(body.kpis.avgDurationMinutes).toBe(60)
    expect(body.kpis.occupancyPercent).toBeCloseTo(1.7, 0)
  })

  it('evento all-day → cuenta como 8h (480 min)', async () => {
    mockCalendarRequest.mockResolvedValue({
      items: [makeAllDayEvent('1', '2026-03-24')],
    })
    const res = await GET(makeGET())
    const body = await res.json()
    expect(body.kpis.totalHours).toBe(8)
    expect(body.kpis.avgDurationMinutes).toBe(480)
  })

  it('evento con status cancelled → excluido de los KPIs', async () => {
    mockCalendarRequest.mockResolvedValue({
      items: [{ ...makeEvent('1', '2026-03-24T09:00:00Z', '2026-03-24T10:00:00Z'), status: 'cancelled' }],
    })
    const res = await GET(makeGET())
    const body = await res.json()
    expect(body.kpis.totalEvents).toBe(0)
    expect(body.kpis.totalHours).toBe(0)
  })
})

// ── Categorización y back-to-back ────────────────────────────────────────────

describe('GET /api/calendar/stats — Categorización y back-to-back', () => {
  it('evento con título "standup diario" → aparece en byCategory como Standup', async () => {
    mockCalendarRequest.mockResolvedValue({
      items: [makeEvent('1', '2026-03-24T09:00:00Z', '2026-03-24T09:30:00Z', 'standup diario')],
    })
    const res = await GET(makeGET())
    const body = await res.json()
    expect(body.byCategory[0].name).toBe('Standup')
  })

  it('dos eventos con gap de 10 min → detectados en backToBack (1 grupo de 2)', async () => {
    mockCalendarRequest.mockResolvedValue({
      items: [
        makeEvent('1', '2026-03-24T09:00:00Z', '2026-03-24T10:00:00Z', 'Meeting 1'),
        makeEvent('2', '2026-03-24T10:10:00Z', '2026-03-24T11:00:00Z', 'Meeting 2'),
      ],
    })
    const res = await GET(makeGET())
    const body = await res.json()
    expect(body.backToBack).toHaveLength(1)
    expect(body.backToBack[0]).toHaveLength(2)
  })

  it('dos eventos con gap de 15 min exactos → NO detectados (condición es < 15)', async () => {
    mockCalendarRequest.mockResolvedValue({
      items: [
        makeEvent('1', '2026-03-24T09:00:00Z', '2026-03-24T10:00:00Z', 'Meeting 1'),
        makeEvent('2', '2026-03-24T10:15:00Z', '2026-03-24T11:00:00Z', 'Meeting 2'),
      ],
    })
    const res = await GET(makeGET())
    const body = await res.json()
    expect(body.backToBack).toHaveLength(0)
  })
})

// ── Fetch paralelo y errores ─────────────────────────────────────────────────

describe('GET /api/calendar/stats — Fetch paralelo y errores', () => {
  it('prevTimeMin + prevTimeMax presentes → calendarRequest llamado 2 veces', async () => {
    const params = `${VALID_PARAMS}&prevTimeMin=2026-03-16T00:00:00-06:00&prevTimeMax=2026-03-22T23:59:59-06:00`
    await GET(makeGET(params))
    expect(mockCalendarRequest).toHaveBeenCalledTimes(2)
  })

  it('calendarRequest lanza excepción → retorna 500', async () => {
    mockCalendarRequest.mockRejectedValue(new Error('Network error'))
    const res = await GET(makeGET())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Error computing stats' })
  })
})
