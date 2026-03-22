-- Pandi – **Un solo script**: reglas `reglas_de_negocio` para **cruces de dos monedas distintas**
-- con **usa_intermediario = false**.
--
-- Definición de producto (canónico alineado a `sql/reglas_de_negocio_tabla.sql`):
-- - **10 filas** por cada tipo: USD-ARS, ARS-USD, EUR-USD, USD-EUR, EUR-ARS, ARS-EUR.
-- - Donde la transacción está **ejecutada** y el modelo usa **par ±** en una moneda (p. ej. P,E egreso
--   con contrapartida false), van **dos registros** que se anulan en CC en esa moneda; lo **pendiente**
--   queda en **una** línea según la tabla.
--
-- **No incluye:** USD-USD sin int (acuerdo en una sola moneda, modelo mr−me / comisión distinto),
-- ni CHEQUE-ARS, ni ningún tipo con **usa_intermediario = true** (usar `reglas_*_inversa*.sql`,
-- `migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`, `migracion_reglas_eur_cruces_*.sql` bloque +int).
--
-- Ejecutar **una vez** en Supabase SQL Editor (idempotente en el sentido de que deja siempre el mismo set).
--
-- Verificación (opcional):
-- SELECT tipo_operacion_codigo, COUNT(*) AS n
-- FROM public.reglas_de_negocio
-- WHERE usa_intermediario = false
--   AND tipo_operacion_codigo IN (
--     'USD-ARS','ARS-USD','EUR-USD','USD-EUR','EUR-ARS','ARS-EUR'
--   )
-- GROUP BY 1 ORDER BY 1;
-- → 6 filas de resultado, todas **n = 10**.
--
-- SELECT tipo_operacion_codigo, COUNT(*) AS mal
-- FROM public.reglas_de_negocio
-- WHERE usa_intermediario = false
--   AND tipo_operacion_codigo IN ('EUR-USD','USD-EUR')
--   AND moneda = 'ARS';
-- → **mal = 0** (solo EUR y USD en esos tipos).

-- =============================================================================
-- 1) Limpiar solo estos tipos sin int (no toca USD-USD, +int, CHEQUE, etc.)
-- =============================================================================

DELETE FROM public.reglas_de_negocio
WHERE usa_intermediario = false
  AND tipo_operacion_codigo IN (
    'USD-ARS',
    'ARS-USD',
    'EUR-USD',
    'USD-EUR',
    'EUR-ARS',
    'ARS-EUR'
  );

-- =============================================================================
-- 2) USD-ARS sin int — 10 filas (fuente para USD-EUR y EUR-ARS)
-- =============================================================================

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
  concepto_leyenda
) VALUES
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'ARS', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'ARS', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'USD', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'USD', 1, 'mr_prorrateado', true, 'compromiso_pago');

-- =============================================================================
-- 3) ARS-USD sin int — 10 filas (fuente para EUR-USD y ARS-EUR)
-- =============================================================================

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
  concepto_leyenda
) VALUES
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', false, 1, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 0, 'USD', -1, 'me_prorrateado', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'ARS', -1, 'monto_transaccion', true, 'cobro_realizado'),
  ('ARS-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', false, 1, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago'),
  ('ARS-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', true, 0, 'ARS', 1, 'mr_prorrateado', true, 'compromiso_pago');

-- =============================================================================
-- 4) Cruces EUR sin int — 10 filas cada uno (derivados siempre desde USD-ARS / ARS-USD)
-- =============================================================================

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
