"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

// ── Types ──────────────────────────────────────────────────────────────────

interface StatsChartsProps {
  hoursPerDay: Array<{ label: string; current: number; previous: number }>
  byCategory: Array<{ name: string; hours: number; percent: number }>
  peakHours: Array<{ hour: string; count: number }>
}

// ── Color palette (consistent with indigo/gray theme) ─────────────────────

const COLORS = {
  current: "#6366f1",   // indigo-500
  previous: "#a5b4fc",  // indigo-300
  peakBar: "#6366f1",
  pie: [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#14b8a6",
  ],
}

// ── Chart 1: Hours per day (grouped bar, current vs previous) ─────────────

function HoursPerDayChart({
  data,
}: {
  data: StatsChartsProps["hoursPerDay"]
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Horas por día
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--stats-grid)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--stats-axis-text)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--stats-axis-text)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--stats-tooltip-bg)",
              border: "1px solid var(--stats-grid)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value) => [typeof value === "number" ? `${value.toFixed(1)}h` : value]}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "var(--stats-axis-text)" }}
          />
          <Bar
            dataKey="current"
            name="Esta semana"
            fill={COLORS.current}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="previous"
            name="Sem. anterior"
            fill={COLORS.previous}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Chart 2: Category distribution (donut + legend) ───────────────────────

function CategoryChart({
  data,
}: {
  data: StatsChartsProps["byCategory"]
}) {
  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Por categoría
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin datos</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Por categoría
      </h2>
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-[160px] h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="hours"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={72}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={COLORS.pie[i % COLORS.pie.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--stats-tooltip-bg)",
                  border: "1px solid var(--stats-grid)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => [typeof value === "number" ? `${value.toFixed(1)}h` : value, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-2 min-w-0">
          {data.map((cat, i) => (
            <li
              key={cat.name}
              className="flex items-center justify-between text-sm gap-2"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: COLORS.pie[i % COLORS.pie.length] }}
                />
                <span className="text-gray-700 dark:text-gray-300 truncate">
                  {cat.name}
                </span>
              </span>
              <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                {cat.percent.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Chart 3: Peak hours (bar chart, 08:00–19:00) ──────────────────────────

function PeakHoursChart({
  data,
}: {
  data: StatsChartsProps["peakHours"]
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6 lg:col-span-2">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Horas pico
      </h2>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--stats-grid)" />
          <XAxis
            dataKey="hour"
            tick={{ fill: "var(--stats-axis-text)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--stats-axis-text)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--stats-tooltip-bg)",
              border: "1px solid var(--stats-grid)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value) => [value, "Eventos"]}
          />
          <Bar
            dataKey="count"
            name="Eventos"
            fill={COLORS.peakBar}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export default function StatsCharts({
  hoursPerDay,
  byCategory,
  peakHours,
}: StatsChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <HoursPerDayChart data={hoursPerDay} />
      <CategoryChart data={byCategory} />
      <PeakHoursChart data={peakHours} />
    </div>
  )
}
