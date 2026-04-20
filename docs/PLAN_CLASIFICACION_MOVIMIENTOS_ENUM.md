# Plan: clasificación de movimientos y transacciones (ENUM PostgreSQL)

Documento de **una sola fuente de verdad** para el cierre del modelo “concepto solo humano” y el ramificado de negocio por **tipo cerrado** en base de datos. Si Cursor o el entorno se cierra, el alcance y las fases quedan acá.

## Principios (productivo)

- **No romper** lo ya desplegado: cambios incrementales, DDL con `DEFAULT` seguro, compatibilidad con clientes que aún no envían clasificación en JSON.
- **`concepto`** queda como texto **solo para humanos** (leyendas, auditoría). Tras migración y backfill, **no** se ramifica lógica crítica por `includes(concepto)` salvo ventana explícita de legado con contador → **0** filas `LEGACY_SIN_CLASIFICAR`.
- **Un solo mecanismo:** tipo PostgreSQL `public.movimiento_clasificacion` + columnas:
  - `clasificacion_movimiento` en `movimientos_cuenta_corriente`, `movimientos_cuenta_corriente_intermediario`, `movimientos_caja`.
  - `clasificacion_transaccion` en `transacciones` (mismo tipo ENUM; valores aplicables según matriz acordada).
- **Matriz ENUM ↔ bolsa G/P ↔ neteo / excepciones:** la matriz en `docs/MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.*` está **cerrada por producto** (2026-04-17); cualquier reescritura fuerte de G/P (`gp_*`), control de calidad o reglas nuevas debe **seguir** esa matriz y actualizar SQL/tests en el mismo cambio. **No** tocar `reglas_de_negocio_tabla.sql` sin criterio explícito en doc (puede seguir otro hilo).

## ENUM `public.movimiento_clasificacion` (lista inicial cerrada)

Valores definidos en **`sql/migracion_movimiento_clasificacion_fase0_ddl.sql`**. Semántica orientativa (el detalle operativo va en la matriz):

| Valor | Uso resumido |
|--------|----------------|
| `LEGACY_SIN_CLASIFICAR` | Transitorio: filas históricas o JSON sin campo; objetivo **0 filas** tras backfill. |
| `CC_FLUJO_OPERATIVO_TRX` | Movimientos CC (cliente o intermediario) alineados al flujo operativo desde transacción. |
| `CC_COMISION_ACUERDO` | Comisión de acuerdo en CC. |
| `CC_COMPENSACION` | Compensación en cuenta corriente (p. ej. USD-USD+int). |
| `CC_COMISION_SINTETICA_SIN_TRX` | Comisión persistida sin transacción asociada cuando aplique. |
| `REGULA_B_MONR_MONE_PRESTAMO` | Préstamo / pata regula B en moneda recibida u operaciones análogas. |
| `CIERRE_ORDEN_MULTIMONEDA` | Cierre multimoneda de orden. |
| `CC_RESULTADO_ECONOMICO_COMPENSATORIO` | Modelo B / resultado económico compensatorio; criterios de producto en § **Definición fase 5 — Modelo B**. |
| `CANCELACION_CONTRAPARTE` | Cancelación / contraparte explícita en CC. |
| `SALDO_INICIAL_VOLCADO` | Saldo inicial volcado. |
| `MANUAL_EXPLICITO` | Movimiento manual con clasificación explícita. |
| `CAJA_FLUJO_OPERATIVO` | Caja derivada del flujo operativo. |
| `CAJA_COMISION_ACUERDO` | Comisión de acuerdo en caja. |
| `EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO` | Excepción de neteo acordada para USD-USD con intermediario. |

*Ampliar el ENUM en el futuro con `ALTER TYPE ... ADD VALUE` (orden de despliegue documentado en cada migración).*

## RPC `sync_cc_caja_orden`

- El JSON de filas puede incluir **`clasificacion_movimiento`** (mismo nombre que la columna). Si falta, es inválido o desconocido → se trata como **`LEGACY_SIN_CLASIFICAR`** (compatibilidad). **Fase 2:** la app rellena el campo en cada sync vía `enriquecerFilasSyncConClasificacionMovimiento` en `main.js` (misma lógica que el backfill SQL).
- La **clave lógica** de deduplicación incluye la clasificación además de cliente/intermediario, transacción, número, moneda, monto y `left(concepto, 72)` (se **mantiene** el recorte de concepto como parte de la identidad de fila hasta que el backfill estabilice duplicados lógicos).
- Script ejecutable: **`sql/rpc_sync_cc_caja_orden.sql`**, que define **`public.parse_movimiento_clasificacion_desde_jsonb`** y la RPC `sync_cc_caja_orden`.

