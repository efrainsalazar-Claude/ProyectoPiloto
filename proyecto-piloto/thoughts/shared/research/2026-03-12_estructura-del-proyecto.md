---
date: 2026-03-12T00:00:00-06:00
git_commit: 058f2b51af3f9aa5ade478e8cf1d7561d1933bb2
branch: main
repository: proyecto-piloto
topic: "¿Cómo está estructurado este proyecto?"
tags: [research, codebase, estructura, next.js, prisma, tailwind, typescript]
status: complete
last_updated: 2026-03-12
---

# Research: ¿Cómo está estructurado este proyecto?

**Date**: 2026-03-12
**Git Commit**: 058f2b51af3f9aa5ade478e8cf1d7561d1933bb2
**Branch**: main

## Research Question
¿Cómo está estructurado este proyecto?

## Summary

El proyecto es un scaffold inicial de Next.js 16 con App Router, TypeScript estricto, Tailwind v4 y Prisma 7 conectado a PostgreSQL. El directorio `app/` (páginas y layout) vive en la raíz del proyecto, no bajo `src/app/` como documenta el `CLAUDE.md`. El único código de aplicación personalizado hasta ahora es el singleton de Prisma en `src/lib/prisma.ts` y un modelo `User` en el schema. Todo lo demás —páginas, API routes, componentes, types— está pendiente de implementar.

## Detailed Findings

### Árbol de directorios real

```
proyecto-piloto/
├── app/                        ← App Router (en raíz, NO bajo src/)
│   ├── favicon.ico
│   ├── globals.css             ← Tailwind v4 via @import + @theme inline
│   ├── layout.tsx              ← Layout global con fuentes Geist
│   └── page.tsx                ← Página principal (scaffold por defecto)
├── prisma/
│   ├── schema.prisma           ← Modelo User único
│   └── migrations/
│       └── 20260312210709_init/
│           └── migration.sql   ← Migración inicial
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── vercel.svg
│   └── window.svg
├── src/
│   └── lib/
│       └── prisma.ts           ← Singleton PrismaClient
├── thoughts/
│   └── shared/
│       ├── research/           ← (este archivo)
│       ├── plans/              ← vacío
│       ├── progress/           ← vacío
│       └── prs/                ← vacío
├── .claude/
│   ├── agents/                 ← 6 definiciones de subagentes
│   └── commands/               ← 3 comandos slash (research, plan, implement)
├── CLAUDE.md                   ← Instrucciones del proyecto para Claude
├── README.md
├── setup-agents.ps1
├── next.config.ts              ← Config vacía (todos los defaults)
├── package.json
├── postcss.config.mjs
├── prisma.config.ts
├── tsconfig.json
└── eslint.config.mjs
```

**Directorios que AÚN NO EXISTEN** (documentados en CLAUDE.md pero no creados):
- `src/app/` (las páginas están en `app/` raíz)
- `src/components/`
- `src/types/`
- `app/api/` (no hay API routes)

---

### Stack y versiones (`package.json`)

| Paquete | Versión | Tipo |
|---|---|---|
| `next` | `16.1.6` (exacta) | producción |
| `react` / `react-dom` | `19.2.3` (exacta) | producción |
| `prisma` | `^7.5.0` | producción |
| `@prisma/client` | `^7.5.0` | producción |
| `@prisma/adapter-pg` | `^7.5.0` | producción |
| `dotenv` | `^17.3.1` | producción |
| `tailwindcss` | `^4` | dev |
| `@tailwindcss/postcss` | `^4` | dev |
| `typescript` | `^5` | dev |

Scripts disponibles: `dev`, `build`, `start`, `lint`.

---

### Next.js Configuration (`next.config.ts`)

Config completamente vacía — Next.js corre con todos sus defaults. No hay configuraciones personalizadas de headers, rewrites, redirects ni opciones de build.

---

### TypeScript (`tsconfig.json`)

- `strict: true` — modo estricto completo
- `noEmit: true` — TypeScript solo type-checks; SWC transpila
- `moduleResolution: "bundler"` — resolución moderna para bundlers
- `jsx: "react-jsx"` — nuevo transform JSX (no requiere `import React`)
- `paths: { "@/*": ["./*"] }` — alias `@/` apunta a la **raíz del proyecto** (`./*`), no a `src/`

> **Nota sobre el alias**: `@/lib/prisma` resuelve a `./lib/prisma` (raíz), pero el cliente Prisma está en `src/lib/prisma.ts`. Para importarlo con el alias se necesitaría `@/src/lib/prisma`.

---

### Tailwind CSS v4 (`postcss.config.mjs` + `app/globals.css`)

Tailwind v4 no usa `tailwind.config.*`. La configuración se distribuye en:

