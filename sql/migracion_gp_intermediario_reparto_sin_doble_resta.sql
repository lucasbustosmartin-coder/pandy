-- Parche G/P (2026-04): comisiones_orden con reparto Pandy+intermediario misma orden+moneda.
-- La fila Pandy ya es ganancia neta marca; no restar de nuevo la fila intermediario en comisiones_acuerdo_intermediario.
-- Idempotente: reemplaza gp_operativa_resumen y gp_operativa_detalle. Ya integrado en migracion_gp_operativa_panel.sql y migracion_gp_operativa_detalle.sql.
-- Requiere columna clasificacion_movimiento (ENUM): migracion_movimiento_clasificacion_fase0_ddl.sql y helpers gp_movimiento_*_gp del panel.

CREATE OR REPLACE FUNCTION public.gp_operativa_resumen(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'caja_manual',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT m.moneda, SUM(m.monto)::numeric AS s
         FROM public.movimientos_caja m
         INNER JOIN public.tipos_movimiento_caja t ON t.id = m.tipo_movimiento_id
         WHERE m.orden_id IS NULL
           AND m.estado = 'cerrado'
           AND COALESCE(t.incluye_gp_operativo, true)
           AND (p_desde IS NULL OR m.fecha >= p_desde)
           AND (p_hasta IS NULL OR m.fecha <= p_hasta)
         GROUP BY m.moneda
       ) q),
      '{}'::jsonb
    ),
    /* Caja por transacciones ejecutadas de órdenes: efectivo/banco/cheque real de Pandy (p. ej. ganancia neta ARS al cerrar CHEQUE-ARS+int). La CC en órdenes cerradas suele anularse; sin esta bolsa el total G/P no ve ese resultado. */
    'caja_ordenes',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT m.moneda, SUM(m.monto)::numeric AS s
         FROM public.movimientos_caja m
         WHERE m.orden_id IS NOT NULL
           AND m.estado = 'cerrado'
           AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
           AND (p_desde IS NULL OR m.fecha >= p_desde)
           AND (p_hasta IS NULL OR m.fecha <= p_hasta)
         GROUP BY m.moneda
       ) q),
      '{}'::jsonb
    ),
    'cc_cliente',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT m.moneda, SUM(m.monto)::numeric AS s
         FROM public.movimientos_cuenta_corriente m
         WHERE m.estado IN ('pendiente', 'cerrado')
           AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
           AND (p_desde IS NULL OR m.fecha >= p_desde)
           AND (p_hasta IS NULL OR m.fecha <= p_hasta)
         GROUP BY m.moneda
       ) q),
      '{}'::jsonb
    ),
    'cc_intermediario',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT m.moneda, SUM(m.monto)::numeric AS s
         FROM public.movimientos_cuenta_corriente_intermediario m
         WHERE m.estado IN ('pendiente', 'cerrado')
           AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
           AND (p_desde IS NULL OR m.fecha >= p_desde)
           AND (p_hasta IS NULL OR m.fecha <= p_hasta)
         GROUP BY m.moneda
       ) q),
      '{}'::jsonb
    ),
    /* Comisión del acuerdo: comisiones_orden (fecha de orden) + líneas CC «Comisión del acuerdo…» huérfanas
       (sin fila comisiones_orden para ese beneficiario/orden) para no perder monto si el libro tiene comisión y la tabla no. */
    'comisiones_acuerdo_pandy',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT u.moneda, SUM(u.monto)::numeric AS s
         FROM (
           SELECT c.moneda, c.monto::numeric AS monto
           FROM public.comisiones_orden c
           INNER JOIN public.ordenes o ON o.id = c.orden_id
           WHERE c.beneficiario = 'pandy'
             AND lower(COALESCE(o.estado, '')) <> 'anulada'
             AND (p_desde IS NULL OR o.fecha >= p_desde)
             AND (p_hasta IS NULL OR o.fecha <= p_hasta)
           UNION ALL
           SELECT m.moneda, m.monto::numeric AS monto
           FROM public.movimientos_cuenta_corriente m
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
         ) u
         GROUP BY u.moneda
       ) q),
      '{}'::jsonb
    ),
    /* Comisión intermediario: filas huérfanas o solo intermediario en comisiones_orden (NEGADO en Total).
       Si para la misma orden+moneda ya existe fila Pandy, los montos son reparto (Pandy = ganancia neta marca; intermediario = parte del acuerdo): NO volver a restar intermediario o el Total queda 49 en vez de 74,50 sobre 100 de spread (orden 49). */
    'comisiones_acuerdo_intermediario',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT u.moneda, (-SUM(u.monto))::numeric AS s
         FROM (
           SELECT c.moneda, c.monto::numeric AS monto
           FROM public.comisiones_orden c
           INNER JOIN public.ordenes o ON o.id = c.orden_id
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
           SELECT m.moneda, m.monto::numeric AS monto
           FROM public.movimientos_cuenta_corriente_intermediario m
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
         ) u
         GROUP BY u.moneda
       ) q),
      '{}'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.gp_operativa_resumen(date, date) IS 'P&L operativo de la empresa por moneda (seis bolsas, sin doble conteo): caja manual y caja por órdenes solo cerrado no anulado; CC cliente e intermediario pendiente+cerrado (excl. anulado), excl. líneas «Comisión del acuerdo…» en el flujo; comisiones_acuerdo_pandy desde comisiones_orden+CC huérfanas; comisiones_acuerdo_intermediario: NEGADO solo para filas intermediario sin par Pandy misma orden+moneda (reparto ya neteado en fila Pandy). Total = suma de las seis claves. Fechas inclusive; NULL = sin límite.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_resumen(date, date) TO authenticated;

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
  IF b NOT IN (
    'caja_manual',
    'caja_ordenes',
    'cc_cliente',
    'cc_intermediario',
    'comisiones_acuerdo_pandy',
    'comisiones_acuerdo_intermediario'
  ) THEN
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
        AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
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
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', c.nombre
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente m
      LEFT JOIN public.clientes c ON c.id = m.cliente_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  IF b = 'cc_intermediario' THEN
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
          'modo_pago', COALESCE(
            NULLIF(TRIM(COALESCE(mp.nombre, '')), ''),
            NULLIF(TRIM(COALESCE(mp.codigo, '')), ''),
            ''
          ),
          'orden_numero', o.numero,
          'transaccion_numero', m.transaccion_numero,
          'entidad', i.nombre
        ) AS row_json,
        m.fecha AS fecha_sort,
        m.id::text AS id_sort
      FROM public.movimientos_cuenta_corriente_intermediario m
      LEFT JOIN public.intermediarios i ON i.id = m.intermediario_id
      LEFT JOIN public.ordenes o ON o.id = m.orden_id
      LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
      LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
      WHERE m.estado IN ('pendiente', 'cerrado')
        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
        AND (p_desde IS NULL OR m.fecha >= p_desde)
        AND (p_hasta IS NULL OR m.fecha <= p_hasta)
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  IF b = 'comisiones_acuerdo_pandy' THEN
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
      '[]'::jsonb
    )
    INTO v
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
          'entidad', cl.nombre
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
          'entidad', c.nombre
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
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  IF b = 'comisiones_acuerdo_intermediario' THEN
    SELECT COALESCE(
      jsonb_agg(row_json ORDER BY fecha_sort DESC, id_sort DESC),
      '[]'::jsonb
    )
    INTO v
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
          'entidad', i.nombre
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
          'entidad', intm.nombre
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
    ) sub;
    RETURN COALESCE(v, '[]'::jsonb);
  END IF;

  RETURN '[]'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.gp_operativa_detalle(date, date, text) IS 'Listado JSON por bolsa (mismo criterio que gp_operativa_resumen): caja manual/órdenes cerrado no anulado; CC cliente/intermediario pendiente+cerrado sin líneas «Comisión del acuerdo…»; comisiones empresa; comisión intermediario desde comisiones_orden solo si no hay par Pandy misma orden+moneda (evita doble resta); CC huérfanas con montos negados en JSON. modo_pago: caja_tipo o modos_pago vía transacción. SECURITY INVOKER / RLS.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_detalle(date, date, text) TO authenticated;