## Fases

| Fase | Contenido |
|------|------------|
| **0** | DDL: `CREATE TYPE`, `ALTER TABLE` + `DEFAULT`/`NOT NULL`, índices mínimos; RPC lee/escribe `clasificacion_movimiento` en sync. |
| **1** | Backfill SQL por capas (concepto + flags); ver **`sql/migracion_movimiento_clasificacion_fase1_backfill.sql`** y § Fase 1 abajo. Objetivo: vaciar **LEGACY** en filas operativas; puede quedar LEGACY en huérfanos / textos no catalogados (muestras al final del script). |
| **2** | `main.js`: antes de `sync_cc_caja_orden`, **`enriquecerFilasSyncConClasificacionMovimiento`** + inferencia por concepto/flags (alineada a fase 1 SQL). **`clasificacion_transaccion`** en cada alta/edición de transacción desde la app (`asegurarClasificacionTransaccionEnPayload`, grueso `CC_FLUJO_OPERATIVO_TRX` como fase 1). Matriz fina por contexto: **producto OK** en Excel (refinar solo si hace falta más de un ENUM por tipo). |
| **3** | SQL G/P (`gp_*`), control de calidad, vistas: criterios de comisión / flujo operativo usando **`clasificacion_movimiento`** además de texto (`gp_movimiento_*_gp` en panel, detalle, control de calidad). Matriz ENUM ↔ bolsa G/P: **producto OK** (Excel + `.md`); cambios futuros vía SQL + tests alineados a esa matriz. |
| **4** | Tests unitarios + smoke read-only RPC (`npm run test:unit-clasificacion`, `npm run smoke:gp-operativa-readonly`); E2E Playwright en dev. **Cerrada** (ver § Estado fase 4). Siguiente: matrices de producto + fase 5. |
| **5** | Modelo B y `CC_RESULTADO_ECONOMICO_COMPENSATORIO`: criterios de producto **cerrados** en § **Definición fase 5 — Modelo B**. **Implementación** (ENUM en filas, motor, backfill, app) **después** de matrices ENUM↔G/P y transacciones alineadas; no reabre la definición salvo cambio explícito de producto. |

## Despliegue

1. Ejecutar en Supabase (dev, luego prod): **`sql/migracion_movimiento_clasificacion_fase0_ddl.sql`**.
2. Ejecutar **`sql/rpc_sync_cc_caja_orden.sql`** (reemplaza función y helper si aplica).

**Estado fase 0 (SQL en servidor):** aplicado en **Supabase dev** y **Supabase producción** (migración DDL + script RPC completo).

**Estado fase 1 (backfill):** aplicado en **Supabase dev** y **Supabase producción** (mismo archivo `sql/migracion_movimiento_clasificacion_fase1_backfill.sql` en SQL Editor). Precondiciones ya cumplidas en esas bases (fase 0 + helpers `gp_concepto_es_*`). Si queda LEGACY residual, usar el bloque Verificación del script y ampliar patrones en una migración nueva.

**Estado fase 2 (app → JSON sync + transacciones):** implementado en **`main.js`**: constantes `MOVIMIENTO_CLASIFICACION`, helpers `conceptoEsComisionAcuerdoLineaGp` / `conceptoEsComisionCajaOrdenesGp`, `inferClasificacionMovimientoCuentaCorrienteRow`, `inferClasificacionMovimientoCajaRowSync`, `enriquecerFilasSyncConClasificacionMovimiento` (llamada inmediatamente antes de `client.rpc('sync_cc_caja_orden', …)` dentro de `sincronizarCcYCajaDesdeOrden`); e **`inferClasificacionTransaccionDesdePayload` / `asegurarClasificacionTransaccionEnPayload`** en los flujos que insertan o actualizan `transacciones` (modal, compensatoria, import cola, autocompletar plantillas, splits, ganancia Pandy, rama `debeDividir` de cambio de estado). Despliegue: subir **front** (Vercel) cuando corresponda; no requiere SQL adicional.

