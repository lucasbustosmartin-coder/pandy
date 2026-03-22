-- CHEQUE-ARS + intermediario → única fuente `reglas_de_negocio` (matriz alineada a
-- sql/migracion_cc_modelo_reglas_cheque_ars_reaply_matriz.sql).
-- Ejecutar en Supabase SQL Editor. Luego borra filas CHEQUE-ARS de cc_modelo_reglas.

ALTER TABLE public.reglas_de_negocio
  ADD COLUMN IF NOT EXISTS condicion_estado_comision text;
COMMENT ON COLUMN public.reglas_de_negocio.condicion_estado_comision IS
  'Para es_comision=true: par_pandy_int | par_cliente | null (motor main.js).';

ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_monto_origen_check;
ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_monto_origen_check CHECK (monto_origen IN (
    'mr', 'me', 'monto_transaccion',
    'me_prorrateado', 'mr_prorrateado',
    'mr_menos_me',
    'monto_efectivo_intermediario'
  ));

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo = 'CHEQUE-ARS' AND usa_intermediario = true;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda,
  condicion_estado_comision
) VALUES
  -- Tx1 Cliente→Pandy ingreso (no comisión): cc suma+incluir en ejecutada; pendiente true con −1 no suma (no fila emitida en motor viejo).
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'mr', true, 'cobro_realizado', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'mr', true, 'cobro_realizado', NULL),
  -- Tx2 Pandy→Cliente egreso
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago', NULL),
  ('CHEQUE-ARS', true, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago', NULL),
  -- Tx3/T4 CC intermediario: signos alineados a deuda neta int→Pandy (+cheque, −comisión, −efectivo). Ver docs/CHEQUE_ARS_INTERMEDIARIO.md
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'ejecutada', false, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'monto_transaccion', true, 'pago_realizado', NULL),
  ('CHEQUE-ARS', true, 'intermediario', 'intermediario', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_efectivo_intermediario', true, 'cobro_realizado', NULL),
  -- Comisión Pandy (signo +1 en matriz canónica; importe desde comisiones_orden en motor)
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', true, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'pendiente', true, 0, 'ARS', 1, 'mr', true, 'comision_acuerdo', 'par_cliente'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', false, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', false, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int'),
  ('CHEQUE-ARS', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'pendiente', true, 0, 'ARS', -1, 'me', true, 'comision_acuerdo', 'par_pandy_int')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda,
  condicion_estado_comision = EXCLUDED.condicion_estado_comision;

DELETE FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'CHEQUE-ARS';

-- Asegurar CC de Tx4 (efectivo neto) solo en intermediario si alguna fila quedó sin entidad_cc.
UPDATE public.reglas_de_negocio
SET entidad_cc = 'intermediario'
WHERE tipo_operacion_codigo = 'CHEQUE-ARS'
  AND usa_intermediario = true
  AND monto_origen = 'monto_efectivo_intermediario'
  AND (entidad_cc IS NULL OR trim(entidad_cc) = '');
