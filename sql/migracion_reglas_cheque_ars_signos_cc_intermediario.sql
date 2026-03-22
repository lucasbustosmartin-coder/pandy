-- CHEQUE-ARS + intermediario: ajuste de signos en CC del intermediario (sin reinsertar toda la matriz).
-- Convención: + monto del cheque entregado por Pandy al int (Tx3); − comisión del intermediario;
-- − efectivo que el int devuelve a Pandy (Tx4). Suma = deuda neta coherente con el acuerdo.
-- Idempotente. Tras ejecutar, resincronizar órdenes afectadas (app / RPC sync) o reabrir instrumentación.
--
-- Ver: docs/CHEQUE_ARS_INTERMEDIARIO.md, tests/e2e/cc-combinaciones-esperado.js

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'CHEQUE-ARS' AND usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND pagador = 'pandy' AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso' AND es_comision = false
  AND concepto_leyenda = 'pago_realizado';

UPDATE public.reglas_de_negocio SET signo = -1
WHERE tipo_operacion_codigo = 'CHEQUE-ARS' AND usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND pagador = 'intermediario' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND concepto_leyenda = 'cobro_realizado';

UPDATE public.reglas_de_negocio SET signo = -1
WHERE tipo_operacion_codigo = 'CHEQUE-ARS' AND usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND pagador = 'pandy' AND cobrador = 'intermediario'
  AND tipo_transaccion = 'egreso' AND es_comision = true
  AND concepto_leyenda = 'comision_acuerdo';
