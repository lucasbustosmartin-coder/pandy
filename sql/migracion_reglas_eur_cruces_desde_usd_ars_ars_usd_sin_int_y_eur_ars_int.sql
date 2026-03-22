-- Pandi – Regenera reglas EUR mal clonadas (simetría respecto a USD-ARS / ARS-USD).
--
-- Corrige:
-- 1) EUR-USD y USD-EUR **sin intermediario**: mismas filas que ARS-USD / USD-ARS false,
--    con moneda ARS → EUR (no debe quedar ARS en un tipo USD/EUR).
-- 2) EUR-ARS y ARS-EUR **con intermediario**: espejo de USD-ARS+int / ARS-USD+int sustituyendo
--    moneda USD → EUR (acuerdo ARS/EUR vs ARS/USD).
--
-- NO toca USD-USD ni CHEQUE-ARS.
--
-- **Sin int, todo junto (USD-ARS + ARS-USD + EUR-USD + USD-EUR + EUR-ARS + ARS-EUR, 10×6):**
-- preferí `sql/migracion_reglas_todos_cruces_dos_monedas_sin_int_canonico.sql` (un solo DELETE+INSERT).
-- Este archivo sirve si solo querés parches parciales o el bloque **C) +int** EUR-ARS/ARS-EUR.
--
-- PRECONDICIÓN: `USD-ARS` y `ARS-USD` (false y true) ya están correctos en `reglas_de_negocio`
-- (p. ej. 10 + 10 sin int USD-ARS/ARS-USD; 20 + 20 con int según `sql/reglas_de_negocio_tabla.sql`).
--
-- Ejecutar en Supabase SQL Editor (una vez). Idempotente si volvés a correrlo.

-- ========== A) EUR-USD / USD-EUR sin intermediario ==========

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo IN ('EUR-USD', 'USD-EUR')
  AND usa_intermediario = false;

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
  AND r.usa_intermediario = false;

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
  AND r.usa_intermediario = false;

-- ========== B) EUR-ARS / ARS-EUR sin intermediario (misma simetría 9 / 10 que USD-ARS / ARS-USD) ==========

DELETE FROM public.reglas_de_negocio
WHERE tipo_operacion_codigo IN ('EUR-ARS', 'ARS-EUR')
  AND usa_intermediario = false;

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
  AND r.usa_intermediario = false;

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
  AND r.usa_intermediario = false;

-- ========== C) EUR-ARS / ARS-EUR con intermediario (20 + 20 si el origen tiene 20 + 20) ==========

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

-- Verificación (opcional):
-- SELECT tipo_operacion_codigo, usa_intermediario, COUNT(*) AS n
-- FROM public.reglas_de_negocio
-- WHERE tipo_operacion_codigo IN (
--   'USD-ARS','ARS-USD','EUR-USD','USD-EUR','EUR-ARS','ARS-EUR'
-- )
-- GROUP BY 1, 2
-- ORDER BY 1, 2;
--
-- Solo pares USD/EUR (sin ARS en columna moneda):
-- SELECT COUNT(*) FROM public.reglas_de_negocio
-- WHERE tipo_operacion_codigo IN ('EUR-USD','USD-EUR') AND moneda = 'ARS';
-- Debe dar 0.
-- (En EUR-ARS / ARS-EUR sí puede haber filas con moneda ARS: es la pata ARS del acuerdo.)
