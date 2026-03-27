import {
  isValidISO8601,
  isValidEventId,
  sanitizeEventBody,
} from '../calendar-validation'

describe('isValidISO8601', () => {
  it('acepta fecha con timezone Z', () => {
    expect(isValidISO8601('2024-01-15T10:30:00Z')).toBe(true)
  })

  it('acepta fecha con offset positivo', () => {
    expect(isValidISO8601('2024-01-15T10:30:00+03:00')).toBe(true)
  })

  it('acepta fecha con offset negativo', () => {
    expect(isValidISO8601('2024-01-15T10:30:00-05:30')).toBe(true)
  })

  it('rechaza fecha sin hora', () => {
    expect(isValidISO8601('2024-01-15')).toBe(false)
  })

  it('rechaza fecha sin timezone', () => {
    expect(isValidISO8601('2024-01-15T10:30:00')).toBe(false)
  })

  it('rechaza string no-fecha', () => {
    expect(isValidISO8601('not-a-date')).toBe(false)
  })

  it('rechaza string vacío', () => {
    expect(isValidISO8601('')).toBe(false)
  })
})

describe('isValidEventId', () => {
  it('acepta ID de exactamente 5 caracteres', () => {
    expect(isValidEventId('abc12')).toBe(true)
  })

  it('acepta ID con guiones y underscore', () => {
    expect(isValidEventId('event_id-123')).toBe(true)
  })

  it('acepta ID de 1024 caracteres (límite máximo)', () => {
    expect(isValidEventId('a'.repeat(1024))).toBe(true)
  })

  it('rechaza ID de 4 caracteres (bajo el mínimo)', () => {
    expect(isValidEventId('ab12')).toBe(false)
  })

  it('rechaza ID con carácter inválido #', () => {
    expect(isValidEventId('abc#1')).toBe(false)
  })

  it('rechaza string vacío', () => {
    expect(isValidEventId('')).toBe(false)
  })
})

describe('sanitizeEventBody', () => {
  it('permite todos los campos del allowlist', () => {
    const input = {
      summary: 'Meeting',
      description: 'Desc',
      location: 'Office',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' },
      colorId: '1',
      reminders: { useDefault: true },
      visibility: 'public',
      status: 'confirmed',
    }
    expect(sanitizeEventBody(input)).toEqual(input)
  })

  it('elimina campos no permitidos', () => {
    const input = {
      summary: 'Meeting',
      attendees: [{ email: 'evil@example.com' }],
      id: 'event123',
      creator: { email: 'someone@example.com' },
      organizer: { email: 'org@example.com' },
    }
    expect(sanitizeEventBody(input)).toEqual({ summary: 'Meeting' })
  })

  it('body mixto: solo pasan los campos del allowlist', () => {
    const input = {
      summary: 'Test',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      attendees: [{ email: 'x@example.com' }],
      recurringEventId: 'rec123',
    }
    expect(sanitizeEventBody(input)).toEqual({
      summary: 'Test',
      start: { dateTime: '2024-01-15T10:00:00Z' },
    })
  })

  it('body vacío retorna objeto vacío', () => {
    expect(sanitizeEventBody({})).toEqual({})
  })
})
