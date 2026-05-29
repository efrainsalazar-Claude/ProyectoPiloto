/** @jest-environment jsdom */
import { render, screen, fireEvent, act } from '@testing-library/react'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}))

import { useSession } from 'next-auth/react'
import EventAlertPoller from '../EventAlertPoller'

const mockUseSession = useSession as jest.Mock

// global.fetch
global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock

// AudioContext
const mockOscillator = {
  frequency: { value: 880, setValueAtTime: jest.fn() },
  type: 'sine',
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  onended: null as (() => void) | null,
}
const mockGain = {
  gain: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() },
  connect: jest.fn(),
}
const mockAudioContextInstance = {
  createOscillator: jest.fn(() => mockOscillator),
  createGain: jest.fn(() => mockGain),
  destination: {},
  currentTime: 0,
  close: jest.fn(),
}
const mockAudioContext = jest.fn(() => mockAudioContextInstance)
Object.defineProperty(window, 'AudioContext', { writable: true, value: mockAudioContext })

// Notification API
const mockNotificationConstructor = jest.fn()
Object.defineProperty(mockNotificationConstructor, 'permission', {
  get: jest.fn(() => 'granted'),
  configurable: true,
})
;(mockNotificationConstructor as unknown as { requestPermission: jest.Mock }).requestPermission =
  jest.fn().mockResolvedValue('granted')
Object.defineProperty(window, 'Notification', {
  writable: true,
  configurable: true,
  value: mockNotificationConstructor,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-05-29T12:00:00Z')

function makeEventInMinutes(minutes: number, allDay = false) {
  const eventTime = new Date(NOW.getTime() + minutes * 60 * 1000)
  return {
    id: 'evt-test-1',
    summary: 'Reunión de prueba',
    start: allDay
      ? { date: eventTime.toISOString().split('T')[0] }
      : { dateTime: eventTime.toISOString() },
    end: allDay
      ? { date: eventTime.toISOString().split('T')[0] }
      : { dateTime: new Date(eventTime.getTime() + 30 * 60 * 1000).toISOString() },
  }
}

function mockFetchSuccess(minutesAway: number) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [makeEventInMinutes(minutesAway)],
  })
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeAll(() => jest.useFakeTimers())
afterAll(() => jest.useRealTimers())

beforeEach(() => {
  jest.setSystemTime(NOW)
  mockFetch.mockReset()
  mockAudioContext.mockClear()
  mockAudioContextInstance.createOscillator.mockClear()
  mockNotificationConstructor.mockClear()
  mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: {} } })
  // fetch retorna vacío por defecto (sin evento próximo)
  mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
})

afterEach(() => jest.clearAllTimers())

// ─── Fase 1: Autenticación y polling básico ───────────────────────────────────

describe('cuando el usuario no está autenticado', () => {
  it('no hace fetch si status === "unauthenticated"', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('no hace fetch si status === "loading"', async () => {
    mockUseSession.mockReturnValue({ status: 'loading', data: null })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('polling', () => {
  it('hace fetch inmediatamente al montar (sin esperar 30s)', async () => {
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0] as string).toContain('/api/calendar/events?timeMin=')
  })

  it('hace fetch adicional cada 30 segundos', async () => {
    render(<EventAlertPoller />)
    await act(async () => {})                                              // poll #1
    await act(async () => { await jest.advanceTimersByTimeAsync(30000) }) // poll #2
    await act(async () => { await jest.advanceTimersByTimeAsync(30000) }) // poll #3
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('limpia el intervalo al desmontar', async () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval')
    const { unmount } = render(<EventAlertPoller />)
    await act(async () => {})
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
    clearIntervalSpy.mockRestore()
  })

  it('falla silenciosamente si fetch retorna !ok', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.queryByText('Evento próximo')).not.toBeInTheDocument()
  })
})

// ─── Fase 2: Detección de umbrales y popup ────────────────────────────────────

describe('detección de eventos', () => {
  it('ignora eventos de todo el día (sin start.dateTime)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeEventInMinutes(15, true)],
    })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.queryByText('Evento próximo')).not.toBeInTheDocument()
  })

  it('no muestra popup si minutesLeft no es un threshold (ej: 8 minutos)', async () => {
    mockFetchSuccess(8)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.queryByText('Evento próximo')).not.toBeInTheDocument()
  })

  it('no muestra popup si el evento ya pasó (minutesLeft < 0)', async () => {
    mockFetchSuccess(-5)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.queryByText('Evento próximo')).not.toBeInTheDocument()
  })
})

