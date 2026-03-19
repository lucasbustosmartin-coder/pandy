-- Pandi – cc_modelo_reglas: moneda y referencia de monto para exposición en CC (cliente e intermediario).
-- Ejecutar en Supabase SQL Editor después de tener la tabla cc_modelo_reglas.
--
-- cc_*_moneda_exposicion: orden_recibida | orden_entregada | transaccion (minúsculas).
-- cc_*_monto_referencia: mr | me | monto_transaccion | monto_efectivo_intermediario (solo lado int., opcional).
-- NULL en ambas columnas de un lado = el motor usa la lógica legacy (JS).
--
-- Tipos sin intermediario (ARS-USD, USD-USD, USD-ARS): ver UPDATE abajo o re-ejecutar
-- sql/cc_modelo_reglas_todas_combinaciones.sql sección 2.

ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS cc_cliente_moneda_exposicion text NULL,
  ADD COLUMN IF NOT EXISTS cc_cliente_monto_referencia text NULL,
  ADD COLUMN IF NOT EXISTS cc_intermediario_moneda_exposicion text NULL,
  ADD COLUMN IF NOT EXISTS cc_intermediario_monto_referencia text NULL;

ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT IF EXISTS cc_modelo_reglas_cli_mon_exp_chk;
ALTER TABLE public.cc_modelo_reglas ADD CONSTRAINT cc_modelo_reglas_cli_mon_exp_chk
  CHECK (cc_cliente_moneda_exposicion IS NULL OR cc_cliente_moneda_exposicion IN ('orden_recibida', 'orden_entregada', 'transaccion'));

ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT IF EXISTS cc_modelo_reglas_cli_monto_ref_chk;
ALTER TABLE public.cc_modelo_reglas ADD CONSTRAINT cc_modelo_reglas_cli_monto_ref_chk
  CHECK (cc_cliente_monto_referencia IS NULL OR cc_cliente_monto_referencia IN ('mr', 'me', 'monto_transaccion'));

ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT IF EXISTS cc_modelo_reglas_int_mon_exp_chk;
ALTER TABLE public.cc_modelo_reglas ADD CONSTRAINT cc_modelo_reglas_int_mon_exp_chk
  CHECK (cc_intermediario_moneda_exposicion IS NULL OR cc_intermediario_moneda_exposicion IN ('orden_recibida', 'orden_entregada', 'transaccion'));

ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT IF EXISTS cc_modelo_reglas_int_monto_ref_chk;
ALTER TABLE public.cc_modelo_reglas ADD CONSTRAINT cc_modelo_reglas_int_monto_ref_chk
  CHECK (cc_intermediario_monto_referencia IS NULL OR cc_intermediario_monto_referencia IN ('mr', 'me', 'monto_transaccion', 'monto_efectivo_intermediario'));

COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_moneda_exposicion IS 'Moneda del movimiento CC cliente: orden_recibida, orden_entregada, transaccion. NULL = motor legacy.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_cliente_monto_referencia IS 'Base del importe: mr, me, monto_transaccion. NULL = inferir desde moneda_exposicion o legacy.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_intermediario_moneda_exposicion IS 'Moneda del movimiento CC intermediario. NULL = motor legacy.';
COMMENT ON COLUMN public.cc_modelo_reglas.cc_intermediario_monto_referencia IS 'Base del importe; monto_efectivo_intermediario para ingreso Int→Pandy con tasa. NULL = legacy.';

-- Par cliente sin intermediario:
-- - ARS-USD y USD-ARS: ingreso Cliente→Pandy expone orden_entregada + me.
-- - USD-USD: ingreso Cliente→Pandy expone transaccion + monto_transaccion (cobro bruto).
-- - Egreso Pandy→Cliente: transaccion + monto_transaccion.
-- Excepciones:
-- - ingreso pendiente + contrapartida ejecutada → orden_recibida + mr (ver migracion_cc_modelo_reglas_ingreso_pendiente_par_exposicion_mr.sql).
-- - USD-USD cobro bruto + cierre con comisión ejecutada/par cerrado (ver migracion_cc_modelo_reglas_usd_usd_cobro_bruto_y_cierre_comision.sql).
UPDATE public.cc_modelo_reglas r
SET
  cc_cliente_moneda_exposicion = CASE
    WHEN r.tipo_operacion_codigo = 'USD-USD'
      AND r.pagador = 'cliente' AND r.cobrador = 'pandy' AND r.tipo_transaccion = 'ingreso' AND r.es_comision = false
      THEN 'transaccion'
    WHEN r.pagador = 'cliente' AND r.cobrador = 'pandy' AND r.tipo_transaccion = 'ingreso' AND r.es_comision = false
      AND NOT (r.estado_transaccion = 'pendiente' AND r.contrapartida_ejecutada = true) THEN 'orden_entregada'
    WHEN r.pagador = 'pandy' AND r.cobrador = 'cliente' AND r.tipo_transaccion = 'egreso' AND r.es_comision = false THEN 'transaccion'
    ELSE r.cc_cliente_moneda_exposicion
  END,
  cc_cliente_monto_referencia = CASE
    WHEN r.tipo_operacion_codigo = 'USD-USD'
      AND r.pagador = 'cliente' AND r.cobrador = 'pandy' AND r.tipo_transaccion = 'ingreso' AND r.es_comision = false
      THEN 'monto_transaccion'
    WHEN r.pagador = 'cliente' AND r.cobrador = 'pandy' AND r.tipo_transaccion = 'ingreso' AND r.es_comision = false
      AND NOT (r.estado_transaccion = 'pendiente' AND r.contrapartida_ejecutada = true) THEN 'me'
    WHEN r.pagador = 'pandy' AND r.cobrador = 'cliente' AND r.tipo_transaccion = 'egreso' AND r.es_comision = false THEN 'monto_transaccion'
    ELSE r.cc_cliente_monto_referencia
  END
WHERE r.usa_intermediario = false
  AND r.tipo_operacion_codigo IN ('ARS-USD', 'USD-USD', 'USD-ARS')
  AND r.es_comision = false;
