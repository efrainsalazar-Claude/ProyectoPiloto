/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import StatsBackToBack from '../StatsBackToBack'

const makeEvent = (id: string, start: string, end: string, summary = 'Meeting') => ({
  id,
  summary,
  start,
  end,
})

const GROUP_A = [
  makeEvent('1', '2026-03-24T09:00:00-06:00', '2026-03-24T10:00:00-06:00', 'Standup'),
  makeEvent('2', '2026-03-24T10:10:00-06:00', '2026-03-24T11:00:00-06:00', 'Planning'),
]

const GROUP_B = [
  makeEvent('3', '2026-03-25T14:00:00-06:00', '2026-03-25T15:00:00-06:00', 'Review'),
  makeEvent('4', '2026-03-25T15:05:00-06:00', '2026-03-25T16:00:00-06:00', 'Sync'),
]

describe('StatsBackToBack', () => {
  it('groups=[] → muestra mensaje "No se detectaron reuniones consecutivas..."', () => {
    render(<StatsBackToBack groups={[]} />)
    expect(screen.getByText(/No se detectaron/i)).toBeInTheDocument()
  })

  it('groups=[] → NO muestra badge rojo con "en"', () => {
    render(<StatsBackToBack groups={[]} />)
    expect(screen.queryByText(/en \d+ bloque/)).not.toBeInTheDocument()
  })

  it('1 bloque → badge singular "bloque" (no "bloques")', () => {
    render(<StatsBackToBack groups={[GROUP_A]} />)
    expect(screen.getByText(/1 bloque$/)).toBeInTheDocument()
  })

  it('2 bloques → badge plural + cuenta total de 4 reuniones', () => {
    render(<StatsBackToBack groups={[GROUP_A, GROUP_B]} />)
    expect(screen.getByText(/4 en 2 bloques/)).toBeInTheDocument()
  })

  it('títulos de eventos son visibles', () => {
    render(<StatsBackToBack groups={[GROUP_A]} />)
    expect(screen.getByText('Standup')).toBeInTheDocument()
    expect(screen.getByText('Planning')).toBeInTheDocument()
  })
})
