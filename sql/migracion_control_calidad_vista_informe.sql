-- Control de calidad: permiso de menú + RPC unificada `control_calidad_informe`.
-- Reemplaza `gp_operativa_control_calidad` (el front pasa a llamar solo `control_calidad_informe`).
-- Requiere: migracion_gp_operativa_panel.sql (helpers), ordenes/transacciones/instrumentacion estándar.
-- Ejecutar en Supabase SQL Editor (Pandy y Pandy-Dev).

INSERT INTO public.app_permission (permission, description) VALUES
  (
    'ver_control_calidad',
    'Menú Control de calidad: informe de alertas (parejas CC↔caja, transacciones vs CC cliente e intermediario).'
  )
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'ver_control_calidad')
ON CONFLICT (role, permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, 'ver_control_calidad'::text
FROM public.app_role_permission rp
WHERE rp.permission = 'ver_gp_operativo_control_calidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.app_role_permission x
    WHERE x.role = rp.role AND x.permission = 'ver_control_calidad'
  );

DROP FUNCTION IF EXISTS public.gp_operativa_control_calidad(date, date);

CREATE OR REPLACE FUNCTION public.control_calidad_informe(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  j_parejas jsonb;
  j_ejecutada_sin_cc jsonb;
  j_pendiente_sin_cc jsonb;
  j_ej_no_cerr jsonb;
  j_pend_no_pend jsonb;
  j_trx_anulada_sin_cc jsonb;
  j_trx_anulada_cc_no_anulado jsonb;
BEGIN
  IF NOT (
    (SELECT public.has_permission('ver_control_calidad'))
    OR (SELECT public.has_permission('ver_gp_operativo_control_calidad'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;

  /* --- Parejas CC ↔ caja (mismo criterio que gp_operativa_control_calidad) --- */
  WITH
  par_cli_man AS (
    SELECT
      m.id AS cc_id,
      m.fecha::text AS cc_fecha,
      m.monto::numeric AS cc_monto,
      left(COALESCE(m.concepto, ''), 120) AS cc_concepto,
      c.id AS caja_id,
      c.fecha::text AS caja_fecha,
      c.monto::numeric AS caja_monto,
      COALESCE(t.incluye_gp_operativo, true) AS incluye_gp
    FROM public.movimientos_cuenta_corriente m
    INNER JOIN public.movimientos_caja c ON c.id = m.movimiento_caja_id
    LEFT JOIN public.tipos_movimiento_caja t ON t.id = c.tipo_movimiento_id
    WHERE m.estado IN ('pendiente', 'cerrado')
      AND NOT public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
      AND c.estado = 'cerrado'
      AND c.orden_id IS NULL
      AND (p_desde IS NULL OR m.fecha >= p_desde)
      AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      AND (p_desde IS NULL OR c.fecha >= p_desde)
      AND (p_hasta IS NULL OR c.fecha <= p_hasta)
  ),
  par_cli_ord AS (
    SELECT
      m.id AS cc_id,
      m.fecha::text AS cc_fecha,
      m.monto::numeric AS cc_monto,
      left(COALESCE(m.concepto, ''), 120) AS cc_concepto,
      c.id AS caja_id,
      c.fecha::text AS caja_fecha,
      c.monto::numeric AS caja_monto,
      COALESCE(t.incluye_gp_operativo, true) AS incluye_gp
    FROM public.movimientos_cuenta_corriente m
    INNER JOIN public.movimientos_caja c ON c.id = m.movimiento_caja_id
    LEFT JOIN public.tipos_movimiento_caja t ON t.id = c.tipo_movimiento_id
    WHERE m.estado IN ('pendiente', 'cerrado')
      AND NOT public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
      AND c.estado = 'cerrado'
      AND c.orden_id IS NOT NULL
      AND NOT public.gp_concepto_es_comision_caja_ordenes_gp(COALESCE(c.concepto, ''))
      AND (p_desde IS NULL OR m.fecha >= p_desde)
      AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      AND (p_desde IS NULL OR c.fecha >= p_desde)
      AND (p_hasta IS NULL OR c.fecha <= p_hasta)
  ),
  par_int_man AS (
    SELECT
      m.id AS cc_id,
      m.fecha::text AS cc_fecha,
      m.monto::numeric AS cc_monto,
      left(COALESCE(m.concepto, ''), 120) AS cc_concepto,
      c.id AS caja_id,
      c.fecha::text AS caja_fecha,
      c.monto::numeric AS caja_monto,
      COALESCE(t.incluye_gp_operativo, true) AS incluye_gp
    FROM public.movimientos_cuenta_corriente_intermediario m
    INNER JOIN public.movimientos_caja c ON c.id = m.movimiento_caja_id
    LEFT JOIN public.tipos_movimiento_caja t ON t.id = c.tipo_movimiento_id
    WHERE m.estado IN ('pendiente', 'cerrado')
      AND NOT public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
      AND c.estado = 'cerrado'
      AND c.orden_id IS NULL
      AND (p_desde IS NULL OR m.fecha >= p_desde)
      AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      AND (p_desde IS NULL OR c.fecha >= p_desde)
      AND (p_hasta IS NULL OR c.fecha <= p_hasta)
  ),
  par_int_ord AS (
    SELECT
      m.id AS cc_id,
      m.fecha::text AS cc_fecha,
      m.monto::numeric AS cc_monto,
      left(COALESCE(m.concepto, ''), 120) AS cc_concepto,
      c.id AS caja_id,
      c.fecha::text AS caja_fecha,
      c.monto::numeric AS caja_monto,
      COALESCE(t.incluye_gp_operativo, true) AS incluye_gp
    FROM public.movimientos_cuenta_corriente_intermediario m
    INNER JOIN public.movimientos_caja c ON c.id = m.movimiento_caja_id
    LEFT JOIN public.tipos_movimiento_caja t ON t.id = c.tipo_movimiento_id
    WHERE m.estado IN ('pendiente', 'cerrado')
      AND NOT public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
      AND c.estado = 'cerrado'
      AND c.orden_id IS NOT NULL
      AND NOT public.gp_concepto_es_comision_caja_ordenes_gp(COALESCE(c.concepto, ''))
      AND (p_desde IS NULL OR m.fecha >= p_desde)
      AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      AND (p_desde IS NULL OR c.fecha >= p_desde)
      AND (p_hasta IS NULL OR c.fecha <= p_hasta)
  ),
  alertas AS (
    SELECT *
    FROM (
      SELECT
        CASE
          WHEN (p.cc_monto > 0 AND p.caja_monto > 0) OR (p.cc_monto < 0 AND p.caja_monto < 0) THEN 'cc_caja_manual_cliente_mismo_signo'
          WHEN abs(p.cc_monto + p.caja_monto) > 0.0001 THEN 'cc_caja_manual_cliente_monto_no_opuesto'
          WHEN NOT p.incluye_gp THEN 'cc_caja_manual_cliente_caja_fuera_gp'
        END AS tipo,
        p.cc_id,
        p.cc_fecha,
        p.cc_monto,
        p.cc_concepto,
        p.caja_id,
        p.caja_fecha,
        p.caja_monto,
        p.incluye_gp
      FROM par_cli_man p
      UNION ALL
      SELECT
        CASE
          WHEN (p.cc_monto > 0 AND p.caja_monto > 0) OR (p.cc_monto < 0 AND p.caja_monto < 0) THEN 'cc_caja_orden_cliente_mismo_signo'
          WHEN abs(p.cc_monto + p.caja_monto) > 0.0001 THEN 'cc_caja_orden_cliente_monto_no_opuesto'
          WHEN NOT p.incluye_gp THEN 'cc_caja_orden_cliente_caja_fuera_gp'
        END,
        p.cc_id,
        p.cc_fecha,
        p.cc_monto,
        p.cc_concepto,
        p.caja_id,
        p.caja_fecha,
        p.caja_monto,
        p.incluye_gp
      FROM par_cli_ord p
      UNION ALL
      SELECT
        CASE
          WHEN (p.cc_monto > 0 AND p.caja_monto > 0) OR (p.cc_monto < 0 AND p.caja_monto < 0) THEN 'cc_caja_manual_intermediario_mismo_signo'
          WHEN abs(p.cc_monto + p.caja_monto) > 0.0001 THEN 'cc_caja_manual_intermediario_monto_no_opuesto'
          WHEN NOT p.incluye_gp THEN 'cc_caja_manual_intermediario_caja_fuera_gp'
        END,
        p.cc_id,
        p.cc_fecha,
        p.cc_monto,
        p.cc_concepto,
        p.caja_id,
        p.caja_fecha,
        p.caja_monto,
        p.incluye_gp
      FROM par_int_man p
      UNION ALL
      SELECT
        CASE
          WHEN (p.cc_monto > 0 AND p.caja_monto > 0) OR (p.cc_monto < 0 AND p.caja_monto < 0) THEN 'cc_caja_orden_intermediario_mismo_signo'
          WHEN abs(p.cc_monto + p.caja_monto) > 0.0001 THEN 'cc_caja_orden_intermediario_monto_no_opuesto'
          WHEN NOT p.incluye_gp THEN 'cc_caja_orden_intermediario_caja_fuera_gp'
        END,
        p.cc_id,
        p.cc_fecha,
        p.cc_monto,
        p.cc_concepto,
        p.caja_id,
        p.caja_fecha,
        p.caja_monto,
        p.incluye_gp
      FROM par_int_ord p
    ) u
    WHERE u.tipo IS NOT NULL
  ),
  cnt AS (SELECT count(*)::int AS n FROM alertas),
  lim AS (
    SELECT tipo, cc_id, cc_fecha, cc_monto, cc_concepto, caja_id, caja_fecha, caja_monto, incluye_gp
    FROM alertas
    ORDER BY tipo, cc_fecha, cc_id::text
    LIMIT 200
  )
  SELECT jsonb_build_object(
    'total', (SELECT n FROM cnt),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'tipo', l.tipo,
            'cc_id', l.cc_id,
            'cc_fecha', l.cc_fecha,
            'cc_monto', l.cc_monto,
            'cc_concepto', l.cc_concepto,
            'caja_id', l.caja_id,
            'caja_fecha', l.caja_fecha,
            'caja_monto', l.caja_monto,
            'incluye_gp', l.incluye_gp
          )
          ORDER BY l.tipo, l.cc_fecha, l.cc_id::text
        )
        FROM lim l
      ),
      '[]'::jsonb
    )
  )
  INTO j_parejas
  FROM (SELECT 1) _x;

  /* Ejecutada: sin ningún movimiento en CC cliente ni en CC intermediario (no anulado) */
  WITH base AS (
    SELECT
      t.id AS transaccion_id,
      t.numero AS transaccion_numero,
      t.estado AS estado_transaccion,
      t.owner,
      t.tipo AS tipo_ie,
      o.id AS orden_id,
      o.numero AS orden_numero,
      o.fecha::text AS fecha_orden
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    INNER JOIN public.ordenes o ON o.id = i.orden_id
    WHERE (p_desde IS NULL OR o.fecha >= p_desde)
      AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      AND lower(COALESCE(t.estado, '')) = 'ejecutada'
      AND NOT EXISTS (
        SELECT 1
        FROM public.movimientos_cuenta_corriente m
        WHERE m.transaccion_id = t.id
          AND COALESCE(lower(m.estado), '') <> 'anulado'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.movimientos_cuenta_corriente_intermediario m
        WHERE m.transaccion_id = t.id
          AND COALESCE(lower(m.estado), '') <> 'anulado'
      )
  ),
  c AS (SELECT count(*)::int AS n FROM base),
  lim AS (SELECT * FROM base ORDER BY orden_numero NULLS LAST, transaccion_numero LIMIT 200)
  SELECT jsonb_build_object(
    'total', (SELECT n FROM c),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'transaccion_id', b.transaccion_id,
            'transaccion_numero', b.transaccion_numero,
            'orden_id', b.orden_id,
            'orden_numero', b.orden_numero,
            'fecha_orden', b.fecha_orden,
            'estado_transaccion', b.estado_transaccion,
            'owner', b.owner,
            'tipo_ie', b.tipo_ie
          )
          ORDER BY b.orden_numero NULLS LAST, b.transaccion_numero
        )
        FROM lim b
      ),
      '[]'::jsonb
    )
  )
  INTO j_ejecutada_sin_cc
  FROM (SELECT 1) _y;

  /* Pendiente: sin ningún movimiento en CC cliente ni en CC intermediario (no anulado) */
  WITH base AS (
    SELECT
      t.id AS transaccion_id,
      t.numero AS transaccion_numero,
      t.estado AS estado_transaccion,
      t.owner,
      t.tipo AS tipo_ie,
      o.id AS orden_id,
      o.numero AS orden_numero,
      o.fecha::text AS fecha_orden
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    INNER JOIN public.ordenes o ON o.id = i.orden_id
    WHERE (p_desde IS NULL OR o.fecha >= p_desde)
      AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      AND lower(COALESCE(t.estado, '')) = 'pendiente'
      AND NOT EXISTS (
        SELECT 1
        FROM public.movimientos_cuenta_corriente m
        WHERE m.transaccion_id = t.id
          AND COALESCE(lower(m.estado), '') <> 'anulado'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.movimientos_cuenta_corriente_intermediario m
        WHERE m.transaccion_id = t.id
          AND COALESCE(lower(m.estado), '') <> 'anulado'
      )
  ),
  c AS (SELECT count(*)::int AS n FROM base),
  lim AS (SELECT * FROM base ORDER BY orden_numero NULLS LAST, transaccion_numero LIMIT 200)
  SELECT jsonb_build_object(
    'total', (SELECT n FROM c),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'transaccion_id', b.transaccion_id,
            'transaccion_numero', b.transaccion_numero,
            'orden_id', b.orden_id,
            'orden_numero', b.orden_numero,
            'fecha_orden', b.fecha_orden,
            'estado_transaccion', b.estado_transaccion,
            'owner', b.owner,
            'tipo_ie', b.tipo_ie
          )
          ORDER BY b.orden_numero NULLS LAST, b.transaccion_numero
        )
        FROM lim b
      ),
      '[]'::jsonb
    )
  )
  INTO j_pendiente_sin_cc
  FROM (SELECT 1) _y0;

  /* Ejecutada: movimientos CC (cliente o intermediario) no anulados y alguno no está cerrado */
  WITH mov_cc AS (
    SELECT m.transaccion_id, m.estado
    FROM public.movimientos_cuenta_corriente m
    WHERE m.transaccion_id IS NOT NULL
      AND COALESCE(lower(m.estado), '') <> 'anulado'
    UNION ALL
    SELECT m.transaccion_id, m.estado
    FROM public.movimientos_cuenta_corriente_intermediario m
    WHERE m.transaccion_id IS NOT NULL
      AND COALESCE(lower(m.estado), '') <> 'anulado'
  ),
  bad AS (
    SELECT
      t.id AS transaccion_id,
      t.numero AS transaccion_numero,
      t.estado AS estado_transaccion,
      o.id AS orden_id,
      o.numero AS orden_numero,
      o.fecha::text AS fecha_orden,
      string_agg(DISTINCT m.estado::text, ', ') AS cc_estados
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    INNER JOIN public.ordenes o ON o.id = i.orden_id
    INNER JOIN mov_cc m ON m.transaccion_id = t.id
    WHERE (p_desde IS NULL OR o.fecha >= p_desde)
      AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      AND lower(COALESCE(t.estado, '')) = 'ejecutada'
    GROUP BY t.id, t.numero, t.estado, o.id, o.numero, o.fecha
    HAVING bool_or(COALESCE(lower(trim(m.estado::text)), '') IS DISTINCT FROM 'cerrado')
  ),
  c AS (SELECT count(*)::int AS n FROM bad),
  lim AS (SELECT * FROM bad ORDER BY orden_numero NULLS LAST, transaccion_numero LIMIT 200)
  SELECT jsonb_build_object(
    'total', (SELECT n FROM c),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'transaccion_id', b.transaccion_id,
            'transaccion_numero', b.transaccion_numero,
            'orden_id', b.orden_id,
            'orden_numero', b.orden_numero,
            'fecha_orden', b.fecha_orden,
            'estado_transaccion', b.estado_transaccion,
            'cc_estados', b.cc_estados
          )
          ORDER BY b.orden_numero NULLS LAST, b.transaccion_numero
        )
        FROM lim b
      ),
      '[]'::jsonb
    )
  )
  INTO j_ej_no_cerr
  FROM (SELECT 1) _z;

  /* Pendiente: movimientos CC (cliente o intermediario) no anulados y alguno no está pendiente */
  WITH mov_cc AS (
    SELECT m.transaccion_id, m.estado
    FROM public.movimientos_cuenta_corriente m
    WHERE m.transaccion_id IS NOT NULL
      AND COALESCE(lower(m.estado), '') <> 'anulado'
    UNION ALL
    SELECT m.transaccion_id, m.estado
    FROM public.movimientos_cuenta_corriente_intermediario m
    WHERE m.transaccion_id IS NOT NULL
      AND COALESCE(lower(m.estado), '') <> 'anulado'
  ),
  bad AS (
    SELECT
      t.id AS transaccion_id,
      t.numero AS transaccion_numero,
      t.estado AS estado_transaccion,
      o.id AS orden_id,
      o.numero AS orden_numero,
      o.fecha::text AS fecha_orden,
      string_agg(DISTINCT m.estado::text, ', ') AS cc_estados
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    INNER JOIN public.ordenes o ON o.id = i.orden_id
    INNER JOIN mov_cc m ON m.transaccion_id = t.id
    WHERE (p_desde IS NULL OR o.fecha >= p_desde)
      AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      AND lower(COALESCE(t.estado, '')) = 'pendiente'
    GROUP BY t.id, t.numero, t.estado, o.id, o.numero, o.fecha
    HAVING bool_or(COALESCE(lower(trim(m.estado::text)), '') IS DISTINCT FROM 'pendiente')
  ),
  c AS (SELECT count(*)::int AS n FROM bad),
  lim AS (SELECT * FROM bad ORDER BY orden_numero NULLS LAST, transaccion_numero LIMIT 200)
  SELECT jsonb_build_object(
    'total', (SELECT n FROM c),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'transaccion_id', b.transaccion_id,
            'transaccion_numero', b.transaccion_numero,
            'orden_id', b.orden_id,
            'orden_numero', b.orden_numero,
            'fecha_orden', b.fecha_orden,
            'estado_transaccion', b.estado_transaccion,
            'cc_estados', b.cc_estados
          )
          ORDER BY b.orden_numero NULLS LAST, b.transaccion_numero
        )
        FROM lim b
      ),
      '[]'::jsonb
    )
  )
  INTO j_pend_no_pend
  FROM (SELECT 1) _w;

  /* Transacción anulada: sin ninguna fila CC en cliente ni intermediario */
  WITH base AS (
    SELECT
      t.id AS transaccion_id,
      t.numero AS transaccion_numero,
      t.estado AS estado_transaccion,
      t.owner,
      t.tipo AS tipo_ie,
      o.id AS orden_id,
      o.numero AS orden_numero,
      o.fecha::text AS fecha_orden,
      o.estado AS estado_orden
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    INNER JOIN public.ordenes o ON o.id = i.orden_id
    WHERE (p_desde IS NULL OR o.fecha >= p_desde)
      AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      AND lower(COALESCE(t.estado, '')) = 'anulada'
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.transaccion_id = t.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.transaccion_id = t.id
      )
  ),
  c AS (SELECT count(*)::int AS n FROM base),
  lim AS (SELECT * FROM base ORDER BY orden_numero NULLS LAST, transaccion_numero LIMIT 200)
  SELECT jsonb_build_object(
    'total', (SELECT n FROM c),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'transaccion_id', b.transaccion_id,
            'transaccion_numero', b.transaccion_numero,
            'orden_id', b.orden_id,
            'orden_numero', b.orden_numero,
            'fecha_orden', b.fecha_orden,
            'estado_transaccion', b.estado_transaccion,
            'estado_orden', b.estado_orden,
            'owner', b.owner,
            'tipo_ie', b.tipo_ie
          )
          ORDER BY b.orden_numero NULLS LAST, b.transaccion_numero
        )
        FROM lim b
      ),
      '[]'::jsonb
    )
  )
  INTO j_trx_anulada_sin_cc
  FROM (SELECT 1) _wa;

  /* Transacción anulada: movimientos CC derivados (no manual) con estado distinto de anulado */
  WITH base AS (
    SELECT
      t.id AS transaccion_id,
      t.numero AS transaccion_numero,
      t.estado AS estado_transaccion,
      o.id AS orden_id,
      o.numero AS orden_numero,
      o.fecha::text AS fecha_orden,
      o.estado AS estado_orden,
      (
        SELECT string_agg(x.e, ', ')
        FROM (
          SELECT DISTINCT concat('cli:', trim(m.estado::text)) AS e
          FROM public.movimientos_cuenta_corriente m
          WHERE m.transaccion_id = t.id
            AND COALESCE(m.es_movimiento_manual, false) = false
            AND COALESCE(lower(trim(m.estado::text)), '') NOT IN ('anulado', 'anulada')
        ) x
      ) AS cc_estados_cliente,
      (
        SELECT string_agg(x.e, ', ')
        FROM (
          SELECT DISTINCT concat('int:', trim(m.estado::text)) AS e
          FROM public.movimientos_cuenta_corriente_intermediario m
          WHERE m.transaccion_id = t.id
            AND COALESCE(m.es_movimiento_manual, false) = false
            AND COALESCE(lower(trim(m.estado::text)), '') NOT IN ('anulado', 'anulada')
        ) x
      ) AS cc_estados_intermediario
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    INNER JOIN public.ordenes o ON o.id = i.orden_id
    WHERE (p_desde IS NULL OR o.fecha >= p_desde)
      AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      AND lower(COALESCE(t.estado, '')) = 'anulada'
      AND (
        EXISTS (
          SELECT 1
          FROM public.movimientos_cuenta_corriente m
          WHERE m.transaccion_id = t.id
            AND COALESCE(m.es_movimiento_manual, false) = false
            AND COALESCE(lower(trim(m.estado::text)), '') NOT IN ('anulado', 'anulada')
        )
        OR EXISTS (
          SELECT 1
          FROM public.movimientos_cuenta_corriente_intermediario m
          WHERE m.transaccion_id = t.id
            AND COALESCE(m.es_movimiento_manual, false) = false
            AND COALESCE(lower(trim(m.estado::text)), '') NOT IN ('anulado', 'anulada')
        )
      )
  ),
  base2 AS (
    SELECT
      b.*,
      nullif(trim(both ' ' FROM concat_ws(' ', b.cc_estados_cliente, b.cc_estados_intermediario)), '') AS cc_estados_mal
    FROM base b
  ),
  c AS (SELECT count(*)::int AS n FROM base2),
  lim AS (SELECT * FROM base2 ORDER BY orden_numero NULLS LAST, transaccion_numero LIMIT 200)
  SELECT jsonb_build_object(
    'total', (SELECT n FROM c),
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'transaccion_id', b.transaccion_id,
            'transaccion_numero', b.transaccion_numero,
            'orden_id', b.orden_id,
            'orden_numero', b.orden_numero,
            'fecha_orden', b.fecha_orden,
            'estado_transaccion', b.estado_transaccion,
            'estado_orden', b.estado_orden,
            'cc_estados', b.cc_estados_mal
          )
          ORDER BY b.orden_numero NULLS LAST, b.transaccion_numero
        )
        FROM lim b
      ),
      '[]'::jsonb
    )
  )
  INTO j_trx_anulada_cc_no_anulado
  FROM (SELECT 1) _wb;

  RETURN jsonb_build_object(
    'ok', true,
    'parejas_cc_caja', j_parejas,
    'trans_ejecutada_sin_registro_cc', j_ejecutada_sin_cc,
    'trans_pendiente_sin_registro_cc', j_pendiente_sin_cc,
    'trans_ejecutada_cc_no_cerrado', j_ej_no_cerr,
    'trans_pendiente_cc_no_pendiente', j_pend_no_pend,
    'trans_anulada_sin_registro_cc', j_trx_anulada_sin_cc,
    'trans_anulada_cc_estado_no_anulado', j_trx_anulada_cc_no_anulado
  );
END;
$fn$;

COMMENT ON FUNCTION public.control_calidad_informe(date, date) IS
  'Control de calidad: parejas CC↔caja (cliente e intermediario) + transacciones vs CC en ambos libros por fecha de orden (incluye órdenes anuladas). Transacción anulada: filas CC no manuales deben estar en estado anulado. Requiere ver_control_calidad o ver_gp_operativo_control_calidad.';

GRANT EXECUTE ON FUNCTION public.control_calidad_informe(date, date) TO authenticated;