**Estado fase 3 (SQL G/P y control de calidad — primer corte):** en repo: **`sql/migracion_gp_operativa_panel.sql`** define `gp_movimiento_cc_cuenta_es_linea_comision_gp` y `gp_movimiento_caja_ordenes_es_comision_gp`; `gp_operativa_resumen` y comisiones huérfanas usan concepto **OR** ENUM. **`migracion_gp_operativa_detalle.sql`** y **`migracion_control_calidad_vista_informe.sql`** (`control_calidad_informe`) alineados. Parche histórico **`migracion_gp_intermediario_reparto_sin_doble_resta.sql`** alineado por consistencia. **`scripts/concat-bootstrap-dev-sql.js`:** inserta `migracion_movimiento_clasificacion_fase0_ddl.sql` **antes** del panel. **Despliegue Supabase (dev y producción, 2026-04-17):** ejecutado en orden **panel → detalle → `migracion_gp_operativa_control_calidad` → `migracion_control_calidad_vista_informe`**. Efectivo para el producto: los **tres primeros** + el cuarto; el tercero (`gp_operativa_control_calidad`) queda **suprimido** por el `DROP FUNCTION` del cuarto, por lo que **no es obligatorio** si solo se busca el estado final (bastan **panel + detalle + vista_informe**). Sin cambio de esquema adicional si fase 0 ya está aplicada.

**Estado fase 4 (tests + smoke — cerrada):** `npm run test:unit-clasificacion-gp` y `npm run test:unit-clasificacion` (paridad comisión CC/caja + inferencia sync / transacciones). Smoke read-only: `npm run smoke:gp-operativa-readonly` con `.env.smoke-prod-readonly` (ver `docs/TESTING_E2E_GUIA.md`); solo RPC de lectura. E2E Playwright siguen en dev. **No** usar Playwright contra producción.

## Próximos pasos del plan (después de la fase 4)

1. **Matriz ENUM ↔ bolsa G/P** — **Estado producto (2026-04-17):** contenido de `docs/MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.xlsx` / guía **aprobado** para seguir; no regenerar el Excel desde script si ya se editó a mano (`npm run excel:matriz-clasificacion-gp` **pisa** el archivo). Próximo paso técnico: traducir cualquier delta futuro a `sql/migracion_gp_operativa_*.sql` + tests según esa matriz. **Plantilla / guía:** `docs/MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.md`.
2. **Matriz fina `clasificacion_transaccion`** — **Estado producto (2026-04-17):** `docs/MATRIZ_CLASIFICACION_TRANSACCION.xlsx` / guía **aprobados** para el grueso actual; mismo cuidado al regenerar con `npm run excel:matriz-clasificacion-trx`. Refinar solo donde el negocio pida más granularidad que `CC_FLUJO_OPERATIVO_TRX`. **Guía:** `docs/MATRIZ_CLASIFICACION_TRANSACCION.md`.
3. **Fase 5 — Modelo B** y `CC_RESULTADO_ECONOMICO_COMPENSATORIO`: **definición** en § siguiente **cerrada**; **implementación** en datos/código (persistir el ENUM donde corresponda, sync) cuando CC/caja/sync y las matrices 1–2 estén alineadas en el repo y en las bases.

**Paralelo (no sustituye el plan ENUM):** `instrumentacion.instrumentacion_ajustada_manual` + persistencia tras `sync_cc_caja_orden` cuando la instrumentación se desvía de la plantilla por tipo de orden — cierra el hueco «pagador/cobrador distinto del autocompletar sin multicontraparte». Seguir con los ítems 1–3 arriba; el flag no reemplaza matrices ni Modelo B.

## Definición fase 5 — Modelo B (producto, acordada antes de código)

Estos puntos fijan el **qué** de la fase 5 (cerrado para producto). El **cómo** en ingeniería (SQL, sync, ENUM en cada fila) sigue el plan de fases 2–3 y las matrices; es trabajo de implementación, no de redefinir criterios salvo pedido explícito.

1. **Separación CC vs caja para compensaciones “en libro”**  
   Los movimientos **compensatorios** que cierran posición cliente (ej. pares que reflejan spread / comisión de acuerdo en el marco discutido) van como **`movimientos_cuenta_corriente`**. **No** generan **`movimientos_caja`** mientras el acuerdo sea **solo en libros**, salvo que exista **efectivo real** en el que **participe la empresa** (cobro o egreso ejecutado que deba impactar caja). Criterio guía: **caja = dinero que se mueve**; **CC = posición y cierres** incluyendo compensaciones contables sin tesorería.

