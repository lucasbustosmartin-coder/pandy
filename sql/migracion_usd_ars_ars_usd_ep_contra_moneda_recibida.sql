-- E,P sin intermediario (USD-ARS y ARS-USD): el cobro en moneda **recibida** del acuerdo se registra en la Trx de ingreso ejecutada
-- como par ± cerrado (cobro + contra); el compromiso abierto queda solo en moneda **entregada** en la Trx de egreso pendiente.
-- Ejecutar en Supabase SQL Editor tras backup. Idempotente vía ON CONFLICT de la PK de reglas_de_negocio.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'contra_cobro_entrega_pendiente'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'contra_cobro_entrega_pendiente'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
