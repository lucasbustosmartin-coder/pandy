-- Borrar toda la transaccionalidad para volver a probar de cero.
-- Se borran: órdenes, instrumentación, transacciones, comisiones por orden, movimientos de caja y cuentas corrientes.
-- No se tocan: clientes, intermediarios, modos_pago, tipos_operacion, tipos_movimiento_caja, usuarios/seguridad.
-- Orden: primero tablas que referencian a otras (movimientos), luego transacciones, comisiones, instrumentación, órdenes.

TRUNCATE TABLE public.movimientos_cuenta_corriente CASCADE;
TRUNCATE TABLE public.movimientos_cuenta_corriente_intermediario CASCADE;
TRUNCATE TABLE public.movimientos_caja CASCADE;
TRUNCATE TABLE public.transacciones CASCADE;
TRUNCATE TABLE public.comisiones_orden CASCADE;
TRUNCATE TABLE public.instrumentacion CASCADE;
TRUNCATE TABLE public.ordenes CASCADE;
