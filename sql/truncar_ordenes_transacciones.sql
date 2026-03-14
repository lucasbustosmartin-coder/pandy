-- Borrar toda la transaccionalidad para volver a probar de cero.
-- Se borran: órdenes, instrumentación, transacciones, comisiones por orden, orden_comisiones_generadas, movimientos de caja y cuentas corrientes.
-- No se tocan: clientes, intermediarios, modos_pago, tipos_operacion, tipos_movimiento_caja, usuarios/seguridad.
-- Orden: primero tablas que referencian a otras (movimientos), luego transacciones, comisiones, orden_comisiones_generadas, instrumentación, órdenes.

TRUNCATE TABLE public.movimientos_cuenta_corriente CASCADE;
TRUNCATE TABLE public.movimientos_cuenta_corriente_intermediario CASCADE;
TRUNCATE TABLE public.movimientos_caja CASCADE;
TRUNCATE TABLE public.transacciones CASCADE;
TRUNCATE TABLE public.comisiones_orden CASCADE;
TRUNCATE TABLE public.orden_comisiones_generadas CASCADE;
TRUNCATE TABLE public.instrumentacion CASCADE;
TRUNCATE TABLE public.ordenes CASCADE;
-- Reset secuencia del número interno de orden (si existe) para que la próxima sea nº 1.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ordenes_numero_seq') THEN
    PERFORM setval('public.ordenes_numero_seq', 1, false);
  ELSIF (SELECT pg_get_serial_sequence('public.ordenes', 'numero')) IS NOT NULL THEN
    PERFORM setval(pg_get_serial_sequence('public.ordenes', 'numero'), 1, false);
  END IF;
END $$;