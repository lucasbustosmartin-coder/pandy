# Plan de mejora — performance sincronización CC / carga Cuenta corriente (Pandi)

> **Recordatorio:** retomar este documento cuando se trabaje en lentitud, sync, RPC `sync_cc_caja_orden` o carga de la vista CC.
>
> **2026-11-03:** **opción A** aplicada en **Pandy y Pandy-Dev** (RPC `sync_cc_caja_ordenes`, 10 órdenes por viaje, solo botón Refrescar). Login/Inicio/Cajas siguen en N×`sync_cc_caja_orden`. El sync masivo **omite** órdenes ejecutadas fuera del plazo de Seguridad (default 10 días hábiles); el Admin en Refrescar puede elegir **Toda la historia**. Ver § «Decisión 2026-09-10» y §Estado 1.5.

## Estado (retomado 2026-04-21; actualizado 2026-09-10 — B en Refrescar; A pendiente)

| Fase | Estado | Notas |
|------|--------|--------|
| **0 — Medir** | **Hecho 2026-04-22** | Evidencia Network en §«Network post-fix»; SQL `sql/util_cc_performance_diagnostico_counts.sql` sigue recomendable para dimensionar N vs filas CC. |
| **1.0 — Menos RPCs sync global** | **Hecho 2026-04-22; recorte plazo 2026-11-03** | `loadOrdenes` sin sync; Inicio/Cajas con cooldown; excluye `anulada`; omite ejecutadas fuera de `dias_laborables_editar_anular` salvo Refrescar Admin «Toda la historia»; concurrencia **4**. Sync post-login **diferido 2 s**. |
| **1.1 — Caché `getReglasDeNegocio`** | **Hecho** | `main.js`: TTL 2 min + invalidación ABM reglas. |
| **1.2 — RPC huérfanos O(n+m)** | **Hecho 2026-04-22; superado 2026-11-02; prod 2026-11-03** | Anti-join histórico (DELETE huérfanos). **Capa 1:** los huérfanos se **anulan** (`estado = anulado`), no se borran; lock por orden. **Capa 2:** identidad `sync_clave` (sin monto). **Gemelos:** anula copias extra (deja la más antigua). Únicos de un vivo **no** en prod mientras 28/41/42 tengan gemelos. Cuerpo: `sql/rpc_sync_cc_caja_orden.sql`. El script `migracion_sync_cc_caja_orden_huerfanos_antijoin.sql` no reaplicar. |
| **1.3 — Índices** | **Hecho 2026-04-22** | `EXPLAIN ANALYZE` en **Pandy-Dev**: CC cliente por `orden_id` era **Seq Scan**; índice `idx_mov_cc_orden_id` (`sql/migracion_cc_indice_mov_cliente_orden_id.sql`). **Pandy (prod) + Pandy-Dev:** migración aplicada (MCP). |
| **1.4 — Refrescar más paralelo (opción B)** | **Hecho 2026-09-10** | Botones Refrescar CC: lotes de **8** (`PANDI_CC_SYNC_ORDENES_CONCURRENCY_REFRESCAR`). Login / Inicio / Cajas / apertura CC siguen en **4**. Misma RPC por orden; no cambia saldos ni payloads. Ganancia acotada (sigue N×RTT). |
| **1.5 — RPC batch varias órdenes (opción A)** | **Hecho 2026-11-03 Pandy y Pandy-Dev** | RPC `sync_cc_caja_ordenes` (`sql/rpc_sync_cc_caja_ordenes.sql`): el front arma el mismo payload (motor en el navegador) y envía **10 órdenes** por viaje. Un error no aborta el lote. Solo **Refrescar**. Fallback a N×`sync_cc_caja_orden` si la RPC no existe. |
| **1.6 — Lecturas en tanda (opción 4)** | **Hecho 2026-11-02 (front, solo Refrescar)** | El motor sigue en el navegador. Refrescar lee órdenes, instrumentación, transacciones y comisiones en tandas de 150 (mismos campos) y calcula en memoria; modos de pago y vínculos una vez. La primera orden de cada tanda se compara con el camino viejo; si no coincide, el resto de esa corrida vuelve a SELECT por orden. Login / Inicio / Cajas / guardar una orden **no** cambian. |
| **2 — CC que escala** | **Pausado** | Ver §«Pausa y retoma». Sin queja de cliente aún; retomar cuando suba volumen CC/pendientes o haya prioridad de producto. |

## Decisión 2026-09-10: B ahora, A después (no olvidar)

**Contexto:** en producción, **Refrescar** en Cuenta corriente se siente lento. No es la pintura de la grilla: es `onCcRefrescarClick` → `sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion` → **una RPC `sync_cc_caja_orden` por cada orden** no anulada con instrumentación (~N×RTT). En local parece rápido porque hay pocas órdenes.

**Acuerdo de producto (esta fecha):**

