-- RPC: sincronizar CC (cliente e intermediario) y caja para una orden en una sola transacción.
-- El front construye los rows (misma lógica que hoy) y los envía en JSONB; esta función hace delete + insert atómicos.
-- Ejecutar en Supabase SQL Editor.
-- Nota: transaccion_numero / orden_numero se leen con ->> (texto) y luego ::integer para que JSON null
-- no rompa el INSERT (evita "cannot cast jsonb null to type integer" en filas de comisión con transaccion_numero null).

CREATE OR REPLACE FUNCTION public.sync_cc_caja_orden(
  p_orden_id uuid,
  p_usuario_id uuid,
  p_rows_cc_cliente jsonb DEFAULT '[]'::jsonb,
  p_rows_cc_int jsonb DEFAULT '[]'::jsonb,
  p_rows_caja jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  ids_trx uuid[];
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN;
  END IF;

  -- 1) Obtener ids de transacciones de esta orden (para borrar movimientos_caja por transacción)
  SELECT COALESCE(array_agg(t.id), array[]::uuid[])
  INTO ids_trx
  FROM public.transacciones t
  JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
  WHERE i.orden_id = p_orden_id;

  -- 2) Borrar movimientos CC cliente e intermediario de esta orden
  DELETE FROM public.movimientos_cuenta_corriente WHERE orden_id = p_orden_id;
  DELETE FROM public.movimientos_cuenta_corriente_intermediario WHERE orden_id = p_orden_id;

  -- 3) Borrar movimientos de caja: por transacciones de la orden y por orden_id (transaccion_id null)
  IF array_length(ids_trx, 1) > 0 THEN
    DELETE FROM public.movimientos_caja WHERE transaccion_id = ANY(ids_trx);
  END IF;
  DELETE FROM public.movimientos_caja WHERE orden_id = p_orden_id AND transaccion_id IS NULL;

  -- 4) Insertar movimientos CC cliente (incluir_en_detalle desde JSON; saldo = suma de todos los no anulados)
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows_cc_cliente)
  LOOP
    INSERT INTO public.movimientos_cuenta_corriente (
      cliente_id, orden_id, transaccion_id, transaccion_numero, concepto, fecha, usuario_id,
      moneda, monto, monto_usd, monto_ars, monto_eur, estado, estado_fecha, incluir_en_detalle
    ) VALUES (
      (r->>'cliente_id')::uuid,
      (r->>'orden_id')::uuid,
      (r->>'transaccion_id')::uuid,
      (r->>'transaccion_numero')::integer,
      r->>'concepto',
      COALESCE((r->>'fecha')::date, CURRENT_DATE),
      COALESCE((r->>'usuario_id')::uuid, p_usuario_id),
      r->>'moneda',
      (r->>'monto')::numeric,
      COALESCE((r->>'monto_usd')::numeric, 0),
      COALESCE((r->>'monto_ars')::numeric, 0),
      COALESCE((r->>'monto_eur')::numeric, 0),
      COALESCE(r->>'estado', 'cerrado'),
      COALESCE((r->>'estado_fecha')::timestamptz, now()),
      COALESCE((r->>'incluir_en_detalle')::boolean, true)
    );
  END LOOP;

  -- 5) Insertar movimientos CC intermediario
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows_cc_int)
  LOOP
    INSERT INTO public.movimientos_cuenta_corriente_intermediario (
      intermediario_id, orden_id, transaccion_id, transaccion_numero, concepto, fecha, usuario_id,
      moneda, monto, monto_usd, monto_ars, monto_eur, estado, estado_fecha, incluir_en_detalle
    ) VALUES (
      (r->>'intermediario_id')::uuid,
      (r->>'orden_id')::uuid,
      (r->>'transaccion_id')::uuid,
      (r->>'transaccion_numero')::integer,
      r->>'concepto',
      COALESCE((r->>'fecha')::date, CURRENT_DATE),
      COALESCE((r->>'usuario_id')::uuid, p_usuario_id),
      r->>'moneda',
      (r->>'monto')::numeric,
      COALESCE((r->>'monto_usd')::numeric, 0),
      COALESCE((r->>'monto_ars')::numeric, 0),
      COALESCE((r->>'monto_eur')::numeric, 0),
      COALESCE(r->>'estado', 'cerrado'),
      COALESCE((r->>'estado_fecha')::timestamptz, now()),
      COALESCE((r->>'incluir_en_detalle')::boolean, true)
    );
  END LOOP;

  -- 6) Insertar movimientos de caja
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows_caja)
  LOOP
    INSERT INTO public.movimientos_caja (
      moneda, monto, caja_tipo, transaccion_id, orden_id, orden_numero, transaccion_numero,
      concepto, fecha, usuario_id
    ) VALUES (
      r->>'moneda',
      (r->>'monto')::numeric,
      COALESCE(r->>'caja_tipo', 'efectivo'),
      (r->>'transaccion_id')::uuid,
      (r->>'orden_id')::uuid,
      (r->>'orden_numero')::integer,
      (r->>'transaccion_numero')::integer,
      r->>'concepto',
      COALESCE((r->>'fecha')::date, CURRENT_DATE),
      COALESCE((r->>'usuario_id')::uuid, p_usuario_id)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_orden IS 'Sync CC cliente, CC intermediario y caja para una orden. Recibe rows ya calculados por el front (JSONB). Ejecuta delete + insert en una transacción. Llamar desde el front tras construir rowsCcCliente, rowsCcInt, rowsCaja.';

-- Permitir invocar la RPC desde el front (anon con sesión o authenticated)
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;
