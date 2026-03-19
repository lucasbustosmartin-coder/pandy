# Convención de conceptos en movimientos de caja

## Objetivo

Unificar el formato del **concepto** de los movimientos de caja que tienen origen en una **transacción**, para que el usuario pueda identificar de un vistazo: tipo (ingreso/egreso), moneda, monto, número de orden y número de transacción.

## Formato estándar

- **Transacción normal:**  
  `Ingreso de [MONEDA], por [MONTO], nro orden [N], nro transacción [T]`  
  o  
  `Egreso de [MONEDA], por [MONTO], nro orden [N], nro transacción [T]`

- **Concepto especial (Ganancia del acuerdo, Comisión del acuerdo):**  
  `[Concepto]. Ingreso de [MONEDA], por [MONTO], nro orden [N], nro transacción [T]`

El monto se muestra con el formato de la app (separador de miles, coma decimal). Si no hay número de orden o de transacción (datos legacy), se usa `?`.

## Número de transacción interno

La tabla `transacciones` tiene una columna **`numero`** (entero, único) generada por secuencia (`transacciones_numero_seq`). Sirve para:

- Trazabilidad en la UI (panel de transacciones muestra columna "Nro").
- Referencia en el concepto del movimiento de caja ("nro transacción 42" en lugar del UUID).

La migración está en `sql/migracion_transacciones_numero.sql`. Al truncar órdenes/transacciones (`sql/truncar_ordenes_transacciones.sql`) se resetea la secuencia para que la próxima transacción sea nº 1.

## Movimientos manuales

Los movimientos de caja **manuales** (sin `transaccion_id`) no usan esta convención: el usuario escribe el concepto libremente o se usa el nombre del tipo de movimiento (ej. "Ajuste ingreso").

## Movimientos por “Orden concertada”

Los movimientos creados al concertar una orden (origen por `orden_id` sin `transaccion_id`) siguen usando el concepto "Orden concertada"; no llevan número de transacción.

## Estructura en base de datos (una sola tabla)

La tabla `movimientos_caja` acepta ambos orígenes (manual y acuerdos) en una única tabla:

- **Relaciones:** `orden_id`, `transaccion_id`, `tipo_movimiento_id` según origen. Constraint: uno y solo uno de los orígenes (transacción; orden legacy; manual).
- **Trazabilidad:** columnas `orden_numero` y `transaccion_numero` (enteros, opcionales) se rellenan al insertar. Migración: `sql/migracion_movimientos_caja_orden_transaccion_numero.sql`.

La **vista de movimientos** muestra: Fecha, Origen (Manual / Acuerdo / Orden concertada), Nro orden, Nro transacción, Tipo (Ingreso/Egreso), Moneda, Monto, Caja, Concepto, Acciones.
