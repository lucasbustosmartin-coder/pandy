-- Detalle de movimientos que suman en cada fila de G/P Operativa (misma lógica que gp_operativa_resumen).
-- Ejecutar en Supabase SQL Editor después de migracion_gp_operativa_panel.sql (y tablas/joins habituales).
--
-- 2026-04: con SET search_path = '' no usar SELECT … INTO v (PL) para el JSON agregado: en algunos entornos
-- Postgres resuelve v como relación → error 42P01 relation "v" does not exist. Patrón canónico: RETURN (SELECT …).

CREATE OR REPLACE FUNCTION public.gp_operativa_detalle(p_desde date, p_hasta date, p_bolsa text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  b text;
BEGIN
  b := lower(trim(COALESCE(p_bolsa, '')));
  IF b NOT IN (
    'caja_manual',
    'caja_ordenes',
    'cc_cliente',
    'cc_intermediario',
    'cc_resultado_economico_compensatorio',
    'comisiones_acuerdo_pandy',
    'comisiones_acuerdo_intermediario'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  IF b = 'caja_manual' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
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
            CASE lower(trim(COALESCE(m.caja_tipo, '')))
              WHEN 'efectivo' THEN 'Efectivo'
              WHEN 'banco' THEN 'Banco'
              WHEN 'cheque' THEN 'Cheque'
              ELSE NULL
            END,
            ''
          ),
          'orden_numero', m.orden_numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', NULL,
          'cc_estado', m.estado,
          'es_movimiento_manual', false
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
      ) sub
    );
  END IF;

  IF b = 'caja_ordenes' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
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
          'entidad', NULL,
          'cc_estado', m.estado,
          'es_movimiento_manual', false
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
        AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      ) sub
    );
  END IF;

  IF b = 'cc_cliente' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
      FROM (
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', c.nombre,
          'cc_estado', m.estado,
          'es_movimiento_manual', COALESCE(m.es_movimiento_manual, false)
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente m
      LEFT JOIN public.clientes c ON c.id = m.cliente_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      ) sub
    );
  END IF;

  IF b = 'cc_intermediario' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
      FROM (
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', i.nombre,
          'cc_estado', m.estado,
          'es_movimiento_manual', COALESCE(m.es_movimiento_manual, false)
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente_intermediario m
      LEFT JOIN public.intermediarios i ON i.id = m.intermediario_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      ) sub
    );
  END IF;

  IF b = 'cc_resultado_economico_compensatorio' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
      FROM (
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', c.nombre,
          'cc_estado', m.estado,
          'es_movimiento_manual', COALESCE(m.es_movimiento_manual, false)
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente m
      LEFT JOIN public.clientes c ON c.id = m.cliente_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND m.clasificacion_movimiento = 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      UNION ALL
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', i.nombre,
          'cc_estado', m.estado,
          'es_movimiento_manual', COALESCE(m.es_movimiento_manual, false)
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente_intermediario m
      LEFT JOIN public.intermediarios i ON i.id = m.intermediario_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND m.clasificacion_movimiento = 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      ) sub
    );
  END IF;

  IF b = 'comisiones_acuerdo_pandy' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
      FROM (
      SELECT
        jsonb_build_object(
          'id', ('co-' || c.id::text),
          'fecha', o.fecha::text,
          'moneda', c.moneda,
          'monto', c.monto,
          'concepto', 'Comisión del acuerdo (tabla comisiones_orden · empresa)',
          'tipo_movimiento', NULL,
          'modo_pago', '',
          'orden_numero', o.numero,
          'transaccion_numero', NULL,
          'entidad', cl.nombre,
          'cc_estado', 'cerrado',
          'es_movimiento_manual', false
        ) AS row_json,
        o.fecha AS fecha_sort,
        ('co-' || c.id::text) AS id_sort
      FROM public.comisiones_orden c
      INNER JOIN public.ordenes o ON o.id = c.orden_id
      LEFT JOIN public.clientes cl ON cl.id = o.cliente_id
      WHERE c.beneficiario = 'pandy'
        AND lower(COALESCE(o.estado, '')) <> 'anulada'
        AND (p_desde IS NULL OR o.fecha >= p_desde)
        AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      UNION ALL
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', m.monto,
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', c.nombre,
          'cc_estado', m.estado,
          'es_movimiento_manual', COALESCE(m.es_movimiento_manual, false)
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente m
      LEFT JOIN public.clientes c ON c.id = m.cliente_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
        AND (
          m.orden_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.comisiones_orden c2
            WHERE c2.orden_id = m.orden_id
              AND c2.beneficiario = 'pandy'
          )
        )
      ) sub
    );
  END IF;

  IF b = 'comisiones_acuerdo_intermediario' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
      FROM (
      SELECT
        jsonb_build_object(
          'id', ('co-' || c.id::text),
          'fecha', o.fecha::text,
          'moneda', c.moneda,
          'monto', (-(c.monto)::numeric),
          'concepto', 'Comisión del acuerdo (tabla comisiones_orden · intermediario)',
          'tipo_movimiento', NULL,
          'modo_pago', '',
          'orden_numero', o.numero,
          'transaccion_numero', NULL,
          'entidad', i.nombre,
          'cc_estado', 'cerrado',
          'es_movimiento_manual', false
        ) AS row_json,
        o.fecha AS fecha_sort,
        ('co-' || c.id::text) AS id_sort
      FROM public.comisiones_orden c
      INNER JOIN public.ordenes o ON o.id = c.orden_id
      LEFT JOIN public.intermediarios i ON i.id = o.intermediario_id
      WHERE c.beneficiario = 'intermediario'
        AND lower(COALESCE(o.estado, '')) <> 'anulada'
        AND (p_desde IS NULL OR o.fecha >= p_desde)
        AND (p_hasta IS NULL OR o.fecha <= p_hasta)
        AND NOT EXISTS (
          SELECT 1
          FROM public.comisiones_orden c_p
          WHERE c_p.orden_id = c.orden_id
            AND c_p.moneda = c.moneda
            AND c_p.beneficiario = 'pandy'
        )
      UNION ALL
      SELECT
        jsonb_build_object(
          'id', m.id::text,
          'fecha', m.fecha::text,
          'moneda', m.moneda,
          'monto', (-(m.monto)::numeric),
          'concepto', COALESCE(m.concepto, ''),
          'tipo_movimiento', NULL,
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', intm.nombre,
          'cc_estado', m.estado,
          'es_movimiento_manual', COALESCE(m.es_movimiento_manual, false)
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente_intermediario m
      LEFT JOIN public.intermediarios intm ON intm.id = m.intermediario_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
        AND (
          m.orden_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.comisiones_orden c2
            WHERE c2.orden_id = m.orden_id
              AND c2.beneficiario = 'intermediario'
          )
        )
      ) sub
    );
  END IF;

  RETURN '[]'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.gp_operativa_detalle(date, date, text) IS 'Listado JSON por bolsa (mismo criterio que gp_operativa_resumen): caja manual/órdenes cerrado no anulado; CC cliente/inter pendiente+cerrado excl. comisión por concepto/ENUM y excl. CC_RESULTADO_ECONOMICO_COMPENSATORIO (bolsa dedicada cc_resultado_economico_compensatorio); comisiones empresa; comisión intermediario desde comisiones_orden solo si no hay par Pandy misma orden+moneda; CC huérfanas con montos negados en JSON. modo_pago: caja_tipo o modos_pago vía transacción. Cada fila incluye cc_estado (pendiente/cerrado o cerrado en caja/comisiones) y es_movimiento_manual en CC para el detalle G/P en front. SECURITY INVOKER / RLS.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_detalle(date, date, text) TO authenticated;
