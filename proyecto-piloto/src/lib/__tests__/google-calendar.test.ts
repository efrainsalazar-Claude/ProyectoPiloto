import { calendarRequest } from '../google-calendar'

const TOKEN = 'test-access-token'

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  global.fetch = jest.fn().mockResolvedValueOnce(response as Response)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('calendarRequest', () => {
  it('retorna datos parseados del JSON en respuesta 200', async () => {
    const data = { items: [{ id: 'evt1' }] }
    mockFetch({ ok: true, status: 200, json: async () => data })

    const result = await calendarRequest('/primary/events', 'GET', TOKEN)
    expect(result).toEqual(data)
  })

  it('retorna undefined en respuesta 204 (sin parsear JSON)', async () => {
    mockFetch({ ok: true, status: 204 })

    const result = await calendarRequest('/primary/events/abc', 'DELETE', TOKEN)
    expect(result).toBeUndefined()
  })

  it('lanza error con .status y .reason en respuesta 403', async () => {
    mockFetch({
      ok: false,
      status: 403,
      json: async () => ({
        error: { message: 'Forbidden', errors: [{ reason: 'forbidden' }] },
      }),
    })

    await expect(calendarRequest('/primary/events', 'GET', TOKEN)).rejects.toMatchObject({
      message: 'Forbidden',
      status: 403,
      reason: 'forbidden',
    })
  })

  it('lanza error con mensaje del body en respuesta 500 parseable', async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: async () => ({
        error: { message: 'Internal Server Error', errors: [] },
      }),
    })

    await expect(calendarRequest('/primary/events', 'GET', TOKEN)).rejects.toMatchObject({
      message: 'Internal Server Error',
      status: 500,
    })
  })

  it('lanza "Calendar API error 500" cuando el body no es parseable', async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: async () => { throw new Error('invalid json') },
    })

    await expect(calendarRequest('/primary/events', 'GET', TOKEN)).rejects.toMatchObject({
      message: 'Calendar API error 500',
    })
  })

  it('incluye header Authorization: Bearer en la request', async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({}) })

    await calendarRequest('/primary/events', 'GET', TOKEN)

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    expect(fetchCall[1].headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })
})
