-- USD-ARS sin int, P,E: quitar línea USD (linea 1, mr_prorrateado) del egreso ejecutado cuando
-- contrapartida_ejecutada = false (ingreso Tx1 aún pendiente). Evita netear USD a 0 en el resumen.
-- E,E sigue usando egreso ejecutada + contrapartida_ejecutada = true (ARS + USD).

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario IS FALSE
  AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision IS FALSE
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada IS FALSE
  AND linea = 1
  AND moneda = 'USD'
  AND monto_origen = 'mr_prorrateado';
