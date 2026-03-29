-- USD-EUR+int y EUR-USD+int (patrón ci_pc, espejo USD-ARS / ARS-USD):
-- 1) compromiso_cobrar ingreso pendiente C→Inter: signo +1 en me/mr (Pendiente de cobro en UI).
-- 2) compromiso_pago egreso P→C ejecutada con contrapartida_ejecutada = false: signo −1 en me (anula P,E).

-- USD-EUR: pendiente (líneas 0 EUR me, 1 USD mr)
UPDATE public.reglas_de_negocio
SET signo = 1
WHERE tipo_operacion_codigo = 'USD-EUR'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'pendiente'
  AND COALESCE(contrapartida_ejecutada, false) = true
  AND (
    (linea = 0 AND moneda = 'EUR' AND monto_origen = 'me' AND concepto_leyenda = 'compromiso_cobrar')
    OR (linea = 1 AND moneda = 'USD' AND monto_origen = 'mr' AND concepto_leyenda = 'compromiso_cobrar')
  );

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'USD-EUR'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'ejecutada'
  AND COALESCE(contrapartida_ejecutada, false) = false
  AND linea = 0
  AND moneda = 'EUR'
  AND monto_origen = 'me'
  AND concepto_leyenda = 'compromiso_pago';

-- EUR-USD: pendiente (línea 0 USD me, 1 EUR mr)
UPDATE public.reglas_de_negocio
SET signo = 1
WHERE tipo_operacion_codigo = 'EUR-USD'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'pendiente'
  AND COALESCE(contrapartida_ejecutada, false) = true
  AND (
    (linea = 0 AND moneda = 'USD' AND monto_origen = 'me' AND concepto_leyenda = 'compromiso_cobrar')
    OR (linea = 1 AND moneda = 'EUR' AND monto_origen = 'mr' AND concepto_leyenda = 'compromiso_cobrar')
  );
