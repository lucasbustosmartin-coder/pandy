-- Comisión Intermediario (pendiente, true): activar suma al saldo para que E,E,E,P dé saldo int -197.000 (-200k + 3k).
-- Ejecutar en Supabase SQL Editor.
-- Referencia: cc_modelo_reglas_todas_combinaciones.sql (misma corrección en el INSERT completo).

UPDATE public.cc_modelo_reglas
SET cc_intermediario_suma_saldo = true
WHERE tipo_operacion_codigo IN ('ARS-ARS', 'CHEQUE-ARS')
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso'
  AND es_comision = true
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;