2. **G/P: claridad y un solo “resultado real” sin doble conteo**  
   El total que ve el usuario **no** debe contar dos veces el mismo efecto económico. En **SQL + panel (2026-04-17)** existe la bolsa dedicada **`cc_resultado_economico_compensatorio`**: las filas CC con `CC_RESULTADO_ECONOMICO_COMPENSATORIO` **no** entran en `cc_cliente` / `cc_intermediario` de flujo y **sí** en esa bolsa; el **Total** sigue siendo la suma algebraica de **siete** claves JSON. Se puede seguir refinando la matriz ENUM ↔ bolsa y el copy de ayuda **siempre** sin duplicar importes en el agregado visible.

3. **`CC_RESULTADO_ECONOMICO_COMPENSATORIO`**  
   Reserva semántica del ENUM para el rol de **resultado económico compensatorio** en CC dentro de este modelo (detalle/panel/control de calidad según la misma matriz).

4. **Excepciones donde la CC del cliente no netea en cero**  
   Deben quedar **documentadas** (manual / doc operativo): casos explícitos (p. ej. multicontraparte, instrumentación ajustada manual, préstamos u otros ya definidos por negocio) para no confundirlos con fallas de sync o del motor.

## Checkpoint de continuidad (reanudar si se cae Cursor u otro entorno)

**Última actualización de esta sección:** 2026-04-17.

| Tema | Dónde quedó / qué hacer después |
|------|--------------------------------|
| **Fases 0–4 ENUM** | Aplicadas en Supabase **dev y prod**; detalle en § **Despliegue** y § **Historial** más abajo. |
| **Matrices producto** | **Matriz 1** G/P (`MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.*`) y **matriz 2** transacciones (`MATRIZ_CLASIFICACION_TRANSACCION.*`) **aprobadas** para el estado actual; ver § **Próximos pasos** (ítems 1–2) y los `.md` de cada matriz. |
| **Fase 5 Modelo B** | **Definición de producto** (cerrada): § **Definición fase 5 — Modelo B** (CC vs caja en libro; bolsa dedicada sin doble conteo; rol semántico del ENUM; excepciones de neteo documentadas). **Hecho en repo + SQL canónico:** `gp_operativa_resumen` / `gp_operativa_detalle` con bolsa **`cc_resultado_economico_compensatorio`** y exclusión de esas filas en `cc_cliente` / `cc_intermediario`. **Fix cuerpo `gp_operativa_detalle` (2026-04):** evitar `SELECT … INTO v` con `SET search_path = ''` → usar `RETURN (SELECT …)` (error 42P01 `relation "v"`); cabecera `sql/migracion_gp_operativa_detalle.sql` + `docs/SUPABASE_REQUISITOS.md`. **Despliegue Supabase:** al cierre de la sesión documentada, **producción no recibió** ese reemplazo de función (solo política explícita del titular); **dev** debe alinearse al pegar el script del repo cuando corresponda. **Pendiente (implementación datos):** persistir `CC_RESULTADO_ECONOMICO_COMPENSATORIO` en filas concretas (motor/backfill/app) según la misma §; el backfill fase 1 **no** asigna ese ENUM (reservado a Modelo B). |
| **`instrumentacion_ajustada_manual`** | Columna + bootstrap: `sql/migracion_instrumentacion_ajustada_manual.sql`; orden en `scripts/concat-bootstrap-dev-sql.js`. App: embed en selects de órdenes, `sincronizarCcYCajaDesdeOrden` (sin motor completo si flag; no es MC), persistencia tras sync (`pandiPersistInstrumentacionAjustadaManualParaOrden`), invariante neteo con misma exclusión que MC, UI badge **Aj** + ayuda. Requisitos: `docs/SUPABASE_REQUISITOS.md` y `docs/CUENTA_CORRIENTE_Y_CAJA.md`. |
| **Tests rápidos** | `npm run test:unit-clasificacion`, `npm run test:unit-clasificacion-gp`, `npm run test:unit-cc-flip`; smoke opcional `npm run smoke:gp-operativa-readonly` (ver `docs/TESTING_E2E_GUIA.md`). |
| **No pisar Excel** | Si las matrices en `docs/*.xlsx` ya están curadas, **no** correr `npm run excel:matriz-clasificacion-gp` ni `excel:matriz-clasificacion-trx` salvo que quieras volver a generar desde scripts del repo. |

