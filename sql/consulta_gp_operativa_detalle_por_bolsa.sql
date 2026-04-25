-- Consulta analítica: cada fila que entra en G/P Operativa (misma lógica que
-- `gp_operativa_resumen` / `gp_operativa_detalle` en migracion_gp_operativa_panel.sql
-- y migracion_gp_operativa_detalle.sql).
--
-- Uso: en Supabase SQL Editor, editar `params`:
--   Rango: fechas desde / hasta (inclusive).
--   Toda la historia: `NULL::date` en ambas (misma semántica que `gp_operativa_resumen` con límites NULL).
-- Requiere las funciones helper `gp_*` ya desplegadas (misma migración que el RPC).
-- Opcional (totales por bolsa/moneda, debe coincidir con gp_operativa_resumen):
--   SELECT bolsa, moneda, SUM(monto_contribuye_gp)::numeric(20,4) AS suma_gp
--   FROM detalle GROUP BY bolsa, moneda ORDER BY bolsa, moneda
--   (agregar punto y coma solo al pegar esa consulta aparte).
-- Importante: no dejar comentarios sueltos después del único `;` final — algunos editores
-- ejecutan la siguiente “sentencia” vacía y Postgres devuelve 42601 al final del input.
--
-- Columnas:
--   bolsa: una de las siete claves del resumen JSON.
--   fuente_tabla: tabla física del registro.
--   monto_contribuye_gp: signo tal como suma en el total G/P de esa bolsa
--     (en comisiones intermediario y CC huérfanas comisión va negado como en el detalle RPC).
--   monto_en_tabla: valor almacenado en la fila origen (sin invertir signo).

WITH params AS (
  SELECT
    NULL::date AS desde,  -- NULL = sin límite inferior (toda la historia)
    NULL::date AS hasta   -- NULL = sin límite superior
),

/* ---------- 1. caja_manual ---------- */
caja_manual AS (
  SELECT
    'caja_manual'::text AS bolsa,
    'movimientos_caja'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    t.nombre AS tipo_movimiento_caja,
    COALESCE(
      CASE lower(trim(COALESCE(m.caja_tipo, '')))
        WHEN 'efectivo' THEN 'Efectivo'
        WHEN 'banco' THEN 'Banco'
        WHEN 'cheque' THEN 'Cheque'
        ELSE NULL
      END,
      ''
    ) AS modo_pago,
    m.orden_id,
    m.orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    NULL::text AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    COALESCE(t.incluye_gp_operativo, true) AS tipo_incluye_gp_operativo,
    'Caja sin orden, cerrado, tipo con incluye_gp_operativo.'::text AS nota_bolsa
  FROM public.movimientos_caja m
  INNER JOIN public.tipos_movimiento_caja t ON t.id = m.tipo_movimiento_id
  CROSS JOIN params p
  WHERE m.orden_id IS NULL
    AND m.estado = 'cerrado'
    AND COALESCE(t.incluye_gp_operativo, true)
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
),

/* ---------- 2. caja_ordenes ---------- */
caja_ordenes AS (
  SELECT
    'caja_ordenes'::text AS bolsa,
    'movimientos_caja'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    t.nombre AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    COALESCE(m.orden_numero, o.numero) AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    NULL::text AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'Caja con orden, cerrado, excluye comisión acuerdo (texto o ENUM CAJA_COMISION_ACUERDO).'::text AS nota_bolsa
  FROM public.movimientos_caja m
  LEFT JOIN public.tipos_movimiento_caja t ON t.id = m.tipo_movimiento_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.orden_id IS NOT NULL
    AND m.estado = 'cerrado'
    AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
),

