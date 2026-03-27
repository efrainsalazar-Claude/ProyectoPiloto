import { NextRequest } from 'next/server'

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}))

import { getToken } from 'next-auth/jwt'
import { getServerToken, getAccessToken } from '../get-access-token'

const mockGetToken = getToken as jest.Mock
const makeRequest = () => new NextRequest('http://localhost/api/test')

beforeEach(() => {
  mockGetToken.mockReset()
})

describe('getServerToken', () => {
  it('retorna token completo cuando getToken devuelve datos válidos', async () => {
    mockGetToken.mockResolvedValueOnce({
      access_token: 'tok-123',
      sub: 'user-abc',
      error: null,
    })

    const result = await getServerToken(makeRequest())
    expect(result).toEqual({
      accessToken: 'tok-123',
      userId: 'user-abc',
      error: null,
    })
  })

  it('retorna nulls cuando getToken devuelve null (sin sesión)', async () => {
    mockGetToken.mockResolvedValueOnce(null)

    const result = await getServerToken(makeRequest())
    expect(result).toEqual({ accessToken: null, userId: null, error: null })
  })

  it('retorna error RefreshTokenError cuando el token está expirado', async () => {
    mockGetToken.mockResolvedValueOnce({
      access_token: null,
      sub: 'user-abc',
      error: 'RefreshTokenError',
    })

    const result = await getServerToken(makeRequest())
    expect(result).toEqual({
      accessToken: null,
      userId: 'user-abc',
      error: 'RefreshTokenError',
    })
  })
})

describe('getAccessToken', () => {
  it('retorna solo el access token cuando la sesión es válida', async () => {
    mockGetToken.mockResolvedValueOnce({ access_token: 'tok-456', sub: 'u1' })

    const result = await getAccessToken(makeRequest())
    expect(result).toBe('tok-456')
  })

  it('retorna null cuando no hay sesión', async () => {
    mockGetToken.mockResolvedValueOnce(null)

    const result = await getAccessToken(makeRequest())
    expect(result).toBeNull()
  })
})
