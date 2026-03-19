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

-- Par cliente sin intermediario: ingreso Cliente→Pandy expone la contraparte (orden entregada = me); egreso Pandy→Cliente en moneda de la transacción.
UPDATE public.cc_modelo_reglas r
SET
  cc_cliente_moneda_exposicion = CASE
    WHEN r.pagador = 'cliente' AND r.cobrador = 'pandy' AND r.tipo_transaccion = 'ingreso' AND r.es_comision = false THEN 'orden_entregada'
    WHEN r.pagador = 'pandy' AND r.cobrador = 'cliente' AND r.tipo_transaccion = 'egreso' AND r.es_comision = false THEN 'transaccion'
    ELSE r.cc_cliente_moneda_exposicion
  END,
  cc_cliente_monto_referencia = CASE
    WHEN r.pagador = 'cliente' AND r.cobrador = 'pandy' AND r.tipo_transaccion = 'ingreso' AND r.es_comision = false THEN 'me'
    WHEN r.pagador = 'pandy' AND r.cobrador = 'cliente' AND r.tipo_transaccion = 'egreso' AND r.es_comision = false THEN 'monto_transaccion'
    ELSE r.cc_cliente_monto_referencia
  END
WHERE r.usa_intermediario = false
  AND r.tipo_operacion_codigo IN ('ARS-USD', 'USD-USD', 'USD-ARS')
  AND r.es_comision = false;
