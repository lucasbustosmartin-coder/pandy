-- USD-ARS sin int, P,E (histórico): quitaba la línea USD (linea 1, mr_prorrateado) del egreso ejecutado.
-- **Modelo actual:** dos líneas **ARS** −/+ `monto_transaccion` en ese egreso; ver `sql/reglas_de_negocio_tabla.sql`
-- y `sql/migracion_reglas_usd_ars_sin_int_pe_egreso_dos_lineas_ars.sql`. Este DELETE sigue siendo idempotente
-- si en alguna base vieja quedó la fila USD en P,E.

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
