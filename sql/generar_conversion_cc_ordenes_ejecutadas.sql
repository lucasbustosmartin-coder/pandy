-- Genera el movimiento "Conversión por tipo de cambio" en cuenta corriente del cliente
-- para órdenes ya ejecutadas: deja el saldo de la orden en cero (no incluye comisión en la CC del cliente).
-- Las comisiones se manejan aparte. Ejecutar una sola vez para órdenes cerradas antes de esta lógica.

INSERT INTO public.movimientos_cuenta_corriente (cliente_id, moneda, monto, orden_id, transaccion_id, concepto, fecha, estado, estado_fecha)
SELECT s.cliente_id, s.moneda, -s.saldo, s.orden_id, NULL, 'Conversión por tipo de cambio', CURRENT_DATE, 'cerrado', now()
FROM (
  SELECT i.orden_id, m.cliente_id, m.moneda, SUM(m.monto) AS saldo
  FROM public.movimientos_cuenta_corriente m
  JOIN public.transacciones t ON t.id = m.transaccion_id
  JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
  WHERE m.transaccion_id IS NOT NULL
  GROUP BY i.orden_id, m.cliente_id, m.moneda
  HAVING SUM(m.monto) <> 0
) s
JOIN public.ordenes o ON o.id = s.orden_id AND o.cliente_id = s.cliente_id
WHERE o.estado = 'orden_ejecutada'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente c
    WHERE c.orden_id = s.orden_id AND c.concepto = 'Conversión por tipo de cambio'
  );
