import { checkRateLimit } from '../rate-limiter'

// Cada test usa un userId único para evitar contaminación entre tests
let testId = 0
const uid = () => `user-${++testId}-${Date.now()}`

describe('checkRateLimit', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('permite el primer request de un userId nuevo', () => {
    expect(checkRateLimit(uid())).toBe(true)
  })

  it('permite 30 requests consecutivos (en el límite)', () => {
    const id = uid()
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit(id)).toBe(true)
    }
  })

  it('bloquea el request 31 (excede el límite)', () => {
    const id = uid()
    for (let i = 0; i < 30; i++) checkRateLimit(id)
    expect(checkRateLimit(id)).toBe(false)
  })

  it('userId distintos no se afectan entre sí', () => {
    const id1 = uid()
    const id2 = uid()
    for (let i = 0; i < 30; i++) checkRateLimit(id1)
    // id1 está en límite, pero id2 está limpio
    expect(checkRateLimit(id2)).toBe(true)
  })

  it('resetea el contador al vencer la ventana de tiempo', () => {
    const id = uid()
    const mockNow = jest.spyOn(Date, 'now')
    mockNow.mockReturnValue(1000)

    for (let i = 0; i < 30; i++) checkRateLimit(id)
    expect(checkRateLimit(id)).toBe(false) // límite alcanzado

    // Avanzar más allá de la ventana (60_000 ms)
    mockNow.mockReturnValue(1000 + 60_001)
    expect(checkRateLimit(id)).toBe(true) // ventana reseteada
  })

  it('respeta un límite personalizado (5 requests)', () => {
    const id = uid()
    for (let i = 0; i < 5; i++) checkRateLimit(id, 5)
    expect(checkRateLimit(id, 5)).toBe(false)
  })

  it('userId vacío "" aplica el límite sin lanzar errores', () => {
    expect(() => checkRateLimit('')).not.toThrow()
    expect(checkRateLimit('')).toBe(true) // primer request de ""
  })
})
