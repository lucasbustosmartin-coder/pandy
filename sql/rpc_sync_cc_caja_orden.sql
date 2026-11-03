-- RPC: sincronizar CC (cliente e intermediario) y caja para una orden en una sola transacción.
-- El front construye los rows (misma lógica que hoy) y los envía en JSONB.
-- Versión **libro**: INSERT altas, UPDATE si cambió algo útil, ANULAR huérfanos (estado = anulado).
-- **No DELETE** de filas derivadas. Conserva `id` cuando la clave lógica es la misma.
-- Capa 2: identidad = transacción + moneda + `sync_clave` (familia de leyenda + signo). El monto se edita in-place.
-- No toca filas CC con `es_movimiento_manual = true`. Caja: solo `tipo_movimiento_id IS NULL` (derivados).
-- Lock por orden (pg_advisory_xact_lock) para no insertar gemelos con dos syncs concurrentes.
-- Auditoría estructurada en auditoria_app (categoría cc_caja_sync) ante alta, edición material y anulación.
-- Ejecutar en Supabase SQL Editor (reemplaza la función anterior).
-- Nota: transaccion_numero / orden_numero vía ->> y cast para JSON null (igual que antes).
-- Clasificación: JSON opcional `clasificacion_movimiento`. Si falta o es inválido → LEGACY_SIN_CLASIFICAR.
-- Requiere migración: sql/migracion_movimiento_clasificacion_fase0_ddl.sql
-- Índices únicos de un vivo: sql/migracion_sync_cc_caja_clave_identidad.sql (capa 2; reemplaza los de capa 1).

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

