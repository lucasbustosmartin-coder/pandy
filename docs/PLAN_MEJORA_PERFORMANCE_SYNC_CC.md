# Plan de mejora — performance sincronización CC / carga Cuenta corriente (Pandi)

> **Recordatorio:** retomar este documento cuando se trabaje en lentitud, sync, RPC `sync_cc_caja_orden` o carga de la vista CC.

## Estado (retomado 2026-04-21; actualizado 2026-04-22 — pausa Fase 2 documentada)

| Fase | Estado | Notas |
|------|--------|--------|
| **0 — Medir** | **Hecho 2026-04-22** | Evidencia Network en §«Network post-fix»; SQL `sql/util_cc_performance_diagnostico_counts.sql` sigue recomendable para dimensionar N vs filas CC. |
| **1.0 — Menos RPCs sync global** | **Hecho 2026-04-22** | `loadOrdenes` sin sync; Inicio/Cajas con cooldown; excluye `anulada`; concurrencia **4** (no saturar pool HTTP). Sync post-login **diferido 2 s** (`PANDI_CC_GLOBAL_SYNC_DEFER_LOGIN_MS`) para no competir con la primera carga de CC. |
| **1.1 — Caché `getReglasDeNegocio`** | **Hecho** | `main.js`: TTL 2 min + invalidación ABM reglas. |
| **1.2 — RPC huérfanos O(n+m)** | **Hecho 2026-04-22** | `sync_cc_caja_orden`: anti-join huérfanos. **Pandy-Dev:** aplicado. **Producción:** ejecutar `sql/migracion_sync_cc_caja_orden_huerfanos_antijoin.sql` en ventana no productiva cuando se confirme (paridad con dev). Índice 1.3 ya está en prod. |
| **1.3 — Índices** | **Hecho 2026-04-22** | `EXPLAIN ANALYZE` en **Pandy-Dev**: CC cliente por `orden_id` era **Seq Scan**; índice `idx_mov_cc_orden_id` (`sql/migracion_cc_indice_mov_cliente_orden_id.sql`). **Pandy (prod) + Pandy-Dev:** migración aplicada (MCP). |
| **2 — CC que escala** | **Pausado** | Ver §«Pausa y retoma». Sin queja de cliente aún; retomar cuando suba volumen CC/pendientes o haya prioridad de producto. |

### Pausa y retoma (2026-04-22)

**Cierre de esta etapa:** Fases **0** y **1** (0 → 1.3) quedaron resueltas en código y en **Pandy-Dev**; en **producción** falta solo aplicar la migración **1.2** (RPC anti-join) cuando elijas la ventana. La **Fase 2** no se implementa ahora.

**Perspectiva interna:** el operador puede seguir notando lentitud sobre todo en **Refrescar** CC (muchas RPC `sync_cc_caja_orden` × RTT — diseño actual). **Cliente / usuario final:** hasta aquí **no hubo reclamos**; no hay presión comercial inmediata para batch en servidor ni para filtro/agregación masiva.

**Cuándo retomar el plan (Fase 2 en adelante):** crecimiento fuerte de filas CC o de `transacciones` pendientes; reclamos de lentitud; necesidad de histórico por fechas o saldos server-side; o decisión explícita de producto.

### Hallazgo red (prod, 2026-04-22)

En Chrome → Network filtrando `sync_cc`: **miles** de requests `sync_cc_caja_orden` (~200–260 ms, 204), pestaña **Finish** ~**2,6 min**. Causa: **una RPC por cada orden** con instrumentación en el sync global, y además se disparaba también al **cada carga de la grilla Órdenes** (`loadOrdenes`). Volumen de filas CC en BD era bajo (§Baseline): el cuello era **N × RTT**, no el tamaño de tablas.

En **desarrollo** con “pocos” movimientos en tablas pero **~671** `sync_cc_caja_orden`, el cuello es el **número de órdenes con `instrumentacion`** (ver consultas al final de `sql/util_cc_performance_diagnostico_counts.sql`), no el `count` de `movimientos_cuenta_corriente`. Muchas RPC en paralelo además **compiten** con los `fetch` de la vista CC en el mismo pool HTTP del navegador → sensación de eternidad al abrir CC justo después del login.

### Baseline producción (2026-04-21 — volumen bajo)

Medición con `sql/util_cc_performance_diagnostico_counts.sql` en **producción**, sistema en uso **menos de un mes**:

