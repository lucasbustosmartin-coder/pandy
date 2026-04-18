-- G/P Operativa — control de calidad (solo quien tenga permiso; por defecto rol admin).
-- Parejas CC ↔ movimientos_caja vía movimiento_caja_id: mismos signos, montos no opuestos,
-- o caja manual con tipo «fuera de G/P» mientras la CC sigue entrando al Total.
-- Requiere migracion_gp_operativa_panel.sql (helpers gp_concepto_es_*).
-- Ejecutar en Supabase SQL Editor (Pandy y Pandy-Dev).

INSERT INTO public.app_permission (permission, description) VALUES
  (
    'ver_gp_operativo_control_calidad',
    'Panel de Control: ver control de calidad de G/P Operativa (parejas CC↔caja en el período; solo diagnóstico).'
  )
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'ver_gp_operativo_control_calidad')
ON CONFLICT (role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gp_operativa_control_calidad(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  r jsonb;
BEGIN
  IF NOT (SELECT public.has_permission('ver_gp_operativo_control_calidad')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;

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
    LIMIT 80
  )
  SELECT jsonb_build_object(
    'ok', true,
    'total_alertas', (SELECT n FROM cnt),
    'alertas', COALESCE(
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
  INTO r;

  RETURN r;
END;
$fn$;

COMMENT ON FUNCTION public.gp_operativa_control_calidad(date, date) IS 'G/P Operativa (admin por defecto): diagnóstico de parejas CC↔caja (movimiento_caja_id) en el período — mismos signos, montos no opuestos, o caja excluida de G/P. Requiere permiso ver_gp_operativo_control_calidad.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_control_calidad(date, date) TO authenticated;
