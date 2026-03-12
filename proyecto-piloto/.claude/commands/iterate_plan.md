Modifica un plan de implementación existente basado en feedback o nueva información.

Uso: `/iterate_plan thoughts/shared/plans/[archivo].md`

Si no se provee ruta, pregunta cuál plan modificar:
```
ls thoughts/shared/plans/
```

Espera input del usuario con la ruta del plan.

---

## Proceso

### Paso 1 — Leer el plan completo
Lee el archivo del plan completamente antes de hacer cualquier cambio.
Entiende todas las fases, dependencias y criterios de éxito actuales.

### Paso 2 — Entender el feedback
Pregunta al usuario qué cambios quiere si no los especificó:

Ejemplos de cambios comunes:
- "Agrega una fase para manejo de errores"
- "Divide la Fase 2 en backend y frontend por separado"  
- "El scope cambió, quita la parte de X"
- "Agrega validación de inputs en la Fase 1"
- "Los criterios de verificación no son específicos, mejóralos"

### Paso 3 — Investigar solo si es necesario
Si el cambio requiere entender código nuevo, lanza agentes en paralelo:
- `codebase-locator` — si necesitas encontrar archivos afectados por el cambio
- `codebase-pattern-finder` — si necesitas ver cómo se hace algo similar ya

NO lances agentes si el cambio es solo reorganizar fases o ajustar texto.

### Paso 4 — Confirmar entendimiento antes de editar
Antes de modificar el plan, presenta un resumen:

```
Entiendo que quieres:
1. [Cambio específico 1]
2. [Cambio específico 2]

Esto afecta: Fase X y Fase Y

¿Procedo con estos cambios?
```

Espera confirmación.

### Paso 5 — Actualizar el plan quirúrgicamente
Edita solo las secciones que necesitan cambiar.
NO reescribas secciones que están bien.
Mantén el historial de lo que ya está implementado (checkboxes marcados).

### Paso 6 — Reportar cambios
```
Plan actualizado en: thoughts/shared/plans/[archivo].md

Cambios realizados:
- [Cambio 1 con detalle]
- [Cambio 2 con detalle]

El plan ahora tiene [N] fases.
¿Necesitas ajustar algo más?
```