## Fase 1 — Backfill (seguimiento y reglas)

### Objetivo

- Pasar de `LEGACY_SIN_CLASIFICAR` a valores del ENUM usando **solo** datos ya persistidos (`concepto`, `es_movimiento_manual`, `transaccion_id`, `orden_id`, `tipo_movimiento_id` en caja).
- Alinear criterios con **`main.js`**: `conceptoCcLeyenda`, `conceptoCompensacionCcEnCuentaCorriente`, `conceptoCcMovimiento` / `conceptoConOrden`, inyección «Trazabilidad transacción anulada», cierre «Cierre orden …», caja `conceptoCajaTransaccion` / `conceptoCajaTransaccionEspecial`, y helpers G/P en SQL.
- **No** reclasificar por `concepto` en fases posteriores el núcleo ya cubierto aquí; lo que quede en LEGACY se revisa con las consultas de muestra del script o se amplía este script (nueva migración idempotente).

### ENUM aún no asignados por este backfill

- `EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO`: sin patrón estable solo por texto; reservado a **fase 2** / matriz.
- `CC_RESULTADO_ECONOMICO_COMPENSATORIO`: Modelo B / fase 5; en G/P va a la bolsa `cc_resultado_economico_compensatorio` (no a `cc_cliente`/`cc_intermediario` de flujo).

### Orden de capas (resumen; detalle en el SQL)

| Orden | Tabla(s) | Criterio principal | Clasificación |
|------|-----------|-------------------|-----------------|
| 1 | CC cliente / int. | `es_movimiento_manual` | `MANUAL_EXPLICITO` |
| 2 | CC cliente / int. | texto compensación flip | `CC_COMPENSACION` |
| 3 | CC cliente / int. | Cancelación / Contraparte cancelación | `CANCELACION_CONTRAPARTE` |
| 4 | CC cliente / int. | Trazabilidad transacción anulada | `CC_FLUJO_OPERATIVO_TRX` |
| 5 | CC cliente / int. | `Cierre orden %` | `CIERRE_ORDEN_MULTIMONEDA` |
| 6 | CC cliente / int. | Préstamo regula B / cobertura Pandy moneda recibida | `REGULA_B_MONR_MONE_PRESTAMO` |
| 7 | CC cliente / int. | comisión acuerdo **sin** `transaccion_id` + helper G/P | `CC_COMISION_SINTETICA_SIN_TRX` |
| 8 | CC cliente / int. | comisión acuerdo **con** `transaccion_id` + helper G/P | `CC_COMISION_ACUERDO` |
| 9 | CC cliente / int. | `Saldo inicial%` | `SALDO_INICIAL_VOLCADO` |
| 10 | CC cliente / int. | Leyendas estándar + legacy Cobro/Deuda/Pago + textos frecuentes intermediario | `CC_FLUJO_OPERATIVO_TRX` |
| 11 | CC cliente / int. | Catch-all: `orden_id` o `transaccion_id` | `CC_FLUJO_OPERATIVO_TRX` |
| 12 | Caja | `tipo_movimiento_id` no nulo | `MANUAL_EXPLICITO` |
| 13 | Caja | helper comisión caja G/P | `CAJA_COMISION_ACUERDO` |
| 14 | Caja | Ganancia del acuerdo / Ingreso de / Egreso de | `CAJA_FLUJO_OPERATIVO` |
| 15 | Caja | Catch-all: orden o transacción | `CAJA_FLUJO_OPERATIVO` |
| 16 | `transacciones` | todas las filas aún LEGACY | `CC_FLUJO_OPERATIVO_TRX` (grueso operativo hasta matriz fina) |

### Post-ejecución

1. Correr el bloque **Verificación** al final del `.sql` (conteos por clasificación + top filas LEGACY) cuando haga falta auditar.
2. Si hay LEGACY con volumen, ampliar patrones en **nueva** migración o acordar corrección puntual de datos.
3. Tras cambios de leyendas en `main.js`, valorar si hace falta una **nueva** capa de backfill idempotente alineada a esos textos.

