-- Asignación atómica de numero de orden (MAX+1) con lock, sin huecos ni colisiones por concurrencia.
-- Ejecutar en Supabase SQL Editor. Requiere que la tabla ordenes tenga la columna numero (integer UNIQUE NOT NULL).
-- La app llama a esta función vía RPC en lugar de INSERT directo al crear una orden nueva.

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
  -- Lock transaccional: serializa la asignación de numero entre todas las sesiones.
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
    p_observaciones,
    p_usuario_id,
    p_updated_at
  )
  RETURNING ordenes.id, ordenes.numero;
END;
$$;

COMMENT ON FUNCTION public.ordenes_insertar_con_proximo_numero IS 'Inserta una orden con numero = MAX(numero)+1 bajo lock; evita huecos y colisiones por concurrencia.';

-- Permiso para roles que pueden crear órdenes (ajustar si usás anon/authenticated/service_role).
GRANT EXECUTE ON FUNCTION public.ordenes_insertar_con_proximo_numero TO authenticated;
GRANT EXECUTE ON FUNCTION public.ordenes_insertar_con_proximo_numero TO service_role;
