Genera un mensaje de commit descriptivo basado en los cambios actuales del proyecto.

## Proceso

### Paso 1 — Analizar los cambios
```bash
git status
git diff --staged
git diff
```

Si no hay nada staged, haz staging de todos los cambios relevantes:
```bash
git add -A
```

Nunca hagas commit de:
- Archivos `.env` o cualquier archivo con credenciales
- `node_modules/`
- `.next/`
- Archivos temporales o de debug que no sean parte del feature

### Paso 2 — Entender el contexto
Lee el plan relacionado si existe en `thoughts/shared/plans/` para entender el propósito de los cambios.

### Paso 3 — Generar el mensaje de commit

Formato:
```
tipo(scope): descripción corta en español

- Detalle 1 de lo que se cambió
- Detalle 2
- Detalle 3 (si aplica)

Plan: thoughts/shared/plans/[archivo].md (si aplica)
```

Tipos válidos:
- `feat` — nueva funcionalidad
- `fix` — corrección de bug
- `refactor` — refactoring sin cambio de comportamiento
- `style` — cambios de estilos/UI
- `db` — cambios de schema o migraciones
- `config` — cambios de configuración
- `docs` — documentación

Ejemplos buenos:
```
feat(auth): agregar login con email y contraseña

- Crear endpoint POST /api/auth/login
- Agregar validación de credenciales con bcrypt
- Retornar JWT en cookie httpOnly
```

```
db(users): agregar campo role al modelo User

- Migración: 20260312_add_role_to_users
- Valores: 'admin' | 'user', default 'user'
```

### Paso 4 — Ejecutar el commit
```bash
git commit -m "tipo(scope): descripción" -m "- detalle 1\n- detalle 2"
```

Confirma que el commit fue exitoso con `git log --oneline -1`.
