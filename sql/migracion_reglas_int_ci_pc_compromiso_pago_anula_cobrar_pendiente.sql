-- USD-ARS+int y ARS-USD+int (patrón ci_pc, 2 tx): con ingreso pendiente el compromiso_cobrar quedó en signo +.
-- El egreso ejecutado con contrapartida_ejecutada = false debe usar signo − en la misma moneda (me) para anular;
-- la fila con contrapartida_ejecutada = true se mantiene en +1 (cierra contra cobro_realizado del ingreso ejecutado).

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND COALESCE(contrapartida_ejecutada, false) = false
  AND linea = 0
  AND moneda = 'ARS'
  AND monto_origen = 'me'
  AND concepto_leyenda = 'compromiso_pago';

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND COALESCE(contrapartida_ejecutada, false) = false
  AND linea = 0
  AND moneda = 'USD'
  AND monto_origen = 'me'
  AND concepto_leyenda = 'compromiso_pago';

-- Espejo EUR (misma fila lógica que USD-ARS / ARS-USD en bases con cruces EUR).
UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'EUR-ARS'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND COALESCE(contrapartida_ejecutada, false) = false
  AND linea = 0
  AND moneda = 'ARS'
  AND monto_origen = 'me'
  AND concepto_leyenda = 'compromiso_pago';

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'EUR-USD'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND COALESCE(contrapartida_ejecutada, false) = false
  AND linea = 0
  AND moneda = 'USD'
  AND monto_origen = 'me'
  AND concepto_leyenda = 'compromiso_pago';
