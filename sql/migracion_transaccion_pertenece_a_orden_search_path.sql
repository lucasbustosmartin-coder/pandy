-- Parche: Security Advisor «Function Search Path Mutable» (splinter) en
-- public.transaccion_pertenece_a_orden — fija search_path y evita hijacking de esquemas.
-- Ejecutar en Supabase SQL Editor en proyectos que ya tenían la función sin SET (idempotente).

CREATE OR REPLACE FUNCTION public.transaccion_pertenece_a_orden(p_orden_id uuid, p_transaccion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (p_orden_id IS NULL OR p_transaccion_id IS NULL)
     OR EXISTS (
       SELECT 1 FROM public.transacciones t
       JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
       WHERE t.id = p_transaccion_id AND i.orden_id = p_orden_id
     );
$$;

COMMENT ON FUNCTION public.transaccion_pertenece_a_orden IS 'Usado por CHECK en mov_cc y mov_cc_int: la transacción debe ser de la instrumentación de la orden.';
