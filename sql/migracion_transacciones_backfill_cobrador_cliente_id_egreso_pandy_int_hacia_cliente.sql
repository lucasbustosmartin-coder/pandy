-- Backfill: egreso con cobrador = cliente, pagador pandy|intermediario, y cobrador_cliente_id NULL.
-- Solo instrumentación con coalesce(multicontraparte_manual, false) = false (no pisar MC con dos clientes).
-- 1) Ejecutar el SELECT y revisar filas.
-- 2) Descomentar el UPDATE y ejecutar en ventana de mantenimiento (prod + dev según política del equipo).

SELECT tx.id, tx.numero, tx.instrumentacion_id, o.numero AS orden_numero,
       tx.pagador, tx.cobrador, tx.moneda, tx.monto, o.cliente_id AS cliente_acuerdo_id
FROM public.transacciones tx
JOIN public.instrumentacion inst ON inst.id = tx.instrumentacion_id
JOIN public.ordenes o ON o.id = inst.orden_id
WHERE coalesce(inst.multicontraparte_manual, false) = false
  AND o.cliente_id IS NOT NULL
  AND lower(coalesce(tx.tipo, '')) = 'egreso'
  AND lower(coalesce(tx.cobrador, '')) = 'cliente'
  AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
  AND (tx.cobrador_cliente_id IS NULL OR trim(tx.cobrador_cliente_id::text) = '');

-- UPDATE public.transacciones tx
-- SET cobrador_cliente_id = o.cliente_id, updated_at = now()
-- FROM public.instrumentacion inst
-- JOIN public.ordenes o ON o.id = inst.orden_id
-- WHERE tx.instrumentacion_id = inst.id
--   AND coalesce(inst.multicontraparte_manual, false) = false
--   AND o.cliente_id IS NOT NULL
--   AND lower(coalesce(tx.tipo, '')) = 'egreso'
--   AND lower(coalesce(tx.cobrador, '')) = 'cliente'
--   AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
--   AND (tx.cobrador_cliente_id IS NULL OR trim(tx.cobrador_cliente_id::text) = '');
