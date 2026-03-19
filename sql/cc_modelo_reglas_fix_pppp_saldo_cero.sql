-- =============================================================================
-- Fix P,P,P,P: saldo 0 cliente y 0 intermediario (todo pendiente = nadie le debe a nadie).
-- Referencia: docs/CC_MODELO_REFERENCIA.md "Inicial (todo Pendiente) | 0 | 0".
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

-- 1) Tx3 (Pandy→Int egreso): pendiente con contrapartida NO ejecutada → no debe sumar al saldo int.
UPDATE public.cc_modelo_reglas
SET cc_intermediario_suma_saldo = false
WHERE tipo_operacion_codigo IN ('ARS-ARS', 'CHEQUE-ARS')
  AND usa_intermediario = true
  AND pagador = 'pandy' AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false;

-- 2) Comisión Pandy (Cliente→Pandy ingreso, comisión): pendiente con nada ejecutado → no suma ni en detalle cliente.
UPDATE public.cc_modelo_reglas
SET cc_cliente_suma_saldo = false, incluir_en_mov_cc_cliente = false
WHERE tipo_operacion_codigo IN ('ARS-ARS', 'CHEQUE-ARS')
  AND usa_intermediario = true
  AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = true
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false;

-- 3) Comisión Intermediario: si Tx3 y Tx4 pendientes, no incluir en detalle int (detalle vacío, saldo 0).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo IN ('ARS-ARS', 'CHEQUE-ARS')
  AND usa_intermediario = true
  AND pagador = 'pandy' AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso' AND es_comision = true
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false;

-- 4) Tx4 (Int→Pandy ingreso): pendiente con contrapartida NO ejecutada → no incluir en mov (era la fila que generaba el 197k con incluir Y; el front la enviaba con sumar_al_saldo false pero la RPC no persiste esa columna → default true → sumaba).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_intermediario = false
WHERE tipo_operacion_codigo IN ('ARS-ARS', 'CHEQUE-ARS')
  AND usa_intermediario = true
  AND pagador = 'intermediario' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false;
