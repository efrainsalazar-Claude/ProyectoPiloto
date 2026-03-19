import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/src/lib/prisma"
import { env } from "@/src/lib/env"
import { authConfig } from "./auth.config"

const baseAdapter = PrismaAdapter(prisma)
const secureAdapter = {
  ...baseAdapter,
  linkAccount: (data: Parameters<NonNullable<typeof baseAdapter.linkAccount>>[0]) => {
    // No almacenar tokens OAuth en la BD — con JWT strategy no se leen de vuelta
    const { access_token, refresh_token, id_token, ...safeData } = data
    return baseAdapter.linkAccount!(safeData)
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: secureAdapter,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          refresh_token: account.refresh_token,
        }
      }
      if (Date.now() < (token.expires_at as number) * 1000) return token
      if (!token.refresh_token) throw new TypeError("Missing refresh_token")
      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: env.AUTH_GOOGLE_ID,
            client_secret: env.AUTH_GOOGLE_SECRET,
            grant_type: "refresh_token",
            refresh_token: token.refresh_token as string,
          }),
        })
        const newTokens = await response.json()
        if (!response.ok) throw newTokens
        return {
          ...token,
          access_token: newTokens.access_token,
          expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_in),
          refresh_token: newTokens.refresh_token ?? token.refresh_token,
        }
      } catch {
        return { ...token, error: "RefreshTokenError" as const }
      }
    },
    async session({ session, token }) {
      // access_token NO se copia al session — queda solo en el JWT (httpOnly cookie)
      // Los route handlers usan getToken() para acceder al token server-side
      session.error = token.error as "RefreshTokenError" | undefined
      return session
    },
  },
})

declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError"
  }
}

