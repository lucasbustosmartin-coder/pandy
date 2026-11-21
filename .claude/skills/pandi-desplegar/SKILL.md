---
name: pandi-desplegar
description: Flujo completo de despliegue de Pandi (versión, novedades del modal, bitácora, commit/push a main, paridad preview-empleado y verificación de SHA). Usar SOLO cuando el usuario diga "desplegar", "ok desplegar", "listo desplegar" o equivalente explícito.
disable-model-invocation: true
---

# Desplegar Pandi

Fuente de detalle: `.cursor/rules/bitacora-tareas.mdc` (sección "Flujo cuando el usuario indique desplegar") y `docs/GIT_Y_VERCEL.md` §4c–§4f. Si hay contradicción, gana la regla de Cursor.

## Precondiciones
- **Sin otros usuarios conectados (obligatorio, regla 2026-11-20):** correr `sql/consulta_sesiones_activas_pre_despliegue.sql` en **Pandy (prod)** (solo lectura). Si aparece una sesión activa (últimos 60 min) de un usuario distinto de quien despliega, o consultas de la app en curso → **no** aplicar SQL ni desplegar: avisar al usuario con rol y hora de última actividad, y reintentar más tarde. Informar el resultado en la respuesta. Repetir el chequeo justo antes de aplicar SQL en prod si pasó tiempo.
- SQL en prod que cambie políticas/DDL: incluir `SET LOCAL lock_timeout = '5s'` dentro de la transacción (si la tabla está ocupada aborta entero en vez de trabar la app).
- `git status` limpio salvo los cambios de la sesión; estar en `main`.
- `node --check main.js` y `npx vite build` (ojo: el plugin `copy-assets-and-config` de `vite.config.js` escribe siempre en `dist/` aunque se pase `--outDir`; no correr `scripts/build-config.js` salvo para build real: reescribe `config.js`) sin errores (no ensuciar `dist/` del repo si no hace falta).
- Prueba funcional del cambio con el subagente `pandi-tester` en Pandy-Dev (E2E apagados).
- Tests unitarios verdes: `npm run test:unit-clasificacion`, `npm run test:unit-cc-flip`, `npm run test:unit-cc-patron-nueva-regla`, `npm run test:unit-cc-invariante-nueva-regla`.

## Pasos (en orden, ninguno se omite)
1. **Versión:** subir `#sidebar-version` en `index.html` (semver `vX.Y.Z`).
2. **Novedades (`pandi-release-blurb.js`):** lo redacta el agente. `versionLabel` idéntico a `#sidebar-version`. `lines`: 2–4 frases cortas, en español, tono comercial, solo lo que el usuario **ve**. Prohibido mencionar Supabase, RPC, SQL, migraciones, Vercel, deploy, **auditoría** o registro interno. `lines: []` solo si no hay ningún cambio visible (anotarlo en Versiones).
3. **Bitácora** (`scripts/crear-bitacora-excel.js`): fila en `versiones` (versión sin "v", fecha Argentina, descripción), filas en `datosLog` por tareas, y `funcionalidades` si cambió funcionalidad.
4. `node scripts/crear-bitacora-excel.js`.
5. **Commit** con `index.html`, `pandi-release-blurb.js`, `scripts/crear-bitacora-excel.js`, `Bitacora_tareas.xlsx` y lo demás de la sesión. Mensaje `vX.Y.Z: descripción breve`. `git push origin main` (Vercel despliega Production solo; **no** correr `vercel --prod` salvo que el build automático falle).
6. *(Opcional)* `npx vercel --yes` solo si hace falta un preview efímero antes del merge.
7. **Paridad:** `git checkout preview-empleado && git pull && git merge main && git push origin preview-empleado && git checkout main`.
8. **Verificación:** `git fetch origin && git rev-parse origin/main origin/preview-empleado` → deben ser idénticos.

## Respuesta al usuario
- Versión desplegada, SHA corto común de `main` y `preview-empleado` (o el bloqueo y qué falta).
- Bloque `Verificación de impacto:`.
- Si el push falla por credenciales: pedir al usuario que lo ejecute localmente; no declarar el despliegue cerrado.
