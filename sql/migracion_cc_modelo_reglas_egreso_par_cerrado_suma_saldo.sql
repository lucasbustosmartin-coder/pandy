-- Pandi: egreso Pandy→Cliente con par cerrado debe sumar al saldo (+me en moneda transacción)
-- para cerrar contra el ingreso en exposición (-me en USD). Sin esto el saldo queda solo con la pata de ingreso.
-- Ejecutar en Supabase si ya tenías cargada la sección 2 sin este ajuste.

UPDATE public.cc_modelo_reglas
SET cc_cliente_suma_saldo = true
WHERE usa_intermediario = false
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = true
  AND tipo_operacion_codigo IN ('ARS-USD', 'USD-USD', 'USD-ARS');
