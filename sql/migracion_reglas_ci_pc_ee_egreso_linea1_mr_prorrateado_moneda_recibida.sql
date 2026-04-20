-- Corrige **E,E** `ci_pc` (ingreso C→I y egreso P→C **ejecutados**): la fila **linea = 1** del egreso Pandy→Cliente con
-- `contrapartida_ejecutada = true` debía ser **+mr_prorrateado** en la **moneda recibida** del acuerdo (igual que cruces **sin** intermediario),
-- no un segundo **−monto_transacción** en la moneda **entregada**. Ese par ± en monE neteaba el egreso en 0 en ARS/USD y dejaba
-- el **−me** del ingreso ejecutado sin contrapartida → invariante «CC cliente no netea a cero (residual −me)» y no se persistía sync.
--
-- Sustituye el efecto erróneo de `sql/migracion_reglas_ci_pc_egreso_pandy_ee_linea1_negativo.sql` para estos códigos + int.
-- Idempotente: cada UPDATE solo afecta filas que aún tienen el patrón viejo (monto_origen = monto_transacción, signo = −1, moneda = moneda entregada típica del tipo).
--
-- Ejecutar en Supabase SQL Editor y **resincronizar** órdenes USD-ARS / ARS-USD / EUR+int afectadas.

UPDATE public.reglas_de_negocio
SET moneda = 'USD', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada' AND contrapartida_ejecutada = true AND linea = 1
  AND moneda = 'ARS' AND signo = -1 AND monto_origen = 'monto_transaccion';

UPDATE public.reglas_de_negocio
SET moneda = 'ARS', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'ARS-USD' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada' AND contrapartida_ejecutada = true AND linea = 1
  AND moneda = 'USD' AND signo = -1 AND monto_origen = 'monto_transaccion';

UPDATE public.reglas_de_negocio
SET moneda = 'USD', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-EUR' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada' AND contrapartida_ejecutada = true AND linea = 1
  AND moneda = 'EUR' AND signo = -1 AND monto_origen = 'monto_transaccion';

UPDATE public.reglas_de_negocio
SET moneda = 'EUR', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'EUR-USD' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada' AND contrapartida_ejecutada = true AND linea = 1
  AND moneda = 'USD' AND signo = -1 AND monto_origen = 'monto_transaccion';

UPDATE public.reglas_de_negocio
SET moneda = 'EUR', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'EUR-ARS' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada' AND contrapartida_ejecutada = true AND linea = 1
  AND moneda = 'ARS' AND signo = -1 AND monto_origen = 'monto_transaccion';

UPDATE public.reglas_de_negocio
SET moneda = 'ARS', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'ARS-EUR' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND estado_transaccion = 'ejecutada' AND contrapartida_ejecutada = true AND linea = 1
  AND moneda = 'EUR' AND signo = -1 AND monto_origen = 'monto_transaccion';

-- Fase B: corrige la **misma** fila lógica si en la base `signo`/`monto_origen` ya no coinciden con el patrón viejo
-- (p. ej. edición manual) pero **sigue** la moneda errónea de línea 1 (moneda entregada en lugar de recibida).
UPDATE public.reglas_de_negocio
SET moneda = 'USD', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-ARS' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND lower(trim(estado_transaccion::text)) = 'ejecutada' AND contrapartida_ejecutada IS TRUE AND linea = 1
  AND moneda = 'ARS';

UPDATE public.reglas_de_negocio
SET moneda = 'ARS', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'ARS-USD' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND lower(trim(estado_transaccion::text)) = 'ejecutada' AND contrapartida_ejecutada IS TRUE AND linea = 1
  AND moneda = 'USD';

UPDATE public.reglas_de_negocio
SET moneda = 'USD', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'USD-EUR' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND lower(trim(estado_transaccion::text)) = 'ejecutada' AND contrapartida_ejecutada IS TRUE AND linea = 1
  AND moneda = 'EUR';

UPDATE public.reglas_de_negocio
SET moneda = 'EUR', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'EUR-USD' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND lower(trim(estado_transaccion::text)) = 'ejecutada' AND contrapartida_ejecutada IS TRUE AND linea = 1
  AND moneda = 'USD';

UPDATE public.reglas_de_negocio
SET moneda = 'EUR', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'EUR-ARS' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND lower(trim(estado_transaccion::text)) = 'ejecutada' AND contrapartida_ejecutada IS TRUE AND linea = 1
  AND moneda = 'ARS';

UPDATE public.reglas_de_negocio
SET moneda = 'ARS', signo = 1, monto_origen = 'mr_prorrateado', incluir_en_detalle = true, concepto_leyenda = 'compromiso_pago'
WHERE tipo_operacion_codigo = 'ARS-EUR' AND usa_intermediario = true AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso' AND es_comision = false
  AND lower(trim(estado_transaccion::text)) = 'ejecutada' AND contrapartida_ejecutada IS TRUE AND linea = 1
  AND moneda = 'EUR';
