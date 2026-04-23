-- Fase 1.2 performance: huérfanos en sync_cc_caja_orden vía DELETE … NOT EXISTS (anti-join).
-- Paridad con el script canónico sql/rpc_sync_cc_caja_orden.sql (líneas 11–401).

CREATE OR REPLACE FUNCTION public.parse_movimiento_clasificacion_desde_jsonb(
  j jsonb,
  key text DEFAULT 'clasificacion_movimiento'
)
RETURNS public.movimiento_clasificacion
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := trim(COALESCE(j->>key, ''));
  IF v = '' THEN
    RETURN 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;
  END IF;
  BEGIN
    RETURN v::public.movimiento_clasificacion;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN 'LEGACY_SIN_CLASIFICAR'::public.movimiento_clasificacion;
  END;
END;
$$;

COMMENT ON FUNCTION public.parse_movimiento_clasificacion_desde_jsonb(jsonb, text) IS
  'Lee clasificación desde JSONB del sync; valor vacío o no ENUM → LEGACY_SIN_CLASIFICAR.';

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
  v_mid uuid;
  v_fecha date;
  v_usuario uuid;
  v_monto numeric;
  v_monto_usd numeric;
  v_monto_ars numeric;
  v_monto_eur numeric;
  v_estado text;
  v_estado_fecha timestamptz;
  v_incluir boolean;
  v_concepto text;
  v_trx uuid;
  v_trx_n int;
  v_cli uuid;
  v_int uuid;
  v_mon text;
  v_caja_tipo text;
  v_ord_num int;
  v_clasificacion public.movimiento_clasificacion;
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(t.id), array[]::uuid[])
  INTO ids_trx
  FROM public.transacciones t
  JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
  WHERE i.orden_id = p_orden_id;

  -- ========== CC cliente: upsert por clave lógica (alineada al dedupe en main.js) ==========
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows_cc_cliente, '[]'::jsonb))
  LOOP
    v_cli := (r->>'cliente_id')::uuid;
    v_trx := NULLIF(TRIM(COALESCE(r->>'transaccion_id', '')), '')::uuid;
    IF trim(COALESCE(r->>'transaccion_numero', '')) = '' THEN
      v_trx_n := NULL;
    ELSE
      v_trx_n := (trim(r->>'transaccion_numero'))::integer;
    END IF;
    v_mon := upper(trim(COALESCE(r->>'moneda', '')));
    v_monto := (r->>'monto')::numeric;
    v_concepto := r->>'concepto';
    v_clasificacion := public.parse_movimiento_clasificacion_desde_jsonb(r);

    SELECT m.id INTO v_mid
    FROM public.movimientos_cuenta_corriente m
    WHERE m.orden_id = p_orden_id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND m.cliente_id = v_cli
      AND m.transaccion_id IS NOT DISTINCT FROM v_trx
      AND m.transaccion_numero IS NOT DISTINCT FROM v_trx_n
      AND upper(trim(m.moneda)) = v_mon
      AND m.monto IS NOT DISTINCT FROM v_monto
      AND m.clasificacion_movimiento IS NOT DISTINCT FROM v_clasificacion
      AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(v_concepto, ''), 72)
    LIMIT 1;

    v_fecha := COALESCE((r->>'fecha')::date, public.fecha_hoy_argentina());
    v_usuario := COALESCE(
      NULLIF(TRIM(COALESCE(r->>'usuario_id', '')), '')::uuid,
      (
        SELECT tr.usuario_id
        FROM public.transacciones tr
        WHERE v_trx IS NOT NULL AND tr.id = v_trx
        LIMIT 1
      ),
      (SELECT o.usuario_id FROM public.ordenes o WHERE o.id = p_orden_id LIMIT 1),
      p_usuario_id
    );
    v_monto_usd := COALESCE((r->>'monto_usd')::numeric, 0);
    v_monto_ars := COALESCE((r->>'monto_ars')::numeric, 0);
    v_monto_eur := COALESCE((r->>'monto_eur')::numeric, 0);
    v_estado := COALESCE(r->>'estado', 'cerrado');
    v_estado_fecha := COALESCE((r->>'estado_fecha')::timestamptz, now());
    v_incluir := COALESCE((r->>'incluir_en_detalle')::boolean, true);

    IF v_mid IS NOT NULL THEN
      UPDATE public.movimientos_cuenta_corriente m
      SET
        concepto = v_concepto,
        clasificacion_movimiento = v_clasificacion,
        fecha = v_fecha,
        usuario_id = v_usuario,
        moneda = v_mon,
        monto = v_monto,
        monto_usd = v_monto_usd,
        monto_ars = v_monto_ars,
        monto_eur = v_monto_eur,
        estado = v_estado,
        estado_fecha = CASE
          WHEN (
            m.concepto IS DISTINCT FROM v_concepto OR m.clasificacion_movimiento IS DISTINCT FROM v_clasificacion
            OR m.fecha IS DISTINCT FROM v_fecha OR m.usuario_id IS DISTINCT FROM v_usuario
            OR upper(trim(m.moneda)) IS DISTINCT FROM v_mon OR m.monto IS DISTINCT FROM v_monto
            OR m.monto_usd IS DISTINCT FROM v_monto_usd OR m.monto_ars IS DISTINCT FROM v_monto_ars OR m.monto_eur IS DISTINCT FROM v_monto_eur
            OR m.estado IS DISTINCT FROM v_estado OR m.incluir_en_detalle IS DISTINCT FROM v_incluir
          ) THEN v_estado_fecha
          ELSE m.estado_fecha
        END,
        incluir_en_detalle = v_incluir
      WHERE m.id = v_mid;
    ELSE
      INSERT INTO public.movimientos_cuenta_corriente (
        cliente_id, orden_id, transaccion_id, transaccion_numero, concepto, clasificacion_movimiento, fecha, usuario_id,
        moneda, monto, monto_usd, monto_ars, monto_eur, estado, estado_fecha, incluir_en_detalle
      ) VALUES (
        v_cli, p_orden_id, v_trx, v_trx_n, v_concepto, v_clasificacion, v_fecha, v_usuario,
        v_mon, v_monto, v_monto_usd, v_monto_ars, v_monto_eur, v_estado, v_estado_fecha, v_incluir
      );
    END IF;
  END LOOP;

  DELETE FROM public.movimientos_cuenta_corriente m
  WHERE m.orden_id = p_orden_id
    AND COALESCE(m.es_movimiento_manual, false) = false
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_rows_cc_cliente, '[]'::jsonb)) AS j(elem)
      WHERE m.cliente_id = (elem->>'cliente_id')::uuid
        AND m.transaccion_id IS NOT DISTINCT FROM NULLIF(TRIM(COALESCE(elem->>'transaccion_id', '')), '')::uuid
        AND m.transaccion_numero IS NOT DISTINCT FROM (
          CASE
            WHEN trim(COALESCE(elem->>'transaccion_numero', '')) = '' THEN NULL
            ELSE (trim(elem->>'transaccion_numero'))::integer
          END
        )
        AND upper(trim(m.moneda)) = upper(trim(COALESCE(elem->>'moneda', '')))
        AND m.monto IS NOT DISTINCT FROM (elem->>'monto')::numeric
        AND m.clasificacion_movimiento IS NOT DISTINCT FROM public.parse_movimiento_clasificacion_desde_jsonb(elem)
        AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(elem->>'concepto', ''), 72)
    );

  -- ========== CC intermediario ==========
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows_cc_int, '[]'::jsonb))
  LOOP
    v_int := (r->>'intermediario_id')::uuid;
    v_trx := NULLIF(TRIM(COALESCE(r->>'transaccion_id', '')), '')::uuid;
    IF trim(COALESCE(r->>'transaccion_numero', '')) = '' THEN
      v_trx_n := NULL;
    ELSE
      v_trx_n := (trim(r->>'transaccion_numero'))::integer;
    END IF;
    v_mon := upper(trim(COALESCE(r->>'moneda', '')));
    v_monto := (r->>'monto')::numeric;
    v_concepto := r->>'concepto';
    v_clasificacion := public.parse_movimiento_clasificacion_desde_jsonb(r);

    SELECT m.id INTO v_mid
    FROM public.movimientos_cuenta_corriente_intermediario m
    WHERE m.orden_id = p_orden_id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND m.intermediario_id = v_int
      AND m.transaccion_id IS NOT DISTINCT FROM v_trx
      AND m.transaccion_numero IS NOT DISTINCT FROM v_trx_n
      AND upper(trim(m.moneda)) = v_mon
      AND m.monto IS NOT DISTINCT FROM v_monto
      AND m.clasificacion_movimiento IS NOT DISTINCT FROM v_clasificacion
      AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(v_concepto, ''), 72)
    LIMIT 1;

    v_fecha := COALESCE((r->>'fecha')::date, public.fecha_hoy_argentina());
    v_usuario := COALESCE(
      NULLIF(TRIM(COALESCE(r->>'usuario_id', '')), '')::uuid,
      (SELECT tr.usuario_id FROM public.transacciones tr WHERE v_trx IS NOT NULL AND tr.id = v_trx LIMIT 1),
      (SELECT o.usuario_id FROM public.ordenes o WHERE o.id = p_orden_id LIMIT 1),
      p_usuario_id
    );
    v_monto_usd := COALESCE((r->>'monto_usd')::numeric, 0);
    v_monto_ars := COALESCE((r->>'monto_ars')::numeric, 0);
    v_monto_eur := COALESCE((r->>'monto_eur')::numeric, 0);
    v_estado := COALESCE(r->>'estado', 'cerrado');
    v_estado_fecha := COALESCE((r->>'estado_fecha')::timestamptz, now());
    v_incluir := COALESCE((r->>'incluir_en_detalle')::boolean, true);

    IF v_mid IS NOT NULL THEN
      UPDATE public.movimientos_cuenta_corriente_intermediario m
      SET
        concepto = v_concepto,
        clasificacion_movimiento = v_clasificacion,
        fecha = v_fecha,
        usuario_id = v_usuario,
        moneda = v_mon,
        monto = v_monto,
        monto_usd = v_monto_usd,
        monto_ars = v_monto_ars,
        monto_eur = v_monto_eur,
        estado = v_estado,
        estado_fecha = CASE
          WHEN (
            m.concepto IS DISTINCT FROM v_concepto OR m.clasificacion_movimiento IS DISTINCT FROM v_clasificacion
            OR m.fecha IS DISTINCT FROM v_fecha OR m.usuario_id IS DISTINCT FROM v_usuario
            OR upper(trim(m.moneda)) IS DISTINCT FROM v_mon OR m.monto IS DISTINCT FROM v_monto
            OR m.monto_usd IS DISTINCT FROM v_monto_usd OR m.monto_ars IS DISTINCT FROM v_monto_ars OR m.monto_eur IS DISTINCT FROM v_monto_eur
            OR m.estado IS DISTINCT FROM v_estado OR m.incluir_en_detalle IS DISTINCT FROM v_incluir
          ) THEN v_estado_fecha
          ELSE m.estado_fecha
        END,
        incluir_en_detalle = v_incluir
      WHERE m.id = v_mid;
    ELSE
      INSERT INTO public.movimientos_cuenta_corriente_intermediario (
        intermediario_id, orden_id, transaccion_id, transaccion_numero, concepto, clasificacion_movimiento, fecha, usuario_id,
        moneda, monto, monto_usd, monto_ars, monto_eur, estado, estado_fecha, incluir_en_detalle
      ) VALUES (
        v_int, p_orden_id, v_trx, v_trx_n, v_concepto, v_clasificacion, v_fecha, v_usuario,
        v_mon, v_monto, v_monto_usd, v_monto_ars, v_monto_eur, v_estado, v_estado_fecha, v_incluir
      );
    END IF;
  END LOOP;

  DELETE FROM public.movimientos_cuenta_corriente_intermediario m
  WHERE m.orden_id = p_orden_id
    AND COALESCE(m.es_movimiento_manual, false) = false
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_rows_cc_int, '[]'::jsonb)) AS j(elem)
      WHERE m.intermediario_id = (elem->>'intermediario_id')::uuid
        AND m.transaccion_id IS NOT DISTINCT FROM NULLIF(TRIM(COALESCE(elem->>'transaccion_id', '')), '')::uuid
        AND m.transaccion_numero IS NOT DISTINCT FROM (
          CASE
            WHEN trim(COALESCE(elem->>'transaccion_numero', '')) = '' THEN NULL
            ELSE (trim(elem->>'transaccion_numero'))::integer
          END
        )
        AND upper(trim(m.moneda)) = upper(trim(COALESCE(elem->>'moneda', '')))
        AND m.monto IS NOT DISTINCT FROM (elem->>'monto')::numeric
        AND m.clasificacion_movimiento IS NOT DISTINCT FROM public.parse_movimiento_clasificacion_desde_jsonb(elem)
        AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(elem->>'concepto', ''), 72)
    );

  -- ========== Caja (derivados: sin tipo_movimiento_id) ==========
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows_caja, '[]'::jsonb))
  LOOP
    v_trx := NULLIF(TRIM(COALESCE(r->>'transaccion_id', '')), '')::uuid;
    IF trim(COALESCE(r->>'transaccion_numero', '')) = '' THEN
      v_trx_n := NULL;
    ELSE
      v_trx_n := (trim(r->>'transaccion_numero'))::integer;
    END IF;
    IF trim(COALESCE(r->>'orden_numero', '')) = '' THEN
      v_ord_num := NULL;
    ELSE
      v_ord_num := (trim(r->>'orden_numero'))::integer;
    END IF;
    v_mon := upper(trim(COALESCE(r->>'moneda', '')));
    v_monto := (r->>'monto')::numeric;
    v_caja_tipo := COALESCE(r->>'caja_tipo', 'efectivo');
    v_concepto := r->>'concepto';
    v_clasificacion := public.parse_movimiento_clasificacion_desde_jsonb(r);
    v_fecha := COALESCE((r->>'fecha')::date, public.fecha_hoy_argentina());
    v_usuario := NULLIF(TRIM(COALESCE(r->>'usuario_id', '')), '')::uuid;

    SELECT m.id INTO v_mid
    FROM public.movimientos_caja m
    WHERE m.tipo_movimiento_id IS NULL
      AND m.transaccion_numero IS NOT DISTINCT FROM v_trx_n
      AND upper(trim(m.moneda)) = v_mon
      AND m.monto IS NOT DISTINCT FROM v_monto
      AND COALESCE(m.caja_tipo, 'efectivo') = v_caja_tipo
      AND m.orden_numero IS NOT DISTINCT FROM v_ord_num
      AND m.clasificacion_movimiento IS NOT DISTINCT FROM v_clasificacion
      AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(v_concepto, ''), 72)
      AND (
        (v_trx IS NOT NULL AND m.transaccion_id = v_trx)
        OR (v_trx IS NULL AND m.orden_id = p_orden_id AND m.transaccion_id IS NULL)
      )
    LIMIT 1;

    IF v_mid IS NOT NULL THEN
      UPDATE public.movimientos_caja m
      SET
        moneda = v_mon,
        monto = v_monto,
        caja_tipo = v_caja_tipo,
        orden_id = p_orden_id,
        orden_numero = v_ord_num,
        transaccion_numero = v_trx_n,
        concepto = v_concepto,
        clasificacion_movimiento = v_clasificacion,
        fecha = v_fecha,
        usuario_id = v_usuario
      WHERE m.id = v_mid
        AND (
          m.moneda IS DISTINCT FROM v_mon OR m.monto IS DISTINCT FROM v_monto OR m.caja_tipo IS DISTINCT FROM v_caja_tipo
          OR m.orden_numero IS DISTINCT FROM v_ord_num OR m.transaccion_numero IS DISTINCT FROM v_trx_n
          OR m.concepto IS DISTINCT FROM v_concepto OR m.clasificacion_movimiento IS DISTINCT FROM v_clasificacion
          OR m.fecha IS DISTINCT FROM v_fecha OR m.usuario_id IS DISTINCT FROM v_usuario
        );
    ELSE
      INSERT INTO public.movimientos_caja (
        moneda, monto, caja_tipo, transaccion_id, orden_id, orden_numero, transaccion_numero,
        concepto, clasificacion_movimiento, fecha, usuario_id
      ) VALUES (
        v_mon, v_monto, v_caja_tipo, v_trx, p_orden_id, v_ord_num, v_trx_n,
        v_concepto, v_clasificacion, v_fecha, v_usuario
      );
    END IF;
  END LOOP;

  DELETE FROM public.movimientos_caja m
  WHERE m.tipo_movimiento_id IS NULL
    AND (
      m.orden_id = p_orden_id
      OR (cardinality(ids_trx) > 0 AND m.transaccion_id IS NOT NULL AND m.transaccion_id = ANY (ids_trx))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_rows_caja, '[]'::jsonb)) AS j(elem)
      WHERE m.transaccion_id IS NOT DISTINCT FROM NULLIF(TRIM(COALESCE(elem->>'transaccion_id', '')), '')::uuid
        AND m.transaccion_numero IS NOT DISTINCT FROM (
          CASE
            WHEN trim(COALESCE(elem->>'transaccion_numero', '')) = '' THEN NULL
            ELSE (trim(elem->>'transaccion_numero'))::integer
          END
        )
        AND m.orden_numero IS NOT DISTINCT FROM (
          CASE
            WHEN trim(COALESCE(elem->>'orden_numero', '')) = '' THEN NULL
            ELSE (trim(elem->>'orden_numero'))::integer
          END
        )
        AND upper(trim(m.moneda)) = upper(trim(COALESCE(elem->>'moneda', '')))
        AND m.monto IS NOT DISTINCT FROM (elem->>'monto')::numeric
        AND COALESCE(m.caja_tipo, 'efectivo') = COALESCE(elem->>'caja_tipo', 'efectivo')
        AND m.clasificacion_movimiento IS NOT DISTINCT FROM public.parse_movimiento_clasificacion_desde_jsonb(elem)
        AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(elem->>'concepto', ''), 72)
        AND (
          (
            NULLIF(TRIM(COALESCE(elem->>'transaccion_id', '')), '')::uuid IS NOT NULL
            AND m.transaccion_id = NULLIF(TRIM(COALESCE(elem->>'transaccion_id', '')), '')::uuid
          )
          OR (
            NULLIF(TRIM(COALESCE(elem->>'transaccion_id', '')), '')::uuid IS NULL
            AND m.orden_id = p_orden_id
            AND m.transaccion_id IS NULL
          )
        )
    );
END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_orden IS
  'Sync CC cliente, CC intermediario y caja para una orden (JSONB desde el front). Versión diff: UPDATE/INSERT/DELETE por clave lógica (incluye clasificacion_movimiento + left(concepto,72)); huérfanos con DELETE … NOT EXISTS sobre jsonb_array_elements (anti-join). Respeta CC manual (es_movimiento_manual). Caja: solo filas sin tipo_movimiento_id. JSON opcional clasificacion_movimiento → parse_movimiento_clasificacion_desde_jsonb.';

GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;
