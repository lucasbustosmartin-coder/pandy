-- Comisión Pandy explícita en USD-USD sin intermediario.
-- Objetivo:
-- - Mostrar "Comisión del acuerdo" en detalle.
-- - Cuando el par cliente está cerrado (ejecutada + contrapartida true), sumar +comisión al saldo
--   para cerrar contra cobro bruto -10000 y egreso +9700.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  condicion_estado_comision
) VALUES
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, false, true, 0, false, false, 'comision_acuerdo', false, 'transaccion', 'monto_transaccion', NULL, NULL, NULL),
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'transaccion', 'monto_transaccion', NULL, NULL, NULL),
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion', NULL, NULL, NULL),
  ('USD-USD', false, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, 'transaccion', 'monto_transaccion', NULL, NULL, NULL)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;
