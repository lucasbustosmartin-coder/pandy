-- G/P Operativa en Panel de Control: flag en tipos de movimiento caja, permiso de vista, RPC de agregación.
-- Ejecutar en Supabase SQL Editor (después de tipos_movimiento_caja, movimientos_caja, CC cliente/intermediario).

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
         SELECT moneda, SUM(monto)::numeric AS s
         FROM public.movimientos_cuenta_corriente
         WHERE estado = 'cerrado'
           AND (p_desde IS NULL OR fecha >= p_desde)
           AND (p_hasta IS NULL OR fecha <= p_hasta)
         GROUP BY moneda
       ) q),
      '{}'::jsonb
    ),
    'cc_intermediario',
    COALESCE(
      (SELECT jsonb_object_agg(q.moneda, q.s)
       FROM (
         SELECT moneda, SUM(monto)::numeric AS s
         FROM public.movimientos_cuenta_corriente_intermediario
         WHERE estado = 'cerrado'
           AND (p_desde IS NULL OR fecha >= p_desde)
           AND (p_hasta IS NULL OR fecha <= p_hasta)
         GROUP BY moneda
       ) q),
      '{}'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.gp_operativa_resumen(date, date) IS 'Suma monto por moneda: caja manual (tipos con incluye_gp_operativo, sin orden), caja por órdenes (mov. caja con orden_id, ejecutados/cerrados), CC cliente e intermediario; fechas inclusive; NULL = sin límite en ese extremo.';

GRANT EXECUTE ON FUNCTION public.gp_operativa_resumen(date, date) TO authenticated;
