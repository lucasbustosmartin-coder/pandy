-- RPC batch: sincronizar CC/caja de varias órdenes en un viaje HTTP (opción A / Refrescar).
-- Cada ítem llama a public.sync_cc_caja_orden (mismo libro INSERT/UPDATE/ANULAR, capa 2).
-- Un fallo en una orden no aborta el lote (subtransacción por EXCEPTION).
-- El motor sigue en el front: este script solo reduce N round-trips de escritura.
-- Aplicado en Pandy y Pandy-Dev (2026-11-03). Si la RPC no está, el front hace fallback a N×sync_cc_caja_orden.
-- Requiere: sql/rpc_sync_cc_caja_orden.sql ya instalado.

CREATE OR REPLACE FUNCTION public.sync_cc_caja_ordenes(
  p_items jsonb,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_ok int := 0;
  v_err jsonb := '[]'::jsonb;
  v_orden uuid;
  v_uid uuid;
  v_msg text;
  v_cli jsonb;
  v_int jsonb;
  v_caja jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', 0, 'errores', '[]'::jsonb);
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_orden := NULL;
    BEGIN
      v_orden := NULLIF(trim(COALESCE(item->>'orden_id', item->>'p_orden_id', '')), '')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_orden := NULL;
    END;
    IF v_orden IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_uid := NULLIF(trim(COALESCE(item->>'usuario_id', item->>'p_usuario_id', '')), '')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_uid := NULL;
    END;
    v_uid := COALESCE(v_uid, p_usuario_id);
    v_cli := COALESCE(item->'rows_cc_cliente', item->'p_rows_cc_cliente', '[]'::jsonb);
    v_int := COALESCE(item->'rows_cc_int', item->'p_rows_cc_int', '[]'::jsonb);
    v_caja := COALESCE(item->'rows_caja', item->'p_rows_caja', '[]'::jsonb);
    IF jsonb_typeof(v_cli) IS DISTINCT FROM 'array' THEN
      v_cli := '[]'::jsonb;
    END IF;
    IF jsonb_typeof(v_int) IS DISTINCT FROM 'array' THEN
      v_int := '[]'::jsonb;
    END IF;
    IF jsonb_typeof(v_caja) IS DISTINCT FROM 'array' THEN
      v_caja := '[]'::jsonb;
    END IF;

    BEGIN
      PERFORM public.sync_cc_caja_orden(v_orden, v_uid, v_cli, v_int, v_caja);
      v_ok := v_ok + 1;
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        v_err := v_err || jsonb_build_array(
          jsonb_build_object(
            'orden_id', v_orden,
            'error', left(COALESCE(v_msg, 'error'), 500)
          )
        );
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', v_ok, 'errores', v_err);
END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_ordenes(jsonb, uuid) IS
  'Sync CC/caja de varias órdenes en un viaje. Cada ítem: orden_id, usuario_id, rows_cc_cliente, rows_cc_int, rows_caja. Delega en sync_cc_caja_orden. Un error no aborta el lote. Usado por Refrescar (opción A).';

REVOKE ALL ON FUNCTION public.sync_cc_caja_ordenes(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_ordenes(jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_ordenes(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_ordenes(jsonb, uuid) TO service_role;
