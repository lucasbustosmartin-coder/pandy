-- Pandi – CC modelo: ingreso Cliente→Pandy pendiente con contrapartida (egreso) ya ejecutada.
-- Antes: exposición orden_entregada + me en USD anulaba en saldo el +me del compromiso del egreso (saldo neto 0 con Tx1 pendiente).
-- Ahora (fuente de verdad cc_modelo_reglas): moneda RECIBIDA + mr, concepto compromiso_cobrar, visible en detalle.
-- Aplicable a ARS-USD, USD-USD, USD-ARS sin intermediario.
-- Ejecutar en Supabase SQL Editor.

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_moneda_exposicion = 'orden_recibida',
  cc_cliente_monto_referencia = 'mr',
  concepto_leyenda = 'compromiso_cobrar',
  incluir_en_mov_cc_cliente = true,
  cc_cliente_signo = -1,
  cc_cliente_suma_saldo = true
WHERE usa_intermediario = false
  AND tipo_operacion_codigo IN ('ARS-USD', 'USD-USD', 'USD-ARS')
  AND pagador = 'cliente'
  AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;
