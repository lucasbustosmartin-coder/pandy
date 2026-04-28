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
    'comisiones_acuerdo_intermediario',
    'ganancia_devengada_orden'
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
        AND NOT (
          EXISTS (
            SELECT 1
            FROM public.transacciones te
            INNER JOIN public.instrumentacion ie ON ie.id = te.instrumentacion_id
            INNER JOIN public.ordenes oe ON oe.id = ie.orden_id
            WHERE te.id = m.transaccion_id
              AND oe.id = m.orden_id
              AND oe.intermediario_id IS NOT NULL
              AND upper(trim(COALESCE(oe.moneda_recibida, ''))) = upper(trim(COALESCE(oe.moneda_entregada, '')))
              AND lower(COALESCE(te.tipo, '')) = 'ingreso'
              AND lower(COALESCE(te.pagador, '')) = 'cliente'
              AND lower(COALESCE(te.cobrador, '')) = 'pandy'
          )
          AND EXISTS (
            SELECT 1
            FROM public.transacciones tx
            INNER JOIN public.instrumentacion ix ON ix.id = tx.instrumentacion_id
            WHERE ix.orden_id = m.orden_id
              AND upper(trim(COALESCE(tx.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
              AND lower(COALESCE(tx.estado, '')) = 'ejecutada'
              AND lower(COALESCE(tx.tipo, '')) = 'egreso'
              AND lower(COALESCE(tx.pagador, '')) = 'intermediario'
              AND lower(COALESCE(tx.cobrador, '')) = 'cliente'
          )
        )
        AND NOT (
          EXISTS (
            SELECT 1
            FROM public.transacciones te
            INNER JOIN public.instrumentacion ie ON ie.id = te.instrumentacion_id
            INNER JOIN public.ordenes oe ON oe.id = ie.orden_id
            WHERE te.id = m.transaccion_id
              AND oe.id = m.orden_id
              AND oe.intermediario_id IS NOT NULL
              AND upper(trim(COALESCE(oe.moneda_recibida, ''))) = upper(trim(COALESCE(oe.moneda_entregada, '')))
              AND lower(COALESCE(te.tipo, '')) = 'egreso'
              AND lower(COALESCE(te.pagador, '')) = 'pandy'
              AND lower(COALESCE(te.cobrador, '')) = 'cliente'
          )
          AND EXISTS (
            SELECT 1
            FROM public.transacciones ti
            INNER JOIN public.instrumentacion ii ON ii.id = ti.instrumentacion_id
            WHERE ii.orden_id = m.orden_id
              AND upper(trim(COALESCE(ti.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
              AND lower(COALESCE(ti.estado, '')) = 'ejecutada'
              AND lower(COALESCE(ti.tipo, '')) = 'ingreso'
              AND lower(COALESCE(ti.pagador, '')) = 'cliente'
              AND lower(COALESCE(ti.cobrador, '')) = 'intermediario'
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.ordenes od
          WHERE od.id = m.orden_id
            AND lower(COALESCE(od.estado, '')) <> 'anulada'
            AND od.monto_recibido IS NOT NULL
            AND od.monto_entregado IS NOT NULL
            AND od.moneda_recibida IS NOT NULL
            AND od.moneda_entregada IS NOT NULL
            AND upper(trim(COALESCE(od.moneda_recibida, ''))) <> upper(trim(COALESCE(od.moneda_entregada, '')))
            AND NOT EXISTS (
              SELECT 1
              FROM public.comisiones_orden co
              WHERE co.orden_id = od.id
            )
        )
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
        /* USD-USD + intermediario: si el flujo CC cliente (sin líneas comisión) + total comisiones_orden ≈ 0, es espejo
           contable de las comisiones (p. ej. 104); no sumar CC para no duplicar con comisiones_acuerdo_*. */
        AND NOT (
          EXISTS (
            SELECT 1
            FROM public.ordenes ox
            WHERE ox.id = m.orden_id
              AND ox.intermediario_id IS NOT NULL
              AND upper(trim(COALESCE(ox.moneda_recibida, ''))) = upper(trim(COALESCE(ox.moneda_entregada, '')))
          )
          AND abs(
            (
              SELECT COALESCE(SUM(m2.monto), 0::numeric)
              FROM public.movimientos_cuenta_corriente m2
              WHERE m2.orden_id = m.orden_id
                AND upper(trim(COALESCE(m2.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
                AND m2.estado IN ('pendiente', 'cerrado')
                AND m2.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m2.concepto, ''), m2.clasificacion_movimiento)
                AND (p_desde IS NULL OR m2.fecha >= p_desde)
                AND (p_hasta IS NULL OR m2.fecha <= p_hasta)
            )
            + (
              SELECT COALESCE(SUM(co.monto), 0::numeric)
              FROM public.comisiones_orden co
              WHERE co.orden_id = m.orden_id
                AND upper(trim(co.moneda)) = upper(trim(m.moneda))
                AND co.beneficiario IN ('pandy', 'intermediario')
            )
          ) <= 0.01
        )
        AND NOT public.gp_operativa_orden_es_usd_usd_inter_cc_cli_excl_nom_85_89_gp(m.orden_id, m.moneda)
        AND NOT EXISTS (
          SELECT 1
          FROM public.ordenes od
          WHERE od.id = m.orden_id
            AND lower(COALESCE(od.estado, '')) <> 'anulada'
            AND od.monto_recibido IS NOT NULL
            AND od.monto_entregado IS NOT NULL
            AND od.moneda_recibida IS NOT NULL
            AND od.moneda_entregada IS NOT NULL
            AND upper(trim(COALESCE(od.moneda_recibida, ''))) <> upper(trim(COALESCE(od.moneda_entregada, '')))
            AND NOT EXISTS (
              SELECT 1
              FROM public.comisiones_orden co
              WHERE co.orden_id = od.id
            )
        )
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
      UNION ALL
      SELECT
        jsonb_build_object(
          'id', ('gp-monr-orden-' || o.id::text || '-' || o.moneda_recibida),
          'fecha', o.fecha::text,
          'moneda', o.moneda_recibida,
          'monto', o.monto_recibido::numeric,
          'concepto', 'Ajuste G/P Operativa (doble moneda sin comisión): +MonR desde orden',
          'tipo_movimiento', NULL,
          'modo_pago', '',
          'orden_numero', o.numero,
          'transaccion_numero', NULL,
          'entidad', c.nombre,
          'cc_estado', 'cerrado',
          'es_movimiento_manual', false
        ) AS row_json,
        o.fecha AS fecha_sort,
        ('gp-monr-orden-' || o.id::text || '-' || o.moneda_recibida) AS id_sort
      FROM public.ordenes o
      LEFT JOIN public.clientes c ON c.id = o.cliente_id
      WHERE lower(COALESCE(o.estado, '')) <> 'anulada'
        AND o.monto_recibido IS NOT NULL
        AND o.monto_entregado IS NOT NULL
        AND o.moneda_recibida IS NOT NULL
        AND o.moneda_entregada IS NOT NULL
        AND upper(trim(COALESCE(o.moneda_recibida, ''))) <> upper(trim(COALESCE(o.moneda_entregada, '')))
        AND NOT EXISTS (
          SELECT 1
          FROM public.comisiones_orden co
          WHERE co.orden_id = o.id
        )
        AND (p_desde IS NULL OR o.fecha >= p_desde)
        AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      UNION ALL
      SELECT
        jsonb_build_object(
          'id', ('gp-mone-orden-' || o.id::text || '-' || o.moneda_entregada),
          'fecha', o.fecha::text,
          'moneda', o.moneda_entregada,
          'monto', (-o.monto_entregado::numeric),
          'concepto', 'Ajuste G/P Operativa (doble moneda sin comisión): -MonE desde orden',
          'tipo_movimiento', NULL,
          'modo_pago', '',
          'orden_numero', o.numero,
          'transaccion_numero', NULL,
          'entidad', c.nombre,
          'cc_estado', 'cerrado',
          'es_movimiento_manual', false
        ) AS row_json,
        o.fecha AS fecha_sort,
        ('gp-mone-orden-' || o.id::text || '-' || o.moneda_entregada) AS id_sort
      FROM public.ordenes o
      LEFT JOIN public.clientes c ON c.id = o.cliente_id
      WHERE lower(COALESCE(o.estado, '')) <> 'anulada'
        AND o.monto_recibido IS NOT NULL
        AND o.monto_entregado IS NOT NULL
        AND o.moneda_recibida IS NOT NULL
        AND o.moneda_entregada IS NOT NULL
        AND upper(trim(COALESCE(o.moneda_recibida, ''))) <> upper(trim(COALESCE(o.moneda_entregada, '')))
        AND NOT EXISTS (
          SELECT 1
          FROM public.comisiones_orden co
          WHERE co.orden_id = o.id
        )
        AND (p_desde IS NULL OR o.fecha >= p_desde)
        AND (p_hasta IS NULL OR o.fecha <= p_hasta)
      UNION ALL
      SELECT
        jsonb_build_object(
          'id', ('gp-cobro-nominal-' || o.id::text || '-' || o.moneda_recibida),
          'fecha', o.fecha::text,
          'moneda', o.moneda_recibida,
          'monto',
            (
              o.monto_recibido::numeric
              - COALESCE(
                (
                  SELECT SUM(cp.monto)::numeric
                  FROM public.comisiones_orden cp
                  WHERE cp.orden_id = o.id
                    AND cp.beneficiario = 'pandy'
                    AND upper(trim(cp.moneda)) = upper(trim(o.moneda_recibida))
                ),
                0::numeric
              )
            )::numeric,
          'concepto',
            'Ajuste G/P Operativa: cobro nominal neto P&G (monto_recibido − comisión Pandy en moneda recibida). Con flujo CC int y comisiones cierra en ganancia Pandy sin doble conteo del spread.',
          'tipo_movimiento', NULL,
          'modo_pago', '',
          'orden_numero', o.numero,
          'transaccion_numero', NULL,
          'entidad', c.nombre,
          'cc_estado', 'cerrado',
          'es_movimiento_manual', false
        ) AS row_json,
        o.fecha AS fecha_sort,
        ('gp-cobro-nominal-' || o.id::text || '-' || o.moneda_recibida) AS id_sort
      FROM public.ordenes o
      LEFT JOIN public.clientes c ON c.id = o.cliente_id
      WHERE lower(COALESCE(o.estado, '')) <> 'anulada'
        AND o.monto_recibido IS NOT NULL
        AND o.moneda_recibida IS NOT NULL
        AND (p_desde IS NULL OR o.fecha >= p_desde)
        AND (p_hasta IS NULL OR o.fecha <= p_hasta)
        AND NOT EXISTS (
          SELECT 1
          FROM public.movimientos_caja mz
          WHERE mz.orden_id = o.id
            AND upper(trim(COALESCE(mz.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
            AND mz.estado = 'cerrado'
            AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(mz.concepto, ''), mz.clasificacion_movimiento)
            AND (p_desde IS NULL OR mz.fecha >= p_desde)
            AND (p_hasta IS NULL OR mz.fecha <= p_hasta)
        )
        AND NOT public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(o.id, o.moneda_recibida)
        AND EXISTS (
          SELECT 1
          FROM (
            SELECT
              c2.orden_id,
              c2.moneda,
              (
                COALESCE(SUM(c2.monto) FILTER (WHERE c2.beneficiario = 'pandy'), 0::numeric)
                + COALESCE(SUM(c2.monto) FILTER (WHERE c2.beneficiario = 'intermediario'), 0::numeric)
              ) AS com_total
            FROM public.comisiones_orden c2
            WHERE c2.orden_id = o.id
            GROUP BY c2.orden_id, c2.moneda
            HAVING COUNT(*) FILTER (WHERE c2.beneficiario = 'pandy') >= 1
              AND COUNT(*) FILTER (WHERE c2.beneficiario = 'intermediario') >= 1
          ) r
          INNER JOIN (
            SELECT
              m2.orden_id,
              m2.moneda,
              SUM(m2.monto)::numeric AS s_flujo
            FROM public.movimientos_cuenta_corriente_intermediario m2
            WHERE m2.estado IN ('pendiente', 'cerrado')
              AND m2.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
              AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m2.concepto, ''), m2.clasificacion_movimiento)
              AND (p_desde IS NULL OR m2.fecha >= p_desde)
              AND (p_hasta IS NULL OR m2.fecha <= p_hasta)
            GROUP BY m2.orden_id, m2.moneda
          ) f ON f.orden_id = r.orden_id AND f.moneda = r.moneda
          WHERE r.orden_id = o.id
            AND upper(trim(r.moneda)) = upper(trim(o.moneda_recibida))
            AND abs(abs(f.s_flujo) + r.com_total - o.monto_recibido::numeric) <= 0.01
        )
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
        WITH reparto_comisiones AS (
          SELECT
            c.orden_id,
            c.moneda,
            (
              COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'pandy'), 0::numeric)
              + COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'intermediario'), 0::numeric)
            ) AS com_total
          FROM public.comisiones_orden c
          INNER JOIN public.ordenes o ON o.id = c.orden_id
          WHERE lower(COALESCE(o.estado, '')) <> 'anulada'
            AND (p_desde IS NULL OR o.fecha >= p_desde)
            AND (p_hasta IS NULL OR o.fecha <= p_hasta)
          GROUP BY c.orden_id, c.moneda
          HAVING COUNT(*) FILTER (WHERE c.beneficiario = 'pandy') >= 1
            AND COUNT(*) FILTER (WHERE c.beneficiario = 'intermediario') >= 1
        )
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
          AND NOT public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(m.orden_id, m.moneda)
          AND NOT (
            EXISTS (
              SELECT 1
              FROM public.ordenes o4
              WHERE o4.id = m.orden_id
                AND o4.intermediario_id IS NOT NULL
                AND upper(trim(COALESCE(o4.moneda_recibida, ''))) = upper(trim(COALESCE(o4.moneda_entregada, '')))
            )
            AND EXISTS (
              SELECT 1
              FROM public.transacciones t_in
              INNER JOIN public.instrumentacion i_in ON i_in.id = t_in.instrumentacion_id
              WHERE i_in.orden_id = m.orden_id
                AND upper(trim(COALESCE(t_in.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
                AND lower(COALESCE(t_in.estado, '')) = 'ejecutada'
                AND lower(COALESCE(t_in.tipo, '')) = 'ingreso'
                AND lower(COALESCE(t_in.pagador, '')) = 'cliente'
                AND lower(COALESCE(t_in.cobrador, '')) = 'pandy'
            )
            AND EXISTS (
              SELECT 1
              FROM public.transacciones t_out
              INNER JOIN public.instrumentacion i_out ON i_out.id = t_out.instrumentacion_id
              WHERE i_out.orden_id = m.orden_id
                AND upper(trim(COALESCE(t_out.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
                AND lower(COALESCE(t_out.estado, '')) = 'ejecutada'
                AND lower(COALESCE(t_out.tipo, '')) = 'egreso'
                AND lower(COALESCE(t_out.pagador, '')) = 'intermediario'
                AND lower(COALESCE(t_out.cobrador, '')) = 'cliente'
            )
            /* Solo passthrough «caja + CC cliente neto cero» (p. ej. 58); no aplica a 8 (sin caja) ni 104 (CC flujo ≠ 0). */
            AND EXISTS (
              SELECT 1
              FROM public.movimientos_caja mz
              WHERE mz.orden_id = m.orden_id
                AND upper(trim(COALESCE(mz.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
                AND mz.estado = 'cerrado'
                AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(mz.concepto, ''), mz.clasificacion_movimiento)
                AND (p_desde IS NULL OR mz.fecha >= p_desde)
                AND (p_hasta IS NULL OR mz.fecha <= p_hasta)
                AND EXISTS (
                  SELECT 1
                  FROM public.transacciones te
                  INNER JOIN public.instrumentacion ie ON ie.id = te.instrumentacion_id
                  WHERE te.id = mz.transaccion_id
                    AND ie.orden_id = m.orden_id
                    AND upper(trim(COALESCE(te.moneda, ''))) = upper(trim(COALESCE(m.moneda, '')))
                    AND lower(COALESCE(te.tipo, '')) = 'ingreso'
                    AND lower(COALESCE(te.pagador, '')) = 'cliente'
                    AND lower(COALESCE(te.cobrador, '')) = 'pandy'
                )
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.ordenes od
            WHERE od.id = m.orden_id
              AND lower(COALESCE(od.estado, '')) <> 'anulada'
              AND od.monto_recibido IS NOT NULL
              AND od.monto_entregado IS NOT NULL
              AND od.moneda_recibida IS NOT NULL
              AND od.moneda_entregada IS NOT NULL
              AND upper(trim(COALESCE(od.moneda_recibida, ''))) <> upper(trim(COALESCE(od.moneda_entregada, '')))
              AND NOT EXISTS (
                SELECT 1
                FROM public.comisiones_orden co
                WHERE co.orden_id = od.id
              )
          )
          AND (p_desde IS NULL OR m.fecha >= p_desde)
          AND (p_hasta IS NULL OR m.fecha <= p_hasta)
        UNION ALL
        SELECT
          jsonb_build_object(
            'id', ('gp-reparto-' || r.orden_id::text || '-' || r.moneda),
            'fecha', o.fecha::text,
            'moneda', r.moneda,
            'monto', (-r.com_total),
            'concepto', 'Ajuste G/P: reparto comisiones (comisiones_orden Pandy+intermediario) ya contabilizado en bolsa comisiones empresa; evita doble conteo con el flujo CC intermediario.',
            'tipo_movimiento', NULL,
            'modo_pago', '',
            'orden_numero', o.numero,
            'transaccion_numero', NULL,
            'entidad', intm.nombre,
            'cc_estado', 'cerrado',
            'es_movimiento_manual', false
          ) AS row_json,
          o.fecha AS fecha_sort,
          ('gp-reparto-' || r.orden_id::text || '-' || r.moneda) AS id_sort
        FROM reparto_comisiones r
        INNER JOIN public.ordenes o ON o.id = r.orden_id
        LEFT JOIN public.intermediarios intm ON intm.id = o.intermediario_id
        WHERE r.com_total <> 0
          AND NOT public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(r.orden_id, r.moneda)
          AND EXISTS (
            SELECT 1
            FROM public.movimientos_cuenta_corriente_intermediario m2
            WHERE m2.orden_id = r.orden_id
              AND m2.moneda = r.moneda
              AND m2.estado IN ('pendiente', 'cerrado')
              AND m2.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
              AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m2.concepto, ''), m2.clasificacion_movimiento)
              AND (p_desde IS NULL OR m2.fecha >= p_desde)
              AND (p_hasta IS NULL OR m2.fecha <= p_hasta)
          )
          /* Misma condición que gp_operativa_resumen: no fila sintética si el flujo ya es neto mr (|S|+com≈monto_recibido). */
          AND NOT (
            o.monto_recibido IS NOT NULL
            AND upper(trim(COALESCE(r.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
            AND abs(
              abs((
                SELECT COALESCE(SUM(m3.monto), 0::numeric)
                FROM public.movimientos_cuenta_corriente_intermediario m3
                WHERE m3.orden_id = r.orden_id
                  AND m3.moneda = r.moneda
                  AND m3.estado IN ('pendiente', 'cerrado')
                  AND m3.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                  AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m3.concepto, ''), m3.clasificacion_movimiento)
                  AND (p_desde IS NULL OR m3.fecha >= p_desde)
                  AND (p_hasta IS NULL OR m3.fecha <= p_hasta)
              )) + r.com_total - o.monto_recibido::numeric
            ) <= 0.01
          )
        UNION ALL
        SELECT
          jsonb_build_object(
            'id', ('gp-bruto-ccint-cierre-' || r.orden_id::text || '-' || r.moneda),
            'fecha', o.fecha::text,
            'moneda', r.moneda,
            'monto',
              -(
                (
                  SELECT COALESCE(SUM(m4.monto), 0::numeric)
                  FROM public.movimientos_cuenta_corriente_intermediario m4
                  WHERE m4.orden_id = r.orden_id
                    AND m4.moneda = r.moneda
                    AND m4.estado IN ('pendiente', 'cerrado')
                    AND m4.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                    AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m4.concepto, ''), m4.clasificacion_movimiento)
                    AND (p_desde IS NULL OR m4.fecha >= p_desde)
                    AND (p_hasta IS NULL OR m4.fecha <= p_hasta)
                )
                - r.com_total
              )::numeric,
            'concepto', 'Ajuste G/P Operativa: cierre CC intermediario bruto (S≈monto_recibido, comisiones fuera del passthrough); netea flujo+reparto a 0 en P&G; ganancia empresa en bolsa comisiones Pandy.',
            'tipo_movimiento', NULL,
            'modo_pago', '',
            'orden_numero', o.numero,
            'transaccion_numero', NULL,
            'entidad', intm.nombre,
            'cc_estado', 'cerrado',
            'es_movimiento_manual', false
          ) AS row_json,
          o.fecha AS fecha_sort,
          ('gp-bruto-ccint-cierre-' || r.orden_id::text || '-' || r.moneda) AS id_sort
        FROM reparto_comisiones r
        INNER JOIN public.ordenes o ON o.id = r.orden_id
        LEFT JOIN public.intermediarios intm ON intm.id = o.intermediario_id
        WHERE r.com_total <> 0
          AND NOT public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(r.orden_id, r.moneda)
          AND EXISTS (
            SELECT 1
            FROM public.movimientos_cuenta_corriente_intermediario m2
            WHERE m2.orden_id = r.orden_id
              AND m2.moneda = r.moneda
              AND m2.estado IN ('pendiente', 'cerrado')
              AND m2.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
              AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m2.concepto, ''), m2.clasificacion_movimiento)
              AND (p_desde IS NULL OR m2.fecha >= p_desde)
              AND (p_hasta IS NULL OR m2.fecha <= p_hasta)
          )
          AND o.monto_recibido IS NOT NULL
          AND upper(trim(COALESCE(r.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
          AND abs(
            (
              SELECT COALESCE(SUM(m5.monto), 0::numeric)
              FROM public.movimientos_cuenta_corriente_intermediario m5
              WHERE m5.orden_id = r.orden_id
                AND m5.moneda = r.moneda
                AND m5.estado IN ('pendiente', 'cerrado')
                AND m5.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m5.concepto, ''), m5.clasificacion_movimiento)
                AND (p_desde IS NULL OR m5.fecha >= p_desde)
                AND (p_hasta IS NULL OR m5.fecha <= p_hasta)
            ) - o.monto_recibido::numeric
          ) <= 0.01
          AND NOT (
            abs(
              abs((
                SELECT COALESCE(SUM(m6.monto), 0::numeric)
                FROM public.movimientos_cuenta_corriente_intermediario m6
                WHERE m6.orden_id = r.orden_id
                  AND m6.moneda = r.moneda
                  AND m6.estado IN ('pendiente', 'cerrado')
                  AND m6.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                  AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m6.concepto, ''), m6.clasificacion_movimiento)
                  AND (p_desde IS NULL OR m6.fecha >= p_desde)
                  AND (p_hasta IS NULL OR m6.fecha <= p_hasta)
              )) + r.com_total - o.monto_recibido::numeric
            ) <= 0.01
          )
        UNION ALL
        SELECT
          jsonb_build_object(
            'id', ('gp-cheque-ars-int-solo-pandy-' || o.id::text || '-' || upper(trim(COALESCE(r.moneda, '')))),
            'fecha', o.fecha::text,
            'moneda', r.moneda,
            'monto', (-r.s_flujo)::numeric,
            'concepto', 'Ajuste G/P: flujo CC intermediario (misma moneda) coincide con comisión Pandy en comisiones_orden; la ganancia está en bolsa comisiones — neteo en esta bolsa.',
            'tipo_movimiento', NULL,
            'modo_pago', '',
            'orden_numero', o.numero,
            'transaccion_numero', NULL,
            'entidad', intm.nombre,
            'cc_estado', 'cerrado',
            'es_movimiento_manual', false
          ) AS row_json,
          o.fecha AS fecha_sort,
          ('gp-cheque-ars-int-solo-pandy-' || o.id::text || '-' || upper(trim(COALESCE(r.moneda, '')))) AS id_sort
        FROM (
          SELECT
            o2.id AS orden_id,
            o2.moneda_recibida AS moneda,
            (
              SELECT COALESCE(SUM(m.monto), 0::numeric)
              FROM public.movimientos_cuenta_corriente_intermediario m
              WHERE m.orden_id = o2.id
                AND upper(trim(m.moneda)) = upper(trim(o2.moneda_recibida))
                AND m.estado IN ('pendiente', 'cerrado')
                AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
                AND (p_desde IS NULL OR m.fecha >= p_desde)
                AND (p_hasta IS NULL OR m.fecha <= p_hasta)
            ) AS s_flujo
          FROM public.ordenes o2
          WHERE lower(COALESCE(o2.estado, '')) <> 'anulada'
            AND (p_desde IS NULL OR o2.fecha >= p_desde)
            AND (p_hasta IS NULL OR o2.fecha <= p_hasta)
            AND o2.intermediario_id IS NOT NULL
            AND o2.monto_recibido IS NOT NULL
            AND o2.moneda_recibida IS NOT NULL
            AND o2.moneda_entregada IS NOT NULL
            AND upper(trim(o2.moneda_recibida)) = upper(trim(o2.moneda_entregada))
            AND NOT EXISTS (
              SELECT 1
              FROM public.comisiones_orden ci
              WHERE ci.orden_id = o2.id
                AND ci.beneficiario = 'intermediario'
                AND upper(trim(ci.moneda)) = upper(trim(o2.moneda_recibida))
            )
            AND EXISTS (
              SELECT 1
              FROM public.comisiones_orden cp
              WHERE cp.orden_id = o2.id
                AND cp.beneficiario = 'pandy'
                AND upper(trim(cp.moneda)) = upper(trim(o2.moneda_recibida))
            )
        ) r
        INNER JOIN public.ordenes o ON o.id = r.orden_id
        LEFT JOIN public.intermediarios intm ON intm.id = o.intermediario_id
        WHERE r.s_flujo <> 0::numeric
          AND abs(
            abs(r.s_flujo) - (
              SELECT COALESCE(SUM(cp.monto), 0::numeric)
              FROM public.comisiones_orden cp
              WHERE cp.orden_id = r.orden_id
                AND cp.beneficiario = 'pandy'
                AND upper(trim(cp.moneda)) = upper(trim(r.moneda))
            )
          ) <= 0.01
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
        AND NOT public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(o.id, c.moneda)
        AND NOT (
          o.intermediario_id IS NOT NULL
          AND upper(trim(COALESCE(o.moneda_recibida, ''))) = upper(trim(COALESCE(o.moneda_entregada, '')))
          AND EXISTS (
            SELECT 1
            FROM public.transacciones t_in
            INNER JOIN public.instrumentacion i_in ON i_in.id = t_in.instrumentacion_id
            WHERE i_in.orden_id = o.id
              AND upper(trim(COALESCE(t_in.moneda, ''))) = upper(trim(c.moneda))
              AND lower(COALESCE(t_in.estado, '')) = 'ejecutada'
              AND lower(COALESCE(t_in.tipo, '')) = 'ingreso'
              AND lower(COALESCE(t_in.pagador, '')) = 'cliente'
              AND lower(COALESCE(t_in.cobrador, '')) = 'pandy'
          )
          AND EXISTS (
            SELECT 1
            FROM public.transacciones t_out
            INNER JOIN public.instrumentacion i_out ON i_out.id = t_out.instrumentacion_id
            WHERE i_out.orden_id = o.id
              AND upper(trim(COALESCE(t_out.moneda, ''))) = upper(trim(c.moneda))
              AND lower(COALESCE(t_out.estado, '')) = 'ejecutada'
              AND lower(COALESCE(t_out.tipo, '')) = 'egreso'
              AND lower(COALESCE(t_out.pagador, '')) = 'intermediario'
              AND lower(COALESCE(t_out.cobrador, '')) = 'cliente'
          )
          AND EXISTS (
            SELECT 1
            FROM public.movimientos_caja mz
            WHERE mz.orden_id = o.id
              AND upper(trim(COALESCE(mz.moneda, ''))) = upper(trim(c.moneda))
              AND mz.estado = 'cerrado'
              AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(mz.concepto, ''), mz.clasificacion_movimiento)
              AND (p_desde IS NULL OR mz.fecha >= p_desde)
              AND (p_hasta IS NULL OR mz.fecha <= p_hasta)
              AND EXISTS (
                SELECT 1
                FROM public.transacciones te
                INNER JOIN public.instrumentacion ie ON ie.id = te.instrumentacion_id
                WHERE te.id = mz.transaccion_id
                  AND ie.orden_id = o.id
                  AND upper(trim(COALESCE(te.moneda, ''))) = upper(trim(c.moneda))
                  AND lower(COALESCE(te.tipo, '')) = 'ingreso'
                  AND lower(COALESCE(te.pagador, '')) = 'cliente'
                  AND lower(COALESCE(te.cobrador, '')) = 'pandy'
              )
          )
          AND abs((
            SELECT COALESCE(SUM(mc.monto), 0::numeric)
            FROM public.movimientos_cuenta_corriente mc
            WHERE mc.orden_id = o.id
              AND upper(trim(COALESCE(mc.moneda, ''))) = upper(trim(c.moneda))
              AND mc.estado IN ('pendiente', 'cerrado')
              AND mc.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
              AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(mc.concepto, ''), mc.clasificacion_movimiento)
              AND (p_desde IS NULL OR mc.fecha >= p_desde)
              AND (p_hasta IS NULL OR mc.fecha <= p_hasta)
          )) <= 0.01
        )
        AND (p_desde IS NULL OR o.fecha >= p_desde)
        AND (p_hasta IS NULL OR o.fecha <= p_hasta)
        AND (
          NOT EXISTS (
            SELECT 1
            FROM public.comisiones_orden c_p
            WHERE c_p.orden_id = c.orden_id
              AND c_p.moneda = c.moneda
              AND c_p.beneficiario = 'pandy'
          )
          OR EXISTS (
            SELECT 1
            FROM public.ordenes o_pt
            WHERE o_pt.id = c.orden_id
              AND lower(COALESCE(o_pt.estado, '')) <> 'anulada'
              AND o_pt.monto_recibido IS NOT NULL
              AND upper(trim(c.moneda)) = upper(trim(o_pt.moneda_recibida))
              AND abs(
                abs((
                  SELECT COALESCE(SUM(m.monto), 0::numeric)
                  FROM public.movimientos_cuenta_corriente_intermediario m
                  WHERE m.orden_id = c.orden_id
                    AND m.moneda = c.moneda
                    AND m.estado IN ('pendiente', 'cerrado')
                    AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                    AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
                    AND (p_desde IS NULL OR m.fecha >= p_desde)
                    AND (p_hasta IS NULL OR m.fecha <= p_hasta)
                ))
                + (
                  SELECT COALESCE(SUM(co.monto), 0::numeric)
                  FROM public.comisiones_orden co
                  WHERE co.orden_id = c.orden_id
                    AND co.moneda = c.moneda
                    AND co.beneficiario IN ('pandy', 'intermediario')
                )
                - o_pt.monto_recibido::numeric
              ) <= 0.01
          )
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.comisiones_orden cp
          WHERE cp.orden_id = m.orden_id
            AND cp.beneficiario = 'pandy'
        )
      ) sub
    );
  END IF;

  /* Una fila por (orden, moneda): comisión Pandy − comisión intermediario en comisiones_orden.
     Es la **ganancia devengada** atribuible a comisiones; no suma caja ni CC (nominal). No entra
     en gp_operativa_resumen (evita doble conteo con las bolsas de comisión; uso: «orden N = 130»). */
  IF b = 'ganancia_devengada_orden' THEN
    RETURN (
      SELECT COALESCE(
        jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          jsonb_build_object(
            'id', ('gp-gan-ord-' || s.orden_id::text || '-' || upper(trim(COALESCE(s.moneda, '')))),
            'fecha', o.fecha::text,
            'moneda', s.moneda,
            'monto', s.net,
            'concepto', 'Ganancia devengada por comisiones (empresa − intermediario) según comisiones_orden',
            'tipo_movimiento', NULL,
            'modo_pago', '',
            'orden_numero', o.numero,
            'transaccion_numero', NULL,
            'entidad', cl.nombre,
            'cc_estado', 'cerrado',
            'es_movimiento_manual', false
          ) AS row_json,
          o.fecha AS fecha_sort,
          ('gp-gan-ord-' || s.orden_id::text || '-' || upper(trim(COALESCE(s.moneda, '')))) AS id_sort
        FROM (
          SELECT
            c.orden_id,
            c.moneda,
            (
              COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'pandy'), 0::numeric)
              - COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'intermediario'), 0::numeric)
            ) AS net
          FROM public.comisiones_orden c
          INNER JOIN public.ordenes o2 ON o2.id = c.orden_id
          WHERE lower(COALESCE(o2.estado, '')) <> 'anulada'
            AND (p_desde IS NULL OR o2.fecha >= p_desde)
            AND (p_hasta IS NULL OR o2.fecha <= p_hasta)
          GROUP BY c.orden_id, c.moneda
        ) s
        INNER JOIN public.ordenes o ON o.id = s.orden_id
        LEFT JOIN public.clientes cl ON cl.id = o.cliente_id
      ) sub
    );
  END IF;

  RETURN '[]'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.gp_operativa_detalle(date, date, text) IS 'Listado JSON por bolsa: caja manual/órdenes; CC cliente+passthrough; CC intermediario+reparto/bruto; comisiones Pandy; intermediario; **ganancia_devengada_orden** (Pandy−int en comisiones_orden, sin caja/CC nominal; no en resumen 7 bolsas). Compensatorio; modo_pago. SECURITY INVOKER / RLS.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_detalle(date, date, text) TO authenticated;