/* ---------- 3. cc_cliente ---------- */
cc_cliente AS (
  SELECT
    'cc_cliente'::text AS bolsa,
    'movimientos_cuenta_corriente'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    NULL::text AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    o.numero AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    c.nombre AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    COALESCE(m.es_movimiento_manual, false) AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'CC cliente pendiente/cerrado; excluye compensatorio y líneas comisión acuerdo (flujo).'::text AS nota_bolsa
  FROM public.movimientos_cuenta_corriente m
  LEFT JOIN public.clientes c ON c.id = m.cliente_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.estado IN ('pendiente', 'cerrado')
    AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
    AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
  UNION ALL
  SELECT
    'cc_cliente'::text AS bolsa,
    'gp_cobro_nominal_acuerdo'::text AS fuente_tabla,
    ('gp-cobro-nominal-' || o.id::text || '-' || o.moneda_recibida) AS registro_id,
    o.fecha::date AS fecha,
    o.moneda_recibida AS moneda,
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
    )::numeric AS monto_contribuye_gp,
    o.monto_recibido::numeric AS monto_en_tabla,
    'Ajuste G/P Operativa: cobro nominal neto P&G (monto_recibido − comisión Pandy; monto_en_tabla = mr).'::text AS concepto,
    NULL::text AS tipo_movimiento_caja,
    ''::text AS modo_pago,
    o.id AS orden_id,
    o.numero AS orden_numero,
    NULL::uuid AS transaccion_id,
    NULL::integer AS transaccion_numero,
    c.nombre AS entidad_nombre,
    'cerrado'::text AS cc_estado_o_sim,
    NULL::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'Solo orden con reparto y |S_int flujo|+com≈monto_recibido (passthrough); monto P&G = mr − comisión Pandy.'::text AS nota_bolsa
  FROM public.ordenes o
  LEFT JOIN public.clientes c ON c.id = o.cliente_id
  CROSS JOIN params p
  WHERE lower(COALESCE(o.estado, '')) <> 'anulada'
    AND o.monto_recibido IS NOT NULL
    AND o.moneda_recibida IS NOT NULL
    AND (p.desde IS NULL OR o.fecha >= p.desde)
    AND (p.hasta IS NULL OR o.fecha <= p.hasta)
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
          AND (p.desde IS NULL OR m2.fecha >= p.desde)
          AND (p.hasta IS NULL OR m2.fecha <= p.hasta)
        GROUP BY m2.orden_id, m2.moneda
      ) f ON f.orden_id = r.orden_id AND f.moneda = r.moneda
      WHERE r.orden_id = o.id
        AND upper(trim(r.moneda)) = upper(trim(o.moneda_recibida))
        AND abs(abs(f.s_flujo) + r.com_total - o.monto_recibido::numeric) <= 0.01
    )
),

