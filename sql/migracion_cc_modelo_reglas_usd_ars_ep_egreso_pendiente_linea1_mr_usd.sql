-- USD-ARS + intermediario — combinación E,P (Tx1 ingreso Cliente→Intermediario ejecutada, Tx2 egreso Pandy→Cliente pendiente).
-- 1) USD en saldo cliente: el ingreso solo suma −me ARS; no hay +mr USD en saldo que compense un −mr. La fila linea_motor=1 con cc_cliente_suma_saldo=true dejaba “debe USD” (−5000) mal. Mantener cc_cliente_suma_saldo=false; el par USD en detalle lo arma main.js (espejos ingreso).
-- 2) ARS: el −me en CC cliente debe salir UNA sola vez del ingreso ejecutado (A). La fila egreso pendiente linea_motor = 0 no debe volver a sumar −me
--    (evita −10M ARS). Ver también UPDATE D en migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql.
--
-- Requiere UNIQUE con linea_motor (sql/migracion_cc_modelo_reglas_linea_motor.sql).
-- Ejecutar en Supabase SQL Editor después de migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql.

-- Fila linea_motor = 0: sin movimiento CC cliente (el −me ARS ya está en el ingreso ejecutado).
UPDATE public.cc_modelo_reglas
SET
  linea_motor = 0,
  cc_cliente_suma_saldo = false,
  incluir_en_mov_cc_cliente = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND COALESCE(linea_motor, 0) = 0;

INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia,
  linea_motor
) VALUES (
  'USD-ARS', true, 'pandy', 'cliente', 'egreso', false, 'pendiente', true,
  -1, false, false,
  0, false, false,
  'compromiso_pago', false,
  'orden_recibida', 'mr',
  NULL, NULL,
  1
)
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador,
  tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada, linea_motor
)
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
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

-- Idempotente: bases que ya tenían linea_motor=1 con suma true.
UPDATE public.cc_modelo_reglas
SET cc_cliente_suma_saldo = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND linea_motor = 1;
