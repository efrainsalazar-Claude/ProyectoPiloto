/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('@/src/components/StatsCharts', () => ({
  __esModule: true,
  default: () => <div data-testid="stats-charts" />,
}))
jest.mock('@/src/components/StatsBackToBack', () => ({
  __esModule: true,
  default: () => <div data-testid="stats-back-to-back" />,
}))

import StatsClient from '../StatsClient'

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock

const MOCK_DATA = {
  kpis: { totalHours: 5.5, totalEvents: 8, occupancyPercent: 9.2, avgDurationMinutes: 41 },
  hoursPerDay: [
    { label: 'Lun', current: 1, previous: 0.5 },
    { label: 'Mar', current: 2, previous: 1 },
    { label: 'Mié', current: 0, previous: 0 },
    { label: 'Jue', current: 1.5, previous: 2 },
    { label: 'Vie', current: 1, previous: 0 },
  ],
  byCategory: [{ name: 'Sync', hours: 5.5, percent: 100 }],
  peakHours: [{ hour: '09:00', count: 3 }],
  backToBack: [],
}

const EMPTY_DATA = {
  ...MOCK_DATA,
  kpis: { totalHours: 0, totalEvents: 0, occupancyPercent: 0, avgDurationMinutes: 0 },
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('StatsClient', () => {
  it('muestra skeleton mientras fetch está pendiente', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<StatsClient />)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('muestra error cuando fetch retorna !ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<StatsClient />)
    await waitFor(() => {
      expect(screen.getByText(/No se pudieron cargar/i)).toBeInTheDocument()
    })
  })

  it('muestra empty state cuando totalEvents=0', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => EMPTY_DATA })
    render(<StatsClient />)
    await waitFor(() => {
      expect(screen.getByText(/No hay eventos en este rango/i)).toBeInTheDocument()
    })
  })

  it('muestra KPI cards con datos reales', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
    render(<StatsClient />)
    await waitFor(() => {
      expect(screen.getByText('5.5h')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('9%')).toBeInTheDocument()
      expect(screen.getByText('41min')).toBeInTheDocument()
    })
  })

  it('StatsCharts y StatsBackToBack se renderizan con datos', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
    render(<StatsClient />)
    await waitFor(() => {
      expect(screen.getByTestId('stats-charts')).toBeInTheDocument()
      expect(screen.getByTestId('stats-back-to-back')).toBeInTheDocument()
    })
  })

  it('selector de rango tiene los 3 botones visibles', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<StatsClient />)
    expect(screen.getByText('Esta semana')).toBeInTheDocument()
    expect(screen.getByText('Semana anterior')).toBeInTheDocument()
    expect(screen.getByText('Últimas 4 semanas')).toBeInTheDocument()
  })

  it('clicar "Semana anterior" dispara un nuevo fetch con URL diferente', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_DATA })
    render(<StatsClient />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    const btn = screen.getByText('Semana anterior')
    fireEvent.click(btn)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    const firstUrl  = mockFetch.mock.calls[0][0] as string
    const secondUrl = mockFetch.mock.calls[1][0] as string
    expect(firstUrl).not.toBe(secondUrl)
  })
})
