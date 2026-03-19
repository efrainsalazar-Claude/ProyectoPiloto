import Link from "next/link"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()
  if (session) redirect("/dashboard")

  return (
    <main>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-900 dark:to-indigo-950 px-4 py-24 sm:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-indigo-900 dark:text-white leading-tight tracking-tight">
            Gestiona tu calendario<br className="hidden sm:block" /> con inteligencia
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-indigo-700 dark:text-indigo-300 max-w-2xl mx-auto leading-relaxed">
            CalendarAI organiza tu tiempo de forma automática, prioriza lo que importa y te ayuda a nunca perderte una cita importante.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-8 py-3 text-base transition-colors"
            >
              Empezar gratis
            </Link>
            <a
              href="#features"
              className="border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 font-semibold rounded-xl px-8 py-3 text-base transition-colors"
            >
              Ver demo
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white dark:bg-gray-950 px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-indigo-900 dark:text-white mb-12">
            Todo lo que necesitas para organizar tu día
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* Card 1 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-8">
              <div className="flex items-center justify-center w-12 h-12 bg-indigo-50 dark:bg-indigo-900 rounded-xl mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Calendario inteligente
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Organiza tus eventos automáticamente según tus prioridades y hábitos. CalendarAI aprende de ti para optimizar tu agenda.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-8">
              <div className="flex items-center justify-center w-12 h-12 bg-indigo-50 dark:bg-indigo-900 rounded-xl mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Recordatorios personalizados
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Nunca pierdas una cita importante. Recibe alertas inteligentes en el momento justo, adaptadas a tu rutina diaria.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-8">
              <div className="flex items-center justify-center w-12 h-12 bg-indigo-50 dark:bg-indigo-900 rounded-xl mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Vista clara de tu día
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Planifica con claridad. Una vista limpia y ordenada de tu jornada para que siempre sepas qué viene a continuación.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-gray-900 border-t border-indigo-100 dark:border-indigo-900 px-4 py-4">
        <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
          © 2026 CalendarAI
        </p>
      </footer>
    </main>
  )
}
