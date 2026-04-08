-- Asignación atómica de numero de orden (MAX+1) con lock, sin huecos ni colisiones por concurrencia.
-- Ejecutar en Supabase SQL Editor. Requiere que la tabla ordenes tenga la columna numero (integer UNIQUE NOT NULL).
-- La app llama a esta función vía RPC en lugar de INSERT directo al crear una orden nueva.
--
-- Al cambiar la firma, ejecutá el DROP de la versión anterior para evitar ERROR 42725 (nombre de función no único).

DROP FUNCTION IF EXISTS public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, text, uuid, timestamptz
);

CREATE OR REPLACE FUNCTION public.ordenes_insertar_con_proximo_numero(
  p_cliente_id uuid,
  p_fecha date,
  p_estado text,
  p_tipo_operacion_id uuid,
  p_operacion_directa boolean,
  p_intermediario_id uuid,
  p_moneda_recibida text,
  p_moneda_entregada text,
  p_monto_recibido numeric,
  p_monto_entregado numeric,
  p_cotizacion numeric,
  p_tasa_descuento_intermediario numeric,
  p_intermediario_pago_transferencia boolean,
  p_intermediario_transferencia_cobra_tasa boolean,
  p_intermediario_transferencia_tasa numeric,
  p_observaciones text,
  p_usuario_id uuid,
  p_updated_at timestamptz
)
RETURNS TABLE (id uuid, numero integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'ordenes_insertar_con_proximo_numero: cliente_id es obligatorio'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ordenes_proximo_numero'));

  SELECT COALESCE(MAX(o.numero), 0) + 1 INTO next_num FROM public.ordenes o;

  RETURN QUERY
  INSERT INTO public.ordenes (
    numero,
    cliente_id,
    fecha,
    estado,
    tipo_operacion_id,
    operacion_directa,
    intermediario_id,
    moneda_recibida,
    moneda_entregada,
    monto_recibido,
    monto_entregado,
    cotizacion,
    tasa_descuento_intermediario,
    intermediario_pago_transferencia,
    intermediario_transferencia_cobra_tasa,
    intermediario_transferencia_tasa,
    observaciones,
    usuario_id,
    updated_at
  ) VALUES (
    next_num,
    p_cliente_id,
    p_fecha,
    p_estado,
    p_tipo_operacion_id,
    p_operacion_directa,
    p_intermediario_id,
    p_moneda_recibida,
    p_moneda_entregada,
    p_monto_recibido,
    p_monto_entregado,
    p_cotizacion,
    p_tasa_descuento_intermediario,
    COALESCE(p_intermediario_pago_transferencia, false),
    COALESCE(p_intermediario_transferencia_cobra_tasa, false),
    p_intermediario_transferencia_tasa,
    p_observaciones,
    p_usuario_id,
    p_updated_at
  )
  RETURNING ordenes.id, ordenes.numero;
END;
$$;

COMMENT ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz
) IS 'Inserta una orden con numero = MAX(numero)+1 bajo lock. Incluye flags transferencia y tasa opcional sobre pata intermediario.';

GRANT EXECUTE ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz
) TO service_role;