| Tabla | Filas |
|-------|------:|
| `movimientos_cuenta_corriente` | 463 |
| `movimientos_cuenta_corriente_intermediario` | 153 |
| `transacciones` (estado pendiente) | 0 |
| `reglas_de_negocio` | 314 |

**Implicación:** con **~616** filas CC en total y **cero** pendientes globales, la lentitud percibida **no** se explica por escaneo masivo de movimientos en BD. Conviene priorizar:

1. **Cantidad y secuencia de viajes red** (Supabase: varias queries + una RPC por sync; latencia regional RTT × N).
2. **Costo CPU en el navegador** (`sincronizarCcYCajaDesdeOrden` / motor CC sobre cada orden).
3. **RPC `sync_cc_caja_orden`** — huérfanos ya en anti-join (2026-04-22); sigue costo fijo por orden (parseo JSONB, upsert por fila, transacción única).
4. **UI bloqueada** (mismo hilo JS que calcula y pinta) vs sensación de “tarda el servidor”.

**Refrescar en Cuenta corriente:** dispara el sync global completo a propósito. En Red, **~1 fila `sync_cc_caja_orden` por orden** con instrumentación (no anulada) es esperado; con ~440 órdenes verás ~440 peticiones aunque los movimientos en BD sean pocos. Acortar eso implica RPC batch en servidor o menos órdenes de prueba en dev.

### Network post-fix (dev local, 2026-04-22)

Medición en Chrome → **Network**, filtro tipo `supabase` + `sync_cc` (o equivalente que liste `sync_cc_caja_orden`):

| Acción | Resultado observado |
|--------|------------------------|
| Abrir solo la vista **Órdenes** (`loadOrdenes`) | **0** requests `sync_cc_caja_orden` (no se dispara el sync global). |
| Pulsar **Refrescar** en **Cuenta corriente** | **~395** requests `sync_cc_caja_orden`, estado **204**, tiempos individuales **~200–280 ms**, iniciador **`main.js` ~25249** (`sincronizarCcYCajaDesdeOrden` → RPC). |

Interpretación: el §1.0 cumple el objetivo de **no** multiplicar RPC al navegar Órdenes; **Refrescar** sigue siendo **N × RTT** por diseño (una orden con instrumentación ≈ una RPC). La Fase **1.2** optimiza el **costo por RPC** en Postgres, no el **conteo** de peticiones en Refrescar.

### Fase 1.3 — EXPLAIN y índice (Pandy-Dev, 2026-04-22)

**Contexto:** `movimientos_cuenta_corriente_intermediario` ya tenía `idx_mov_cc_int_orden`; en **`movimientos_cuenta_corriente` (cliente)** no existía índice por `orden_id` (solo `cliente_id`, `transaccion_id`, etc.).

**Medición** (`EXPLAIN (ANALYZE, BUFFERS)` sobre `COUNT(*)` con `WHERE orden_id = <uuid de prueba>` y `es_movimiento_manual = false`):

| Tabla | Antes | Después |
|--------|--------|---------|
| `movimientos_cuenta_corriente` | **Seq Scan** (~126 filas leídas en dev; sin índice útil en `orden_id`) | **Bitmap Index Scan** sobre `idx_mov_cc_orden_id` |
| `movimientos_cuenta_corriente_intermediario` | Seq Scan (tabla pequeña; planner razonable) | (sin cambio de migración) |

**RPC completa:** `EXPLAIN (ANALYZE) SELECT sync_cc_caja_orden(...)` dentro de `BEGIN`/`ROLLBACK` con payload `[]` sobre orden de prueba → **~8 ms** execution time en dev (el plan de alto nivel solo muestra nodo `Result`; el coste interno sigue en buffers/función).

**Migración:** `sql/migracion_cc_indice_mov_cliente_orden_id.sql` — aplicada en **Pandy-Dev** y **Pandy (prod)** (MCP). Bootstrap dev: entrada en `scripts/concat-bootstrap-dev-sql.js`.

**Siguiente foco del plan:** **Fase 2** (filtro fecha CC, pendientes acotados, agregación) cuando el volumen de filas lo justifique.

## Contexto

Hay dos frentes distintos:

1. **Sync por orden** — `sincronizarCcYCajaDesdeOrden` (`main.js`): lecturas (orden, reglas, instrumentación, transacciones, comisiones, modos de pago, vínculos), cálculo pesado en el **navegador**, luego RPC `sync_cc_caja_orden` con JSON.
2. **Carga vista CC** — `loadCuentaCorriente`: `pandiSupabaseFetchAll` sobre **todo** `movimientos_cuenta_corriente` e intermediario; además fetch global de **todas** las transacciones `pendiente` para ajustes de resumen.

