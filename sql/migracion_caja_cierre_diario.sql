-- Fase C3 — Cierre diario de caja y detección de cambios en días cerrados (2026-11-20)
-- Contexto: docs/INCIDENTE_CAJA_ARS_SYNC_2026-11-19.md §5.C
--
-- caja_cierre_diario guarda, por día contable (Argentina), caja y moneda, el saldo de cierre tal como estaba
-- la primera vez que se registró (foto). Sin pg_cron: la app llama a caja_registrar_cierres() al cargar Inicio
-- (idempotente; registra los días faltantes hasta ayer). caja_cierres_con_diferencia() compara cada foto con el
-- saldo recalculado hoy y devuelve los días que cambiaron, con los movimientos del historial que lo explican.
-- Idempotente. Aplicar en Pandy-Dev, probar, luego Pandy. Requiere sql/migracion_historial_movimientos_caja_cc.sql.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.caja_cierre_diario (
  fecha         date NOT NULL,
  caja_tipo     text NOT NULL,
  moneda        text NOT NULL,
  saldo_cierre  numeric NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  registrado_por uuid DEFAULT auth.uid(),
  PRIMARY KEY (fecha, caja_tipo, moneda)
);
COMMENT ON TABLE public.caja_cierre_diario IS
  'Foto del saldo de cierre por día contable (AR), caja y moneda. No se actualiza: si el recálculo difiere, hubo un cambio retroactivo.';

ALTER TABLE public.caja_cierre_diario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caja_cierre_diario_select ON public.caja_cierre_diario;
CREATE POLICY caja_cierre_diario_select ON public.caja_cierre_diario
  FOR SELECT TO authenticated USING ((SELECT public.es_usuario_habilitado()));
REVOKE ALL ON public.caja_cierre_diario FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.caja_cierre_diario TO authenticated;

DROP TRIGGER IF EXISTS trg_caja_cierre_diario_inmutable ON public.caja_cierre_diario;
CREATE TRIGGER trg_caja_cierre_diario_inmutable
  BEFORE UPDATE OR DELETE ON public.caja_cierre_diario
  FOR EACH ROW EXECUTE FUNCTION public.historial_inmutable();

-- Registra los cierres faltantes hasta ayer (AR). Desde el primer día sin foto (o hace 60 días si no hay ninguna).
CREATE OR REPLACE FUNCTION public.caja_registrar_cierres()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ayer date := public.fecha_hoy_argentina() - 1;
  v_desde date;
  v_n integer;
BEGIN
  IF NOT (SELECT public.es_usuario_habilitado()) THEN
    RETURN 0;
  END IF;
  SELECT COALESCE(max(fecha) + 1, v_ayer - 59) INTO v_desde FROM public.caja_cierre_diario;
  IF v_desde > v_ayer THEN
    RETURN 0;
  END IF;
  INSERT INTO public.caja_cierre_diario (fecha, caja_tipo, moneda, saldo_cierre)
  SELECT d.dia::date, cm.caja_tipo, cm.moneda,
         COALESCE((SELECT sum(c.monto) FROM public.movimientos_caja c
                    WHERE COALESCE(c.caja_tipo, 'efectivo') = cm.caja_tipo AND c.moneda = cm.moneda
                      AND lower(COALESCE(c.estado, '')) NOT IN ('anulado', 'anulada')
                      AND c.fecha <= d.dia::date), 0)
    FROM generate_series(v_desde, v_ayer, interval '1 day') d(dia)
   CROSS JOIN (SELECT DISTINCT COALESCE(caja_tipo, 'efectivo') caja_tipo, moneda FROM public.movimientos_caja) cm
  ON CONFLICT (fecha, caja_tipo, moneda) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.caja_registrar_cierres() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caja_registrar_cierres() TO authenticated;

-- Días cuyo saldo de cierre cambió respecto de la foto, con la explicación desde el historial.
CREATE OR REPLACE FUNCTION public.caja_cierres_con_diferencia(p_desde date DEFAULT NULL)
RETURNS TABLE (
  fecha date, caja_tipo text, moneda text,
  saldo_registrado numeric, saldo_actual numeric, diferencia numeric,
  registrado_en timestamptz, cambios jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH f AS (
    SELECT cd.*,
           COALESCE((SELECT sum(c.monto) FROM public.movimientos_caja c
                      WHERE COALESCE(c.caja_tipo, 'efectivo') = cd.caja_tipo AND c.moneda = cd.moneda
                        AND lower(COALESCE(c.estado, '')) NOT IN ('anulado', 'anulada')
                        AND c.fecha <= cd.fecha), 0) AS actual
      FROM public.caja_cierre_diario cd
     WHERE cd.fecha >= COALESCE(p_desde, public.fecha_hoy_argentina() - 60)
  )
  SELECT f.fecha, f.caja_tipo, f.moneda, f.saldo_cierre, f.actual, f.actual - f.saldo_cierre, f.registrado_en,
         (SELECT jsonb_agg(jsonb_build_object(
                   'ocurrido_en', h.ocurrido_en, 'operacion', h.operacion, 'origen', h.origen,
                   'proceso', h.origen_detalle, 'pantalla', h.origen_pantalla, 'usuario_id', h.usuario_id,
                   'orden_numero', h.orden_numero, 'transaccion_numero', h.transaccion_numero,
                   'fecha_contable', COALESCE(h.fecha_despues, h.fecha_antes), 'impacto', h.impacto_saldo)
                 ORDER BY h.ocurrido_en)
            FROM public.movimientos_historial h
           WHERE h.libro = 'caja' AND h.caja_tipo = f.caja_tipo AND h.moneda = f.moneda
             AND h.afecta_dia_cerrado
             AND h.ocurrido_en > f.registrado_en
             AND LEAST(COALESCE(h.fecha_antes, h.fecha_despues), COALESCE(h.fecha_despues, h.fecha_antes)) <= f.fecha)
    FROM f
   WHERE abs(f.actual - f.saldo_cierre) > 0.004
   ORDER BY f.fecha DESC, f.caja_tipo, f.moneda;
$$;
REVOKE ALL ON FUNCTION public.caja_cierres_con_diferencia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caja_cierres_con_diferencia(date) TO authenticated;

COMMIT;
