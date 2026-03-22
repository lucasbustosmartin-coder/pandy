-- Orden de listado de tipos de operación (selector en Nueva orden, Cargar por chat, vista ABM).
-- Ejecutar en Supabase SQL Editor una vez.
-- A futuro: la instrumentación deberá adaptarse a las monedas que participan (sin depender solo del código fijo).

ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS orden_visual integer;

-- Primera carga: todos los que siguen sin valor reciben rango según código (mismo criterio que antes en UI).
UPDATE public.tipos_operacion t
SET orden_visual = r.n * 10
FROM (
  SELECT id, row_number() OVER (ORDER BY codigo, usa_intermediario NULLS LAST, id) AS n
  FROM public.tipos_operacion
  WHERE orden_visual IS NULL
) r
WHERE t.id = r.id;

-- Si quedara algún NULL (p. ej. fila nueva sin orden), colocarla al final sin colisionar.
UPDATE public.tipos_operacion t
SET orden_visual = sub.new_ord
FROM (
  SELECT
    id,
    (SELECT COALESCE(MAX(orden_visual), 0) FROM public.tipos_operacion WHERE orden_visual IS NOT NULL)
      + row_number() OVER (ORDER BY id) * 10 AS new_ord
  FROM public.tipos_operacion
  WHERE orden_visual IS NULL
) sub
WHERE t.id = sub.id;

ALTER TABLE public.tipos_operacion
  ALTER COLUMN orden_visual SET NOT NULL;

ALTER TABLE public.tipos_operacion
  ALTER COLUMN orden_visual SET DEFAULT 1000000;

COMMENT ON COLUMN public.tipos_operacion.orden_visual IS 'Orden en listas UI (menor = más arriba). Editado con subir/bajar en Tipos de operación.';
