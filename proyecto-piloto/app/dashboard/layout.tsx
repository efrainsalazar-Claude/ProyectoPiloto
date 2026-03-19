import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Sidebar from "@/src/components/Sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar user={session.user ?? {}} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
