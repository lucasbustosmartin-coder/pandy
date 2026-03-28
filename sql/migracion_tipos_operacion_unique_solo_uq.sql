-- Tipos de operación: unicidad (codigo, usa_intermediario) sin tocar cc_modelo_reglas (legacy).
-- Permite dos filas con el mismo código (ej. USD-ARS sin y con intermediario).
-- Ejecutar después de migracion_tipos_operacion_usa_intermediario.sql.
-- En bases que ya ejecutaron migracion_tipos_operacion_unique_codigo_usa_intermediario.sql completa, este script es idempotente (DROP/CREATE IF NOT EXISTS).

UPDATE public.tipos_operacion
SET usa_intermediario = COALESCE(usa_intermediario, false);

ALTER TABLE public.tipos_operacion
  ALTER COLUMN usa_intermediario SET DEFAULT false,
  ALTER COLUMN usa_intermediario SET NOT NULL;

ALTER TABLE public.tipos_operacion DROP CONSTRAINT IF EXISTS tipos_operacion_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_operacion_codigo_usa_intermediario
  ON public.tipos_operacion (codigo, usa_intermediario);

COMMENT ON TABLE public.tipos_operacion IS 'Catálogo de tipos. codigo puede repetirse si usa_intermediario difiere (ej. USD-ARS directo vs intermediado).';
