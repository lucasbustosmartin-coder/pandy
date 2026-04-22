# Plan de mejora — performance sincronización CC / carga Cuenta corriente (Pandi)

> **Recordatorio:** retomar este documento cuando se trabaje en lentitud, sync, RPC `sync_cc_caja_orden` o carga de la vista CC.

## Contexto

Hay dos frentes distintos:

1. **Sync por orden** — `sincronizarCcYCajaDesdeOrden` (`main.js`): lecturas (orden, reglas, instrumentación, transacciones, comisiones, modos de pago, vínculos), cálculo pesado en el **navegador**, luego RPC `sync_cc_caja_orden` con JSON.
2. **Carga vista CC** — `loadCuentaCorriente`: `pandiSupabaseFetchAll` sobre **todo** `movimientos_cuenta_corriente` e intermediario; además fetch global de **todas** las transacciones `pendiente` para ajustes de resumen.

El crecimiento de la base impacta sobre todo el punto **2** y el fetch de pendientes; el sync por orden es más “costo fijo por orden” (CPU + varias round-trips + una RPC).

## Diagnóstico resumido

| Área | Riesgo |
|------|--------|
| `getReglasDeNegocio` | `select *` sin caché en cliente en cada sync. |
| RPC `sync_cc_caja_orden` | Búsqueda por fila JSON + pasada de huérfanos **O(n×m)** (anidado). |
| `loadCuentaCorriente` | Lee **todas** las filas CC (paginado en bucle); escala con volumen total. |
| Pendientes CC | Lee **todas** las trx `pendiente` del sistema. |
| Sync global todas las órdenes | Existe en lotes de 4; no debe forzarse en cada apertura de CC (hoy desactivado en lectura pantalla). |

Referencia código: `main.js` (`sincronizarCcYCajaDesdeOrden`, `loadCuentaCorriente`, `pandiSupabaseFetchAll`, `sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion`); `sql/rpc_sync_cc_caja_orden.sql`.

## Fase 0 — Medir

- DevTools (Network + Performance) al guardar trx y al abrir CC.
- Supabase: duración RPC / queries pesadas.
- SQL lectura: `count(*)` movimientos CC, intermediario, trx pendientes.

## Fase 1 — Quick wins

1. Caché cliente de `reglas_de_negocio` por `(codigo, usa_intermediario)` + invalidación/TTL.
2. RPC: huérfanos con estructura **O(n+m)** (clave lógica en memoria PL/pgSQL, un solo barrido BD).
3. Validar índices con `EXPLAIN ANALYZE` en staging para los `WHERE` de la RPC.

## Fase 2 — CC que escala

1. Filtrar movimientos por **rango de fechas** (alinear con filtros UI); histórico completo bajo demanda.
2. Saldos vía **agregación en servidor** (vista/RPC/materialized) sin traer todas las filas.
3. Pendientes: acotar `transacciones` pendientes a `instrumentacion_id` relevante, no global.

## Fase 3 — Arquitectura (si hace falta)

- Sync derivado en servidor (Edge/SQL) solo si se justifica duplicar/portar lógica con tests.
- Cola async para operaciones masivas.

---

*Documento generado a partir de revisión técnica en conversación; sin cambios de producto acordados aquí.*
