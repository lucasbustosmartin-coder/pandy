-- Pandi – Condición de estado para comisiones en cc_modelo_reglas
-- Cuando una comisión no tiene una sola transacción, su "estado efectivo" se deriva de una condición.
-- El motor del front (estadoEfectivoComision) interpreta el nombre; la tabla es la fuente de verdad.
--
-- Valores:
--   par_pandy_int: ejecutada si al menos Tx3 o Tx4 ejecutada (Comisión Intermediario).
--   par_cliente:   ejecutada si par cerrado (Tx1 y Tx2) O Tx2 ejecutada (Comisión Pandy; así P,E,P,P → saldo 200k, detalle 195k+5k).
--   NULL:          siempre ejecutada.

ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS condicion_estado_comision text;

COMMENT ON COLUMN public.cc_modelo_reglas.condicion_estado_comision IS 'Para es_comision=true: condicion para derivar estado efectivo. par_pandy_int = ejecutada si alguna Tx Pandy↔Int ejecutada. par_cliente = ejecutada si par cliente cerrado o Tx2 ejecutada. Null = siempre ejecutada.';

UPDATE public.cc_modelo_reglas
SET condicion_estado_comision = 'par_pandy_int'
WHERE pagador = 'pandy' AND cobrador = 'intermediario' AND tipo_transaccion = 'egreso' AND es_comision = true;

UPDATE public.cc_modelo_reglas
SET condicion_estado_comision = 'par_cliente'
WHERE pagador = 'cliente' AND cobrador = 'pandy' AND tipo_transaccion = 'ingreso' AND es_comision = true;
