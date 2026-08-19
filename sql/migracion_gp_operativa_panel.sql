-- G/P Operativa en Panel de Control: flag en tipos de movimiento caja, permiso de vista, RPC de agregación.
-- Ejecutar en Supabase SQL Editor (después de tipos_movimiento_caja, movimientos_caja, CC cliente/intermediario).

-- Líneas de comisión del acuerdo (misma convención que el front: conceptoCcLeyenda(..., 'comision_acuerdo', ...)
-- y conceptoCajaTransaccionEspecial('Comisión del acuerdo', ...)).
CREATE OR REPLACE FUNCTION public.gp_concepto_es_linea_comision_cc_gp(concepto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(btrim(concepto), '') <> ''
    AND (
      lower(btrim(concepto)) LIKE 'comisión del acuerdo%'
      OR lower(btrim(concepto)) LIKE 'comision del acuerdo%'
    );
$$;

CREATE OR REPLACE FUNCTION public.gp_concepto_es_comision_caja_ordenes_gp(concepto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(btrim(concepto), '') <> ''
    AND (
      btrim(concepto) ILIKE 'Comisión del acuerdo.%'
      OR btrim(concepto) ILIKE 'Comision del acuerdo.%'
    );
$$;

COMMENT ON FUNCTION public.gp_concepto_es_linea_comision_cc_gp(text) IS 'G/P Operativa: true si el concepto de CC es línea de comisión del acuerdo (aislar del flujo operativo y totalizar aparte).';
COMMENT ON FUNCTION public.gp_concepto_es_comision_caja_ordenes_gp(text) IS 'G/P Operativa: true si el concepto de caja por orden es movimiento sintético de comisión del acuerdo (mismo criterio que conceptoCajaTransaccionEspecial).';

GRANT EXECUTE ON FUNCTION public.gp_concepto_es_linea_comision_cc_gp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_concepto_es_comision_caja_ordenes_gp(text) TO authenticated;

-- True si la fila CC cuenta como línea comisión del acuerdo para G/P: texto (legacy) o ENUM explícito (fase clasificación).
CREATE OR REPLACE FUNCTION public.gp_movimiento_cc_cuenta_es_linea_comision_gp(concepto text, clasificacion public.movimiento_clasificacion)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.gp_concepto_es_linea_comision_cc_gp(concepto)
    OR clasificacion IN (
      'CC_COMISION_ACUERDO'::public.movimiento_clasificacion,
      'CC_COMISION_SINTETICA_SIN_TRX'::public.movimiento_clasificacion
    );
$$;

-- True si el movimiento de caja por orden es comisión sintética del acuerdo: texto o ENUM CAJA_COMISION_ACUERDO.
CREATE OR REPLACE FUNCTION public.gp_movimiento_caja_ordenes_es_comision_gp(concepto text, clasificacion public.movimiento_clasificacion)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.gp_concepto_es_comision_caja_ordenes_gp(concepto)
    OR clasificacion = 'CAJA_COMISION_ACUERDO'::public.movimiento_clasificacion;
$$;

COMMENT ON FUNCTION public.gp_movimiento_cc_cuenta_es_linea_comision_gp(text, public.movimiento_clasificacion) IS 'G/P Operativa: comisión acuerdo en CC por concepto (gp_concepto_es_linea_comision_cc_gp) o por clasificacion_movimiento ENUM.';
COMMENT ON FUNCTION public.gp_movimiento_caja_ordenes_es_comision_gp(text, public.movimiento_clasificacion) IS 'G/P Operativa: comisión acuerdo en caja por orden por concepto o por clasificacion_movimiento ENUM.';

GRANT EXECUTE ON FUNCTION public.gp_movimiento_cc_cuenta_es_linea_comision_gp(text, public.movimiento_clasificacion) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gp_movimiento_caja_ordenes_es_comision_gp(text, public.movimiento_clasificacion) TO authenticated;

/* Patrones USD-USD + intermediario (81/85/89) en un solo pase sobre transacciones ejecutadas.
   gp_operativa_resumen / gp_operativa_detalle materializan este set una vez (hash join), para que
   Total (historial completo) no escale con helpers SQL anidados por cada movimiento. */
CREATE OR REPLACE FUNCTION public.gp_operativa_patrones_usd_usd()
RETURNS TABLE (
  orden_id uuid,
  moneda text,
  es_cobertura_81 boolean,
  es_85 boolean,
  es_89 boolean,
  excl_cc_cli_85_89 boolean,
  excl_flujo_nominal boolean
)
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH usd_usd AS (
    SELECT
      o.id AS orden_id,
      upper(trim(COALESCE(o.moneda_recibida, ''))) AS moneda
    FROM public.ordenes o
    WHERE o.intermediario_id IS NOT NULL
      AND upper(trim(COALESCE(o.moneda_recibida, ''))) = upper(trim(COALESCE(o.moneda_entregada, '')))
      AND btrim(COALESCE(o.moneda_recibida, '')) <> ''
  ),
  trx AS (
    SELECT
      i.orden_id,
      upper(trim(COALESCE(t.moneda, ''))) AS moneda,
      bool_or(
        lower(COALESCE(t.tipo, '')) = 'ingreso'
        AND lower(COALESCE(t.pagador, '')) = 'pandy'
        AND lower(COALESCE(t.cobrador, '')) = 'cliente'
      ) AS ing_pandy_cli,
      bool_or(
        lower(COALESCE(t.tipo, '')) = 'egreso'
        AND lower(COALESCE(t.pagador, '')) = 'intermediario'
        AND lower(COALESCE(t.cobrador, '')) = 'cliente'
      ) AS egr_int_cli,
      bool_or(
        lower(COALESCE(t.tipo, '')) = 'ingreso'
        AND lower(COALESCE(t.pagador, '')) = 'cliente'
        AND lower(COALESCE(t.cobrador, '')) = 'pandy'
      ) AS ing_cli_pandy,
      bool_or(
        lower(COALESCE(t.tipo, '')) = 'egreso'
        AND lower(COALESCE(t.pagador, '')) = 'cliente'
        AND lower(COALESCE(t.cobrador, '')) = 'pandy'
      ) AS egr_cli_pandy,
      bool_or(
        lower(COALESCE(t.tipo, '')) = 'egreso'
        AND lower(COALESCE(t.pagador, '')) = 'pandy'
        AND lower(COALESCE(t.cobrador, '')) = 'cliente'
      ) AS egr_pandy_cli,
      bool_or(
        lower(COALESCE(t.tipo, '')) = 'ingreso'
        AND lower(COALESCE(t.pagador, '')) = 'cliente'
        AND lower(COALESCE(t.cobrador, '')) = 'intermediario'
      ) AS ing_cli_int
    FROM public.transacciones t
    INNER JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    WHERE lower(COALESCE(t.estado, '')) = 'ejecutada'
    GROUP BY i.orden_id, upper(trim(COALESCE(t.moneda, '')))
  )
  SELECT
    u.orden_id,
    u.moneda,
    COALESCE(t.ing_pandy_cli AND t.egr_int_cli AND NOT COALESCE(t.ing_cli_pandy, false), false),
    COALESCE(t.ing_cli_int AND t.egr_cli_pandy AND NOT COALESCE(t.ing_cli_pandy, false), false),
    COALESCE(t.ing_cli_int AND t.egr_pandy_cli AND NOT COALESCE(t.ing_cli_pandy, false), false),
    COALESCE(
      (t.ing_cli_int AND t.egr_cli_pandy AND NOT COALESCE(t.ing_cli_pandy, false))
      OR (t.ing_cli_int AND t.egr_pandy_cli AND NOT COALESCE(t.ing_cli_pandy, false)),
      false
    ),
    COALESCE(
      (t.ing_pandy_cli AND t.egr_int_cli AND NOT COALESCE(t.ing_cli_pandy, false))
      OR (t.ing_cli_int AND t.egr_cli_pandy AND NOT COALESCE(t.ing_cli_pandy, false))
      OR (t.ing_cli_int AND t.egr_pandy_cli AND NOT COALESCE(t.ing_cli_pandy, false)),
      false
    )
  FROM usd_usd u
  INNER JOIN trx t ON t.orden_id = u.orden_id AND t.moneda = u.moneda
$$;

COMMENT ON FUNCTION public.gp_operativa_patrones_usd_usd() IS 'G/P Operativa: patrones USD-USD+intermediario (81 cobertura / 85 cliente→int y cliente→Pandy / 89 liberación) en un set por orden+moneda. Misma semántica que gp_operativa_orden_es_usd_usd_inter_*.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_patrones_usd_usd() TO authenticated;

/* USD-USD + intermediario: Pandy ingresa al cliente e intermediario paga al cliente (sin ingreso cliente→Pandy).
   El libro usa CC cliente (cobertura/préstamo/compensación) y CC intermediario del principal; en P&G la
   realidad económica es solo comisión Pandy (p. ej. orden 81). No confundir con passthrough caja+cliente→Pandy (58/104). */
CREATE OR REPLACE FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cobertura_pandy_cc(
  p_orden_id uuid,
  p_moneda text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.es_cobertura_81
    FROM public.gp_operativa_patrones_usd_usd() p
    WHERE p.orden_id = p_orden_id
      AND (
        NULLIF(btrim(COALESCE(p_moneda, '')), '') IS NULL
        OR p.moneda = upper(btrim(p_moneda))
      )
    LIMIT 1
  ), false);
$$;

COMMENT ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cobertura_pandy_cc(uuid, text) IS 'G/P Operativa: orden USD-USD con intermediario donde Pandy ingresa al cliente y el intermediario paga al cliente, sin ingreso cliente→Pandy (p. ej. 81). Sirve para no duplicar nominal en CC intermediario / comisión intermediario / sintético passthrough; el desembolso Pandy→cliente en CC cliente **sí** aporta al P&L junto a la comisión Pandy.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cobertura_pandy_cc(uuid, text) TO authenticated;

/* USD-USD + intermediario: el cliente liquida al intermediario (ingreso en libro) y a Pandy (egreso), sin ingreso cliente→Pandy.
   CC cliente refleja préstamo/ajustes contables; en P&G solo comisión Pandy (p. ej. orden 85). Distinto de 8 (hay ingreso cliente→Pandy)
   y de cobertura Pandy→cliente + intermediario→cliente (81). */
CREATE OR REPLACE FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cliente_inter_y_pandy_cc(
  p_orden_id uuid,
  p_moneda text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.es_85
    FROM public.gp_operativa_patrones_usd_usd() p
    WHERE p.orden_id = p_orden_id
      AND (
        NULLIF(btrim(COALESCE(p_moneda, '')), '') IS NULL
        OR p.moneda = upper(btrim(p_moneda))
      )
  ), false);
