-- USD-ARS con intermediario (cierre E,E para cliente):
-- cuando se ejecuta Pandy->Intermediario, debe compensar CC cliente en +me
-- (mismo efecto que si pagara al cliente en forma directa), manteniendo trazabilidad Pandy-Intermediario.

UPDATE public.cc_modelo_reglas
SET
  cc_cliente_signo = 1,
  cc_cliente_suma_saldo = true,
  incluir_en_mov_cc_cliente = true,
  cc_cliente_moneda_exposicion = 'orden_entregada',
  cc_cliente_monto_referencia = 'me',
  concepto_leyenda = 'compromiso_pago',
  cc_intermediario_signo = -1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me'
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