| Opción | Qué es | Decisión |
|--------|--------|----------|
| **B** | Subir el paralelismo **solo** en Refrescar (4 → 8 órdenes a la vez). Sigue habiendo **N** viajes HTTP. Login / Inicio / Cajas / primera apertura CC **no** cambian (siguen en 4 para no saturar el pool HTTP mientras se lee la vista). | **Hecho ahora.** Código: `PANDI_CC_SYNC_ORDENES_CONCURRENCY_REFRESCAR` + `opts.concurrency`. Condición: **no** cambiar datos de BD ni saldos/movimientos (mismos payloads, misma RPC por orden). |
| **A** | **RPC batch:** una (o pocas) llamadas que sincronicen **varias órdenes** en el servidor. Baja N de round-trips; es el único recorte de tiempo de verdad a medida que crezca el volumen. | **Hecho 2026-11-03 en Pandy y Pandy-Dev** (`sync_cc_caja_ordenes`, 10 por viaje, solo Refrescar; motor sigue en el front). |

**Por qué B no alcanza para siempre:** el techo sigue siendo **cantidad de órdenes × latencia de cada RPC**. Duplicar el paralelo (4→8) como mucho acerca el tiempo total a la mitad *si* el cuello es el pool HTTP y no la CPU del navegador ni Postgres. Con cientos de órdenes, Refrescar seguirá midiendo en **minutos** hasta que exista A.

**Qué quedó implementado de A (2026-11-02 Dev; prod 2026-11-03):**

1. Nueva RPC `sync_cc_caja_ordenes(p_items jsonb, p_usuario_id uuid)` que recorre ítems y llama a `sync_cc_caja_orden` (mismo libro). Un `EXCEPTION` por orden no aborta el lote.
2. El botón **Refrescar** (`opts.usarBatchRpc`) deja de disparar N escrituras; calcula en paralelo (8) y escribe de a 10. Login / Inicio / Cajas / guardar una orden **no** usan el lote.
3. Timeout: lote de 10 para no chocar el tope de PostgREST. Si la función no está, fallback a N×`sync_cc_caja_orden`.
4. No se portó el motor al servidor. **2026-11-02:** las lecturas de Refrescar pasan a tandas (opción 4 / §1.6); el cálculo sigue en el front. No se mezcló con Fase 2.

**A en producción:** aplicada **2026-11-03** (v3.8.20) junto con capas 1–2. Login/Inicio/Cajas siguen en 4.

### Pausa y retoma (2026-04-22)

**Cierre de esta etapa:** Fases **0** y **1** (0 → 1.3) quedaron resueltas en **código**, **Pandy-Dev** y **producción** (incluye migración **1.2** RPC anti-join en prod, ejecutada antes del deploy v3.8.2). La **Fase 2** no se implementa ahora.

**Perspectiva interna:** **2026-09-10** opción B (más paralelo). **2026-11-03** opción A en **Pandy y Pandy-Dev** (RPC batch en Refrescar). **Cliente / usuario final:** hasta abr. 2026 **no hubo reclamos**; no hay presión comercial inmediata para filtro/agregación (Fase 2).

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
3. **RPC `sync_cc_caja_orden`** — huérfanos se **anulan** (capa 1, 2026-11-02; el anti-join DELETE de 2026-04-22 quedó superado); sigue costo fijo por orden (parseo JSONB, upsert por fila, transacción única).
4. **UI bloqueada** (mismo hilo JS que calcula y pinta) vs sensación de “tarda el servidor”.

**Refrescar en Cuenta corriente:** dispara el sync global completo a propósito. En **Pandy y Pandy-Dev** (2026-11-03) las escrituras van en **`sync_cc_caja_ordenes`** (~1 request cada 10 órdenes) y las lecturas del motor van **en tandas de 150** (opción 4). Login / Inicio / Cajas siguen leyendo por orden.

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

**Siguiente foco del plan:** llevar **opción A** a producción cuando se autorice; **Fase 2** (filtro fecha CC, pendientes acotados, agregación) cuando el volumen de **filas** de lectura lo justifique. Lecturas en tanda de Refrescar: §1.6.

## Contexto

Hay dos frentes distintos:

1. **Sync por orden** — `sincronizarCcYCajaDesdeOrden` (`main.js`): lecturas (orden, reglas, instrumentación, transacciones, comisiones, modos de pago, vínculos), cálculo pesado en el **navegador**, luego RPC `sync_cc_caja_orden` con JSON.
2. **Carga vista CC** — `loadCuentaCorriente`: `pandiSupabaseFetchAll` sobre **todo** `movimientos_cuenta_corriente` e intermediario; además fetch global de **todas** las transacciones `pendiente` para ajustes de resumen.

El crecimiento de la base impacta sobre todo el punto **2** y el fetch de pendientes; el sync por orden es más “costo fijo por orden” (CPU + varias round-trips + una RPC).

