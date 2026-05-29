import { NextRequest } from 'next/server'

jest.mock('@/src/lib/get-access-token', () => ({
  getServerToken: jest.fn(),
}))
jest.mock('@/src/lib/prisma', () => ({
  __esModule: true,
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

import { getServerToken } from '@/src/lib/get-access-token'
import { prisma } from '@/src/lib/prisma'
import { GET, PATCH } from '../route'

const mockGetServerToken = getServerToken as jest.Mock
const mockFindUnique = prisma.user.findUnique as jest.Mock
const mockUpdate = prisma.user.update as jest.Mock

const USER_ID = 'test-user-id'
const VALID_TOKEN = { userId: USER_ID, error: null }
const MOCK_USER = {
  name: 'Test User',
  email: 'test@test.com',
  image: null,
  role: 'Dev',
  company: 'Acme',
  jobTitle: 'Engineer',
  department: 'Tech',
  updatedAt: new Date('2026-05-29'),
}

const makeGET = () => new NextRequest('http://localhost/api/profile')
const makePATCH = (body: object) =>
  new NextRequest('http://localhost/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  mockGetServerToken.mockReset()
  mockFindUnique.mockReset()
  mockUpdate.mockReset()
  mockGetServerToken.mockResolvedValue(VALID_TOKEN)
})

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/profile', () => {
  describe('Auth', () => {
    it('retorna 401 cuando userId es null', async () => {
      mockGetServerToken.mockResolvedValueOnce({ userId: null, error: null })

      const res = await GET(makeGET())
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    })

    it('retorna 401 cuando error es RefreshTokenError', async () => {
      mockGetServerToken.mockResolvedValueOnce({ userId: null, error: 'RefreshTokenError' })

      const res = await GET(makeGET())
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('Session expired') })
    })
  })

  describe('Prisma', () => {
    it('retorna 404 cuando findUnique devuelve null', async () => {
      mockFindUnique.mockResolvedValueOnce(null)

      const res = await GET(makeGET())
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'User not found' })
    })

    it('retorna 500 cuando findUnique lanza una excepción', async () => {
      mockFindUnique.mockRejectedValueOnce(new Error('DB error'))

      const res = await GET(makeGET())
      expect(res.status).toBe(500)
    })
  })

  describe('Happy path', () => {
    it('retorna 200 con los 8 campos del perfil', async () => {
      mockFindUnique.mockResolvedValueOnce(MOCK_USER)

      const res = await GET(makeGET())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        name: 'Test User',
        email: 'test@test.com',
        role: 'Dev',
        company: 'Acme',
        jobTitle: 'Engineer',
        department: 'Tech',
      })
      expect(body).toHaveProperty('image')
      expect(body).toHaveProperty('updatedAt')
    })
  })
})

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/profile', () => {
  describe('Auth', () => {
    it('retorna 401 cuando userId es null', async () => {
      mockGetServerToken.mockResolvedValueOnce({ userId: null, error: null })

      const res = await PATCH(makePATCH({ role: 'Dev' }))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    })

    it('retorna 401 cuando error es RefreshTokenError', async () => {
      mockGetServerToken.mockResolvedValueOnce({ userId: null, error: 'RefreshTokenError' })

      const res = await PATCH(makePATCH({ role: 'Dev' }))
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('Session expired') })
    })
  })

  describe('Transformación de campos', () => {
    it('convierte string vacío a null en el data de Prisma', async () => {
      mockUpdate.mockResolvedValueOnce({ role: null, company: null, jobTitle: null, department: null, updatedAt: null })

      await PATCH(makePATCH({ role: '', company: '', jobTitle: '', department: '' }))

      const dataArg = mockUpdate.mock.calls[0][0].data
      expect(dataArg.role).toBeNull()
      expect(dataArg.company).toBeNull()
      expect(dataArg.jobTitle).toBeNull()
      expect(dataArg.department).toBeNull()
    })

    it('campo ausente del body resulta en undefined (Prisma no actualiza esa columna)', async () => {
      mockUpdate.mockResolvedValueOnce({ role: 'Dev', company: null, jobTitle: null, department: null, updatedAt: null })

      await PATCH(makePATCH({ role: 'Dev' }))

      const dataArg = mockUpdate.mock.calls[0][0].data
      expect(dataArg.role).toBe('Dev')
      expect(dataArg.company).toBeUndefined()
      expect(dataArg.jobTitle).toBeUndefined()
      expect(dataArg.department).toBeUndefined()
    })

    it('campo no-string resulta en undefined', async () => {
      mockUpdate.mockResolvedValueOnce({ role: null, company: null, jobTitle: null, department: null, updatedAt: null })

      await PATCH(makePATCH({ role: 42, company: false }))

      const dataArg = mockUpdate.mock.calls[0][0].data
      expect(dataArg.role).toBeUndefined()
      expect(dataArg.company).toBeUndefined()
    })
  })

  describe('Happy path', () => {
    it('retorna 200 con los 5 campos actualizados', async () => {
      const updated = { role: 'Lead', company: 'Acme', jobTitle: 'Dev', department: 'Eng', updatedAt: new Date('2026-05-29') }
      mockUpdate.mockResolvedValueOnce(updated)

      const res = await PATCH(makePATCH({ role: 'Lead', company: 'Acme', jobTitle: 'Dev', department: 'Eng' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({ role: 'Lead', company: 'Acme', jobTitle: 'Dev', department: 'Eng' })
    })

    it('retorna 500 con el mensaje del error cuando Prisma lanza excepción', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('Record not found'))

      const res = await PATCH(makePATCH({ role: 'Dev' }))
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'Record not found' })
    })
  })
})