## Referencias en código

- Motor CC, invariante, multicontraparte: `main.js`.
- Otras migraciones y grietas CC: `docs/CUENTA_CORRIENTE_Y_CAJA.md`, `docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md`.

## Historial de este documento

- **2026-04-17:** Creación del plan + fase 0 en repo (`migracion_movimiento_clasificacion_fase0_ddl.sql` + RPC actualizada).
- **2026-04-17:** Fase 0 ejecutada en Supabase **dev** y **producción** (confirmación operación).
- **2026-04-17:** Fase 1: script `migracion_movimiento_clasificacion_fase1_backfill.sql` + § seguimiento en este documento; backfill ejecutada en **dev** y **producción** (confirmación operación).
- **2026-04-17:** Fase 2: `main.js` envía `clasificacion_movimiento` en el payload del sync (`enriquecerFilasSyncConClasificacionMovimiento`).
- **2026-04-17:** Fase 2 (complemento): `main.js` persiste `clasificacion_transaccion` en altas/ediciones de transacción (`asegurarClasificacionTransaccionEnPayload`), alineado al grueso del backfill fase 1.
- **2026-04-17:** Fase 3 (parcial): G/P resumen/detalle y parejas de control de calidad usan helpers `gp_movimiento_*_gp` (texto o `clasificacion_movimiento`); bootstrap dev incluye DDL fase 0 antes del panel.
- **2026-04-17:** Despliegue SQL fase 3 en **Supabase dev y producción**: orden panel → detalle → `migracion_gp_operativa_control_calidad` → `migracion_control_calidad_vista_informe` (cuarto script elimina RPC legacy del tercero).
- **2026-04-17:** Fase 4 (inicio): tests unitarios `tests/unit/clasificacion-gp-sql-paridad.test.mjs` + script `npm run test:unit-clasificacion-gp`.
- **2026-04-17:** Fase 4: `tests/unit/clasificacion-sync-inferencia.test.mjs` + `npm run test:unit-clasificacion` (suite completa clasificación unit).
- **2026-04-17:** Fase 4: smoke read-only `scripts/smoke-gp-operativa-readonly.mjs` + `npm run smoke:gp-operativa-readonly` (`SMOKE_GP_READONLY_CONFIRM=yes`, variables `SMOKE_GP_*`).
- **2026-04-19:** Fase 4 cerrada operativamente: smoke read-only contra producción OK (`gp_operativa_resumen`, seis bolsas); suite `test:unit-clasificacion` verde. Plan actualizado con § **Próximos pasos** (matrices producto + fase 5).
- **2026-04-17 (continuidad):** Matrices Excel G/P y transacciones→ENUM **aprobadas por producto** (§ Próximos pasos + tabla fases 2–3). § **Definición fase 5 — Modelo B** y § **Checkpoint de continuidad** (reanudar si cae Cursor). Referencia cruzada `instrumentacion_ajustada_manual`: `docs/SUPABASE_REQUISITOS.md`, `docs/CUENTA_CORRIENTE_Y_CAJA.md`.
- **2026-04-17:** G/P Operativa: **séptima bolsa** `cc_resultado_economico_compensatorio` en `gp_operativa_resumen` y `gp_operativa_detalle`; filas `CC_RESULTADO_ECONOMICO_COMPENSATORIO` excluidas del flujo `cc_cliente`/`cc_intermediario`; panel y snapshot offline en `main.js`; smoke y matriz script alineados. Re-ejecutar `migracion_gp_operativa_panel.sql` y `migracion_gp_operativa_detalle.sql` en Supabase.
- **2026-04-17 (documentación cierre sesión):** Aclaración explícita: **definición** fase 5 = § **Definición fase 5 — Modelo B** (sin reabrir salvo pedido de producto); **pendiente** = solo implementación persistida del ENUM. Fix **42P01** en `gp_operativa_detalle` documentado en `SUPABASE_REQUISITOS.md`, cabecera `migracion_gp_operativa_detalle.sql` y § **Checkpoint**; **Supabase producción** sin aplicar ese `CREATE OR REPLACE` en la ronda registrada (titular: no implementar en prod). Redacción fase 5 (implementación vs definición) y eliminación de referencia obsoleta `_part2_gp_detalle` en requisitos.