$$;

COMMENT ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cliente_inter_y_pandy_cc(uuid, text) IS 'G/P Operativa: USD-USD con intermediario, cliente ingresa al intermediario y egresa a Pandy ejecutadas, sin ingreso cliente→Pandy; flujo nominal CC cliente no es ganancia devengada (solo comisión Pandy).';

GRANT EXECUTE ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cliente_inter_y_pandy_cc(uuid, text) TO authenticated;

/* USD-USD + intermediario: el cliente ingresa al intermediario y Pandy egresa al cliente (liberación), sin ingreso cliente→Pandy.
   El nominal en CC cliente + CC intermediario no es ganancia devengada (solo comisiones del acuerdo; p. ej. orden 89 con spread mínimo).
   Nombre ≤63 caracteres (límite identificador Postgres). */
CREATE OR REPLACE FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cli_int_pandy_libera_cli_cc(
  p_orden_id uuid,
  p_moneda text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.es_89
    FROM public.gp_operativa_patrones_usd_usd() p
    WHERE p.orden_id = p_orden_id
      AND (
        NULLIF(btrim(COALESCE(p_moneda, '')), '') IS NULL
        OR p.moneda = upper(btrim(p_moneda))
      )
  ), false);
$$;

COMMENT ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cli_int_pandy_libera_cli_cc(uuid, text) IS 'G/P Operativa: USD-USD con intermediario, ingreso cliente→intermediario y egreso Pandy→cliente ejecutados, sin ingreso cliente→Pandy; nominal CC no devenga en P&L (solo comisiones; ej. orden 89).';

