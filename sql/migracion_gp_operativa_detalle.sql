-- Detalle de movimientos que suman en cada fila de G/P Operativa (misma lógica que gp_operativa_resumen).
-- Ejecutar en Supabase SQL Editor después de migracion_gp_operativa_panel.sql (y tablas/joins habituales).

CREATE OR REPLACE FUNCTION public.gp_operativa_detalle(p_desde date, p_hasta date, p_bolsa text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb;
  b text;
BEGIN
  b := lower(trim(COALESCE(p_bolsa, '')));
  IF b NOT IN ('caja_manual', 'caja_ordenes', 'cc_cliente', 'cc_intermediario') THEN
    RETURN '[]'::jsonb;
  END IF;

  IF b = 'caja_manual' THEN
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
      '[]'::jsonb
    )
    INTO v
    FROM (
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', t.nombre,
          'modo_pago', '',
          'orden_numero', m.orden_numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', NULL
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_caja m
      INNER JOIN public.tipos_movimiento_caja t ON t.id = m.tipo_movimiento_id
      WHERE m.orden_id IS NULL
        AND m.estado = 'cerrado'
        AND COALESCE(t.incluye_gp_operativo, true)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  IF b = 'caja_ordenes' THEN
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
      '[]'::jsonb
    )
    INTO v
    FROM (
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', t.nombre,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', COALESCE(m.orden_numero, o.numero),
          'transaccion_numero', m.transaccion_numero,
          'entidad', NULL
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_caja m
      LEFT JOIN public.tipos_movimiento_caja t ON t.id = m.tipo_movimiento_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.orden_id IS NOT NULL
        AND m.estado = 'cerrado'
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  IF b = 'cc_cliente' THEN
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
      '[]'::jsonb
    )
    INTO v
    FROM (
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', '',
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', c.nombre
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente m
      LEFT JOIN public.clientes c ON c.id = m.cliente_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      WHERE m.estado = 'cerrado'
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  -- cc_intermediario
  SELECT COALESCE(
    jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
    '[]'::jsonb
  )
  INTO v
  FROM (
    SELECT
      jsonb_build_object(
        'id', m.id::text,
        'fecha', m.fecha::text,
        'moneda', m.moneda,
        'monto', m.monto,
        'concepto', COALESCE(m.concepto, ''),
        'tipo_movimiento', NULL,
        'modo_pago', '',
        'orden_numero', o.numero,
        'transaccion_numero', m.transaccion_numero,
        'entidad', i.nombre
      ) AS row_json,
      m.fecha AS fecha_sort,
      m.id::text AS id_sort
    FROM public.movimientos_cuenta_corriente_intermediario m
    LEFT JOIN public.intermediarios i ON i.id = m.intermediario_id
    LEFT JOIN public.ordenes o ON o.id = m.orden_id
    WHERE m.estado = 'cerrado'
      AND (p_desde IS NULL OR m.fecha >= p_desde)
      AND (p_hasta IS NULL OR m.fecha <= p_hasta)
  ) sub;
  RETURN COALESCE(v, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.gp_operativa_detalle(date, date, text) IS 'Listado JSON de movimientos que entran en una fila de G/P Operativa para el período: caja_manual, caja_ordenes, cc_cliente, cc_intermediario. Mismos filtros que gp_operativa_resumen (cerrados, fechas inclusive AR, tipos caja con incluye_gp_operativo en manual). Campo modo_pago: nombre (o código) del catálogo modos_pago vía transacción vinculada a movimientos_caja.transaccion_id en caja_ordenes; vacío en el resto. SECURITY INVOKER / RLS.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_detalle(date, date, text) TO authenticated;
