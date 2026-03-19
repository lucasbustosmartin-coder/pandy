-- Ajustes que no contradicen el Excel: solo filas Pendiente.
-- NO tocar filas Ejecutada (Tx1/Tx2/Tx3/Tx4 ejecutada deben seguir con incluir = true según Excel).
-- Referencia: docs/CC_MODELO_REFERENCIA.md.

-- Cliente: Tx2 pendiente + contrapartida ejecutada → incluir en mov (única fila que suma a saldo cuando Tx1 ejecutada).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_cliente = true
WHERE pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = true;

-- Intermediario: Tx4 pendiente no se muestra en detalle (Excel: estado Pendiente = N).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_intermediario = false
WHERE usa_intermediario = true AND pagador = 'intermediario' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente';
