---
name: pandi-cierre-tarea
description: Checklist de cierre de cualquier tarea que modificó el repo de Pandi - chequeo de sintaxis/build, tests, RPC, documentación y artefactos, bitácora Excel y bloque "Verificación de impacto". Usar al terminar un cambio de código, SQL, UI o docs antes de dar la tarea por cerrada.
---

# Cierre de tarea — Pandi

Aplicar en orden. No omitir pasos salvo indicación explícita del usuario.

1. **Sintaxis / build**
   - `node --check main.js` (y cualquier `.js` tocado).
   - Si cambió el front: `npx vite build` (ojo: el plugin `copy-assets-and-config` de `vite.config.js` escribe siempre en `dist/` aunque se pase `--outDir`; no correr `scripts/build-config.js` salvo para build real: reescribe `config.js`).
2. **Tests**
   - Unit: `npm run test:unit-clasificacion`, `npm run test:unit-cc-flip`, `npm run test:unit-cc-patron-nueva-regla`, `npm run test:unit-cc-invariante-nueva-regla`.
   - Si cambiaron selectores, textos, columnas o flujos cubiertos por `tests/e2e/`: actualizar los specs. **No** cambiar valores esperados (`*-esperado.js`) sin acuerdo explícito.
   - Los E2E escriben en Supabase dev: correrlos solo si el usuario lo pide.
3. **RPC / SQL**: si cambió una regla de negocio o un dato persistido, verificar si la RPC en `sql/` lo construye y actualizarla. Fechas → `public.fecha_hoy_argentina()`.
4. **Matriz CC**: si cambió cómo se graban movimientos CC → `npm run excel:matriz-cc-reglas` (o avisar que quedó pendiente).
5. **Docs y artefactos** (sin preguntar):
   - `docs/` afectados.
   - `python3 scripts/export_manual_usuario_pdf.py` si cambió `docs/MANUAL_USUARIO_OFFLINE.md` o ayudas de usuario.
   - `npm run plan-pwa:docx` si cambió `docs/PLAN_PWA_OPERACION_OFFLINE.md`.
   - Rutas nuevas en `docs/` → actualizar `.cursor/rules/estructura-proyecto.mdc`.
6. **Bitácora**: agregar fila en `datosLog` de `scripts/crear-bitacora-excel.js` (`dd/mm/aaaa`, `HH:mm` en America/Argentina/Buenos_Aires; no reescribir filas viejas) y `funcionalidades` si aplica; correr `node scripts/crear-bitacora-excel.js`.
7. **Respuesta final** con bloque titulado exactamente:

```
Verificación de impacto:
- Núcleo: …
- Superficies revisadas: … (CC cliente e intermediario, caja, G/P, PWA, etc.)
- Sin riesgo colateral razonable porque … | Riesgos identificados: … — autorizados / fuera de alcance.
```

No commitear ni pushear salvo pedido explícito.
