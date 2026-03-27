# Componente: Sidebar

<!--
  Generado automáticamente por doc-writer
  Última actualización: 2026-03-27
  Commit: 789645c
  NO editar manualmente — usar /update_docs para actualizar
-->

Barra de navegación lateral del dashboard. Muestra el logo, los links de navegación y el perfil del usuario. Puede estar expandida o colapsada, adaptando su presentación a cada estado.

**Archivo fuente**: `src/components/Sidebar.tsx`
**Tipo**: Client Component (`"use client"`)

---

## Descripción

Componente de navegación principal del área autenticada. Ocupa toda la altura disponible en el lado izquierdo del layout y presenta tres zonas verticales:

1. **Cabecera** — logo "CalendarAI" y botón de toggle para colapsar/expandir
2. **Navegación** — links a las rutas del dashboard
3. **Perfil** — avatar, nombre y email del usuario, y botón de cierre de sesión

El componente lee la ruta activa con `usePathname()` y aplica estilos diferenciados al link correspondiente. En pantallas menores a 768 px inicia en estado colapsado.

---

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `user` | `SidebarProps["user"]` | Sí | Datos del usuario autenticado |
| `user.name` | `string \| null \| undefined` | No | Nombre para mostrar en el perfil |
| `user.email` | `string \| null \| undefined` | No | Email para mostrar en el perfil |
| `user.image` | `string \| null \| undefined` | No | URL del avatar del usuario |

```ts
interface SidebarProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}
```

---

## Uso

```tsx
// app/dashboard/layout.tsx (ejemplo)
import Sidebar from "@/src/components/Sidebar"

export default function DashboardLayout({ session, children }) {
  return (
    <div className="flex h-screen">
      <Sidebar user={session.user} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
```

---

## Estado interno

| Estado | Tipo | Valor inicial | Descripción |
|--------|------|---------------|-------------|
| `collapsed` | `boolean` | `false` | Controla si la sidebar está colapsada o expandida |

### Inicialización responsive

Un `useEffect` se ejecuta una única vez al montar el componente. Si `window.innerWidth < 768`, establece `collapsed` a `true`. En pantallas de 768 px o más, el estado inicial permanece `false` (expandido).

```ts
useEffect(() => {
  if (window.innerWidth < 768) {
    setCollapsed(true)
  }
}, [])
```

---

## Items de navegación

El array `navItems` está definido dentro del componente y contiene las dos rutas activas del dashboard:

| `href` | `label` | Descripción |
|--------|---------|-------------|
| `/dashboard` | Calendario | Vista principal del calendario semanal |
| `/dashboard/stats` | Estadísticas | Vista de estadísticas |

Cada item tiene la forma:

```ts
{
  href: string
  label: string
  icon: JSX.Element   // SVG inline con aria-hidden="true"
}
```

---

## Comportamiento collapsed / expanded

El toggle se activa mediante el botón de flecha en la cabecera. La transición entre ambos estados dura 300 ms (`transition-all duration-300`).

| Propiedad | Collapsed | Expanded |
|-----------|-----------|----------|
| Ancho | `w-16` (64 px) | `w-64` (256 px) |
| Logo | Solo icono SVG con `title="CalendarAI"` | Icono + texto "CalendarAI" |
| Links de nav | Solo icono, centrado, con `title={label}` como tooltip | Icono + etiqueta de texto |
| Perfil | Solo avatar (`<Image>`) centrado con `title={user.name}` | Avatar + nombre + email |
| Botón logout | Solo icono con `title="Cerrar sesión"` | Icono + texto "Cerrar sesión" |
| Active border | Sin `border-l-2` (solo fondo indigo) | Fondo indigo + `border-l-2 border-indigo-600` |

---

## Estado activo de navegación

La ruta activa se determina comparando `pathname === item.href`, donde `pathname` proviene de `usePathname()` de `next/navigation`. La comparación es exacta (no por prefijo).

**Estilos cuando el link está activo:**

- Fondo: `bg-indigo-50 dark:bg-indigo-900/50`
- Texto: `text-indigo-700 dark:text-indigo-300`
- Solo en modo expanded: `border-l-2 border-indigo-600 dark:border-indigo-400`

**Estilos cuando el link está inactivo:**

- Texto: `text-gray-600 dark:text-gray-400`
- Hover: `hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200`

---

## Perfil de usuario

La sección de perfil se encuentra en la parte inferior de la sidebar, separada por un borde superior.

**Modo expanded:**

Muestra el componente `<Image>` de Next.js (32x32 px, `rounded-full`) junto al nombre (`text-sm font-medium`) y el email (`text-xs text-gray-500`). Tanto nombre como email tienen `truncate` para no desbordar el contenedor.

**Modo collapsed:**

Muestra solo el avatar centrado con `title={user.name ?? "Usuario"}` como tooltip. Si `user.image` es `null` o `undefined`, no se renderiza ningún elemento de imagen en ninguno de los dos modos.

---

## Cierre de sesión

El botón de logout llama a `signOut` de `next-auth/react` con redirección a la raíz:

```ts
signOut({ callbackUrl: "/" })
```

En modo collapsed el botón muestra solo el icono y añade `title="Cerrar sesión"`. En modo expanded muestra icono y el texto "Cerrar sesión".

---

## Soporte dark mode

Todos los elementos tienen variantes `dark:` de Tailwind. La sidebar usa:

- Fondo: `bg-white dark:bg-gray-900`
- Bordes: `border-indigo-100 dark:border-indigo-900`
- Logo: `text-indigo-700 dark:text-indigo-400`
- Toggle button: `text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800`

---

## Dependencias

- `react` — `useState`, `useEffect`
- `next/link` — navegación cliente con `<Link>`
- `next/image` — avatar del usuario con `<Image>`
- `next/navigation` — `usePathname()` para detectar ruta activa
- `next-auth/react` — `signOut()` para cerrar sesión

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-03-27 | Versión inicial |
