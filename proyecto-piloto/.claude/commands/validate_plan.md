Verifica que la implementación cumplió exactamente lo que el plan especificaba.

Uso: `/validate_plan thoughts/shared/plans/[archivo].md`

Corre esto DESPUÉS de implementar y ANTES de hacer commit final.

---

## Proceso

### Paso 1 — Leer el plan completo
Lee el plan para entender exactamente qué se comprometió a hacer en cada fase.

### Paso 2 — Revisar git history
```bash
git log --oneline -20
git diff HEAD~3..HEAD  # ajusta N según cuántos commits tiene la implementación
```

### Paso 3 — Lanzar verificación en paralelo

Lanza estos agentes simultáneamente:

**Agente 1 — Verificar cambios de código:**
Usa `codebase-locator` y `codebase-analyzer` para encontrar todos los archivos modificados
y verificar que corresponden a lo que el plan especificó.

**Agente 2 — Verificar base de datos (si aplica):**
Si el plan incluía cambios de schema, verifica:
- Que la migración existe en `prisma/migrations/`
- Que el `schema.prisma` refleja los cambios esperados
- Corre: `npx prisma validate`

**Agente 3 — Correr checks automatizados:**
```bash
npm run lint
npm run build
```
Si hay tests: `npm test`

### Paso 4 — Comparar plan vs realidad

Para cada fase del plan, reporta:

```
## Validación: [Nombre del Plan]

### Fase 1: [nombre] — ✅ COMPLETA / ⚠️ PARCIAL / ❌ INCOMPLETA

**Planificado:**
- [ ] Item del plan 1
- [ ] Item del plan 2

**Encontrado:**
- ✅ `src/app/api/feature/route.ts` — creado, implementa GET y POST
- ✅ `prisma/schema.prisma` — modelo X agregado
- ⚠️ Tests no implementados (no estaban en el plan pero son recomendables)

### Fase 2: [nombre] — ✅ COMPLETA
[misma estructura]

---

## Resumen
- Fases completadas: X/Y
- Checks automatizados: ✅ lint OK / ✅ build OK
- Items del plan no implementados: [lista o "ninguno"]
- Items implementados que no estaban en el plan: [lista o "ninguno"]

## Recomendación
[LISTO PARA COMMIT / FALTA COMPLETAR X ANTES DE COMMIT]
```

### Paso 5 — Si algo falta
Si hay items incompletos, pregunta:
```
Estos items del plan no se implementaron:
- [item 1]
- [item 2]

¿Quieres que los implemente ahora, o prefieres hacer commit de lo que está y continuar en la siguiente sesión?
```