## Diagnóstico resumido

| Área | Riesgo |
|------|--------|
| `getReglasDeNegocio` | ~~`select *` sin caché~~ **Caché TTL 2 min** (2026-04-21). |
| RPC `sync_cc_caja_orden` | Huérfanos: **ANULAR** (`estado = anulado`, sin DELETE; 2026-11-02 en Dev). CC cliente: **idx_mov_cc_orden_id** en `orden_id` (2026-04-22); upsert por fila JSON + lock por orden. |
| `loadCuentaCorriente` | Lee **todas** las filas CC (paginado en bucle); escala con volumen total. |
| Pendientes CC | Lee **todas** las trx `pendiente` del sistema. |
| Sync global todas las órdenes | Paralelo por lotes de **4** (login/Inicio/Cajas/apertura CC); **Refrescar** lecturas en tandas de 150 + cálculo en 8 + escritura batch de 10 (`sync_cc_caja_ordenes`, Dev 2026-11-02). No en `loadOrdenes`; cooldown Inicio/Cajas; excluye `anulada`; defer post-login 2 s. |

Referencia código: `main.js` (`sincronizarCcYCajaDesdeOrden`, `loadCuentaCorriente`, `pandiSupabaseFetchAll`, `sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion`); `sql/rpc_sync_cc_caja_orden.sql`.

## Cómo seguimos (orden recomendado)

1. **Fase 0** — **Cerrada** (evidencia §«Network post-fix»; repetir SQL de conteos cuando cambie el volumen de datos o se quiera comparar con prod).
2. **Fase 1.2 (RPC huérfanos)** — **Hecho** (ver tabla §Estado).
3. **Fase 1.3 (índices + EXPLAIN)** — **Hecho** (ver §«Fase 1.3 — EXPLAIN y índice»); índice aplicado en **prod y dev**.
4. **Fase 2** — **Pausada** (§«Pausa y retoma»): filtro por fechas, pendientes acotados, agregación en servidor cuando volumen o negocio lo exijan.
5. **Opción A / Fase 3 — RPC batch:** **hecha en Dev** (`sync_cc_caja_ordenes`, 10 órdenes por viaje, solo Refrescar). Falta autorizar producción. El motor sigue en el front. Detalle: § «Decisión 2026-09-10».
6. **Opción 4 — lecturas en tanda:** **hecha en el front (solo Refrescar)**. Tandas de 150 + muestra dual vs SELECT por orden. Login/Inicio/Cajas no.

**Refrescar en Dev** genera ~N/10 escrituras más las lecturas del motor; en producción (sin la RPC) el front cae a N×`sync_cc_caja_orden`.

## Fase 0 — Medir

- DevTools (Network + Performance) al guardar trx y al abrir CC.
- Supabase: duración RPC / queries pesadas.
- SQL lectura: `count(*)` movimientos CC, intermediario, trx pendientes; órdenes con instrumentación (`sql/util_cc_performance_diagnostico_counts.sql`).

## Fase 1 — Quick wins

1. **Caché cliente** de `reglas_de_negocio` por `(codigo, usa_intermediario)` + **TTL 2 min** + invalidación al guardar/eliminar/replicar en ABM (`getReglasDeNegocio` / `invalidateReglasDeNegocioFetchCache` en `main.js`).
2. **No re-sync global en navegaciones irrelevantes** — quitado de `loadOrdenes`; cooldown en Inicio/Cajas; menos RPCs acumuladas en la pestaña Network (2026-04-22).
3. RPC: huérfanos se marcan **anulado** con `NOT EXISTS` + `jsonb_array_elements` (sin DELETE). El anti-join DELETE de 2026-04-22 quedó superado.
4. ~~Validar índices con `EXPLAIN ANALYZE`~~ **Hecho 2026-04-22** — índice `idx_mov_cc_orden_id` en CC cliente (Pandy-Dev); ver §«Fase 1.3».

## Fase 2 — CC que escala

1. Filtrar movimientos por **rango de fechas** (alinear con filtros UI); histórico completo bajo demanda.
2. Saldos vía **agregación en servidor** (vista/RPC/materialized) sin traer todas las filas.
3. Pendientes: acotar `transacciones` pendientes a `instrumentacion_id` relevante, no global.

## Fase 3 — Arquitectura (opción A / batch)

- **Opción A (Dev 2026-11-02):** RPC `sync_cc_caja_ordenes` — varias órdenes en un viaje, payloads desde el front. Producción pendiente. Portar el motor al servidor queda fuera (solo si A con motor en front no alcanza).
- Cola async para operaciones masivas (solo si A aún no alcanza).

---

*Documento vivo: decisiones de producto (B ahora / A después, 2026-09-10) quedan en §Estado y §«Decisión 2026-09-10».*