El crecimiento de la base impacta sobre todo el punto **2** y el fetch de pendientes; el sync por orden es más “costo fijo por orden” (CPU + varias round-trips + una RPC).

## Diagnóstico resumido

| Área | Riesgo |
|------|--------|
| `getReglasDeNegocio` | ~~`select *` sin caché~~ **Caché TTL 2 min** (2026-04-21). |
| RPC `sync_cc_caja_orden` | Huérfanos: **anti-join** `NOT EXISTS` (2026-04-22); CC cliente: **idx_mov_cc_orden_id** en `orden_id` (2026-04-22); upsert sigue por fila JSON. |
| `loadCuentaCorriente` | Lee **todas** las filas CC (paginado en bucle); escala con volumen total. |
| Pendientes CC | Lee **todas** las trx `pendiente` del sistema. |
| Sync global todas las órdenes | Paralelo por lotes de **4**; no en `loadOrdenes`; cooldown Inicio/Cajas; excluye `anulada`; defer post-login 2 s (2026-04-22). |

Referencia código: `main.js` (`sincronizarCcYCajaDesdeOrden`, `loadCuentaCorriente`, `pandiSupabaseFetchAll`, `sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion`); `sql/rpc_sync_cc_caja_orden.sql`.

## Cómo seguimos (orden recomendado)

1. **Fase 0** — **Cerrada** (evidencia §«Network post-fix»; repetir SQL de conteos cuando cambie el volumen de datos o se quiera comparar con prod).
2. **Fase 1.2 (RPC huérfanos)** — **Hecho** (ver tabla §Estado).
3. **Fase 1.3 (índices + EXPLAIN)** — **Hecho** (ver §«Fase 1.3 — EXPLAIN y índice»); índice aplicado en **prod y dev**.
4. **Fase 2** — **Pausada** (§«Pausa y retoma»): filtro por fechas, pendientes acotados, agregación en servidor cuando volumen o negocio lo exijan.
5. **Fase 3 / RPC batch** — Solo si negocio acepta el riesgo y el esfuerzo: **una** RPC que reciba varias órdenes o mover sync pesado al servidor; implica tests E2E y migración cuidadosa.

**Refrescar** seguirá generando **N** RPCs mientras el modelo sea “una orden = una llamada”; acortar eso corresponde al ítem **5** (Fase 3) o a limpieza de órdenes de prueba en dev.

## Fase 0 — Medir

- DevTools (Network + Performance) al guardar trx y al abrir CC.
- Supabase: duración RPC / queries pesadas.
- SQL lectura: `count(*)` movimientos CC, intermediario, trx pendientes; órdenes con instrumentación (`sql/util_cc_performance_diagnostico_counts.sql`).

## Fase 1 — Quick wins

1. **Caché cliente** de `reglas_de_negocio` por `(codigo, usa_intermediario)` + **TTL 2 min** + invalidación al guardar/eliminar/replicar en ABM (`getReglasDeNegocio` / `invalidateReglasDeNegocioFetchCache` en `main.js`).
2. **No re-sync global en navegaciones irrelevantes** — quitado de `loadOrdenes`; cooldown en Inicio/Cajas; menos RPCs acumuladas en la pestaña Network (2026-04-22).
3. RPC: huérfanos con **anti-join** `NOT EXISTS` + `jsonb_array_elements` (equivalente O(n+m) en el planificador frente a bucles anidados en PL/pgSQL).
4. ~~Validar índices con `EXPLAIN ANALYZE`~~ **Hecho 2026-04-22** — índice `idx_mov_cc_orden_id` en CC cliente (Pandy-Dev); ver §«Fase 1.3».

## Fase 2 — CC que escala

1. Filtrar movimientos por **rango de fechas** (alinear con filtros UI); histórico completo bajo demanda.
2. Saldos vía **agregación en servidor** (vista/RPC/materialized) sin traer todas las filas.
3. Pendientes: acotar `transacciones` pendientes a `instrumentacion_id` relevante, no global.

## Fase 3 — Arquitectura (si hace falta)

- Sync derivado en servidor (Edge/SQL) solo si se justifica duplicar/portar lógica con tests.
- Cola async para operaciones masivas.

---

*Documento generado a partir de revisión técnica en conversación; sin cambios de producto acordados aquí.*
