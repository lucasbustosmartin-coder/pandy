-- Número de orden interno (trazabilidad en UI, ordenes_insertar_con_proximo_numero, movimientos_caja.orden_numero).
-- Ejecutar en Supabase SQL Editor después de tener la tabla ordenes y antes de backfills que usen ordenes.numero.

CREATE SEQUENCE IF NOT EXISTS public.ordenes_numero_seq;

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS numero integer;

DO $$
DECLARE
  r RECORD;
  n integer := 0;
BEGIN
  FOR r IN (SELECT id FROM public.ordenes ORDER BY created_at, id)
  LOOP
    n := n + 1;
    UPDATE public.ordenes SET numero = n WHERE id = r.id;
  END LOOP;
  IF n > 0 THEN
    PERFORM setval('public.ordenes_numero_seq', n, true);
  END IF;
END $$;

ALTER TABLE public.ordenes
  ALTER COLUMN numero SET DEFAULT nextval('public.ordenes_numero_seq');

UPDATE public.ordenes SET numero = nextval('public.ordenes_numero_seq') WHERE numero IS NULL;
ALTER TABLE public.ordenes ALTER COLUMN numero SET NOT NULL;
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS uniq_ordenes_numero;
ALTER TABLE public.ordenes ADD CONSTRAINT uniq_ordenes_numero UNIQUE (numero);

COMMENT ON COLUMN public.ordenes.numero IS 'Número interno de orden para trazabilidad en UI y movimientos de caja.';
