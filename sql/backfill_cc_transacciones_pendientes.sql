-- Backfill cuenta corriente para transacciones ya cargadas en estado 'pendiente'
-- Ejecutar una sola vez después de que la app impacte CC en pendiente y ejecutada.
-- Así las transacciones pendientes existentes pasan a verse en la cuenta corriente sin re-guardar cada una.

-- 1) Limpiar posibles movimientos CC ya vinculados a estas transacciones (por si se corrió antes a mano)
DELETE FROM public.movimientos_cuenta_corriente
WHERE transaccion_id IN (SELECT id FROM public.transacciones WHERE estado = 'pendiente');

DELETE FROM public.movimientos_cuenta_corriente_intermediario
WHERE transaccion_id IN (SELECT id FROM public.transacciones WHERE estado = 'pendiente');

-- 2) Cliente: cobrador = cliente → -monto
INSERT INTO public.movimientos_cuenta_corriente (cliente_id, moneda, monto, transaccion_id, concepto, fecha, estado, estado_fecha)
SELECT o.cliente_id, t.moneda, -t.monto, t.id, 'Transacción pendiente',
       COALESCE((t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE), 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.estado = 'pendiente' AND t.cobrador = 'cliente' AND o.cliente_id IS NOT NULL;

-- 3) Cliente: pagador = cliente → +monto
INSERT INTO public.movimientos_cuenta_corriente (cliente_id, moneda, monto, transaccion_id, concepto, fecha, estado, estado_fecha)
SELECT o.cliente_id, t.moneda, t.monto, t.id, 'Transacción pendiente',
       COALESCE((t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE), 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.estado = 'pendiente' AND t.pagador = 'cliente' AND o.cliente_id IS NOT NULL;

-- 4) Intermediario: cobrador = intermediario → -monto
INSERT INTO public.movimientos_cuenta_corriente_intermediario (intermediario_id, moneda, monto, transaccion_id, concepto, fecha, estado, estado_fecha)
SELECT o.intermediario_id, t.moneda, -t.monto, t.id, 'Transacción pendiente',
       COALESCE((t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE), 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.estado = 'pendiente' AND t.cobrador = 'intermediario' AND o.intermediario_id IS NOT NULL;

-- 5) Intermediario: pagador = intermediario → -monto
INSERT INTO public.movimientos_cuenta_corriente_intermediario (intermediario_id, moneda, monto, transaccion_id, concepto, fecha, estado, estado_fecha)
SELECT o.intermediario_id, t.moneda, -t.monto, t.id, 'Transacción pendiente',
       COALESCE((t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE), 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.estado = 'pendiente' AND t.pagador = 'intermediario' AND o.intermediario_id IS NOT NULL;
