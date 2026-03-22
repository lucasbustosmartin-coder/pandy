-- Ajuste de reglas CC para USD-ARS con intermediario siguiendo criterio Pandy-central:
-- 1) CC solo Pandy-Cliente y Pandy-Intermediario.
-- 2) Todo pendiente no impacta saldo ni detalle.
-- 3) Si Cliente->Pandy ejecutada y la contrapartida (Int->Cliente) sigue pendiente:
--    - En CC cliente: mantener deuda de Pandy en moneda entregada (-me) y mostrar espejo +mr en detalle.
--    - En CC intermediario: registrar -me (Pandy le debe al intermediario por fondeo).
--
-- Nota: este ajuste usa la tabla cc_modelo_reglas como fuente de verdad.

-- A) Base conservadora: en USD-ARS con intermediario, toda fila pendiente no impacta por defecto.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_suma_saldo = false,
  incluir_en_mov_cc_cliente = false,
  cc_intermediario_suma_saldo = false,
  incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND estado_transaccion = 'pendiente';

-- B) Cliente->Pandy ejecutada: exposición en moneda entregada (me) para reflejar deuda real de Pandy al cliente.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  concepto_leyenda = 'cobro_realizado',
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- C) Int->Cliente (tipo egreso): crear matriz explícita (4 combinaciones) porque no existía en todos los entornos.
--    - Pendiente + contrapartida ejecutada: +mr en detalle cliente (no saldo) y -me en CC intermediario (saldo+detalle).
--    - Resto: sin impacto por defecto.
INSERT INTO public.cc_modelo_reglas (
  tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada,
  cc_cliente_signo, cc_cliente_suma_saldo, incluir_en_mov_cc_cliente,
  cc_intermediario_signo, cc_intermediario_suma_saldo, incluir_en_mov_cc_intermediario,
  concepto_leyenda, usa_monto_efectivo,
  cc_cliente_moneda_exposicion, cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion, cc_intermediario_monto_referencia
) VALUES
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true,  0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'pendiente', false, 0, false, false, 0, false, false, NULL, false, NULL, NULL, NULL, NULL),
  ('USD-ARS', true, 'intermediario', 'cliente', 'egreso', false, 'pendiente', true,  1, false, true, -1, true, true, 'compromiso_pago', false, 'orden_recibida', 'mr', 'orden_entregada', 'me')
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
  cc_cliente_moneda_exposicion = EXCLUDED.cc_cliente_moneda_exposicion,
  cc_cliente_monto_referencia = EXCLUDED.cc_cliente_monto_referencia,
  cc_intermediario_moneda_exposicion = EXCLUDED.cc_intermediario_moneda_exposicion,
  cc_intermediario_monto_referencia = EXCLUDED.cc_intermediario_monto_referencia;

