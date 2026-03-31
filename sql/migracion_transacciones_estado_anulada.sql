-- Transacciones: estado 'anulada' (coherente con orden anulada). RLS: quien tiene anular_orden puede
-- poner estado = anulada. Ejecutar en Supabase SQL Editor después de migracion_permisos_ordenes_transacciones.sql.

-- 1) Ampliar CHECK de estado (nombre típico en tablas creadas con CREATE TABLE)
ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_estado_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_estado_check CHECK (estado IN ('pendiente', 'ejecutada', 'anulada'));

COMMENT ON COLUMN public.transacciones.estado IS 'pendiente | ejecutada | anulada (esta última al anular la orden).';

-- 2) RPC usada al cambiar estado desde la app: permitir anulada por si se invoca en el futuro
CREATE OR REPLACE FUNCTION public.transacciones_cambiar_estado(
  p_transaccion_id uuid,
  p_estado text,
  p_fecha_ejecucion date DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_revertida_una_vez boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_transaccion_id IS NULL OR p_estado IS NULL THEN
    RETURN;
  END IF;

  IF p_estado NOT IN ('pendiente', 'ejecutada', 'anulada') THEN
    RAISE EXCEPTION 'estado debe ser pendiente, ejecutada o anulada';
  END IF;

  UPDATE public.transacciones
  SET
    estado = p_estado,
    fecha_ejecucion = CASE
      WHEN p_estado = 'ejecutada' THEN COALESCE(p_fecha_ejecucion, public.fecha_hoy_argentina())
      WHEN p_estado = 'anulada' THEN NULL
      ELSE NULL
    END,
    usuario_id = CASE WHEN p_estado = 'ejecutada' THEN COALESCE(p_usuario_id, usuario_id) ELSE usuario_id END,
    revertida_una_vez = CASE WHEN p_revertida_una_vez IS NOT NULL THEN p_revertida_una_vez ELSE revertida_una_vez END,
    updated_at = now()
  WHERE id = p_transaccion_id;
END;
$$;

COMMENT ON FUNCTION public.transacciones_cambiar_estado IS 'Actualiza estado (pendiente | ejecutada | anulada), fecha_ejecucion, usuario_id y opcionalmente revertida_una_vez.';

-- 3) RLS UPDATE: editar_transacciones sigue igual; anular_orden solo puede fijar estado anulada
DROP POLICY IF EXISTS "transacciones_update_perm" ON public.transacciones;
CREATE POLICY "transacciones_update_perm"
  ON public.transacciones FOR UPDATE TO authenticated
  USING (
    public.has_permission('editar_transacciones')
    OR public.has_permission('anular_orden')
  )
  WITH CHECK (
    public.has_permission('editar_transacciones')
    OR (
      public.has_permission('anular_orden')
      AND estado = 'anulada'
    )
  );
