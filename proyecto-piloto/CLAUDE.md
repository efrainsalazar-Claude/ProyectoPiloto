# proyecto-piloto

## Stack
- **Framework**: Next.js 15 con App Router y Turbopack
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS
- **Base de datos**: PostgreSQL (local en puerto 5432, DB: proyecto_piloto_db)
- **ORM**: Prisma 7
- **Runtime**: Node.js v24

## Estructura del proyecto
```
app/                      ← App Router (en RAÍZ, no bajo src/)
├── page.tsx              ← página principal (localhost:3000)
├── layout.tsx            ← layout global
├── globals.css           ← estilos globales (Tailwind v4)
└── api/                  ← endpoints del backend (API Routes)
    └── [feature]/
        └── route.ts      ← GET, POST, etc.

src/
└── lib/
    └── prisma.ts         ← cliente Prisma (singleton)
    (components/ y types/ aún no existen — crearlos aquí cuando se necesiten)

prisma/
├── schema.prisma         ← definición de modelos/tablas
└── migrations/           ← historial de migraciones (no editar manualmente)

thoughts/
└── shared/
    ├── research/         ← documentos de research generados
    ├── plans/            ← planes de implementación
    ├── progress/         ← estado de implementaciones en curso
    └── prs/              ← descripciones de PRs
```

**Alias de imports** (`tsconfig.json`): `@/*` apunta a la **raíz del proyecto** (`./*`), no a `src/`.
- `@/app/...` → `./app/...` ✓
- `@/src/lib/prisma` → `./src/lib/prisma.ts` ✓
- `@/lib/prisma` → NO resuelve (lib/ no existe en la raíz)

## Comandos principales
```bash
npm run dev                              # servidor de desarrollo en localhost:3000
npx prisma migrate dev --name [nombre]  # aplicar cambios del schema a la BD
npx prisma studio                       # UI visual de la BD en localhost:5555
npx prisma generate                     # regenerar cliente tras cambios en schema
npm run build                           # compilar para producción
npm test                                # correr tests
```

## Reglas de base de datos
- SIEMPRE editar `prisma/schema.prisma` para cambios en la BD
- NUNCA escribir SQL directo — usar Prisma
- Después de cada cambio al schema: `npx prisma migrate dev --name descripcion`
- El cliente Prisma se importa desde `@/src/lib/prisma` (alias) o con ruta relativa

## Patrones de código

### API Route (App Router)
```typescript
// app/api/[feature]/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/prisma'

export async function GET() {
  const data = await prisma.[model].findMany()
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()
  const result = await prisma.[model].create({ data: body })
  return NextResponse.json(result, { status: 201 })
}
```

### Componente React (Server Component por defecto)
```typescript
// app/[feature]/page.tsx
export default async function FeaturePage() {
  return <div className="container mx-auto p-4">...</div>
}
```

### Cliente Prisma (singleton)
```typescript
// src/lib/prisma.ts  (importar como @/src/lib/prisma o con ruta relativa)
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

## Workflow con Claude Code

Todo trabajo nuevo sigue este flujo sin excepción:

```
1. /research_codebase [pregunta o descripción de tarea]
   → genera thoughts/shared/research/YYYY-MM-DD_topic.md
   → TÚ LO LEES y apruebas

2. /create_plan [descripción] o /create_plan [ruta del research]
   → genera thoughts/shared/plans/YYYY-MM-DD-description.md
   → TÚ LO REVISAS fase por fase y apruebas

3. /implement_plan thoughts/shared/plans/[archivo].md
   → implementa UNA fase a la vez
   → verifica tests después de cada fase
   → TÚ CONFIRMAS antes de continuar a la siguiente fase
```

**Regla de contexto**: Nunca superar 60% de utilización. Si el contexto está grande, guardar progreso y empezar sesión nueva.

## Agentes disponibles
- `codebase-locator` — encuentra archivos por tema/feature
- `codebase-analyzer` — analiza cómo funciona código específico
- `codebase-pattern-finder` — encuentra patrones existentes para modelar nuevo código
- `thoughts-locator` — busca documentos en thoughts/ por tema
- `thoughts-analyzer` — extrae insights de documentos de research existentes
- `web-search-researcher` — investiga documentación externa (Next.js, Prisma, etc.)

## Variables de entorno
- `DATABASE_URL` — conexión a PostgreSQL (en .env, nunca subir a git)

## Git
- No subir: `.env`, `node_modules/`, `.next/`
- Commit después de cada fase de implementación verificada
- Incluir el archivo de plan en el commit junto al código
