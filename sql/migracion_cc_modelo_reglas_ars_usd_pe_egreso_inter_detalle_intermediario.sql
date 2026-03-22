-- ARS-USD con intermediario — egreso Pandy→Cliente cuando la contrapartida (ingreso C→Int) aún NO está ejecutada (P,E).
-- Ajuste de negocio:
-- 1) CC intermediario: +me en USD (lo que Pandy pagó al circuito en moneda entregada).
-- 2) Detalle cliente: incluir_en_mov_cc_cliente = true en el +me del egreso para listar −me (ingreso pendiente) y +me (egreso ejecutado) en USD.
--    La deuda ARS (−mr, línea motor 1) permanece hasta ejecutar el ingreso; no espejo +mr ARS desde main.js en este caso.
--
-- Ejecutar en Supabase SQL Editor. Requiere UNIQUE con linea_motor (migracion_cc_modelo_reglas_linea_motor.sql).

UPDATE public.cc_modelo_reglas
SET
  incluir_en_mov_cc_cliente = true,
  cc_intermediario_signo = 1,
  cc_intermediario_suma_saldo = true,
  incluir_en_mov_cc_intermediario = true,
  cc_intermediario_moneda_exposicion = 'orden_entregada',
  cc_intermediario_monto_referencia = 'me'
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = false
  AND COALESCE(linea_motor, 0) = 0;
