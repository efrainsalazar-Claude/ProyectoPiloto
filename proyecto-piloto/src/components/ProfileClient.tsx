"use client"

import { useState, useEffect } from "react"
import Image from "next/image"

interface ProfileData {
  name: string | null
  email: string | null
  image: string | null
  role: string | null
  company: string | null
  jobTitle: string | null
  department: string | null
  updatedAt: string | null
}

export default function ProfileClient() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [role, setRole] = useState("")
  const [company, setCompany] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [department, setDepartment] = useState("")

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setProfile(data)
        setRole(data.role ?? "")
        setCompany(data.company ?? "")
        setJobTitle(data.jobTitle ?? "")
        setDepartment(data.department ?? "")
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, company, jobTitle, department }),
      })
      if (res.ok) {
        const updated = await res.json()
        setProfile((prev) => (prev ? { ...prev, ...updated } : prev))
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-6 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi perfil</h1>

      {/* Cuenta — solo lectura */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Cuenta</h2>
        <div className="flex items-center gap-4">
          {profile?.image && (
            <Image
              src={profile.image}
              alt={profile.name ?? "Avatar"}
              width={64}
              height={64}
              className="rounded-full flex-shrink-0"
            />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{profile?.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.email}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Nombre e imagen gestionados por Google
            </p>
          </div>
        </div>
      </div>

      {/* Información profesional — editable */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Información profesional
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rol
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ej: Developer, Manager, Designer"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Empresa
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nombre de tu organización"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Puesto
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Ej: Senior Engineer, Product Lead"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Departamento
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Ej: Ingeniería, Marketing, Ventas"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          {profile?.updatedAt ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Última actualización:{" "}
              {new Date(profile.updatedAt).toLocaleDateString("es-MX", { dateStyle: "medium" })}
            </p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400">Guardado</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
