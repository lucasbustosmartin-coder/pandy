-- =============================================================================
-- Reaplicar matriz canónica SOLO para CHEQUE-ARS con intermediario (usa_intermediario = true).
-- Caso típico que se rompe si faltan filas: combinación P,P,P,E → saldo intermediario
-- debe ser -197000 (-200k exposición Tx3 con Tx4 ejecutada + comisión 3k), no solo -3000.
--
-- Ejecutar en Supabase SQL Editor (mismo proyecto que usa la app / .env.test).
-- Luego: truncar E2E o re-correr el test 01-cc-combinaciones.
--
-- Nota: es un subconjunto idéntico a sql/cc_modelo_reglas_todas_combinaciones.sql §1
-- (solo filas tipo_operacion_codigo = 'CHEQUE-ARS').
-- =============================================================================

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo, condicion_estado_comision
) VALUES
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true,  -1, true,  true,  0, false, false, 'cobro_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', false,  0, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', false, 'pendiente', true,  -1, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,  1, true,  true,  0, false, false, 'compromiso_pago', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,  1, false, false, 0, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true,  0, false, false, -1, true,  true,  'pago_realizado', false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', false, 0, false, false, -1, false, false, NULL, false, NULL),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', false, 'pendiente', true,  0, false, false, -1, true,  true,  NULL, false, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', false, 0, false, false,  1, false, false, 'cobro_realizado', true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true,  0, false, false,  1, true,  true,  'cobro_realizado', true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', false, 0, false, false,  1, false, false, NULL, true, NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'ingreso', false, 'pendiente', true,  0, false, false,  1, false, false, NULL, true, NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true,  1, true,  true, 0, false, false, 'comision_acuerdo', false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 1, false, false, 0, false, false, NULL, false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'ingreso', true, 'pendiente', true,  1, true,  true, 0, false, false, NULL, false, 'par_cliente'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, false, false,  1, false, true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true,  0, false, false,  1, true,  true,  'comision_acuerdo', false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, false, false,  1, false, false, NULL, false, 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'pandy', 'intermediario', 'egreso', true, 'pendiente', true,  0, false, false,  1, true,  true,  NULL, false, 'par_pandy_int')
ON CONFLICT (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor)
DO UPDATE SET
  cc_cliente_signo = EXCLUDED.cc_cliente_signo,
  cc_cliente_suma_saldo = EXCLUDED.cc_cliente_suma_saldo,
  incluir_en_mov_cc_cliente = EXCLUDED.incluir_en_mov_cc_cliente,
  cc_intermediario_signo = EXCLUDED.cc_intermediario_signo,
  cc_intermediario_suma_saldo = EXCLUDED.cc_intermediario_suma_saldo,
  incluir_en_mov_cc_intermediario = EXCLUDED.incluir_en_mov_cc_intermediario,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  usa_monto_efectivo = EXCLUDED.usa_monto_efectivo,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;