GRANT EXECUTE ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cli_int_pandy_libera_cli_cc(uuid, text) TO authenticated;

/* Excluir movimientos **reales** de CC cliente del P&L solo en patrones 85 y 89 (nominal libro ≠ devengo).
   No incluye cobertura 81: ahí el aporte en CC cliente incluye lo que Pandy puso a nombre del cliente + comisión. */
CREATE OR REPLACE FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cc_cli_excl_nom_85_89_gp(
  p_orden_id uuid,
  p_moneda text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.excl_cc_cli_85_89
    FROM public.gp_operativa_patrones_usd_usd() p
    WHERE p.orden_id = p_orden_id
      AND (
        NULLIF(btrim(COALESCE(p_moneda, '')), '') IS NULL
        OR p.moneda = upper(btrim(p_moneda))
      )
  ), false);
$$;

COMMENT ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cc_cli_excl_nom_85_89_gp(uuid, text) IS 'G/P Operativa: excluir flujo nominal en **movimientos reales CC cliente** solo para patrones 85 y 89 (no 81).';

GRANT EXECUTE ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cc_cli_excl_nom_85_89_gp(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(
  p_orden_id uuid,
  p_moneda text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p.excl_flujo_nominal
    FROM public.gp_operativa_patrones_usd_usd() p
    WHERE p.orden_id = p_orden_id
      AND (
        NULLIF(btrim(COALESCE(p_moneda, '')), '') IS NULL
        OR p.moneda = upper(btrim(p_moneda))
      )
  ), false);
