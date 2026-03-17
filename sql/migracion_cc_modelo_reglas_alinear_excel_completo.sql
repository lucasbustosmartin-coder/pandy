-- REGLA MADRE: dejar la tabla cc_modelo_reglas igual que el Excel (CC_MODELO).
-- Si el detalle de CC Cliente o Intermediario sale vacío con transacciones ejecutadas, ejecutá ESTE script en Supabase.
-- En el Excel: todas las filas Ejecutada tienen Y en INCLUIR MOV (cliente o intermediario según corresponda).

-- Cliente: Tx1 y Tx2 ejecutada → incluir en mov (Excel filas 76, 77).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_cliente = true
WHERE tipo_transaccion IN ('ingreso', 'egreso') AND es_comision = false AND estado_transaccion = 'ejecutada'
  AND ((pagador = 'cliente' AND cobrador = 'pandy') OR (pagador = 'pandy' AND cobrador = 'cliente'));

-- Cliente: Comisión Pandy ejecutada (incl. cuando par cerrado) → incluir (Excel fila 84).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_cliente = true
WHERE pagador = 'cliente' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = true
  AND estado_transaccion = 'ejecutada';

-- Intermediario: Tx4 ejecutada → incluir en mov (Excel fila 79: -197.000 con Y).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_intermediario = true
WHERE usa_intermediario = true AND pagador = 'intermediario' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- Tx4 pendiente sigue sin incluir en detalle (Excel: estado Pendiente = N).
UPDATE public.cc_modelo_reglas
SET incluir_en_mov_cc_intermediario = false
WHERE usa_intermediario = true AND pagador = 'intermediario' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente';
