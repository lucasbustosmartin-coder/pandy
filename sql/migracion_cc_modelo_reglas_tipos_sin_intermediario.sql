-- Pandi – Reglas CC para tipos activos sin intermediario (ARS-USD, USD-USD, USD-ARS)
-- Ejecutar en Supabase SQL Editor para agregar las reglas si la tabla cc_modelo_reglas ya existía solo con ARS-ARS/CHEQUE-ARS.

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo
)
SELECT codigo, false, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  0, false, false,
  concepto_leyenda, usa_monto_efectivo
FROM (VALUES
  ('ARS-USD'), ('USD-USD'), ('USD-ARS')
) AS t(codigo)
CROSS JOIN (VALUES
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, false, true, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, false, true, 'cobro_realizado', false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, NULL, false),
  ('cliente', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, false, true, 'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, false, true, 'compromiso_pago', false),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, NULL, false),
  ('pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, true, false, NULL, false)
) AS r(pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente, concepto_leyenda, usa_monto_efectivo)
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada) DO NOTHING;
