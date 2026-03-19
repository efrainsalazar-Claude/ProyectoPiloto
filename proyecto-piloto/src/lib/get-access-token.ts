import { getToken } from "next-auth/jwt"
import { type NextRequest } from "next/server"

interface TokenResult {
  accessToken: string | null
  userId: string | null
  error: string | null
}

/**
 * Server-side only — reads access_token, userId and error from the JWT
 * (httpOnly cookie) without exposing it via the client-facing session object.
 */
export async function getServerToken(req: NextRequest): Promise<TokenResult> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  if (!token) return { accessToken: null, userId: null, error: null }
  return {
    accessToken: (token.access_token as string) ?? null,
    userId: (token.sub as string) ?? null,
    error: (token.error as string) ?? null,
  }
}

/** Convenience wrapper — returns just the access_token or null */
export async function getAccessToken(req: NextRequest): Promise<string | null> {
  const { accessToken } = await getServerToken(req)
  return accessToken
}
