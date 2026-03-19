import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import ConditionalNavbar from "@/src/components/ConditionalNavbar"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CalendarAI — Gestiona tu calendario con inteligencia",
  description: "CalendarAI te ayuda a organizar tu tiempo, priorizar tareas y gestionar tu calendario de forma inteligente.",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider session={session}>
          <ConditionalNavbar />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