- **`postcss.config.mjs`**: registra `@tailwindcss/postcss` como único plugin PostCSS
- **`app/globals.css`**:
  - `@import "tailwindcss"` — carga el framework (reemplaza las antiguas directivas `@tailwind`)
  - `@theme inline` — mapea tokens de diseño (`--color-background`, `--font-sans`, etc.) al sistema de utilities de Tailwind
  - Variables CSS en `:root`: `--background: #ffffff`, `--foreground: #171717`
  - Dark mode via `@media (prefers-color-scheme: dark)`

---

### Base de Datos (`prisma/schema.prisma`)

- Provider: `postgresql`
- Sin `url` en el schema — la conexión se gestiona a través del driver adapter `@prisma/adapter-pg` en runtime
- **Un único modelo definido**: `User`

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
}
```

Una migración aplicada: `20260312210709_init`.

---

### Prisma Client Singleton (`src/lib/prisma.ts`)

Implementa el patrón singleton estándar para Next.js dev mode (previene agotamiento de conexiones por hot-reload):

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

En producción, no persiste en `globalThis` (cada invocación serverless gestiona su propio cliente).

---

### App Router — Páginas actuales

**`app/layout.tsx`** — Layout global:
- Carga fuentes `Geist` y `Geist_Mono` desde `next/font/google` con variables CSS
- Metadata: `title: "Create Next App"` y `description: "Generated by create next app"` (valores scaffold sin personalizar)
- Aplica clases de variables de fuente y `antialiased` al `<body>`

**`app/page.tsx`** — Página principal:
- Scaffold por defecto de `create-next-app`, sin lógica de aplicación
- Muestra logo Next.js, texto "To get started, edit the page.tsx file.", links a Vercel y documentación
- Componente sincrónico (no `async`)

---

### Automatización Claude (`.claude/`)

**Agentes** (`.claude/agents/`):
- `codebase-analyzer.md`
- `codebase-locator.md`
- `codebase-pattern-finder.md`
- `thoughts-analyzer.md`
- `thoughts-locator.md`
- `web-search-researcher.md`

**Comandos slash** (`.claude/commands/`):
- `research_codebase.md` — genera documentos de research en `thoughts/shared/research/`
- `create_plan.md` — genera planes en `thoughts/shared/plans/`
- `implement_plan.md` — implementa planes fase por fase

---

## Code References

- `app/layout.tsx` — Layout global, fuentes Geist, metadata scaffold
- `app/page.tsx` — Página principal scaffold (sin lógica custom)
- `app/globals.css` — Tailwind v4 import + @theme tokens + CSS vars
- `src/lib/prisma.ts` — Singleton PrismaClient
- `prisma/schema.prisma` — Schema PostgreSQL, modelo User
- `prisma/migrations/20260312210709_init/migration.sql` — Migración inicial
- `package.json` — next@16.1.6, react@19.2.3, prisma@7.5.0
- `tsconfig.json` — `@/*` alias → raíz `./`, strict mode
- `next.config.ts` — Config vacía
- `postcss.config.mjs` — Plugin `@tailwindcss/postcss`
- `.claude/agents/` — 6 definiciones de subagentes
- `.claude/commands/` — 3 comandos slash

## Key Architectural Decisions Found

1. **`app/` en raíz vs `src/app/`**: El directorio de App Router está en la raíz del proyecto, no bajo `src/`. Esto difiere de la estructura documentada en `CLAUDE.md`.

2. **Alias `@/*` apunta a raíz**: El path alias resuelve desde `./*` (raíz del proyecto). El cliente Prisma en `src/lib/prisma.ts` requiere `@/src/lib/prisma` para ser importado con el alias, o un import relativo.

3. **Prisma con driver adapter**: Se usa `@prisma/adapter-pg` en lugar del motor nativo de Prisma, lo que implica que la URL de conexión se pasa programáticamente al instanciar el cliente, no vía `url = env("DATABASE_URL")` en el schema.

4. **Tailwind v4**: No hay `tailwind.config.*` — toda la configuración de tokens se hace via CSS (`@theme inline` en `globals.css`).

5. **Proyecto en estado inicial**: No hay componentes, types, API routes, ni tests. Solo la infraestructura base está configurada.

## Gaps in Research

- No se analizó `prisma.config.ts` (archivo en raíz — su contenido y propósito no fueron investigados)
- No se analizó `setup-agents.ps1`
- No se analizó `README.md`
- No se verificó el contenido exacto de `prisma/migrations/20260312210709_init/migration.sql`
- No se exploró la configuración de ESLint (`eslint.config.mjs`)
- No se investigó cómo `@prisma/adapter-pg` está configurado en `src/lib/prisma.ts` (el análisis mostró que el cliente se instancia sin argumentos)
