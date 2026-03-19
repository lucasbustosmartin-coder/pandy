-- RPC: actualizar estado de una transacción (pendiente | ejecutada).
-- El front llama esta RPC en lugar de UPDATE directo; el resto del flujo (reversiones, sync CC/caja) sigue en el cliente.
-- Ejecutar en Supabase SQL Editor.

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

  IF p_estado NOT IN ('pendiente', 'ejecutada') THEN
    RAISE EXCEPTION 'estado debe ser pendiente o ejecutada';
  END IF;

  UPDATE public.transacciones
  SET
    estado = p_estado,
    fecha_ejecucion = CASE WHEN p_estado = 'ejecutada' THEN COALESCE(p_fecha_ejecucion, CURRENT_DATE) ELSE NULL END,
    usuario_id = CASE WHEN p_estado = 'ejecutada' THEN p_usuario_id ELSE usuario_id END,
    revertida_una_vez = CASE WHEN p_revertida_una_vez IS NOT NULL THEN p_revertida_una_vez ELSE revertida_una_vez END,
    updated_at = now()
  WHERE id = p_transaccion_id;
END;
$$;

COMMENT ON FUNCTION public.transacciones_cambiar_estado IS 'Actualiza estado, fecha_ejecucion, usuario_id y opcionalmente revertida_una_vez de una transacción. Llamar desde el front al cambiar pendiente↔ejecutada.';

GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO service_role;
