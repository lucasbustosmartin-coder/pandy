-- Pandi – cc_modelo_reglas: flags de motor para espejo egreso y merge de lookups (fuente de verdad en tabla).
-- Fase 1 (tipo USD-ARS sin intermediario): evita hardcode en main.js de merge contrapartida y supresión de espejo +mr en egreso P→C cuando el par cliente está cerrado.
-- Ejecutar en Supabase SQL Editor después de tener cc_modelo_reglas con linea_motor.
-- Referencia: docs/CC_FUENTE_DE_VERDAD_TABLA_Y_MULTI_PATA.md

ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS motor_suprime_espejo_egreso_mr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motor_merge_lookup_contrapartida boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cc_modelo_reglas.motor_suprime_espejo_egreso_mr IS
  'Si true en alguna fila matcheada del egreso: no generar línea espejo automática en moneda recibida (mr) para ese egreso; la tabla ya cerró exposición (p. ej. USD-ARS sin int E,E línea_motor 1).';
COMMENT ON COLUMN public.cc_modelo_reglas.motor_merge_lookup_contrapartida IS
  'Si true en el set de reglas del tipo: en egreso P→C ejecutado con par cliente cerrado, unir lookupReglas(contrapartida false y true) por linea_motor.';

-- USD-ARS sin intermediario — egreso Pandy→Cliente ejecutado: merge de contrapartidas en par cerrado (ambas filas motor).
UPDATE public.cc_modelo_reglas
SET motor_merge_lookup_contrapartida = true
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = false
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada';

-- Misma clave, solo cuando contrapartida_ejecutada = true: la fila −mr USD (linea_motor 1) ya evita duplicar espejo +mr.
UPDATE public.cc_modelo_reglas
SET motor_suprime_espejo_egreso_mr = true
WHERE tipo_operacion_codigo = 'USD-ARS'
  AND usa_intermediario = false
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = true;