describe('alertas en thresholds exactos', () => {
  it('muestra popup cuando faltan exactamente 15 minutos', async () => {
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('Evento próximo')).toBeInTheDocument()
    expect(screen.getByText('Reunión de prueba')).toBeInTheDocument()
    expect(screen.getByText(/15 min/)).toBeInTheDocument()
  })

  it('muestra popup cuando faltan exactamente 10 minutos', async () => {
    mockFetchSuccess(10)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('Evento próximo')).toBeInTheDocument()
    expect(screen.getByText(/10 min/)).toBeInTheDocument()
  })

  it('muestra popup cuando faltan exactamente 5 minutos', async () => {
    mockFetchSuccess(5)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('Evento próximo')).toBeInTheDocument()
    expect(screen.getByText(/5 min/)).toBeInTheDocument()
  })

  it('muestra popup cuando faltan exactamente 2 minutos', async () => {
    mockFetchSuccess(2)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('Evento próximo')).toBeInTheDocument()
    expect(screen.getByText(/2 min/)).toBeInTheDocument()
  })

  it('no repite la alerta del mismo threshold para el mismo evento', async () => {
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})                                              // poll #1 → dispara alerta
    await act(async () => { await jest.advanceTimersByTimeAsync(30000) }) // poll #2 → mismo evento/threshold
    // AudioContext solo debe haberse instanciado 1 vez
    expect(mockAudioContext).toHaveBeenCalledTimes(1)
  })
})

// ─── Fase 3: Sonido, notificaciones OS y dismiss ──────────────────────────────

describe('sonido y notificación OS', () => {
  it('llama a AudioContext cuando se dispara una alerta', async () => {
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(mockAudioContext).toHaveBeenCalledTimes(1)
    expect(mockAudioContextInstance.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('crea una Notification del OS cuando permission === "granted"', async () => {
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(mockNotificationConstructor).toHaveBeenCalledWith(
      '📅 CalendarAI',
      expect.objectContaining({ body: expect.stringContaining('Reunión de prueba') })
    )
  })

  it('NO crea Notification si permission === "denied"', async () => {
    Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true })
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(mockNotificationConstructor).not.toHaveBeenCalled()
    // Restaurar para tests siguientes
    Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true })
  })
})

describe('dismiss del popup', () => {
  it('el popup desaparece automáticamente después de 30 segundos', async () => {
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('Evento próximo')).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(30000))
    expect(screen.queryByText('Evento próximo')).not.toBeInTheDocument()
  })

  it('el botón X cierra el popup manualmente', async () => {
    mockFetchSuccess(15)
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('Evento próximo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cerrar alerta/i }))
    expect(screen.queryByText('Evento próximo')).not.toBeInTheDocument()
  })

  it('muestra "(Sin título)" cuando el evento no tiene summary', async () => {
    const eventTime = new Date(NOW.getTime() + 15 * 60 * 1000)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 'evt-notitle',
        start: { dateTime: eventTime.toISOString() },
        end: { dateTime: new Date(eventTime.getTime() + 30 * 60 * 1000).toISOString() },
      }],
    })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(screen.getByText('(Sin título)')).toBeInTheDocument()
  })
})

describe('permisos de notificación', () => {
  it('llama requestPermission al montar si permission === "default"', async () => {
    Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true })
    render(<EventAlertPoller />)
    await act(async () => {})
    expect(
      (mockNotificationConstructor as unknown as { requestPermission: jest.Mock }).requestPermission
    ).toHaveBeenCalledTimes(1)
    // Restaurar
    Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true })
  })
})