/* ---------- 4. cc_intermediario ---------- */
cc_intermediario AS (
  SELECT
    'cc_intermediario'::text AS bolsa,
    'movimientos_cuenta_corriente_intermediario'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    NULL::text AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    o.numero AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    i.nombre AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    COALESCE(m.es_movimiento_manual, false) AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'CC intermediario pendiente/cerrado; excluye compensatorio y líneas comisión acuerdo (flujo).'::text AS nota_bolsa
  FROM public.movimientos_cuenta_corriente_intermediario m
  LEFT JOIN public.intermediarios i ON i.id = m.intermediario_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.estado IN ('pendiente', 'cerrado')
    AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
    AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
  UNION ALL
  SELECT
    'cc_intermediario'::text AS bolsa,
    'gp_ajuste_reparto_comisiones'::text AS fuente_tabla,
    ('gp-reparto-' || rco.orden_id::text || '-' || rco.moneda) AS registro_id,
    o.fecha::date AS fecha,
    rco.moneda,
    (-rco.com_total)::numeric AS monto_contribuye_gp,
    (-rco.com_total)::numeric AS monto_en_tabla,
    'Ajuste G/P: reparto comisiones (comisiones_orden Pandy+intermediario) ya en bolsa comisiones empresa; evita doble conteo con CC intermediario.'::text AS concepto,
    NULL::text AS tipo_movimiento_caja,
    ''::text AS modo_pago,
    rco.orden_id,
    o.numero AS orden_numero,
    NULL::uuid AS transaccion_id,
    NULL::integer AS transaccion_numero,
    intm.nombre AS entidad_nombre,
    'cerrado'::text AS cc_estado_o_sim,
    NULL::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'Solo si existe reparto Pandy+intermediario y CC intermediario de esa orden+moneda en el período (misma lógica que gp_operativa_resumen).'::text AS nota_bolsa
  FROM (
    SELECT
      c.orden_id,
      c.moneda,
      (
        COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'pandy'), 0::numeric)
        + COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'intermediario'), 0::numeric)
      ) AS com_total
    FROM public.comisiones_orden c
    INNER JOIN public.ordenes o2 ON o2.id = c.orden_id
    CROSS JOIN params p
    WHERE lower(COALESCE(o2.estado, '')) <> 'anulada'
      AND (p.desde IS NULL OR o2.fecha >= p.desde)
      AND (p.hasta IS NULL OR o2.fecha <= p.hasta)
    GROUP BY c.orden_id, c.moneda
    HAVING COUNT(*) FILTER (WHERE c.beneficiario = 'pandy') >= 1
      AND COUNT(*) FILTER (WHERE c.beneficiario = 'intermediario') >= 1
  ) rco
  INNER JOIN public.ordenes o ON o.id = rco.orden_id
  LEFT JOIN public.intermediarios intm ON intm.id = o.intermediario_id
  CROSS JOIN params p
  WHERE rco.com_total <> 0
    AND EXISTS (
      SELECT 1
      FROM public.movimientos_cuenta_corriente_intermediario m2
      WHERE m2.orden_id = rco.orden_id
        AND m2.moneda = rco.moneda
        AND m2.estado IN ('pendiente', 'cerrado')
        AND m2.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m2.concepto, ''), m2.clasificacion_movimiento)
        AND (p.desde IS NULL OR m2.fecha >= p.desde)
        AND (p.hasta IS NULL OR m2.fecha <= p.hasta)
    )
    AND NOT (
      o.monto_recibido IS NOT NULL
      AND upper(trim(COALESCE(rco.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
      AND abs(
        abs((
          SELECT COALESCE(SUM(m3.monto), 0::numeric)
          FROM public.movimientos_cuenta_corriente_intermediario m3
          WHERE m3.orden_id = rco.orden_id
            AND m3.moneda = rco.moneda
            AND m3.estado IN ('pendiente', 'cerrado')
            AND m3.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
            AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m3.concepto, ''), m3.clasificacion_movimiento)
            AND (p.desde IS NULL OR m3.fecha >= p.desde)
            AND (p.hasta IS NULL OR m3.fecha <= p.hasta)
        )) + rco.com_total - o.monto_recibido::numeric
      ) <= 0.01
    )
  UNION ALL
  SELECT
    'cc_intermediario'::text AS bolsa,
    'gp_bruto_ccint_cierre'::text AS fuente_tabla,
    ('gp-bruto-ccint-cierre-' || rco.orden_id::text || '-' || rco.moneda) AS registro_id,
    o.fecha::date AS fecha,
    rco.moneda,
    (
      -(
        (
          SELECT COALESCE(SUM(m4.monto), 0::numeric)
          FROM public.movimientos_cuenta_corriente_intermediario m4
          WHERE m4.orden_id = rco.orden_id
            AND m4.moneda = rco.moneda
            AND m4.estado IN ('pendiente', 'cerrado')
            AND m4.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
            AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m4.concepto, ''), m4.clasificacion_movimiento)
            AND (p.desde IS NULL OR m4.fecha >= p.desde)
            AND (p.hasta IS NULL OR m4.fecha <= p.hasta)
        )
        - rco.com_total
      )
    )::numeric AS monto_contribuye_gp,
    (
      -(
        (
          SELECT COALESCE(SUM(m4b.monto), 0::numeric)
          FROM public.movimientos_cuenta_corriente_intermediario m4b
          WHERE m4b.orden_id = rco.orden_id
            AND m4b.moneda = rco.moneda
            AND m4b.estado IN ('pendiente', 'cerrado')
            AND m4b.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
            AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m4b.concepto, ''), m4b.clasificacion_movimiento)
            AND (p.desde IS NULL OR m4b.fecha >= p.desde)
            AND (p.hasta IS NULL OR m4b.fecha <= p.hasta)
        )
        - rco.com_total
      )
    )::numeric AS monto_en_tabla,
    'Ajuste G/P Operativa: cierre CC intermediario bruto (S≈monto_recibido, comisiones fuera del passthrough); netea flujo+reparto a 0 en P&G.'::text AS concepto,
    NULL::text AS tipo_movimiento_caja,
    ''::text AS modo_pago,
    rco.orden_id,
    o.numero AS orden_numero,
    NULL::uuid AS transaccion_id,
    NULL::integer AS transaccion_numero,
    intm.nombre AS entidad_nombre,
    'cerrado'::text AS cc_estado_o_sim,
    NULL::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'Solo si reparto, CC int en período, S alineado a mr y NO passthrough (|S|+com≠mr).'::text AS nota_bolsa
  FROM (
    SELECT
      c.orden_id,
      c.moneda,
      (
        COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'pandy'), 0::numeric)
        + COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'intermediario'), 0::numeric)
      ) AS com_total
    FROM public.comisiones_orden c
    INNER JOIN public.ordenes o2 ON o2.id = c.orden_id
    CROSS JOIN params p
    WHERE lower(COALESCE(o2.estado, '')) <> 'anulada'
      AND (p.desde IS NULL OR o2.fecha >= p.desde)
      AND (p.hasta IS NULL OR o2.fecha <= p.hasta)
    GROUP BY c.orden_id, c.moneda
    HAVING COUNT(*) FILTER (WHERE c.beneficiario = 'pandy') >= 1
      AND COUNT(*) FILTER (WHERE c.beneficiario = 'intermediario') >= 1
  ) rco
  INNER JOIN public.ordenes o ON o.id = rco.orden_id
  LEFT JOIN public.intermediarios intm ON intm.id = o.intermediario_id
  CROSS JOIN params p
  WHERE rco.com_total <> 0
    AND EXISTS (
      SELECT 1
      FROM public.movimientos_cuenta_corriente_intermediario m2
      WHERE m2.orden_id = rco.orden_id
        AND m2.moneda = rco.moneda
        AND m2.estado IN ('pendiente', 'cerrado')
        AND m2.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m2.concepto, ''), m2.clasificacion_movimiento)
        AND (p.desde IS NULL OR m2.fecha >= p.desde)
        AND (p.hasta IS NULL OR m2.fecha <= p.hasta)
    )
    AND o.monto_recibido IS NOT NULL
    AND upper(trim(COALESCE(rco.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
    AND abs(
      (
        SELECT COALESCE(SUM(m5.monto), 0::numeric)
        FROM public.movimientos_cuenta_corriente_intermediario m5
        WHERE m5.orden_id = rco.orden_id
          AND m5.moneda = rco.moneda
          AND m5.estado IN ('pendiente', 'cerrado')
          AND m5.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
          AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m5.concepto, ''), m5.clasificacion_movimiento)
          AND (p.desde IS NULL OR m5.fecha >= p.desde)
          AND (p.hasta IS NULL OR m5.fecha <= p.hasta)
      ) - o.monto_recibido::numeric
    ) <= 0.01
    AND NOT (
      abs(
        abs((
          SELECT COALESCE(SUM(m6.monto), 0::numeric)
          FROM public.movimientos_cuenta_corriente_intermediario m6
          WHERE m6.orden_id = rco.orden_id
            AND m6.moneda = rco.moneda
            AND m6.estado IN ('pendiente', 'cerrado')
            AND m6.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
            AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m6.concepto, ''), m6.clasificacion_movimiento)
            AND (p.desde IS NULL OR m6.fecha >= p.desde)
            AND (p.hasta IS NULL OR m6.fecha <= p.hasta)
        )) + rco.com_total - o.monto_recibido::numeric
      ) <= 0.01
    )
),

