/** @jest-environment jsdom */

jest.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart:   ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
    PieChart:   ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
    Bar:        () => null,
    Pie:        ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Cell:       () => null,
    XAxis:      () => null,
    YAxis:      () => null,
    CartesianGrid: () => null,
    Tooltip:    () => null,
    Legend:     () => null,
  }
})

import { render, screen } from '@testing-library/react'
import StatsCharts from '../StatsCharts'

const HOURS_PER_DAY = [
  { label: 'Lun', current: 1, previous: 0.5 },
  { label: 'Mar', current: 2, previous: 1 },
  { label: 'Mié', current: 0, previous: 0 },
  { label: 'Jue', current: 1.5, previous: 2 },
  { label: 'Vie', current: 1, previous: 0 },
]

const PEAK_HOURS = [
  { hour: '08:00', count: 1 },
  { hour: '09:00', count: 3 },
  { hour: '10:00', count: 2 },
]

const BY_CATEGORY = [
  { name: 'Sync', hours: 3, percent: 60 },
  { name: 'Standup', hours: 2, percent: 40 },
]

describe('StatsCharts', () => {
  it('CategoryChart con byCategory=[] → muestra "Sin datos"', () => {
    render(<StatsCharts hoursPerDay={HOURS_PER_DAY} byCategory={[]} peakHours={PEAK_HOURS} />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
  })

  it('CategoryChart con datos → NO muestra "Sin datos"', () => {
    render(<StatsCharts hoursPerDay={HOURS_PER_DAY} byCategory={BY_CATEGORY} peakHours={PEAK_HOURS} />)
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument()
  })

  it('render completo con todos los datos → 2 bar-charts (días y horas pico)', () => {
    render(<StatsCharts hoursPerDay={HOURS_PER_DAY} byCategory={BY_CATEGORY} peakHours={PEAK_HOURS} />)
    const barCharts = screen.getAllByTestId('bar-chart')
    expect(barCharts).toHaveLength(2)
  })
})
