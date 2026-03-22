-- USD-ARS + intermediario — combinación P,E (Tx1 ingreso Cliente→Intermediario pendiente, Tx2 egreso Pandy→Cliente ejecutado).
-- Cliente debe USD (mr); Pandy pagó al cliente en ARS (me). CC cliente: −me ARS + +me ARS = 0; −mr USD queda en saldo.
-- Requiere UNIQUE con linea_motor (sql/migracion_cc_modelo_reglas_linea_motor.sql).
-- Fuente consolidada: sql/migracion_cc_modelo_reglas_usd_ars_intermediario_flujo_inverso_operativo.sql

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_cobrar',
  cc_intermediario_signo = 0,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'ingreso'
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
  'USD-ARS', true, 'cliente', 'intermediario', 'ingreso', false, 'pendiente', true,
  -1, true, true,
  0, false, false,
  'compromiso_cobrar', false,
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
