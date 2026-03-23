-- =============================================================================
-- Pandi – UN SOLO SCRIPT para Supabase SQL Editor
-- =============================================================================
-- Referencia revisada: `docs/reglas_de_negocio_rows (2).sql` (snapshot de producción).
--   Ese archivo **no** se ejecuta aquí: los INSERT con `id` fijos suelen chocar o quedar
--   desalineados. Este script aplica el **parche de negocio** y **regenera** los cruces EUR+int
--   a partir de las filas **actuales** de USD-ARS+int y ARS-USD+int en la base.
--
-- Orden:
--   1) UPSERT filas CC intermediario (egreso Intermediario→Cliente, cp_ic) en USD-USD, USD-ARS, ARS-USD.
--   2) UPDATE signo comisión intermediario (USD-USD+int, es_comision / comision_intermediario).
--   3) DELETE + INSERT EUR-USD y USD-EUR (usa_intermediario=true) clonando ARS→EUR en columna moneda.
--   4) DELETE + INSERT EUR-ARS y ARS-EUR (usa_intermediario=true) clonando USD→EUR en columna moneda.
--
-- Advertencia: los pasos 3 y 4 **eliminan** todas las reglas +int de esos cuatro códigos EUR y las
-- vuelven a crear desde USD-ARS/ARS-USD. Si tenías filas EUR+int editadas a mano sin equivalente en
-- la fuente, se pierden (diseño del repo: EUR es espejo de USD-ARS/ARS-USD).
--
-- Ejecución: correr **este archivo entero** en el SQL Editor. No uses otros `.sql` del repo para el mismo fin
-- (los fragmentos en `migracion_*.sql` están duplicados aquí a propósito).
--
-- Verificación (opcional, al final):
--   SELECT tipo_operacion_codigo, usa_intermediario, COUNT(*) AS n
--   FROM public.reglas_de_negocio
--   WHERE tipo_operacion_codigo IN (
--     'USD-ARS','ARS-USD','USD-USD','EUR-USD','USD-EUR','EUR-ARS','ARS-EUR'
--   )
--   GROUP BY 1, 2 ORDER BY 1, 2;
--
--   Filas nuevas Int→Cliente en CC intermediario (debería haber al menos en USD-USD, USD-ARS, ARS-USD):
--   SELECT tipo_operacion_codigo, entidad_cc, pagador, cobrador, linea, moneda, signo
--   FROM public.reglas_de_negocio
--   WHERE usa_intermediario AND entidad_cc = 'intermediario'
--     AND pagador = 'intermediario' AND cobrador = 'cliente' AND tipo_transaccion = 'egreso'
--   ORDER BY 1, 4, 7;
-- =============================================================================

-- --- 1 y 2: parche cp_ic + comisión USD-USD+int --------------------------------

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND es_comision = true
  AND LOWER(pagador) = 'pandy'
  AND LOWER(cobrador) = 'intermediario'
  AND LOWER(tipo_transaccion) = 'egreso'
  AND LOWER(monto_origen) = 'comision_intermediario';

-- --- 2b: ci_pc — CC intermediario por egreso Pandy→Cliente (**solo USD-USD+int**; cruces ya cubiertos por C→I) ----------
-- (El mismo bloque está en `sql/migracion_reglas_ci_pc_cc_intermediario_pandy_cliente.sql` solo como copia en repo; no ejecutar ese archivo aparte.)

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- --- 3: EUR-USD / USD-EUR +int (espejo USD-ARS+int / ARS-USD+int; ARS→EUR en moneda) ----------
--     Fuente: sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo IN ('EUR-USD', 'USD-EUR')
  AND usa_intermediario = true;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  incluir_en_detalle,
  concepto_leyenda,
  condicion_estado_comision
)
SELECT
  'USD-EUR',
  r.usa_intermediario,
  r.entidad_cc,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.linea,
  CASE r.moneda::text WHEN 'ARS' THEN 'EUR'::character varying ELSE r.moneda END,
  r.signo,
  r.monto_origen,
  r.incluir_en_detalle,
  r.concepto_leyenda,
  r.condicion_estado_comision
FROM public.reglas_de_negocio r
WHERE r.tipo_operacion_codigo = 'USD-ARS'
  AND r.usa_intermediario = true;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  incluir_en_detalle,
  concepto_leyenda,
  condicion_estado_comision
)
SELECT
  'EUR-USD',
  r.usa_intermediario,
  r.entidad_cc,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.linea,
  CASE r.moneda::text WHEN 'ARS' THEN 'EUR'::character varying ELSE r.moneda END,
  r.signo,
  r.monto_origen,
  r.incluir_en_detalle,
  r.concepto_leyenda,
  r.condicion_estado_comision
FROM public.reglas_de_negocio r
WHERE r.tipo_operacion_codigo = 'ARS-USD'
  AND r.usa_intermediario = true;

-- --- 4: EUR-ARS / ARS-EUR +int (espejo; USD→EUR en moneda) -------------------
--     Fuente: bloque C de sql/migracion_reglas_eur_cruces_desde_usd_ars_ars_usd_sin_int_y_eur_ars_int.sql

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo IN ('EUR-ARS', 'ARS-EUR')
  AND usa_intermediario = true;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  incluir_en_detalle,
  concepto_leyenda,
  condicion_estado_comision
)
SELECT
  'EUR-ARS',
  r.usa_intermediario,
  r.entidad_cc,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.linea,
  CASE r.moneda::text WHEN 'USD' THEN 'EUR'::character varying ELSE r.moneda END,
  r.signo,
  r.monto_origen,
  r.incluir_en_detalle,
  r.concepto_leyenda,
  r.condicion_estado_comision
FROM public.reglas_de_negocio r
WHERE r.tipo_operacion_codigo = 'USD-ARS'
  AND r.usa_intermediario = true;

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  pagador,
  cobrador,
  tipo_transaccion,
  es_comision,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  incluir_en_detalle,
  concepto_leyenda,
  condicion_estado_comision
)
SELECT
  'ARS-EUR',
  r.usa_intermediario,
  r.entidad_cc,
  r.pagador,
  r.cobrador,
  r.tipo_transaccion,
  r.es_comision,
  r.estado_transaccion,
  r.contrapartida_ejecutada,
  r.linea,
  CASE r.moneda::text WHEN 'USD' THEN 'EUR'::character varying ELSE r.moneda END,
  r.signo,
  r.monto_origen,
  r.incluir_en_detalle,
  r.concepto_leyenda,
  r.condicion_estado_comision
FROM public.reglas_de_negocio r
WHERE r.tipo_operacion_codigo = 'ARS-USD'
  AND r.usa_intermediario = true;
