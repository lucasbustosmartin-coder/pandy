-- Pandi: CC cliente con intermediario — transacciones independientes en el detalle.
-- Quita filas que sumaban un movimiento +mr en la moneda del acuerdo al cerrar la contrapartida (E,E),
-- generando un espejo entre transacciones (p. ej. −783 USD del ingreso C→Pandy y +783 USD en el egreso Int→Cliente).
--
-- Idempotente (DELETE sin error si ya no existen filas). Ejecutar en Supabase tras alinear el repo.
-- Canónico actualizado: sql/reglas_de_negocio_tabla.sql

DELETE FROM public.reglas_de_negocio
WHERE COALESCE(usa_intermediario, false) = true
  AND entidad_cc = 'cliente'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada IS TRUE
  AND linea = 2
  AND monto_origen = 'mr'
  AND concepto_leyenda = 'cobro_realizado'
  AND tipo_transaccion = 'egreso'
  AND pagador = 'intermediario'
  AND cobrador = 'cliente';

DELETE FROM public.reglas_de_negocio
WHERE COALESCE(usa_intermediario, false) = true
  AND entidad_cc = 'cliente'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada IS TRUE
  AND linea = 2
  AND monto_origen = 'mr'
  AND concepto_leyenda = 'cobro_realizado'
  AND tipo_transaccion = 'ingreso'
  AND pagador = 'cliente'
  AND cobrador = 'intermediario';
