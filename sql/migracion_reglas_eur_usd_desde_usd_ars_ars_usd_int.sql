-- Regenera reglas EUR-USD y USD-EUR (con intermediario) como espejo de USD-ARS y ARS-USD,
-- reemplazando moneda ARS → EUR en la columna moneda (el acuerdo del tipo es USD/EUR, no USD/ARS).
--
-- PRECONDICIÓN: En tu base, conviene que USD-ARS+int y ARS-USD+int tengan la MISMA cantidad de filas
-- (idealmente 20 cada uno, como en sql/reglas_de_negocio_tabla.sql). Si USD-ARS+int tiene menos filas
-- que ARS-USD+int, tras este script USD-EUR+int quedará más chico que EUR-USD+int (heredado del origen).
--
-- Ejecutar en Supabase SQL Editor. Ajustar solo si ya existen tipos EUR-USD y USD-EUR en tipos_operacion.

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

-- Verificación rápida (opcional):
-- SELECT tipo_operacion_codigo, COUNT(*) FROM reglas_de_negocio
-- WHERE tipo_operacion_codigo IN ('USD-ARS','ARS-USD','USD-EUR','EUR-USD') AND usa_intermediario
-- GROUP BY 1 ORDER BY 1;
