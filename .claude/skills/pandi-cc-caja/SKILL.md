---
name: pandi-cc-caja
description: Guía para analizar o cambiar el motor de cuenta corriente (CC cliente e intermediario) y caja de Pandi - reglas_de_negocio, aplicarMotorCcDesdeReglasDeNegocio, sincronizarCcYCajaDesdeOrden, RPC sync_cc_caja_orden(es), invariantes de saldo y duplicados. Usar ante cualquier tarea o incidente que toque saldos, movimientos, sync, refrescar CC o caja.
---

# Motor CC y caja — Pandi

## Leer primero
- `docs/CORAZON_SISTEMA_CC_Y_CAJA.md` (principios), `docs/FLUJOS_CC_REGLA.md`, `docs/REGLA_CC_SIMPLE_INFALIBLE.md`.
- `docs/CC_OPERACION_CIERRE_Y_PIPELINE_SYNC.md`, `docs/CC_GRIETAS_INVARIANTE_SALDO_CERO_ORDEN.md`, `docs/CC_DUPLICADOS_PROD_SALDO.md`, `docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.md` (historia de incidentes).
- `docs/PLAN_MEJORA_PERFORMANCE_SYNC_CC.md` (estado del sync masivo / Refrescar).

## Invariantes a verificar en todo cambio
1. Saldo = suma de movimientos; cada movimiento por el monto ejecutado; sin doble conteo.
2. **CC cliente y CC intermediario** revisadas juntas; también caja.
3. Movimientos atados a `transaccion_id`; operaciones por transacción, idempotentes.
4. La verdad contable sale de `reglas_de_negocio` (filas por `linea`); `main.js` no ramifica por tipo de operación.
5. Fechas de negocio en Argentina.
6. Sin duplicados tras re-sync (correr dos veces debe dar el mismo resultado).

## Puntos de código
- `main.js`: `aplicarMotorCcDesdeReglasDeNegocio`, `sincronizarCcYCajaDesdeOrden`, `fallbackSyncCcCaja`, invariante de neteo, multicontraparte, Refrescar (`sync_cc_caja_ordenes`).
- `sql/rpc_sync_cc_caja_orden.sql` y relacionadas (`transacciones_cambiar_estado`).
- Tests: `tests/unit/cc-*.test.mjs`, `tests/e2e/01..03-cc-*.spec.js` + `*-esperado.js` (expectativas = fuente de verdad, no tocarlas sin acuerdo).

## Si algo no cierra
1. Explicar con evidencia (SELECT en dev/prod, orden y transacción concretas).
2. Proponer: primero ajustar `reglas_de_negocio`; extender el modelo solo si la tabla no alcanza; nunca parchear el saldo en el front.
3. Acordar alcance y entorno antes de tocar nada.
4. Tras el cambio: matriz Excel CC (`npm run excel:matriz-cc-reglas`), docs, bitácora, `Verificación de impacto:` incluyendo CC cliente, CC intermediario y caja.
