-- ARS-USD + intermediario, P,E: egreso Pandy→Cliente ejecutado (contrapartida no ejecutada).
-- Negocio: lo ejecutado es USD → el neteo en CC cliente debe verse en USD (−me pendiente + +me cerrado en detalle),
-- no ocultar el +me ni compensar ARS con espejo +mr (ajuste en main.js sincronizarCcYCajaDesdeOrden).
--
-- Ejecutar en Supabase SQL Editor. Requiere UNIQUE con linea_motor.

UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_cliente = true
WHERE tipo_operacion_codigo = 'ARS-USD'
  AND usa_intermediario = true
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = false
  AND COALESCE(linea_motor, 0) = 0;
