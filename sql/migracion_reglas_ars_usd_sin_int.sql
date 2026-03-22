-- ARS-USD sin intermediario → tabla reglas_de_negocio (espejo de USD-ARS con mr ARS / me USD).
-- Requiere columna entidad_cc (sql/migracion_reglas_de_negocio_entidad_cc.sql).
-- Ejecutar en Supabase SQL Editor. Quita filas duplicadas en cc_modelo_reglas para el mismo tipo.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_cobrar'),
  -- P,E: par USD −me/+me en egreso ejecutada contrapartida false (anula doble registro; saldo neto USD 0; queda −mr ARS pendiente).
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

DELETE FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario IS FALSE;
