-- Pandi – Ajuste USD-USD sin intermediario:
-- 1) Cobro Realizado (Cliente→Pandy, ingreso) en USD-USD se expone en monto transacción (bruto 10.000), no en me (9.700).
-- 2) Comisión del acuerdo ejecutada con par cliente cerrado suma al saldo (+300) para que E,E cierre en 0.
-- Ejecutar en Supabase SQL Editor.

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_moneda_exposicion = 'transaccion',
  cc_cliente_monto_referencia = 'monto_transaccion'
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = false
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false;

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = false
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = true
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = true;