$$;

COMMENT ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(uuid, text) IS 'G/P Operativa: orden+moneda con ajuste nominal en CC intermediario / comisión int. / sintético passthrough (81, 85, 89). En **CC cliente movimientos reales** solo excluye 85 y 89 (`cc_cli_excl_nom_85_89_gp`); en 81 el desembolso Pandy→cliente en CC cliente sí suma junto a comisión Pandy.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_orden_es_usd_usd_inter_cc_cliente_excluir_flujo_nominal_gp(uuid, text) TO authenticated;

ALTER TABLE public.tipos_movimiento_caja
  ADD COLUMN IF NOT EXISTS incluye_gp_operativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tipos_movimiento_caja.incluye_gp_operativo IS 'Si true, movimientos de caja manuales con este tipo suman en G/P Operativa del Panel (junto a sumas de CC cliente e intermediario en el período).';

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_inicio_gp_operativo', 'Panel de Control: ver tarjeta G/P Operativa (caja manual + caja por órdenes + CC cliente/intermediario pendiente+cerrado + resultado económico compensatorio en CC + comisiones del acuerdo por período)')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'ver_inicio_gp_operativo'),
  ('encargado', 'ver_inicio_gp_operativo')
ON CONFLICT (role, permission) DO NOTHING;

-- Agregados por moneda; RLS de las tablas aplica (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.gp_operativa_resumen(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH gp_pat AS MATERIALIZED (
    SELECT orden_id, moneda, excl_cc_cli_85_89, excl_flujo_nominal
    FROM public.gp_operativa_patrones_usd_usd()
  )
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
         GROUP BY m.moneda
       ) q),
      '{}'::jsonb
    ),
    /* CC cliente: movimientos de flujo + ajuste P&G en passthrough (|S_int|+com≈mr): **monto_recibido − comisión Pandy**
       en moneda_recibida. Con S en CC int y bolsa comisiones (−Ci + Cp) se cumple (mr−Cp)+S+(−Ci)+Cp = Cp (sin doble conteo del spread). */
    'cc_cliente',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT u.moneda, SUM(u.m)::numeric AS s
         FROM (
           SELECT m.moneda, m.monto::numeric AS m
           FROM public.movimientos_cuenta_corriente m
           WHERE m.estado IN ('pendiente', 'cerrado')
             AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
             AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
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
             AND NOT EXISTS (
               SELECT 1 FROM gp_pat p
               WHERE p.orden_id = m.orden_id
                 AND (
                   NULLIF(btrim(COALESCE(m.moneda, '')), '') IS NULL
                   OR p.moneda = upper(btrim(m.moneda))
                 )
                 AND p.excl_cc_cli_85_89
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
             o.moneda_recibida,
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
             )::numeric
           FROM public.ordenes o
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
             AND NOT EXISTS (
               SELECT 1 FROM gp_pat p
               WHERE p.orden_id = o.id
                 AND (
                   NULLIF(btrim(COALESCE(o.moneda_recibida, '')), '') IS NULL
                   OR p.moneda = upper(btrim(o.moneda_recibida))
                 )
                 AND p.excl_flujo_nominal
             )
             AND EXISTS (
               SELECT 1
               FROM (
                 SELECT
                   c.orden_id,
                   c.moneda,
                   (
                     COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'pandy'), 0::numeric)
                     + COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'intermediario'), 0::numeric)
                   ) AS com_total
                 FROM public.comisiones_orden c
                 WHERE c.orden_id = o.id
                 GROUP BY c.orden_id, c.moneda
                 HAVING COUNT(*) FILTER (WHERE c.beneficiario = 'pandy') >= 1
                   AND COUNT(*) FILTER (WHERE c.beneficiario = 'intermediario') >= 1
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
           UNION ALL
           SELECT
             o.moneda_recibida,
             o.monto_recibido::numeric
           FROM public.ordenes o
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
             o.moneda_entregada,
             (-o.monto_entregado::numeric)
           FROM public.ordenes o
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
         ) u
         GROUP BY u.moneda
       ) q),
      '{}'::jsonb
    ),
    /* CC intermediario: reparto — restar comisiones del agregado solo si es **bruto**; si |S|+com≈mr (passthrough neto),
       el flujo real (p. ej. −me) se mantiene; el cobro nominal **mr** entra en bolsa **cc_cliente** (sintético P&G).
       Si S≈mr pero **no** passthrough (comisiones «encima» del nominal; cobra intermediario), aporte P&G de esta orden+moneda = **0**:
       la ganancia empresa es solo comisión Pandy (bolsa comisiones); evita arrastrar el principal como «ganancia». */
    'cc_intermediario',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT x.moneda, SUM(x.s_neto_orden)::numeric AS s
         FROM (
           SELECT
             b.moneda,
             (
               CASE
                 WHEN EXISTS (
                   SELECT 1 FROM gp_pat p
                   WHERE p.orden_id = b.orden_id
                     AND (
                       NULLIF(btrim(COALESCE(b.moneda, '')), '') IS NULL
                       OR p.moneda = upper(btrim(b.moneda))
                     )
                     AND p.excl_flujo_nominal
                 ) THEN 0::numeric
                 WHEN r.com_total_reparto IS NOT NULL
                   AND o.monto_recibido IS NOT NULL
                   AND upper(trim(COALESCE(b.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
                   AND abs(abs(b.s) + r.com_total_reparto - o.monto_recibido::numeric) <= 0.01
                  AND EXISTS (
                    SELECT 1
                    FROM public.movimientos_caja mzp
                    WHERE mzp.orden_id = b.orden_id
                      AND upper(trim(COALESCE(mzp.moneda, ''))) = upper(trim(COALESCE(b.moneda, '')))
                      AND mzp.estado = 'cerrado'
                      AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(mzp.concepto, ''), mzp.clasificacion_movimiento)
                      AND (p_desde IS NULL OR mzp.fecha >= p_desde)
                      AND (p_hasta IS NULL OR mzp.fecha <= p_hasta)
                  )
                  AND abs((
                    SELECT COALESCE(SUM(mc.monto), 0::numeric)
                    FROM public.movimientos_cuenta_corriente mc
                    WHERE mc.orden_id = b.orden_id
                      AND upper(trim(COALESCE(mc.moneda, ''))) = upper(trim(COALESCE(b.moneda, '')))
                      AND mc.estado IN ('pendiente', 'cerrado')
                      AND mc.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                      AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(mc.concepto, ''), mc.clasificacion_movimiento)
                      AND (p_desde IS NULL OR mc.fecha >= p_desde)
                      AND (p_hasta IS NULL OR mc.fecha <= p_hasta)
                  )) <= 0.01
                THEN (-o.monto_recibido::numeric)
                WHEN r.com_total_reparto IS NOT NULL
                  AND o.monto_recibido IS NOT NULL
                  AND upper(trim(COALESCE(b.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
                  AND abs(abs(b.s) + r.com_total_reparto - o.monto_recibido::numeric) <= 0.01
                 THEN b.s
                 WHEN r.com_total_reparto IS NOT NULL
                   AND o.monto_recibido IS NOT NULL
                   AND upper(trim(COALESCE(b.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
                   AND abs(b.s - o.monto_recibido::numeric) <= 0.01
                   AND NOT (
                     abs(abs(b.s) + r.com_total_reparto - o.monto_recibido::numeric) <= 0.01
                   )
                 THEN 0::numeric
                 /* CHEQUE-ARS (misma moneda) con intermediario: solo comisión Pandy en comisiones_orden; el flujo CC int. sin líneas de comisión GP
                    suma el «hueco» principal (= comisión) pero ya entra en bolsa comisiones_acuerdo_pandy → no duplicar en CC intermediario. */
                 WHEN r.com_total_reparto IS NULL
                   AND o.intermediario_id IS NOT NULL
                   AND o.monto_recibido IS NOT NULL
                   AND o.moneda_recibida IS NOT NULL
                   AND o.moneda_entregada IS NOT NULL
                   AND upper(trim(COALESCE(o.moneda_recibida, ''))) = upper(trim(COALESCE(o.moneda_entregada, '')))
                   AND upper(trim(COALESCE(b.moneda, ''))) = upper(trim(COALESCE(o.moneda_recibida, '')))
                   AND NOT EXISTS (
                     SELECT 1
                     FROM public.comisiones_orden ci
                     WHERE ci.orden_id = o.id
                       AND ci.beneficiario = 'intermediario'
                       AND upper(trim(ci.moneda)) = upper(trim(b.moneda))
                   )
                   AND EXISTS (
                     SELECT 1
                     FROM public.comisiones_orden cp
                     WHERE cp.orden_id = o.id
                       AND cp.beneficiario = 'pandy'
                       AND upper(trim(cp.moneda)) = upper(trim(b.moneda))
                   )
                   AND abs(
                     abs(b.s) - (
                       SELECT COALESCE(SUM(cp2.monto), 0::numeric)
                       FROM public.comisiones_orden cp2
                       WHERE cp2.orden_id = o.id
                         AND cp2.beneficiario = 'pandy'
                         AND upper(trim(cp2.moneda)) = upper(trim(b.moneda))
                     )
                   ) <= 0.01
                 THEN 0::numeric
                 ELSE b.s - COALESCE(r.com_total_reparto, 0::numeric)
               END
             ) AS s_neto_orden
           FROM (
             SELECT
               m.orden_id,
               m.moneda,
               SUM(m.monto)::numeric AS s
             FROM public.movimientos_cuenta_corriente_intermediario m
             WHERE m.estado IN ('pendiente', 'cerrado')
               AND m.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
               AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(m.concepto, ''), m.clasificacion_movimiento)
               AND NOT EXISTS (
                 SELECT 1 FROM gp_pat p
                 WHERE p.orden_id = m.orden_id
                   AND (
                     NULLIF(btrim(COALESCE(m.moneda, '')), '') IS NULL
                     OR p.moneda = upper(btrim(m.moneda))
                   )
                   AND p.excl_flujo_nominal
               )
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
             GROUP BY m.orden_id, m.moneda
           ) b
           LEFT JOIN (
             SELECT
               c.orden_id,
               c.moneda,
               (
                 COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'pandy'), 0::numeric)
                 + COALESCE(SUM(c.monto) FILTER (WHERE c.beneficiario = 'intermediario'), 0::numeric)
               ) AS com_total_reparto
             FROM public.comisiones_orden c
             INNER JOIN public.ordenes o2 ON o2.id = c.orden_id
             WHERE lower(COALESCE(o2.estado, '')) <> 'anulada'
               AND (p_desde IS NULL OR o2.fecha >= p_desde)
               AND (p_hasta IS NULL OR o2.fecha <= p_hasta)
             GROUP BY c.orden_id, c.moneda
             HAVING COUNT(*) FILTER (WHERE c.beneficiario = 'pandy') >= 1
               AND COUNT(*) FILTER (WHERE c.beneficiario = 'intermediario') >= 1
           ) r ON r.orden_id IS NOT DISTINCT FROM b.orden_id
             AND r.moneda = b.moneda
           LEFT JOIN public.ordenes o ON o.id = b.orden_id
         ) x
         GROUP BY x.moneda
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
       Con reparto Pandy+intermediario: se excluye la fila intermediario salvo **passthrough** (|S_int|+com≈mr), donde
       debe figurar en P&G para cerrar con cobro nominal en cc_cliente + flujo int. + comisión Pandy = ganancia neta. */
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
             AND NOT EXISTS (
               SELECT 1 FROM gp_pat p
               WHERE p.orden_id = o.id
                 AND (
                   NULLIF(btrim(COALESCE(c.moneda, '')), '') IS NULL
                   OR p.moneda = upper(btrim(c.moneda))
                 )
                 AND p.excl_flujo_nominal
             )
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
                  AND NOT (
                    EXISTS (
                      SELECT 1
                      FROM public.movimientos_caja mzp
                      WHERE mzp.orden_id = c.orden_id
                        AND upper(trim(COALESCE(mzp.moneda, ''))) = upper(trim(c.moneda))
                        AND mzp.estado = 'cerrado'
                        AND NOT public.gp_movimiento_caja_ordenes_es_comision_gp(COALESCE(mzp.concepto, ''), mzp.clasificacion_movimiento)
                        AND (p_desde IS NULL OR mzp.fecha >= p_desde)
                        AND (p_hasta IS NULL OR mzp.fecha <= p_hasta)
                    )
                    AND abs((
                      SELECT COALESCE(SUM(mc.monto), 0::numeric)
                      FROM public.movimientos_cuenta_corriente mc
                      WHERE mc.orden_id = c.orden_id
                        AND upper(trim(COALESCE(mc.moneda, ''))) = upper(trim(c.moneda))
                        AND mc.estado IN ('pendiente', 'cerrado')
                        AND mc.clasificacion_movimiento IS DISTINCT FROM 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
                        AND NOT public.gp_movimiento_cc_cuenta_es_linea_comision_gp(COALESCE(mc.concepto, ''), mc.clasificacion_movimiento)
                        AND (p_desde IS NULL OR mc.fecha >= p_desde)
                        AND (p_hasta IS NULL OR mc.fecha <= p_hasta)
                    )) <= 0.01
                  )
               )
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
             /* Línea sintética CC int. «Comisión del acuerdo» es simetría contable si la comisión ya está en comisiones_orden (Pandy). */
             AND NOT EXISTS (
               SELECT 1
               FROM public.comisiones_orden cp
               WHERE cp.orden_id = m.orden_id
                 AND cp.beneficiario = 'pandy'
             )
         ) u
         GROUP BY u.moneda
       ) q),
      '{}'::jsonb
    ),
    /* Resultado económico compensatorio (Modelo B): solo filas CC con ENUM dedicado; excluidas de cc_cliente/cc_intermediario arriba para no duplicar en el Total. */
    'cc_resultado_economico_compensatorio',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT u.moneda, SUM(u.monto)::numeric AS s
         FROM (
           SELECT m.moneda, m.monto::numeric AS monto
           FROM public.movimientos_cuenta_corriente m
           WHERE m.estado IN ('pendiente', 'cerrado')
             AND m.clasificacion_movimiento = 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
             AND (p_desde IS NULL OR m.fecha >= p_desde)
             AND (p_hasta IS NULL OR m.fecha <= p_hasta)
           UNION ALL
           SELECT m.moneda, m.monto::numeric AS monto
           FROM public.movimientos_cuenta_corriente_intermediario m
           WHERE m.estado IN ('pendiente', 'cerrado')
             AND m.clasificacion_movimiento = 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'::public.movimiento_clasificacion
             AND (p_desde IS NULL OR m.fecha >= p_desde)
             AND (p_hasta IS NULL OR m.fecha <= p_hasta)
         ) u
         GROUP BY u.moneda
       ) q),
      '{}'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.gp_operativa_resumen(date, date) IS 'P&L operativo de la empresa por moneda (siete bolsas, sin doble conteo): caja manual y caja por órdenes solo cerrado no anulado; CC cliente: flujo + sintético passthrough **monto_recibido − comisión Pandy** (moneda_recibida); CC intermediario: S si passthrough (|S|+com≈mr); **0** si S≈monto_recibido y no passthrough (cobro bruto intermediario; ganancia solo comisión Pandy); si no, S−com (reparto bruto clásico); comisiones Pandy; intermediario NEGADO salvo passthrough. Suma siete claves = caja+libro. Fechas inclusive; NULL = sin límite. Rendimiento: patrones USD-USD 81/85/89 se materializan una vez vía gp_operativa_patrones_usd_usd (no por cada movimiento).';

GRANT EXECUTE ON FUNCTION public.gp_operativa_resumen(date, date) TO authenticated;
