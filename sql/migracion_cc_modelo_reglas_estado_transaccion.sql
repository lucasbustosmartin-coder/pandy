-- Pandi – Migración: cc_modelo_reglas con estado_transaccion y todas las combinaciones
-- Ejecutar si la tabla ya existía con columna transaccion_ejecutada (boolean).
-- Añade estado_transaccion, elimina transaccion_ejecutada, inserta filas faltantes (4 combinaciones por tipo de tx).

-- 1) Añadir columna estado_transaccion
ALTER TABLE public.cc_modelo_reglas
  ADD COLUMN IF NOT EXISTS estado_transaccion text CHECK (estado_transaccion IN ('pendiente', 'ejecutada'));

-- 2) Rellenar desde transaccion_ejecutada si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cc_modelo_reglas' AND column_name = 'transaccion_ejecutada') THEN
    UPDATE public.cc_modelo_reglas SET estado_transaccion = CASE WHEN transaccion_ejecutada THEN 'ejecutada' ELSE 'pendiente' END WHERE estado_transaccion IS NULL;
  END IF;
END $$;

-- 3) NOT NULL y default solo si la columna ya existe y puede quedar con nulls
UPDATE public.cc_modelo_reglas SET estado_transaccion = 'ejecutada' WHERE estado_transaccion IS NULL;
ALTER TABLE public.cc_modelo_reglas ALTER COLUMN estado_transaccion SET NOT NULL;
ALTER TABLE public.cc_modelo_reglas ALTER COLUMN estado_transaccion SET DEFAULT 'ejecutada';

-- 4) Eliminar constraint UNIQUE viejo (incluye transaccion_ejecutada)
DO $$
DECLARE c name;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.cc_modelo_reglas'::regclass AND contype = 'u'
  LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT %I', c);
  END IF;
END $$;

-- 5) Eliminar columna transaccion_ejecutada si existe
ALTER TABLE public.cc_modelo_reglas DROP COLUMN IF EXISTS transaccion_ejecutada;

-- 6) Crear UNIQUE nuevo (estado_transaccion)
ALTER TABLE public.cc_modelo_reglas DROP CONSTRAINT IF EXISTS cc_modelo_reglas_estado_contrapartida_uniq;
ALTER TABLE public.cc_modelo_reglas
  ADD CONSTRAINT cc_modelo_reglas_estado_contrapartida_uniq
  UNIQUE (tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision, estado_transaccion, contrapartida_ejecutada);

-- 7) Índice por estado
CREATE INDEX IF NOT EXISTS idx_cc_modelo_reglas_estado
  ON public.cc_modelo_reglas (tipo_operacion_codigo, usa_intermediario, estado_transaccion, contrapartida_ejecutada);

-- Luego ejecutar los INSERT del bloque "2. Datos" de cc_modelo_reglas_tabla.sql (todas las combinaciones)
-- o ejecutar cc_modelo_reglas_tabla.sql completo en un proyecto nuevo.
