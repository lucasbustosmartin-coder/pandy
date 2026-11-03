# Pandi – Funciones críticas: modelo Sistema-Contable aplicado

Referencia: en **Sistema-Contable** (repo hermano en LyP) la lógica se reparte así:
- **Supabase Edge Functions:** actualización de tipo de cambio, precios DOCTA, entradas contables, valor portfolio (lógica crítica que escribe datos).
- **`src/utils`:** formato de montos, variaciones, fechas de mercado, métricas de portfolio, chequeo de conectividad (presentación y cálculos en el cliente).

Este doc propone **aplicar el mismo criterio en Pandi**: qué llevar a Supabase (Edge o SQL/RPC) y qué puede quedar en el front (o en un `utils.js`).

---

## 1. Criterio (igual que Sistema-Contable)

| Dónde | Qué va |
|-------|--------|
| **Supabase** (Edge Functions o funciones/RPC SQL) | Lógica que **escribe o deriva datos** críticos: CC, caja, comisiones, estado de órdenes/transacciones. Una sola fuente de verdad, transacciones atómicas, RLS. |
| **Front** (main.js o `scripts/utils.js`) | Formato de números/monedas, helpers de UI, mensajería (toast/confirm), lectura y render de datos que ya vienen de Supabase. |

---

## 2. Candidatas a Supabase (hoy en main.js)

Estas funciones son **críticas** porque determinan qué se escribe en `movimientos_cuenta_corriente`, `movimientos_cuenta_corriente_intermediario`, `movimientos_caja`, y en el estado de transacciones/órdenes. En Sistema-Contable eso estaría en Edge (o en RPC SQL).

| Función | Rol | Opción recomendada |
|---------|-----|---------------------|
| **sincronizarCcYCajaDesdeOrden** | Borra y rearma todos los movimientos de CC (cliente e int.) y caja para una orden según el estado actual de las transacciones. | **RPC SQL** o **Edge Function** que reciba `orden_id` y haga todo en una transacción. |
| **insertarMovimientosCcParaTransaccion** | Inserta movimientos de CC al marcar una transacción como ejecutada (legacy / no regla simple). | Integrar en la misma RPC/Edge que sincroniza por orden, o llamada desde Edge. |
| **asegurarGananciaPandy** / **revertirGananciaPandy** | Crea/revierte transacción "Ganancia del acuerdo" y movimientos asociados. | Parte de la lógica de sincronización en Supabase. |
| **asegurarComisionIntermediario** / **revertirComisionIntermediario** | Crea/revierte comisión intermediario: fila `orden_comisiones_generadas` y, salvo tasa transferencia fuera del acuerdo, egreso en `movimientos_caja` efectivo; CC int. «Comisión del acuerdo» inserta el caller. | Parte de la lógica de sincronización en Supabase. |
| **insertarMovimientosCcMomentoCero** / **insertarMovimientosCcMomentoCeroIntermediario** | Inserta filas "Compromiso" momento cero (regla simple). | Integrado en la RPC/Edge de sync. |
| **insertarFilasComisionIntermediarioCcPorTransaccion** | Tras ejecutar pata Pandy↔Intermediario: inserta CC int. «Comisión del acuerdo» y delega en **asegurarComisionIntermediario** (caja efectivo solo si no aplica omisión por tasa transferencia fuera del acuerdo). | `usuario_id` en inserts: `opts.usuarioId` (p. ej. `transacciones.usuario_id`) **o** `currentUserId` si no viene; momento cero intermediario usa `currentUserId` como la CC cliente en momento cero. |
| **cambiarEstadoTransaccion** (núcleo) | Actualiza estado de la transacción y dispara sync CC/caja, reversas, splits, etc. | **Edge Function** o **RPC** que: (1) actualice `transacciones.estado`, (2) llame a la lógica de sync CC/caja en el mismo backend. |
| **actualizarEstadoOrden** | Recalcula estado de la orden (abierta/parcial/cerrada) desde las transacciones. | **RPC SQL** o trigger; puede invocarse desde la misma Edge que hace el cambio de estado. |
| **insertarCompensatoria** / flujo de transacción compensatoria | Crea transacción y movimientos para compensar. | Misma RPC/Edge de sync o Edge dedicada. |

Ventaja de llevarlo a Supabase: una sola transacción DB para “cambiar estado + sync CC + caja”; el front solo llama una RPC o Edge y refresca la UI.

---

## 3. Candidatas a quedar en el front (o en utils)

Equivalente a lo que en Sistema-Contable está en `src/utils`: no escriben datos críticos, solo formatean, calculan para mostrar o orquestan UI.

