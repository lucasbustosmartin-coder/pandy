-- Número de transacción interno (trazabilidad para el usuario, en lugar de mostrar solo UUID).
-- Ejecutar en Supabase SQL Editor después de tener la tabla transacciones.

-- Secuencia para números únicos
CREATE SEQUENCE IF NOT EXISTS public.transacciones_numero_seq;

-- Columna numero (entero, único, no nulo)
ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS numero integer;

-- Asignar valores a filas existentes (por orden de created_at) y dejar la secuencia al día
DO $$
DECLARE
  r RECORD;
  n integer := 0;
BEGIN
  FOR r IN (SELECT id FROM public.transacciones ORDER BY created_at, id)
  LOOP
    n := n + 1;
    UPDATE public.transacciones SET numero = n WHERE id = r.id;
  END LOOP;
  IF n > 0 THEN
    PERFORM setval('public.transacciones_numero_seq', n, true);
  END IF;
END $$;

-- Default para nuevas filas
ALTER TABLE public.transacciones
  ALTER COLUMN numero SET DEFAULT nextval('public.transacciones_numero_seq');

-- Obligatorio y único
UPDATE public.transacciones SET numero = nextval('public.transacciones_numero_seq') WHERE numero IS NULL;
ALTER TABLE public.transacciones ALTER COLUMN numero SET NOT NULL;
ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS uniq_transacciones_numero;
ALTER TABLE public.transacciones ADD CONSTRAINT uniq_transacciones_numero UNIQUE (numero);

COMMENT ON COLUMN public.transacciones.numero IS 'Número interno de transacción para trazabilidad en UI y en conceptos de movimientos de caja (ej. nro transacción 42).';
