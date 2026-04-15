-- CC con filas que siguen en `pendiente` pese a orden `anulada` (p. ej. sync no
-- regeneró o quedó inconsistente). Solo **UPDATE** a `anulado` — no borra filas.
-- Excluye movimientos **manuales** (misma regla que `anularMovimientosCcYCajaNoManualPorOrden` en main.js).
--
-- Si además hay filas en `cerrado` que deberían estar anuladas para esa orden,
-- usá el parche más amplio `sql/fix_cc_anulado_estado.sql` (anula todo lo no-anulado
-- derivado de la orden anulada, más caja y transacciones).
--
-- Ejecutar en SQL Editor (rol postgres / sin RLS).

-- ---------------------------------------------------------------------------
-- 1) Inspección: movimientos CC pendientes ligados a órdenes anuladas
-- ---------------------------------------------------------------------------
SELECT
  o.numero AS nro_orden,
  m.id,
  m.cliente_id,
  m.concepto,
  m.moneda,
  m.monto,
  m.estado,
  m.orden_id
FROM public.movimientos_cuenta_corriente m
INNER JOIN public.ordenes o ON o.id = m.orden_id
WHERE o.estado = 'anulada'
  AND m.estado = 'pendiente'
  AND COALESCE(m.es_movimiento_manual, false) = false
ORDER BY o.numero NULLS LAST, m.fecha, m.id;

SELECT
  o.numero AS nro_orden,
  mi.id,
  mi.intermediario_id,
  mi.concepto,
  mi.moneda,
  mi.monto,
  mi.estado,
  mi.orden_id
FROM public.movimientos_cuenta_corriente_intermediario mi
INNER JOIN public.ordenes o ON o.id = mi.orden_id
WHERE o.estado = 'anulada'
  AND mi.estado = 'pendiente'
  AND COALESCE(mi.es_movimiento_manual, false) = false
ORDER BY o.numero NULLS LAST, mi.fecha, mi.id;

-- ---------------------------------------------------------------------------
-- 2) UPDATE (ejecutar cuando el preview sea el esperado)
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE public.movimientos_cuenta_corriente m
SET estado = 'anulado',
    estado_fecha = now()
FROM public.ordenes o
WHERE o.id = m.orden_id
  AND o.estado = 'anulada'
  AND m.estado = 'pendiente'
  AND COALESCE(m.es_movimiento_manual, false) = false;

UPDATE public.movimientos_cuenta_corriente_intermediario mi
SET estado = 'anulado',
    estado_fecha = now()
FROM public.ordenes o
WHERE o.id = mi.orden_id
  AND o.estado = 'anulada'
  AND mi.estado = 'pendiente'
  AND COALESCE(mi.es_movimiento_manual, false) = false;

COMMIT;

-- ---------------------------------------------------------------------------
-- Opcional: una sola orden por número (ej. 54)
-- ---------------------------------------------------------------------------
/*
BEGIN;

UPDATE public.movimientos_cuenta_corriente m
SET estado = 'anulado', estado_fecha = now()
WHERE m.orden_id = (SELECT id FROM public.ordenes WHERE numero = 54 LIMIT 1)
  AND m.estado = 'pendiente'
  AND COALESCE(m.es_movimiento_manual, false) = false;

UPDATE public.movimientos_cuenta_corriente_intermediario mi
SET estado = 'anulado', estado_fecha = now()
WHERE mi.orden_id = (SELECT id FROM public.ordenes WHERE numero = 54 LIMIT 1)
  AND mi.estado = 'pendiente'
  AND COALESCE(mi.es_movimiento_manual, false) = false;

COMMIT;
*/
