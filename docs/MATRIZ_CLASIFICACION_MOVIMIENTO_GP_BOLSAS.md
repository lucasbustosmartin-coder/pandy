# Matriz: `clasificacion_movimiento` ↔ bolsas G/P Operativa

**Estado (2026-04-17):** matriz de producto **aprobada** para el comportamiento vigente; el plan ENUM enlaza desde § **Checkpoint de continuidad** en `docs/PLAN_CLASIFICACION_MOVIMIENTOS_ENUM.md`. No regenerar el `.xlsx` con `npm run excel:matriz-clasificacion-gp` si ya lo editaste a mano (el comando **sobrescribe** el archivo). **RPC `gp_operativa_detalle`:** misma lógica que el resumen por bolsa; si el SQL Editor falla con 42P01 al desplegar, ver cabecera de `sql/migracion_gp_operativa_detalle.sql` y el Checkpoint del plan (fix `RETURN` vs `INTO v`).

**Excel (matriz ya cargada con el comportamiento actual del SQL):** abrí y corregí solo lo que quieras cambiar.

**`docs/MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.xlsx`**

En la hoja **Matriz**, cada celda cruza una **fila** (un valor del ENUM `clasificacion_movimiento`) con una **columna** (una **bolsa** del resumen G/P: `caja_manual`, `caja_ordenes`, `cc_cliente`, `cc_intermediario`, comisiones, `cc_resultado_economico_compensatorio`, etc. — **siete** bolsas en el JSON de `gp_operativa_resumen`).

- **S** — Ese movimiento (con esa clasificación), cuando viene de la tabla que alimenta esa bolsa y cumple filtros de fecha/estado, **su monto entra** en el total de esa bolsa en `gp_operativa_resumen`.
- **N** — Esa bolsa **no suma** ese movimiento por este criterio (p. ej. la bolsa es de otra tabla, o el `WHERE` del SQL no lo incluye).
- **E** — **Exclusión explícita** en SQL: no entra en el agregado de **flujo** de esa bolsa (p. ej. comisión sacada de `cc_*` o de `caja_ordenes`); puede contar en bolsas de **comisiones** si la fila entra al `UNION` correspondiente.
- **C** — **Condicional** (hoy: sobre todo `LEGACY` + texto de concepto); ver columna de notas.

Una misma fila de base **no** se cuenta dos veces en flujo y comisión para el mismo CC: el SQL usa condiciones excluyentes (`NOT` helper vs `AND` helper). La hoja **Leyenda** del Excel amplía esto.

Las celdas precargadas reflejan `sql/migracion_gp_operativa_panel.sql` y el detalle alineado. **Regenerar** el comando de abajo **pisa** el `.xlsx` (guardá copia si ya lo corregiste a mano).

- Hoja **Leyenda** — significado de **S / N / E / C**.
- Hoja **Matriz** — una fila por valor del ENUM; celdas precargadas + columna de notas técnicas.
- Hoja **EXCEPCION_NETEO** — texto con el comportamiento actual SQL y espacio para cambios de negocio.

**Regenerar desde el script** (sobrescribe el `.xlsx`):

```bash
npm run excel:matriz-clasificacion-gp
```

**Relacionado:** `docs/PLAN_CLASIFICACION_MOVIMIENTOS_ENUM.md` § Próximos pasos y § **Checkpoint de continuidad**. SQL de referencia: `sql/migracion_gp_operativa_panel.sql`. Matriz transacciones→ENUM: `docs/MATRIZ_CLASIFICACION_TRANSACCION.xlsx`.

Cuando lo tengas listo, pasame el Excel editado o subí el archivo al repo y avisame para traducirlo a `gp_*` y tests.
