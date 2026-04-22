-- Auditoría pre-deploy: USD-USD + intermediario, pata «moneda recibida» en CC cliente vs préstamo gemelo.
-- Solo lectura. Ejecutar en Supabase SQL Editor (producción) antes del deploy del front.
-- Criterio alineado a main.js: órdenes cerradas tipo USD-USD con intermediario_id;
-- filas CC no manuales, no anuladas, con leyenda «Pandy cumple pata en moneda recibida».

-- ---------------------------------------------------------------------------
-- 1) Cantidad de órdenes USD-USD + int en estado cerrado (mismo universo)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS usdusd_int_cerradas
FROM ordenes o
JOIN tipos_operacion t ON t.id = o.tipo_operacion_id
WHERE t.codigo = 'USD-USD'
  AND o.intermediario_id IS NOT NULL
  AND o.estado IN ('orden_ejecutada', 'instrumentacion_cerrada_ejecucion');

-- ---------------------------------------------------------------------------
-- 2) Órdenes con al menos una fila de pata monR o de préstamo (CC cliente)
-- ---------------------------------------------------------------------------
SELECT
  o.numero,
  SUM(CASE WHEN m.concepto LIKE '%Pandy cumple pata en moneda recibida%' THEN 1 ELSE 0 END) AS n_pata_monr,
  SUM(
    CASE
      WHEN m.concepto ILIKE '%préstamo%' OR m.concepto ILIKE '%prestamo%' THEN 1
      ELSE 0
    END
  ) AS n_prestamo
FROM ordenes o
JOIN tipos_operacion t ON t.id = o.tipo_operacion_id
LEFT JOIN movimientos_cuenta_corriente m
  ON m.orden_id = o.id
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND COALESCE(m.estado, '') <> 'anulado'
WHERE t.codigo = 'USD-USD'
  AND o.intermediario_id IS NOT NULL
  AND o.estado IN ('orden_ejecutada', 'instrumentacion_cerrada_ejecucion')
GROUP BY o.numero
HAVING
  SUM(CASE WHEN m.concepto LIKE '%Pandy cumple pata en moneda recibida%' THEN 1 ELSE 0 END) > 0
  OR SUM(
    CASE
      WHEN m.concepto ILIKE '%préstamo%' OR m.concepto ILIKE '%prestamo%' THEN 1
      ELSE 0
    END
  ) > 0
ORDER BY o.numero;

-- ---------------------------------------------------------------------------
-- 3) Detalle: cada pata monR y si existe préstamo en la misma transacción (CC cliente)
-- ---------------------------------------------------------------------------
SELECT
  o.numero AS orden_num,
  p.transaccion_numero,
  p.transaccion_id,
  p.monto_pata,
  EXISTS (
    SELECT 1
    FROM movimientos_cuenta_corriente x
    WHERE x.orden_id = p.orden_id
      AND x.cliente_id = p.cliente_id
      AND (
        x.transaccion_id IS NOT DISTINCT FROM p.transaccion_id
        OR (
          p.transaccion_id IS NULL
          AND x.transaccion_numero IS NOT DISTINCT FROM p.transaccion_numero
        )
      )
      AND (x.concepto ILIKE '%préstamo%' OR x.concepto ILIKE '%prestamo%')
      AND COALESCE(x.es_movimiento_manual, false) = false
  ) AS tiene_prestamo_misma_trx
FROM (
  SELECT
    m.orden_id,
    m.cliente_id,
    m.transaccion_id,
    m.transaccion_numero,
    m.monto AS monto_pata
  FROM movimientos_cuenta_corriente m
  WHERE COALESCE(m.es_movimiento_manual, false) = false
    AND COALESCE(m.estado, '') <> 'anulado'
    AND m.concepto LIKE '%Pandy cumple pata en moneda recibida%'
) p
JOIN ordenes o ON o.id = p.orden_id
JOIN tipos_operacion t ON t.id = o.tipo_operacion_id
WHERE t.codigo = 'USD-USD'
  AND o.intermediario_id IS NOT NULL
ORDER BY o.numero, p.transaccion_numero;

-- ---------------------------------------------------------------------------
-- 4) Compensación persistida en ingresos (mismo universo de órdenes)
-- ---------------------------------------------------------------------------
SELECT o.numero AS orden_num, t.numero AS trx_num, t.compensacion_cc_monto_aplicado
FROM transacciones t
JOIN instrumentacion i ON i.id = t.instrumentacion_id
JOIN ordenes o ON o.id = i.orden_id
JOIN tipos_operacion tp ON tp.id = o.tipo_operacion_id
WHERE tp.codigo = 'USD-USD'
  AND o.intermediario_id IS NOT NULL
  AND o.estado IN ('orden_ejecutada', 'instrumentacion_cerrada_ejecucion')
  AND t.compensacion_cc_monto_aplicado IS NOT NULL
ORDER BY o.numero, t.numero;

-- ---------------------------------------------------------------------------
-- 5) Total global de filas CC con préstamo/cobertura (cualquier orden)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS cc_filas_prestamo_o_cobertura
FROM movimientos_cuenta_corriente m
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.concepto ILIKE '%préstamo%'
    OR m.concepto ILIKE '%prestamo%'
    OR m.concepto ILIKE '%cobertura pandy%'
  );
