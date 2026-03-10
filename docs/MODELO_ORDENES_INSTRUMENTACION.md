# Pandi – Modelo Órdenes e Instrumentación

## Orden de ejecución SQL (Supabase)

### Si ya tenés la base creada (tablas_negocio, seguridad, rls_negocio, migracion_estado)

**Solo ejecutá estos 5 (nuevos), en este orden:**

1. **`supabase_complejidad_ordenes.sql`** – Agrega tablas (tipos_operacion, modos_pago, intermediarios, instrumentacion, transacciones, comisiones_orden, mov_cc_intermediario), columnas nuevas en `ordenes` y `movimientos_caja`, y migra estado de órdenes (abierta/parcialmente_cerrada/cerrada).
2. **`migracion_estado_orden.sql`** – Actualiza estados a: pendiente_instrumentar, instrumentacion_parcial, instrumentacion_cerrada_ejecucion, orden_ejecutada.
3. **`migracion_transaccion_cobrador_pagador.sql`** – Agrega cobrador y pagador en transacciones para conciliar CC cliente e intermediario.
4. **`supabase_seguridad_complejidad.sql`** – Agrega el permiso `abm_intermediarios` (una sola vez).
5. **`supabase_rls_complejidad.sql`** – RLS y grants de las tablas nuevas.

No hace falta volver a ejecutar `tablas_negocio`, `seguridad`, `rls_negocio` ni `migracion_estado_movimientos`.

---

### Orden completo (solo para una base nueva desde cero)

1. `supabase_tablas_negocio.sql`
2. `migracion_estado_movimientos.sql` (si aplica)
3. `supabase_complejidad_ordenes.sql`
4. `migracion_estado_orden.sql`
5. `migracion_transaccion_cobrador_pagador.sql`
6. `supabase_seguridad.sql`
7. `supabase_seguridad_complejidad.sql`
8. `supabase_rls_negocio.sql`
9. `supabase_rls_complejidad.sql`

## Resumen

- **Orden** = Acuerdo comercial. Una orden tiene **una instrumentación** con **N transacciones**.
- **Estado de la orden:** Pendiente Instrumentar | Instrumentación Parcial | Cerrada en Ejecución | Orden Ejecutada (derivado de transacciones y conciliación con el acuerdo). Ver `sql/migracion_estado_orden.sql`.
- **Transacciones:** Pendiente | Ejecutada. Solo al ejecutarse impactan caja y cuenta corriente.
- **Operación:** directa (solo Pandy–cliente) o intermediada (participa intermediario con su cuenta corriente).

## Entidades

| Entidad | Descripción |
|--------|-------------|
| **tipos_operacion** | Catálogo: USD-USD, ARS-USD, USD-ARS, ARS-EUR, ARS-ARS-CHEQUE. |
| **modos_pago** | Catálogo: Efectivo, Transferencia, Cheque (ARS). |
| **intermediarios** | Terceros con cuenta corriente propia (Pandy ↔ intermediario). |
| **ordenes** | Acuerdo: cliente, tipo_operacion, operacion_directa, intermediario (si aplica), montos de acuerdo, comisión, estado (pendiente_instrumentar, instrumentacion_parcial, instrumentacion_cerrada_ejecucion, orden_ejecutada). |
| **instrumentacion** | Una por orden. Agrupa las transacciones. |
| **transacciones** | Ingreso/Egreso, modo_pago, moneda, owner (Pandy/Cliente/Intermediario), monto, estado (Pendiente/Ejecutada), tipo_cambio (si ARS). Al ejecutarse genera movimientos de caja y CC. |
| **comisiones_orden** | Registro de comisiones por orden (monto, moneda). |
| **Cajas** | Por tipo: efectivo, banco (transferencias), cheque (solo ARS). Saldo por (caja_tipo, moneda). |
| **Cuenta corriente cliente** | Igual que hoy (por cliente y moneda). |
| **Cuenta corriente intermediario** | Nueva: por intermediario y moneda. |

## Cobrador y Pagador (por transacción)

Cada transacción tiene **cobrador** y **pagador** (obligatorios y distintos) para que sea conciliable:

- **Cobrador:** quien recibe el dinero en esa transacción (Pandy, Cliente o Intermediario).
- **Pagador:** quien paga en esa transacción (Pandy, Cliente o Intermediario).

Así se llevan bien la cuenta corriente del cliente y la del intermediario con Pandy. Ejemplo: tipo Ingreso, pagador = Intermediario, cobrador = Pandy → la CC del intermediario refleja que nosotros le debemos.

- **CC cliente:** cobrador = cliente → +monto (nos debe más); pagador = cliente → −monto (nos debe menos).
- **CC intermediario:** cobrador o pagador = intermediario → −monto (nosotros le debemos).

## Flujo USD-USD (ejemplo)

1. Se crea la orden (acuerdo: entrego 15.000 USD, recibo 15.300 USD, comisión 300 USD).
2. Se crea la instrumentación (1 por orden).
3. Se cargan N transacciones (Trx 1: egreso 15.000 Pandy efectivo/transferencia; Trx 2: ingreso 12.000 pendiente; Trx 3: ingreso resto, etc.).
4. Al marcar una transacción como **Ejecutada** se generan los movimientos de caja (y CC si aplica) y se actualiza estado de la orden según cuántas trx estén ejecutadas.
