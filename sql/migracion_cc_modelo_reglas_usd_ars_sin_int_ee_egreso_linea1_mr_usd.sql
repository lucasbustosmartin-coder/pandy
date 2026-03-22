-- USD-ARS sin intermediario — combinación E,E (Tx1 y Tx2 ejecutadas, Cliente↔Pandy).
-- Con reglas que definen cc_cliente_moneda_exposicion, main.js NO aplica el cierre sintético en dos monedas
-- (ver reglasUsanExposicionCcCliente + bloque "Cierre orden en dos monedas").
-- El egreso en ARS cierra la pata ARS; el compromiso +mr en USD del ingreso ejecutado queda +5000 USD en saldo
-- si no se compensa con −mr USD en la misma lógica que E,P con intermediario.
-- Solución: segunda fila motor (linea_motor = 1) en egreso ejecutada con contrapartida_ejecutada = true: −mr en orden_recibida (USD).
--
-- Ejecutar en Supabase SQL Editor (requisitos: linea_motor + UNIQUE ya aplicados).

UPDATE public.cc_modelo_reglas
SET linea_motor = 0
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = false
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
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
  'USD-ARS', false, 'pandy', 'cliente', 'egreso', false, 'ejecutada', true,
  -1, true, true,
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
