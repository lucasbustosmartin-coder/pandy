-- USD-USD: P,P con comisión implícita (mr > me) — CC cliente sin duplicar el nominal mr.
-- Aplicar en Supabase (dev/prod) si la tabla ya existía con la matriz anterior.
--
-- 1) Eliminar la fila «Compromiso de Pago» egreso pendiente con contrapartida_ejecutada = false,
--    linea = 0, monto_origen = mr (+mr en CC; sobraba junto a comisión mr_menos_me e ingreso en mr).
-- 2) Ingreso pendiente misma clave (compromiso_cobrar, contrapartida false): monto_origen = me.

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND es_comision = false
  AND tipo_transaccion = 'egreso'
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = false
  AND linea = 0
  AND moneda = 'USD'
  AND signo = 1
  AND monto_origen = 'mr'
  AND concepto_leyenda = 'compromiso_pago'
  AND entidad_cc = 'cliente'
  AND pagador IN ('pandy', 'intermediario')
  AND cobrador = 'cliente';

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND es_comision = false
  AND tipo_transaccion = 'egreso'
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = false
  AND linea = 0
  AND moneda = 'USD'
  AND signo = 1
  AND monto_origen = 'mr'
  AND concepto_leyenda = 'compromiso_pago'
  AND entidad_cc = 'intermediario'
  AND pagador = 'pandy'
  AND cobrador = 'cliente';

UPDATE public.reglas_de_negocio
SET monto_origen = 'me'
WHERE tipo_operacion_codigo = 'USD-USD'
  AND es_comision = false
  AND tipo_transaccion = 'ingreso'
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = false
  AND linea = 0
  AND concepto_leyenda = 'compromiso_cobrar'
  AND pagador = 'cliente'
  AND cobrador IN ('pandy', 'intermediario')
  AND monto_origen = 'monto_transaccion';
