# setup-agents.ps1
# Crea toda la estructura de agentes HumanLayer en tu proyecto Next.js
# Ejecutar desde la raiz del proyecto: .\setup-agents.ps1

Write-Host "Creando estructura de agentes HumanLayer..." -ForegroundColor Cyan

# Crear directorios
New-Item -ItemType Directory -Force -Path ".claude\agents" | Out-Null
New-Item -ItemType Directory -Force -Path ".claude\commands" | Out-Null
New-Item -ItemType Directory -Force -Path "thoughts\shared\research" | Out-Null
New-Item -ItemType Directory -Force -Path "thoughts\shared\plans" | Out-Null
New-Item -ItemType Directory -Force -Path "thoughts\shared\progress" | Out-Null
New-Item -ItemType Directory -Force -Path "thoughts\shared\prs" | Out-Null
New-Item -ItemType Directory -Force -Path "src\lib" | Out-Null
New-Item -ItemType Directory -Force -Path "src\components" | Out-Null
New-Item -ItemType Directory -Force -Path "src\types" | Out-Null

Write-Host "Directorios creados." -ForegroundColor Green

# Crear archivo prisma client singleton
$prismaClient = @'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
'@

Set-Content -Path "src\lib\prisma.ts" -Value $prismaClient
Write-Host "src/lib/prisma.ts creado." -ForegroundColor Green

Write-Host ""
Write-Host "LISTO. Ahora copia manualmente los archivos descargados a:" -ForegroundColor Yellow
Write-Host "  .claude/agents/     <- los 6 archivos de agentes" -ForegroundColor White
Write-Host "  .claude/commands/   <- los 3 archivos de comandos" -ForegroundColor White
Write-Host "  CLAUDE.md           <- en la raiz del proyecto" -ForegroundColor White
Write-Host ""
Write-Host "Luego abre Claude Code con: claude" -ForegroundColor Cyan
