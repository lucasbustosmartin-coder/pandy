-- Limpieza única: órdenes ya en estado `anulada` que aún tienen filas en
-- `comisiones_orden` y/o `orden_comisiones_generadas` (p. ej. anuladas antes
-- del DELETE en `ejecutarAnulacionOrdenCompleta` o si el DELETE falló por RLS).
--
-- Ejecutar en Supabase SQL Editor (producción y/o dev) tras revisar el SELECT
-- de inspección. Misma semántica que el flujo actual de anulación en la app.

-- ---------------------------------------------------------------------------
-- 1) Inspección (solo lectura): qué se borraría
-- ---------------------------------------------------------------------------
SELECT
  o.numero AS nro_orden,
  o.id AS orden_id,
  o.estado,
  c.id AS comisiones_orden_id,
  c.beneficiario,
  c.moneda,
  c.monto
FROM public.ordenes o
INNER JOIN public.comisiones_orden c ON c.orden_id = o.id
WHERE o.estado = 'anulada'
ORDER BY o.numero NULLS LAST, c.id;

SELECT ocg.*
FROM public.orden_comisiones_generadas ocg
INNER JOIN public.ordenes o ON o.id = ocg.orden_id
WHERE o.estado = 'anulada'
ORDER BY o.numero NULLS LAST;

-- ---------------------------------------------------------------------------
-- 2) Borrado (ejecutar cuando el preview sea el esperado)
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM public.orden_comisiones_generadas ocg
WHERE ocg.orden_id IN (
  SELECT id FROM public.ordenes WHERE estado = 'anulada'
);

DELETE FROM public.comisiones_orden co
WHERE co.orden_id IN (
  SELECT id FROM public.ordenes WHERE estado = 'anulada'
);

COMMIT;

-- ---------------------------------------------------------------------------
-- Opcional: solo una orden por número (ej. orden 54)
-- ---------------------------------------------------------------------------
/*
BEGIN;

DELETE FROM public.orden_comisiones_generadas
WHERE orden_id = (SELECT id FROM public.ordenes WHERE numero = 54 LIMIT 1);

DELETE FROM public.comisiones_orden
WHERE orden_id = (SELECT id FROM public.ordenes WHERE numero = 54 LIMIT 1);

COMMIT;
*/
