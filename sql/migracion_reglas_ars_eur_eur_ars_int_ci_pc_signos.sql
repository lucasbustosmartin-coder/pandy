-- ARS-EUR+int y EUR-ARS+int (patrón ci_pc): mismo criterio que USD-EUR / EUR-USD y USD-ARS / ARS-USD.
-- 1) compromiso_cobrar ingreso pendiente C→Inter: +1 en me/mr.
-- 2) compromiso_pago egreso P→C, contrapartida_ejecutada = false: −1 en me (moneda entregada al cliente).

-- ARS-EUR: pendiente (línea 0 EUR me, 1 ARS mr)
UPDATE public.reglas_de_negocio
SET signo = 1
WHERE tipo_operacion_codigo = 'ARS-EUR'
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
    OR (linea = 1 AND moneda = 'ARS' AND monto_origen = 'mr' AND concepto_leyenda = 'compromiso_cobrar')
  );

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'ARS-EUR'
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

-- EUR-ARS: pendiente (línea 0 ARS me, 1 EUR mr). Egreso P→C false ya debía ser −1 en ARS; idempotente si quedó +1.
UPDATE public.reglas_de_negocio
SET signo = 1
WHERE tipo_operacion_codigo = 'EUR-ARS'
  AND usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
  AND COALESCE(es_comision, false) = false
  AND estado_transaccion = 'pendiente'
  AND COALESCE(contrapartida_ejecutada, false) = true
  AND (
    (linea = 0 AND moneda = 'ARS' AND monto_origen = 'me' AND concepto_leyenda = 'compromiso_cobrar')
    OR (linea = 1 AND moneda = 'EUR' AND monto_origen = 'mr' AND concepto_leyenda = 'compromiso_cobrar')
  );

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
