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
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <footer className="flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-4">
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            © 2026 CalendarAI
          </p>
        </footer>
      </div>
    </div>
  )
}