/* ---------- 5. cc_resultado_economico_compensatorio ---------- */
cc_comp AS (
  SELECT
    'cc_resultado_economico_compensatorio'::text AS bolsa,
    'movimientos_cuenta_corriente'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    NULL::text AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    o.numero AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    c.nombre AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    COALESCE(m.es_movimiento_manual, false) AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'CC cliente clasificación CC_RESULTADO_ECONOMICO_COMPENSATORIO.'::text AS nota_bolsa
  FROM public.movimientos_cuenta_corriente m
  LEFT JOIN public.clientes c ON c.id = m.cliente_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.estado IN ('pendiente', 'cerrado')
    AND m.clasificacion_movimiento = 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
  UNION ALL
  SELECT
    'cc_resultado_economico_compensatorio'::text AS bolsa,
    'movimientos_cuenta_corriente_intermediario'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    NULL::text AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    o.numero AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    i.nombre AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    COALESCE(m.es_movimiento_manual, false) AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'CC intermediario clasificación CC_RESULTADO_ECONOMICO_COMPENSATORIO.'::text AS nota_bolsa
  FROM public.movimientos_cuenta_corriente_intermediario m
  LEFT JOIN public.intermediarios i ON i.id = m.intermediario_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.estado IN ('pendiente', 'cerrado')
    AND m.clasificacion_movimiento = 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
),

