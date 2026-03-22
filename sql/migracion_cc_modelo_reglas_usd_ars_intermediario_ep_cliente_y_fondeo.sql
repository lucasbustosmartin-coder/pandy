-- Ajuste E,P para USD-ARS con intermediario (Pandy central)
-- Objetivo:
-- - Si Cliente->Pandy está ejecutada y la pata de fondeo sigue pendiente,
--   en CC cliente mostrar: +mr y -mr (detalle) y -me (saldo+detalle).
-- - En CC intermediario mostrar -me (saldo+detalle).

-- 1) Cliente->Pandy ejecutada: exponer deuda en moneda entregada (me).
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

-- 1b) Intermediario->Cliente ejecutada compensa saldo cliente en moneda entregada (me),
--     y mantiene deuda de Pandy con intermediario en la misma moneda.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  cc_intermediario_signo = -1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'intermediario'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- 2) Pandy->Intermediario pendiente con contrapartida ejecutada:
--    +mr solo detalle en CC cliente, y -me saldo+detalle en CC intermediario.
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = false,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_recibida',
  cc_cliente_monto_referencia = 'mr',
  cc_intermediario_signo = -1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;

-- 3) Normalizar moneda exposición de Pandy->Intermediario (evita fallback en USD).
UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false;