| Función / ámbito | Rol | Dónde dejarla |
|-------------------|-----|----------------|
| **formatMonto**, **formatImporteDisplay**, **formatImporteParaInput**, **formatearCeldaMoneda** | Formato de números y monedas para la UI. | **utils.js** (ej. `scripts/utils.js` o `utils.js` en raíz), como en Sistema-Contable. |
| **conceptoCcMovimiento**, **conceptoConOrden**, **conceptoCajaTransaccion**, **conceptoCajaTransaccionEspecial** | Armar texto de concepto para mostrar o para insert (si el insert se hace en el backend, el backend puede tener sus propias plantillas). | Si el insert sigue en el front, quedan en main; si todo pasa a Supabase, pueden moverse a utils solo para etiquetas en UI o eliminarse del front. |
| **montosCcPorMoneda**, **montosCcPorOrden**, **numCc**, **ratioCc**, **montosCancelacionDesdeOrden** | Helpers de montos por moneda para CC. | Si la sync está en Supabase, estos solo tienen sentido en el backend; en el front quedarían solo si se usan para preview o listados que no vienen ya calculados. |
| **showToast**, **showConfirm**, **dismissAllToasts** | Mensajería y confirmaciones. | **main.js** (o un pequeño módulo de UI). |
| **loadCuentaCorriente**, **loadCajas**, **fetchMovimientosCcPorEntidad**, **buildCcResumenRows**, **renderCcResumenTable**, etc. | Carga de datos desde Supabase y **render** de tablas/vistas. | **main.js**: solo lectura y UI; no definen reglas de negocio. |
| **sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion** | Orquesta el sync por orden (lotes de 4 en login/Inicio/Cajas/apertura CC; lotes de 8 en **Refrescar**). `opts.concurrency` 1–12; si ya hay corrida en vuelo, reutiliza la misma promesa. **Refrescar** usa `opts.usarBatchRpc` → lecturas en tandas de 150 (`datosPrefetch`) + RPC `sync_cc_caja_ordenes` (10 órdenes por viaje). Omite **nro. 23, 28, 41, 42 y 106**. Omite órdenes **ejecutadas fuera del plazo** (`dias_laborables_editar_anular`) salvo `opts.recorrerHistoria` (Refrescar Admin). Login/Inicio/Cajas **no arrancan** mientras el cartel «Nueva versión» pide Recargar o Entendido. | **Opción A en Pandy y Pandy-Dev** (`sql/rpc_sync_cc_caja_ordenes.sql`, v3.8.20). Login/guardar una orden siguen en `sync_cc_caja_orden` con SELECT por orden (guardar no recorta por plazo). El motor sigue en el front. Si la RPC batch no está, fallback a N llamadas. |

---

## 4. Pasos sugeridos (evaluación)

1. **Definir una RPC (o Edge) “sync CC y caja por orden”** en Supabase que encapsule la lógica de `sincronizarCcYCajaDesdeOrden` (y las ayudas que usa). El front solo invocaría esa RPC al cambiar estado, guardar orden, o al hacer “Re-sincronizar”.
2. **Mover el cambio de estado de transacción al backend:** una RPC o Edge “cambiar estado transacción” que actualice la fila y llame a la sync en la misma transacción (o en la misma Edge).
3. **Extraer formateo a utils:** crear `scripts/utils.js` (o `utils.js` en raíz) con `formatMonto`, `formatImporteDisplay`, etc., e importarlo desde main.js, igual que en Sistema-Contable con `src/utils/utils.js`.
4. Dejar en main.js todo lo que sea **solo** carga desde Supabase, render y eventos de UI.

**Estado:** RPC `sync_cc_caja_orden` (`sql/rpc_sync_cc_caja_orden.sql`): recibe filas JSONB del front y hace **INSERT / UPDATE / ANULAR** (sin DELETE de derivados); gemelos vivos: deja la más antigua y anula el resto; lock por orden; auditoría `cc_caja_sync`. El monto se **redondea a 4 decimales** al comparar y al persistir (evita “editar” falso por coma flotante). Los campos opcionales numéricos (`transaccion_numero`, `orden_numero` en caja) deben leerse con `->>` antes del cast para aceptar `null` en JSON (evita error *cannot cast jsonb null to type integer* en filas de comisión). En **movimientos CC** (cliente e intermediario), si el JSON no trae `usuario_id`, el INSERT usa `transacciones.usuario_id` (cuando hay `transaccion_id`), luego `ordenes.usuario_id`, y solo al final `p_usuario_id` — defensa en profundidad frente a resync con JSON incompleto. RPC `transacciones_cambiar_estado` (`sql/rpc_transacciones_cambiar_estado.sql`); `utils.js` con formateo. El cambio de estado de la transacción se hace por RPC (UPDATE en la DB); el front sigue con reversiones, sync, `actualizarEstadoOrden`. Sin Edge Functions: todo son funciones PostgreSQL (RPC). El cliente **no** hace delete+insert si la RPC falla.
