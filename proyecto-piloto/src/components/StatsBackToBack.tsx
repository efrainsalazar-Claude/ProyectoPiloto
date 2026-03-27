"use client"

interface BackToBackEvent {
  id: string
  summary: string
  start: string
  end: string
}

interface Props {
  groups: BackToBackEvent[][]
}

export default function StatsBackToBack({ groups }: Props) {
  if (groups.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
          Reuniones back-to-back
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No se detectaron reuniones consecutivas sin buffer en este rango.
        </p>
      </div>
    )
  }

  const totalMeetings = groups.reduce((sum, g) => sum + g.length, 0)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Reuniones back-to-back
        </h2>
        <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
          {totalMeetings} en {groups.length} bloque{groups.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-4">
        {groups.map((group, gi) => (
          <div
            key={gi}
            className="border-l-2 border-red-400 dark:border-red-600 pl-3 space-y-1"
          >
            {group.map((event) => {
              const start = new Date(event.start).toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })
              const end = new Date(event.end).toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-2"
                >
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {event.summary}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {start}–{end}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
