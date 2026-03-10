-- Re-sincronizar cuenta corriente desde TODAS las transacciones (pendiente y ejecutada)
-- Corrige movimientos faltantes: p. ej. cuando el cliente cobra del intermediario (cobrador=cliente, pagador=intermediario)
-- debe verse en la CC del cliente como Haber. Ejecutar una sola vez tras detectar CC incorrecta.

-- 1) Borrar todos los movimientos de CC que vienen de transacciones (no tocar los de orden concertada u otros)
DELETE FROM public.movimientos_cuenta_corriente
WHERE transaccion_id IS NOT NULL;

DELETE FROM public.movimientos_cuenta_corriente_intermediario
WHERE transaccion_id IS NOT NULL;

-- 2) Cliente: cobrador = cliente → -monto (cliente recibe; en tabla = Haber)
INSERT INTO public.movimientos_cuenta_corriente (cliente_id, moneda, monto, transaccion_id, concepto, fecha, usuario_id, estado, estado_fecha)
SELECT o.cliente_id, t.moneda, -t.monto, t.id,
       CASE WHEN t.estado = 'ejecutada' THEN 'Transacción ejecutada' ELSE 'Transacción pendiente' END,
       COALESCE(t.fecha_ejecucion, (t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
       t.usuario_id, 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.cobrador = 'cliente' AND o.cliente_id IS NOT NULL;

-- 3) Cliente: pagador = cliente → +monto (cliente paga; en tabla = Debe)
INSERT INTO public.movimientos_cuenta_corriente (cliente_id, moneda, monto, transaccion_id, concepto, fecha, usuario_id, estado, estado_fecha)
SELECT o.cliente_id, t.moneda, t.monto, t.id,
       CASE WHEN t.estado = 'ejecutada' THEN 'Transacción ejecutada' ELSE 'Transacción pendiente' END,
       COALESCE(t.fecha_ejecucion, (t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
       t.usuario_id, 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.pagador = 'cliente' AND o.cliente_id IS NOT NULL;

-- 4) Intermediario: cobrador = intermediario → -monto (deuda Pandy con intermediario)
INSERT INTO public.movimientos_cuenta_corriente_intermediario (intermediario_id, moneda, monto, transaccion_id, concepto, fecha, usuario_id, estado, estado_fecha)
SELECT o.intermediario_id, t.moneda, -t.monto, t.id,
       CASE WHEN t.estado = 'ejecutada' THEN 'Transacción ejecutada' ELSE 'Transacción pendiente' END,
       COALESCE(t.fecha_ejecucion, (t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
       t.usuario_id, 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.cobrador = 'intermediario' AND o.intermediario_id IS NOT NULL;

-- 5) Intermediario: pagador = intermediario → -monto (intermediario paga; deuda Pandy con intermediario)
INSERT INTO public.movimientos_cuenta_corriente_intermediario (intermediario_id, moneda, monto, transaccion_id, concepto, fecha, usuario_id, estado, estado_fecha)
SELECT o.intermediario_id, t.moneda, -t.monto, t.id,
       CASE WHEN t.estado = 'ejecutada' THEN 'Transacción ejecutada' ELSE 'Transacción pendiente' END,
       COALESCE(t.fecha_ejecucion, (t.created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE),
       t.usuario_id, 'cerrado', now()
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.pagador = 'intermediario' AND o.intermediario_id IS NOT NULL;
