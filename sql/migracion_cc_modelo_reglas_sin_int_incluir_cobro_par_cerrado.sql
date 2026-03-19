-- Pandi: en tipos sin intermediario (ARS-USD, USD-USD, USD-ARS), con par cliente cerrado
-- la fila de ingreso Cliente→Pandy tenía incluir_en_mov_cc_cliente = false y no aparecía
-- "Cobro Realizado" en la solapa Movimientos. Pasar a true (el saldo no cambia).

UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_cliente = true
WHERE usa_intermediario = false
  AND tipo_operacion_codigo IN ('ARS-USD', 'USD-USD', 'USD-ARS')
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = true;
