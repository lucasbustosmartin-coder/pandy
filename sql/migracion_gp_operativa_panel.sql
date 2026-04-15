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

ALTER TABLE public.tipos_movimiento_caja
  ADD COLUMN IF NOT EXISTS incluye_gp_operativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tipos_movimiento_caja.incluye_gp_operativo IS 'Si true, movimientos de caja manuales con este tipo suman en G/P Operativa del Panel (junto a sumas de CC cliente e intermediario en el período).';

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_inicio_gp_operativo', 'Panel de Control: ver tarjeta G/P Operativa (caja manual filtrada + CC cliente + CC intermediario por período)')
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
           AND NOT public.gp_concepto_es_comision_caja_ordenes_gp(COALESCE(m.concepto, ''))
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
         WHERE m.estado = 'cerrado'
           AND NOT public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
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
         WHERE m.estado = 'cerrado'
           AND NOT public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
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
           WHERE m.estado = 'cerrado'
             AND public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
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
    'comisiones_acuerdo_intermediario',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT u.moneda, SUM(u.monto)::numeric AS s
         FROM (
           SELECT c.moneda, c.monto::numeric AS monto
           FROM public.comisiones_orden c
           INNER JOIN public.ordenes o ON o.id = c.orden_id
           WHERE c.beneficiario = 'intermediario'
             AND lower(COALESCE(o.estado, '')) <> 'anulada'
             AND (p_desde IS NULL OR o.fecha >= p_desde)
             AND (p_hasta IS NULL OR o.fecha <= p_hasta)
           UNION ALL
           SELECT m.moneda, m.monto::numeric AS monto
           FROM public.movimientos_cuenta_corriente_intermediario m
           WHERE m.estado = 'cerrado'
             AND public.gp_concepto_es_linea_comision_cc_gp(COALESCE(m.concepto, ''))
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

COMMENT ON FUNCTION public.gp_operativa_resumen(date, date) IS 'Suma monto por moneda en seis bolsas coherentes (sin doble conteo): caja manual; caja por órdenes excl. comisión del acuerdo en concepto; CC cliente e intermediario excl. líneas «Comisión del acuerdo…»; comisiones_acuerdo_pandy e intermediario desde comisiones_orden (fecha de orden) más líneas CC de comisión huérfanas (sin comisiones_orden para ese orden/beneficiario). El total G/P por moneda = suma de las seis claves. Fechas inclusive; NULL = sin límite.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_resumen(date, date) TO authenticated;