/* ---------- 6. comisiones_acuerdo_pandy ---------- */
com_pandy_co AS (
  SELECT
    'comisiones_acuerdo_pandy'::text AS bolsa,
    'comisiones_orden'::text AS fuente_tabla,
    ('co-' || c.id::text) AS registro_id,
    o.fecha::date AS fecha,
    c.moneda,
    c.monto::numeric AS monto_contribuye_gp,
    c.monto::numeric AS monto_en_tabla,
    'Comisión del acuerdo (tabla comisiones_orden · empresa)'::text AS concepto,
    NULL::text AS tipo_movimiento_caja,
    ''::text AS modo_pago,
    c.orden_id,
    o.numero AS orden_numero,
    NULL::uuid AS transaccion_id,
    NULL::int AS transaccion_numero,
    cl.nombre AS entidad_nombre,
    'cerrado'::text AS cc_estado_o_sim,
    NULL::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'comisiones_orden beneficiario pandy; fecha de orden.'::text AS nota_bolsa
  FROM public.comisiones_orden c
  INNER JOIN public.ordenes o ON o.id = c.orden_id
  LEFT JOIN public.clientes cl ON cl.id = o.cliente_id
  CROSS JOIN params p
  WHERE c.beneficiario = 'pandy'
    AND lower(COALESCE(o.estado, '')) <> 'anulada'
    AND (p.desde IS NULL OR o.fecha >= p.desde)
    AND (p.hasta IS NULL OR o.fecha <= p.hasta)
),
com_pandy_cc_huerfana AS (
  SELECT
    'comisiones_acuerdo_pandy'::text AS bolsa,
    'movimientos_cuenta_corriente'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    m.monto::numeric AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    NULL::text AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    o.numero AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    c.nombre AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    COALESCE(m.es_movimiento_manual, false) AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'CC cliente línea comisión acuerdo sin fila comisiones_orden pandy para esa orden (huérfana).'::text AS nota_bolsa
  FROM public.movimientos_cuenta_corriente m
  LEFT JOIN public.clientes c ON c.id = m.cliente_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.estado IN ('pendiente', 'cerrado')
    AND public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
    AND (
      m.orden_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.comisiones_orden c2
        WHERE c2.orden_id = m.orden_id
          AND c2.beneficiario = 'pandy'
      )
    )
),

