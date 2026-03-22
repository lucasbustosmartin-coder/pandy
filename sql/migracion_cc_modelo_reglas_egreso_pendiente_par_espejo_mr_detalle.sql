-- Pandi – CC sin intermediario: egreso pendiente con contrapartida ejecutada (E,P)
-- Objetivo: mostrar línea espejo +mr en moneda recibida para conciliar visualmente Movimientos con Saldos.
-- No altera saldo: sumar_al_saldo permanece false.
-- Ejecutar en Supabase SQL Editor.

UPDATE public.cc_modelo_reglas
SET
  incluir_en_mov_cc_cliente = true,
  concepto_leyenda = 'compromiso_pago',
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = false,
  cc_cliente_moneda_exposicion = 'orden_recibida',
  cc_cliente_monto_referencia = 'mr'
WHERE usa_intermediario = false
  AND tipo_operacion_codigo IN ('ARS-USD', 'USD-ARS', 'USD-USD')
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true;
