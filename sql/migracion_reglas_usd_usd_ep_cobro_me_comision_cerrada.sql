-- USD-USD **E,P** (ingreso Cliente→Pandy ejecutado, egreso entrega al cliente pendiente):
-- cobro en CC por **me** (−me); comisión **mr−me** como línea **cerrada** **−318**; egreso pendiente solo **+mr** (sin segunda línea −me en la misma trx).
-- Aplica sin y con intermediario (misma clave `usa_intermediario`).
-- Idempotente. Ejecutar en Supabase SQL Editor en bases ya desplegadas.

-- Ingreso cobro ejecutado, contrapartida false (E,P): pasar de −monto_transacción (−mr) a −me.
UPDATE public.reglas_de_negocio
SET monto_origen = 'me'
WHERE tipo_operacion_codigo = 'USD-USD'
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = false
  AND linea = 0
  AND (monto_origen IS DISTINCT FROM 'me');

-- Quitar segunda línea −me del egreso pendiente con contrapartida ejecutada (E,P).
DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND entidad_cc = 'cliente'
  AND pagador IN ('pandy', 'intermediario')
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND linea = 1
  AND lower(monto_origen) = 'me'
  AND lower(concepto_leyenda) = 'compromiso_pago';

-- Comisión E,P: de pendiente/+1 a ejecutada/−1 (cargo al cliente, cerrada en motor vía rama E,P).
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 0,
   'USD', -1, 'mr_menos_me', true, 'comision_acuerdo'),
  ('USD-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 0,
   'USD', -1, 'mr_menos_me', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- Obsoleto: fila comisión E,P pendiente/false (+318).
DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = false
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = true
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = false
  AND linea = 0
  AND lower(monto_origen) = 'mr_menos_me';
