-- RPC: actualizar estado de una transacción (pendiente | ejecutada | anulada).
-- Debe coincidir con la función definida en migracion_transacciones_estado_anulada.sql (este archivo va después en bootstrap y deja la versión final).
-- fecha_ejecucion por defecto: calendario Argentina (public.fecha_hoy_argentina), no CURRENT_DATE del servidor.

CREATE OR REPLACE FUNCTION public.transacciones_cambiar_estado(
  p_transaccion_id uuid,
  p_estado text,
  p_fecha_ejecucion date DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_revertida_una_vez boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
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

COMMENT ON FUNCTION public.transacciones_cambiar_estado IS 'Actualiza estado (pendiente | ejecutada | anulada), fecha_ejecucion (Argentina si no se pasa), usuario_id y opcionalmente revertida_una_vez.';

-- Sin anon: sesión obligatoria (authenticated). Ver `migracion_security_advisor_revoke_public_anon_security_definer_rpc.sql`.
GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO service_role;
