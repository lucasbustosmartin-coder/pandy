-- Pandi – USD-USD **con intermediario**: tipo de operación + reglas `reglas_de_negocio`.
-- CC cliente: misma matriz que USD-USD sin int (comisión total implícita `mr_menos_me`).
-- CC intermediario: fila `es_comision` con `monto_origen` = `comision_intermediario` (monto en `comisiones_orden`, beneficiario intermediario).
-- Ejecutar en Supabase SQL Editor después de `reglas_de_negocio` y `migracion_tipos_operacion_unique_codigo_usa_intermediario.sql`.

-- 1) Catálogo: segunda fila USD-USD con usa_intermediario = true
INSERT INTO public.tipos_operacion (
  codigo, nombre, moneda_in, moneda_out, usa_intermediario, activo,
  icono_modo, icono_url_publica
)
SELECT
  t.codigo,
  'USD - USD (con intermediario)',
  t.moneda_in,
  t.moneda_out,
  true,
  COALESCE(t.activo, true),
  COALESCE(t.icono_modo, 'auto'),
  t.icono_url_publica
FROM public.tipos_operacion t
WHERE t.codigo = 'USD-USD'
  AND t.usa_intermediario = false
  AND NOT EXISTS (
    SELECT 1 FROM public.tipos_operacion x
    WHERE x.codigo = 'USD-USD' AND x.usa_intermediario = true
  )
LIMIT 1;

-- 2) Ampliar CHECK monto_origen
ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_monto_origen_check;

ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_monto_origen_check CHECK (monto_origen IN (
    'mr', 'me', 'monto_transaccion',
    'me_prorrateado', 'mr_prorrateado',
    'mr_menos_me',
    'monto_efectivo_intermediario',
    'comision_intermediario'
  ));

COMMENT ON COLUMN public.reglas_de_negocio.monto_origen IS
  'mr/me: totales acuerdo. monto_transaccion: esta trx. me_prorrateado/mr_prorrateado: prorrateos. mr_menos_me: comisión implícita USD-USD (mr − me). monto_efectivo_intermediario: CHEQUE. comision_intermediario: parte intermediario en comisiones_orden (USD-USD con int).';

-- 3) Reglas USD-USD con intermediario: clonar sin int + fila comisión intermediario
INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
)
SELECT
  r.tipo_operacion_codigo,
  true,
  COALESCE(NULLIF(BTRIM(COALESCE(r.entidad_cc::text, '')), ''), 'cliente') AS entidad_cc,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.linea,
  r.moneda,
  r.signo,
  r.monto_origen,
  r.incluir_en_detalle,
  r.concepto_leyenda
FROM public.reglas_de_negocio r
WHERE r.tipo_operacion_codigo = 'USD-USD'
  AND r.usa_intermediario = false
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'pandy', 'intermediario', 'egreso', true, 'ejecutada', true, 0, 'USD', 1, 'comision_intermediario', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

DELETE FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = true;