CREATE OR REPLACE FUNCTION public.sync_cc_caja_fmt_monto(p_monto numeric, p_moneda text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_monto IS NULL THEN '—'
    ELSE replace(trim(to_char(p_monto, 'FM999999999990.00')), '.', ',') || ' ' || COALESCE(NULLIF(trim(p_moneda), ''), '')
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cc_caja_etiqueta_caja(p_caja_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(COALESCE(p_caja_tipo, '')))
    WHEN 'efectivo' THEN 'Efectivo'
    WHEN 'banco' THEN 'Banco (transferencia)'
    WHEN 'cheque' THEN 'Cheque'
    WHEN '' THEN '—'
    ELSE initcap(trim(p_caja_tipo))
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cc_caja_medio_pago_de_trx(p_trx uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(trim(mp.nombre), ''), NULLIF(trim(mp.codigo), ''), '—')
  FROM public.transacciones t
  LEFT JOIN public.modos_pago mp ON mp.id = t.modo_pago_id
  WHERE t.id = p_trx
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.sync_cc_caja_registrar_auditoria(
  p_accion text,
  p_detalle text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.auditoria_app (usuario_id, categoria, accion, detalle, metadata)
  VALUES (
    v_uid,
    'cc_caja_sync',
    COALESCE(NULLIF(trim(p_accion), ''), 'editar'),
    left(COALESCE(p_detalle, ''), 8000),
    p_metadata
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_registrar_auditoria(text, text, jsonb) IS
  'Alta/edición/anulación del sync CC-caja hacia auditoria_app. No aborta el sync si falla el INSERT (RLS).';

CREATE OR REPLACE FUNCTION public.sync_cc_caja_orden(
  p_orden_id uuid,
  p_usuario_id uuid,
  p_rows_cc_cliente jsonb DEFAULT '[]'::jsonb,
  p_rows_cc_int jsonb DEFAULT '[]'::jsonb,
  p_rows_caja jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
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
  v_clave text;
  v_orden_n int;
  v_entidad text;
  v_medio text;
  v_old_estado text;
  v_old_monto numeric;
  v_old_mon text;
  v_old_concepto text;
  v_old_caja text;
  v_old_fecha date;
  v_material boolean;
  v_aud record;
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(870011, hashtext(p_orden_id::text));

  SELECT o.numero INTO v_orden_n FROM public.ordenes o WHERE o.id = p_orden_id LIMIT 1;

  SELECT COALESCE(array_agg(t.id), array[]::uuid[])
  INTO ids_trx
  FROM public.transacciones t
  JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
  WHERE i.orden_id = p_orden_id;

  -- ========== CC cliente: upsert por clave lógica; huérfanos se ANULAN ==========
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
    v_clave := COALESCE(
      NULLIF(trim(r->>'sync_clave'), ''),
      public.sync_cc_caja_clave_identidad(v_concepto, v_monto, 'cc')
    );

    SELECT m.id, m.estado, m.monto, m.moneda, m.concepto, m.fecha
    INTO v_mid, v_old_estado, v_old_monto, v_old_mon, v_old_concepto, v_old_fecha
    FROM public.movimientos_cuenta_corriente m
    WHERE m.orden_id = p_orden_id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND m.cliente_id = v_cli
      AND m.transaccion_id IS NOT DISTINCT FROM v_trx
      AND m.transaccion_numero IS NOT DISTINCT FROM v_trx_n
      AND upper(trim(m.moneda)) = v_mon
      AND (
        m.sync_clave IS NOT DISTINCT FROM v_clave
        OR (
          m.sync_clave IS NULL
          AND m.monto IS NOT DISTINCT FROM v_monto
          AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(v_concepto, ''), 72)
        )
      )
    ORDER BY CASE WHEN COALESCE(lower(m.estado), '') IN ('anulado', 'anulada') THEN 1 ELSE 0 END,
             m.created_at ASC NULLS LAST, m.id
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
      v_material := (
        v_old_concepto IS DISTINCT FROM v_concepto
        OR v_old_fecha IS DISTINCT FROM v_fecha
        OR upper(trim(COALESCE(v_old_mon, ''))) IS DISTINCT FROM v_mon
        OR v_old_monto IS DISTINCT FROM v_monto
        OR v_old_estado IS DISTINCT FROM v_estado
      );
      UPDATE public.movimientos_cuenta_corriente m
      SET
        sync_clave = v_clave,
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
      IF v_material THEN
        SELECT c.nombre INTO v_entidad FROM public.clientes c WHERE c.id = v_cli LIMIT 1;
        v_medio := public.sync_cc_caja_medio_pago_de_trx(v_trx);
        PERFORM public.sync_cc_caja_registrar_auditoria(
          'editar',
          'Cuenta corriente cliente · ' || COALESCE(v_entidad, '—')
            || ' · Orden ' || COALESCE(v_orden_n::text, '—')
            || COALESCE(' · Trans ' || v_trx_n::text, '')
            || ': se editó el movimiento ' || public.sync_cc_caja_fmt_monto(v_monto, v_mon)
            || ' («' || left(COALESCE(v_concepto, ''), 80) || '»).'
            || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
          jsonb_build_object(
            'entidad', 'cc_cliente',
            'libro', 'Cuenta corriente cliente',
            'orden_id', p_orden_id,
            'orden_numero', v_orden_n,
            'transaccion_id', v_trx,
            'transaccion_numero', v_trx_n,
            'registro_id', v_mid,
            'cliente_nombre', v_entidad,
            'moneda', v_mon,
            'medio_pago', v_medio,
            'cambios', jsonb_build_array(
              jsonb_build_object('campo', 'Estado', 'anterior', v_old_estado, 'nuevo', v_estado),
              jsonb_build_object('campo', 'Monto', 'anterior', v_old_monto, 'nuevo', v_monto),
              jsonb_build_object('campo', 'Moneda', 'anterior', v_old_mon, 'nuevo', v_mon),
              jsonb_build_object('campo', 'Medio de pago', 'anterior', NULL, 'nuevo', v_medio),
              jsonb_build_object('campo', 'Concepto', 'anterior', v_old_concepto, 'nuevo', v_concepto)
            )
          )
        );
      END IF;
    ELSE
      INSERT INTO public.movimientos_cuenta_corriente (
        cliente_id, orden_id, transaccion_id, transaccion_numero, concepto, clasificacion_movimiento, sync_clave, fecha, usuario_id,
        moneda, monto, monto_usd, monto_ars, monto_eur, estado, estado_fecha, incluir_en_detalle
      ) VALUES (
        v_cli, p_orden_id, v_trx, v_trx_n, v_concepto, v_clasificacion, v_clave, v_fecha, v_usuario,
        v_mon, v_monto, v_monto_usd, v_monto_ars, v_monto_eur, v_estado, v_estado_fecha, v_incluir
      )
      RETURNING id INTO v_mid;
      SELECT c.nombre INTO v_entidad FROM public.clientes c WHERE c.id = v_cli LIMIT 1;
      v_medio := public.sync_cc_caja_medio_pago_de_trx(v_trx);
      PERFORM public.sync_cc_caja_registrar_auditoria(
        'alta',
        'Cuenta corriente cliente · ' || COALESCE(v_entidad, '—')
          || ' · Orden ' || COALESCE(v_orden_n::text, '—')
          || COALESCE(' · Trans ' || v_trx_n::text, '')
          || ': se registró ' || public.sync_cc_caja_fmt_monto(v_monto, v_mon)
          || ' («' || left(COALESCE(v_concepto, ''), 80) || '»).'
          || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
        jsonb_build_object(
          'entidad', 'cc_cliente',
          'libro', 'Cuenta corriente cliente',
          'orden_id', p_orden_id,
          'orden_numero', v_orden_n,
          'transaccion_id', v_trx,
          'transaccion_numero', v_trx_n,
          'registro_id', v_mid,
          'cliente_nombre', v_entidad,
          'moneda', v_mon,
          'monto', v_monto,
          'estado', v_estado,
          'medio_pago', v_medio,
          'concepto', v_concepto,
          'cambios', jsonb_build_array(
            jsonb_build_object('campo', 'Monto', 'anterior', NULL, 'nuevo', v_monto),
            jsonb_build_object('campo', 'Moneda', 'anterior', NULL, 'nuevo', v_mon),
            jsonb_build_object('campo', 'Medio de pago', 'anterior', NULL, 'nuevo', v_medio),
            jsonb_build_object('campo', 'Estado', 'anterior', NULL, 'nuevo', v_estado)
          )
        )
      );
    END IF;
  END LOOP;

  FOR v_aud IN
    UPDATE public.movimientos_cuenta_corriente m
    SET estado = 'anulado', estado_fecha = now()
    WHERE m.orden_id = p_orden_id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND COALESCE(lower(m.estado), '') NOT IN ('anulado', 'anulada')
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
          AND m.sync_clave IS NOT DISTINCT FROM COALESCE(
            NULLIF(trim(elem->>'sync_clave'), ''),
            public.sync_cc_caja_clave_identidad(elem->>'concepto', (elem->>'monto')::numeric, 'cc')
          )
      )
    RETURNING m.id, m.cliente_id, m.transaccion_id, m.transaccion_numero, m.monto, m.moneda, m.concepto, m.estado
  LOOP
    SELECT c.nombre INTO v_entidad FROM public.clientes c WHERE c.id = v_aud.cliente_id LIMIT 1;
    v_medio := public.sync_cc_caja_medio_pago_de_trx(v_aud.transaccion_id);
    PERFORM public.sync_cc_caja_registrar_auditoria(
      'anular',
      'Cuenta corriente cliente · ' || COALESCE(v_entidad, '—')
        || ' · Orden ' || COALESCE(v_orden_n::text, '—')
        || COALESCE(' · Trans ' || v_aud.transaccion_numero::text, '')
        || ': se anuló el movimiento ' || public.sync_cc_caja_fmt_monto(v_aud.monto, v_aud.moneda)
        || ' («' || left(COALESCE(v_aud.concepto, ''), 80) || '»). No se borró la fila.',
      jsonb_build_object(
        'entidad', 'cc_cliente',
        'libro', 'Cuenta corriente cliente',
        'orden_id', p_orden_id,
        'orden_numero', v_orden_n,
        'transaccion_id', v_aud.transaccion_id,
        'transaccion_numero', v_aud.transaccion_numero,
        'registro_id', v_aud.id,
        'cliente_nombre', v_entidad,
        'moneda', v_aud.moneda,
        'monto', v_aud.monto,
        'medio_pago', v_medio,
        'concepto', v_aud.concepto,
        'cambios', jsonb_build_array(
          jsonb_build_object('campo', 'Estado', 'anterior', 'cerrado', 'nuevo', 'anulado')
        )
      )
    );
  END LOOP;

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
    v_clave := COALESCE(
      NULLIF(trim(r->>'sync_clave'), ''),
      public.sync_cc_caja_clave_identidad(v_concepto, v_monto, 'cc')
    );

    SELECT m.id, m.estado, m.monto, m.moneda, m.concepto, m.fecha
    INTO v_mid, v_old_estado, v_old_monto, v_old_mon, v_old_concepto, v_old_fecha
    FROM public.movimientos_cuenta_corriente_intermediario m
    WHERE m.orden_id = p_orden_id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND m.intermediario_id = v_int
      AND m.transaccion_id IS NOT DISTINCT FROM v_trx
      AND m.transaccion_numero IS NOT DISTINCT FROM v_trx_n
      AND upper(trim(m.moneda)) = v_mon
      AND (
        m.sync_clave IS NOT DISTINCT FROM v_clave
        OR (
          m.sync_clave IS NULL
          AND m.monto IS NOT DISTINCT FROM v_monto
          AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(v_concepto, ''), 72)
        )
      )
    ORDER BY CASE WHEN COALESCE(lower(m.estado), '') IN ('anulado', 'anulada') THEN 1 ELSE 0 END,
             m.created_at ASC NULLS LAST, m.id
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
      v_material := (
        v_old_concepto IS DISTINCT FROM v_concepto
        OR v_old_fecha IS DISTINCT FROM v_fecha
        OR upper(trim(COALESCE(v_old_mon, ''))) IS DISTINCT FROM v_mon
        OR v_old_monto IS DISTINCT FROM v_monto
        OR v_old_estado IS DISTINCT FROM v_estado
      );
      UPDATE public.movimientos_cuenta_corriente_intermediario m
      SET
        sync_clave = v_clave,
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
      IF v_material THEN
        SELECT i.nombre INTO v_entidad FROM public.intermediarios i WHERE i.id = v_int LIMIT 1;
        v_medio := public.sync_cc_caja_medio_pago_de_trx(v_trx);
        PERFORM public.sync_cc_caja_registrar_auditoria(
          'editar',
          'Cuenta corriente intermediario · ' || COALESCE(v_entidad, '—')
            || ' · Orden ' || COALESCE(v_orden_n::text, '—')
            || COALESCE(' · Trans ' || v_trx_n::text, '')
            || ': se editó el movimiento ' || public.sync_cc_caja_fmt_monto(v_monto, v_mon)
            || ' («' || left(COALESCE(v_concepto, ''), 80) || '»).'
            || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
          jsonb_build_object(
            'entidad', 'cc_intermediario',
            'libro', 'Cuenta corriente intermediario',
            'orden_id', p_orden_id,
            'orden_numero', v_orden_n,
            'transaccion_id', v_trx,
            'transaccion_numero', v_trx_n,
            'registro_id', v_mid,
            'intermediario_nombre', v_entidad,
            'moneda', v_mon,
            'medio_pago', v_medio,
            'cambios', jsonb_build_array(
              jsonb_build_object('campo', 'Estado', 'anterior', v_old_estado, 'nuevo', v_estado),
              jsonb_build_object('campo', 'Monto', 'anterior', v_old_monto, 'nuevo', v_monto),
              jsonb_build_object('campo', 'Moneda', 'anterior', v_old_mon, 'nuevo', v_mon),
              jsonb_build_object('campo', 'Medio de pago', 'anterior', NULL, 'nuevo', v_medio),
              jsonb_build_object('campo', 'Concepto', 'anterior', v_old_concepto, 'nuevo', v_concepto)
            )
          )
        );
      END IF;
    ELSE
      INSERT INTO public.movimientos_cuenta_corriente_intermediario (
        intermediario_id, orden_id, transaccion_id, transaccion_numero, concepto, clasificacion_movimiento, sync_clave, fecha, usuario_id,
        moneda, monto, monto_usd, monto_ars, monto_eur, estado, estado_fecha, incluir_en_detalle
      ) VALUES (
        v_int, p_orden_id, v_trx, v_trx_n, v_concepto, v_clasificacion, v_clave, v_fecha, v_usuario,
        v_mon, v_monto, v_monto_usd, v_monto_ars, v_monto_eur, v_estado, v_estado_fecha, v_incluir
      )
      RETURNING id INTO v_mid;
      SELECT i.nombre INTO v_entidad FROM public.intermediarios i WHERE i.id = v_int LIMIT 1;
      v_medio := public.sync_cc_caja_medio_pago_de_trx(v_trx);
      PERFORM public.sync_cc_caja_registrar_auditoria(
        'alta',
        'Cuenta corriente intermediario · ' || COALESCE(v_entidad, '—')
          || ' · Orden ' || COALESCE(v_orden_n::text, '—')
          || COALESCE(' · Trans ' || v_trx_n::text, '')
          || ': se registró ' || public.sync_cc_caja_fmt_monto(v_monto, v_mon)
          || ' («' || left(COALESCE(v_concepto, ''), 80) || '»).'
          || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
        jsonb_build_object(
          'entidad', 'cc_intermediario',
          'libro', 'Cuenta corriente intermediario',
          'orden_id', p_orden_id,
          'orden_numero', v_orden_n,
          'transaccion_id', v_trx,
          'transaccion_numero', v_trx_n,
          'registro_id', v_mid,
          'intermediario_nombre', v_entidad,
          'moneda', v_mon,
          'monto', v_monto,
          'estado', v_estado,
          'medio_pago', v_medio,
          'concepto', v_concepto,
          'cambios', jsonb_build_array(
            jsonb_build_object('campo', 'Monto', 'anterior', NULL, 'nuevo', v_monto),
            jsonb_build_object('campo', 'Moneda', 'anterior', NULL, 'nuevo', v_mon),
            jsonb_build_object('campo', 'Medio de pago', 'anterior', NULL, 'nuevo', v_medio),
            jsonb_build_object('campo', 'Estado', 'anterior', NULL, 'nuevo', v_estado)
          )
        )
      );
    END IF;
  END LOOP;

  FOR v_aud IN
    UPDATE public.movimientos_cuenta_corriente_intermediario m
    SET estado = 'anulado', estado_fecha = now()
    WHERE m.orden_id = p_orden_id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND COALESCE(lower(m.estado), '') NOT IN ('anulado', 'anulada')
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
          AND m.sync_clave IS NOT DISTINCT FROM COALESCE(
            NULLIF(trim(elem->>'sync_clave'), ''),
            public.sync_cc_caja_clave_identidad(elem->>'concepto', (elem->>'monto')::numeric, 'cc')
          )
      )
    RETURNING m.id, m.intermediario_id, m.transaccion_id, m.transaccion_numero, m.monto, m.moneda, m.concepto
  LOOP
    SELECT i.nombre INTO v_entidad FROM public.intermediarios i WHERE i.id = v_aud.intermediario_id LIMIT 1;
    v_medio := public.sync_cc_caja_medio_pago_de_trx(v_aud.transaccion_id);
    PERFORM public.sync_cc_caja_registrar_auditoria(
      'anular',
      'Cuenta corriente intermediario · ' || COALESCE(v_entidad, '—')
        || ' · Orden ' || COALESCE(v_orden_n::text, '—')
        || COALESCE(' · Trans ' || v_aud.transaccion_numero::text, '')
        || ': se anuló el movimiento ' || public.sync_cc_caja_fmt_monto(v_aud.monto, v_aud.moneda)
        || ' («' || left(COALESCE(v_aud.concepto, ''), 80) || '»). No se borró la fila.',
      jsonb_build_object(
        'entidad', 'cc_intermediario',
        'libro', 'Cuenta corriente intermediario',
        'orden_id', p_orden_id,
        'orden_numero', v_orden_n,
        'transaccion_id', v_aud.transaccion_id,
        'transaccion_numero', v_aud.transaccion_numero,
        'registro_id', v_aud.id,
        'intermediario_nombre', v_entidad,
        'moneda', v_aud.moneda,
        'monto', v_aud.monto,
        'medio_pago', v_medio,
        'concepto', v_aud.concepto,
        'cambios', jsonb_build_array(
          jsonb_build_object('campo', 'Estado', 'anterior', 'cerrado', 'nuevo', 'anulado')
        )
      )
    );
  END LOOP;

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
    v_clave := COALESCE(
      NULLIF(trim(r->>'sync_clave'), ''),
      public.sync_cc_caja_clave_identidad(v_concepto, v_monto, 'caja')
    );
    v_fecha := COALESCE((r->>'fecha')::date, public.fecha_hoy_argentina());
    v_usuario := NULLIF(TRIM(COALESCE(r->>'usuario_id', '')), '')::uuid;
    v_estado := COALESCE(NULLIF(trim(r->>'estado'), ''), 'cerrado');

    SELECT m.id, m.estado, m.monto, m.moneda, m.concepto, m.fecha, m.caja_tipo
    INTO v_mid, v_old_estado, v_old_monto, v_old_mon, v_old_concepto, v_old_fecha, v_old_caja
    FROM public.movimientos_caja m
    WHERE m.tipo_movimiento_id IS NULL
      AND m.transaccion_numero IS NOT DISTINCT FROM v_trx_n
      AND upper(trim(m.moneda)) = v_mon
      AND COALESCE(m.caja_tipo, 'efectivo') = v_caja_tipo
      AND m.orden_numero IS NOT DISTINCT FROM v_ord_num
      AND (
        m.sync_clave IS NOT DISTINCT FROM v_clave
        OR (
          m.sync_clave IS NULL
          AND m.monto IS NOT DISTINCT FROM v_monto
          AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(v_concepto, ''), 72)
        )
      )
      AND (
        (v_trx IS NOT NULL AND m.transaccion_id = v_trx)
        OR (v_trx IS NULL AND m.orden_id = p_orden_id AND m.transaccion_id IS NULL)
      )
    ORDER BY CASE WHEN COALESCE(lower(m.estado), '') IN ('anulado', 'anulada') THEN 1 ELSE 0 END,
             m.created_at ASC NULLS LAST, m.id
    LIMIT 1;

    IF v_mid IS NOT NULL THEN
      v_material := (
        v_old_monto IS DISTINCT FROM v_monto
        OR upper(trim(COALESCE(v_old_mon, ''))) IS DISTINCT FROM v_mon
        OR COALESCE(v_old_caja, 'efectivo') IS DISTINCT FROM v_caja_tipo
        OR v_old_concepto IS DISTINCT FROM v_concepto
        OR v_old_fecha IS DISTINCT FROM v_fecha
        OR v_old_estado IS DISTINCT FROM v_estado
      );
      UPDATE public.movimientos_caja m
      SET
        sync_clave = v_clave,
        moneda = v_mon,
        monto = v_monto,
        caja_tipo = v_caja_tipo,
        orden_id = p_orden_id,
        orden_numero = v_ord_num,
        transaccion_numero = v_trx_n,
        concepto = v_concepto,
        clasificacion_movimiento = v_clasificacion,
        fecha = v_fecha,
        usuario_id = v_usuario,
        estado = v_estado,
        estado_fecha = CASE WHEN v_material THEN COALESCE(now(), m.estado_fecha) ELSE m.estado_fecha END
      WHERE m.id = v_mid;
      IF v_material THEN
        v_medio := public.sync_cc_caja_medio_pago_de_trx(v_trx);
        PERFORM public.sync_cc_caja_registrar_auditoria(
          'editar',
          'Caja ' || public.sync_cc_caja_etiqueta_caja(v_caja_tipo)
            || ' · Orden ' || COALESCE(v_orden_n::text, v_ord_num::text, '—')
            || COALESCE(' · Trans ' || v_trx_n::text, '')
            || ': se editó ' || public.sync_cc_caja_fmt_monto(v_monto, v_mon)
            || ' («' || left(COALESCE(v_concepto, ''), 80) || '»).'
            || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
          jsonb_build_object(
            'entidad', 'caja',
            'libro', 'Caja',
            'caja', public.sync_cc_caja_etiqueta_caja(v_caja_tipo),
            'caja_tipo', v_caja_tipo,
            'orden_id', p_orden_id,
            'orden_numero', COALESCE(v_orden_n, v_ord_num),
            'transaccion_id', v_trx,
            'transaccion_numero', v_trx_n,
            'registro_id', v_mid,
            'moneda', v_mon,
            'medio_pago', v_medio,
            'cambios', jsonb_build_array(
              jsonb_build_object('campo', 'Estado', 'anterior', v_old_estado, 'nuevo', v_estado),
              jsonb_build_object('campo', 'Monto', 'anterior', v_old_monto, 'nuevo', v_monto),
              jsonb_build_object('campo', 'Moneda', 'anterior', v_old_mon, 'nuevo', v_mon),
              jsonb_build_object('campo', 'Caja', 'anterior', public.sync_cc_caja_etiqueta_caja(v_old_caja), 'nuevo', public.sync_cc_caja_etiqueta_caja(v_caja_tipo)),
              jsonb_build_object('campo', 'Medio de pago', 'anterior', NULL, 'nuevo', v_medio),
              jsonb_build_object('campo', 'Concepto', 'anterior', v_old_concepto, 'nuevo', v_concepto)
            )
          )
        );
      END IF;
    ELSE
      INSERT INTO public.movimientos_caja (
        moneda, monto, caja_tipo, transaccion_id, orden_id, orden_numero, transaccion_numero,
        concepto, clasificacion_movimiento, sync_clave, fecha, usuario_id, estado, estado_fecha
      ) VALUES (
        v_mon, v_monto, v_caja_tipo, v_trx, p_orden_id, v_ord_num, v_trx_n,
        v_concepto, v_clasificacion, v_clave, v_fecha, v_usuario, v_estado, now()
      )
      RETURNING id INTO v_mid;
      v_medio := public.sync_cc_caja_medio_pago_de_trx(v_trx);
      PERFORM public.sync_cc_caja_registrar_auditoria(
        'alta',
        'Caja ' || public.sync_cc_caja_etiqueta_caja(v_caja_tipo)
          || ' · Orden ' || COALESCE(v_orden_n::text, v_ord_num::text, '—')
          || COALESCE(' · Trans ' || v_trx_n::text, '')
          || ': se registró ' || public.sync_cc_caja_fmt_monto(v_monto, v_mon)
          || ' («' || left(COALESCE(v_concepto, ''), 80) || '»).'
          || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
        jsonb_build_object(
          'entidad', 'caja',
          'libro', 'Caja',
          'caja', public.sync_cc_caja_etiqueta_caja(v_caja_tipo),
          'caja_tipo', v_caja_tipo,
          'orden_id', p_orden_id,
          'orden_numero', COALESCE(v_orden_n, v_ord_num),
          'transaccion_id', v_trx,
          'transaccion_numero', v_trx_n,
          'registro_id', v_mid,
          'moneda', v_mon,
          'monto', v_monto,
          'estado', v_estado,
          'medio_pago', v_medio,
          'concepto', v_concepto,
          'cambios', jsonb_build_array(
            jsonb_build_object('campo', 'Monto', 'anterior', NULL, 'nuevo', v_monto),
            jsonb_build_object('campo', 'Moneda', 'anterior', NULL, 'nuevo', v_mon),
            jsonb_build_object('campo', 'Caja', 'anterior', NULL, 'nuevo', public.sync_cc_caja_etiqueta_caja(v_caja_tipo)),
            jsonb_build_object('campo', 'Medio de pago', 'anterior', NULL, 'nuevo', v_medio),
            jsonb_build_object('campo', 'Estado', 'anterior', NULL, 'nuevo', v_estado)
          )
        )
      );
    END IF;
  END LOOP;

  FOR v_aud IN
    UPDATE public.movimientos_caja m
    SET estado = 'anulado', estado_fecha = now()
    WHERE m.tipo_movimiento_id IS NULL
      AND COALESCE(lower(m.estado), '') NOT IN ('anulado', 'anulada')
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
          AND COALESCE(m.caja_tipo, 'efectivo') = COALESCE(elem->>'caja_tipo', 'efectivo')
          AND (
            m.sync_clave IS NOT DISTINCT FROM COALESCE(
              NULLIF(trim(elem->>'sync_clave'), ''),
              public.sync_cc_caja_clave_identidad(elem->>'concepto', (elem->>'monto')::numeric, 'caja')
            )
            OR (
              m.sync_clave IS NULL
              AND m.monto IS NOT DISTINCT FROM (elem->>'monto')::numeric
              AND left(COALESCE(m.concepto, ''), 72) IS NOT DISTINCT FROM left(COALESCE(elem->>'concepto', ''), 72)
            )
          )
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
      )
    RETURNING m.id, m.transaccion_id, m.transaccion_numero, m.orden_numero, m.monto, m.moneda, m.concepto, m.caja_tipo
  LOOP
    v_medio := public.sync_cc_caja_medio_pago_de_trx(v_aud.transaccion_id);
    PERFORM public.sync_cc_caja_registrar_auditoria(
      'anular',
      'Caja ' || public.sync_cc_caja_etiqueta_caja(v_aud.caja_tipo)
        || ' · Orden ' || COALESCE(v_orden_n::text, v_aud.orden_numero::text, '—')
        || COALESCE(' · Trans ' || v_aud.transaccion_numero::text, '')
        || ': se anuló ' || public.sync_cc_caja_fmt_monto(v_aud.monto, v_aud.moneda)
        || ' («' || left(COALESCE(v_aud.concepto, ''), 80) || '»). No se borró la fila.'
        || ' Medio de pago: ' || COALESCE(v_medio, '—') || '.',
      jsonb_build_object(
        'entidad', 'caja',
        'libro', 'Caja',
        'caja', public.sync_cc_caja_etiqueta_caja(v_aud.caja_tipo),
        'caja_tipo', v_aud.caja_tipo,
        'orden_id', p_orden_id,
        'orden_numero', COALESCE(v_orden_n, v_aud.orden_numero),
        'transaccion_id', v_aud.transaccion_id,
        'transaccion_numero', v_aud.transaccion_numero,
        'registro_id', v_aud.id,
        'moneda', v_aud.moneda,
        'monto', v_aud.monto,
        'medio_pago', v_medio,
        'concepto', v_aud.concepto,
        'cambios', jsonb_build_array(
          jsonb_build_object('campo', 'Estado', 'anterior', 'cerrado', 'nuevo', 'anulado'),
          jsonb_build_object('campo', 'Caja', 'anterior', public.sync_cc_caja_etiqueta_caja(v_aud.caja_tipo), 'nuevo', public.sync_cc_caja_etiqueta_caja(v_aud.caja_tipo)),
          jsonb_build_object('campo', 'Monto', 'anterior', v_aud.monto, 'nuevo', v_aud.monto)
        )
      )
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_orden IS
  'Sync CC cliente, CC intermediario y caja para una orden (JSONB desde el front). Libro: INSERT/UPDATE/ANULAR (sin DELETE). Capa 2: match por sync_clave (familia+signo), no por monto. Lock por orden. Auditoría cc_caja_sync. Huérfanos: estado anulado. Respeta CC manual. Caja: solo tipo_movimiento_id IS NULL.';

REVOKE ALL ON FUNCTION public.sync_cc_caja_fmt_monto(numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_fmt_monto(numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_fmt_monto(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_fmt_monto(numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.sync_cc_caja_etiqueta_caja(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_etiqueta_caja(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_etiqueta_caja(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_etiqueta_caja(text) TO service_role;

REVOKE ALL ON FUNCTION public.sync_cc_caja_medio_pago_de_trx(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_medio_pago_de_trx(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_medio_pago_de_trx(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_medio_pago_de_trx(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.parse_movimiento_clasificacion_desde_jsonb(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parse_movimiento_clasificacion_desde_jsonb(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.parse_movimiento_clasificacion_desde_jsonb(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parse_movimiento_clasificacion_desde_jsonb(jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.sync_cc_caja_registrar_auditoria(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_registrar_auditoria(text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_registrar_auditoria(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_registrar_auditoria(text, text, jsonb) TO service_role;

-- Opción A (Refrescar): lote de órdenes en un viaje. Cuerpo: sql/rpc_sync_cc_caja_ordenes.sql
-- (el bootstrap concatenado lo incluye después de este archivo).