/* ---------- 7. comisiones_acuerdo_intermediario ---------- */
com_int_co AS (
  SELECT
    'comisiones_acuerdo_intermediario'::text AS bolsa,
    'comisiones_orden'::text AS fuente_tabla,
    ('co-' || c.id::text) AS registro_id,
    o.fecha::date AS fecha,
    c.moneda,
    (-(c.monto)::numeric) AS monto_contribuye_gp,
    c.monto::numeric AS monto_en_tabla,
    'Comisión del acuerdo (tabla comisiones_orden · intermediario)'::text AS concepto,
    NULL::text AS tipo_movimiento_caja,
    ''::text AS modo_pago,
    c.orden_id,
    o.numero AS orden_numero,
    NULL::uuid AS transaccion_id,
    NULL::int AS transaccion_numero,
    i.nombre AS entidad_nombre,
    'cerrado'::text AS cc_estado_o_sim,
    NULL::text AS clasificacion_movimiento,
    false AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'comisiones_orden intermediario si solo intermediario o passthrough (|S_int|+com≈mr); aporte al total en negativo.'::text AS nota_bolsa
  FROM public.comisiones_orden c
  INNER JOIN public.ordenes o ON o.id = c.orden_id
  LEFT JOIN public.intermediarios i ON i.id = o.intermediario_id
  CROSS JOIN params p
  WHERE c.beneficiario = 'intermediario'
    AND lower(COALESCE(o.estado, '')) <> 'anulada'
    AND (p.desde IS NULL OR o.fecha >= p.desde)
    AND (p.hasta IS NULL OR o.fecha <= p.hasta)
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
                AND (p.desde IS NULL OR m.fecha >= p.desde)
                AND (p.hasta IS NULL OR m.fecha <= p.hasta)
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
),
com_int_cc_huerfana AS (
  SELECT
    'comisiones_acuerdo_intermediario'::text AS bolsa,
    'movimientos_cuenta_corriente_intermediario'::text AS fuente_tabla,
    m.id::text AS registro_id,
    m.fecha::date AS fecha,
    m.moneda,
    (-(m.monto)::numeric) AS monto_contribuye_gp,
    m.monto::numeric AS monto_en_tabla,
    COALESCE(m.concepto, '') AS concepto,
    NULL::text AS tipo_movimiento_caja,
    COALESCE(
      NULLIF(trim(COALESCE(mp.nombre, '')), ''),
      NULLIF(trim(COALESCE(mp.codigo, '')), ''),
      ''
    ) AS modo_pago,
    m.orden_id,
    o.numero AS orden_numero,
    m.transaccion_id,
    m.transaccion_numero,
    intm.nombre AS entidad_nombre,
    m.estado::text AS cc_estado_o_sim,
    m.clasificacion_movimiento::text AS clasificacion_movimiento,
    COALESCE(m.es_movimiento_manual, false) AS es_movimiento_manual,
    NULL::boolean AS tipo_incluye_gp_operativo,
    'CC int. comisión acuerdo huérfana (sin fila comisiones_orden intermediario para esa orden); aporte en negativo.'::text AS nota_bolsa
  FROM public.movimientos_cuenta_corriente_intermediario m
  LEFT JOIN public.intermediarios intm ON intm.id = m.intermediario_id
  LEFT JOIN public.ordenes o ON o.id = m.orden_id
  LEFT JOIN public.transacciones tr ON tr.id = m.transaccion_id
  LEFT JOIN public.modos_pago mp ON mp.id = tr.modo_pago_id
  CROSS JOIN params p
  WHERE m.estado IN ('pendiente', 'cerrado')
    AND public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
    AND (p.desde IS NULL OR m.fecha >= p.desde)
    AND (p.hasta IS NULL OR m.fecha <= p.hasta)
    AND (
      m.orden_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.comisiones_orden c2
        WHERE c2.orden_id = m.orden_id
          AND c2.beneficiario = 'intermediario'
      )
    )
),

detalle AS (
  SELECT * FROM caja_manual
  UNION ALL SELECT * FROM caja_ordenes
  UNION ALL SELECT * FROM cc_cliente
  UNION ALL SELECT * FROM cc_intermediario
  UNION ALL SELECT * FROM cc_comp
  UNION ALL SELECT * FROM com_pandy_co
  UNION ALL SELECT * FROM com_pandy_cc_huerfana
  UNION ALL SELECT * FROM com_int_co
  UNION ALL SELECT * FROM com_int_cc_huerfana
)

SELECT
  d.bolsa,
  d.fuente_tabla,
  d.registro_id,
  d.fecha,
  d.moneda,
  d.monto_contribuye_gp,
  d.monto_en_tabla,
  d.concepto,
  d.tipo_movimiento_caja,
  d.modo_pago,
  d.orden_id,
  d.orden_numero,
  d.transaccion_id,
  d.transaccion_numero,
  d.entidad_nombre,
  d.cc_estado_o_sim,
  d.clasificacion_movimiento,
  d.es_movimiento_manual,
  d.tipo_incluye_gp_operativo,
  d.nota_bolsa
FROM detalle d
ORDER BY d.bolsa, d.moneda, d.fecha DESC, d.registro_id;
