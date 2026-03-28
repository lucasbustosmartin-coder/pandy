-- Tabla orden_comisiones_generadas: una fila por (orden_id, tipo) — ganancia Pandy y comisión intermediario.
-- La app (main.js) inserta/lee/borra estas filas al cerrar órdenes con comisión.
-- Ejecutar después de ordenes, transacciones y movimientos_caja (p. ej. tras migracion_movimientos_caja_orden_transaccion_numero.sql).
-- Idempotente: CREATE IF NOT EXISTS + políticas con DROP IF EXISTS.

CREATE TABLE IF NOT EXISTS public.orden_comisiones_generadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ganancia_pandy', 'comision_intermediario')),
  transaccion_id uuid REFERENCES public.transacciones(id) ON DELETE SET NULL,
  transaccion_id_reducida uuid REFERENCES public.transacciones(id) ON DELETE SET NULL,
  movimiento_caja_id uuid REFERENCES public.movimientos_caja(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orden_comisiones_generadas_orden_tipo_uniq UNIQUE (orden_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_orden_comisiones_generadas_orden
  ON public.orden_comisiones_generadas (orden_id);

COMMENT ON TABLE public.orden_comisiones_generadas IS
  'Evita duplicar Ganancia Pandy y Comisión intermediario al re-ejecutar; vincula trx y/o movimiento_caja. Ver docs/FLUJOS_CC_REGLA.md §8.';
COMMENT ON COLUMN public.orden_comisiones_generadas.tipo IS 'ganancia_pandy | comision_intermediario';
COMMENT ON COLUMN public.orden_comisiones_generadas.transaccion_id_reducida IS
  'Trx de ingreso cliente reducida cuando aplica ganancia Pandy (misma orden).';

ALTER TABLE public.orden_comisiones_generadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orden_comisiones_generadas_select" ON public.orden_comisiones_generadas;
CREATE POLICY "orden_comisiones_generadas_select"
  ON public.orden_comisiones_generadas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "orden_comisiones_generadas_insert" ON public.orden_comisiones_generadas;
CREATE POLICY "orden_comisiones_generadas_insert"
  ON public.orden_comisiones_generadas FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_ordenes'));

DROP POLICY IF EXISTS "orden_comisiones_generadas_update" ON public.orden_comisiones_generadas;
CREATE POLICY "orden_comisiones_generadas_update"
  ON public.orden_comisiones_generadas FOR UPDATE TO authenticated
  USING (public.has_permission('abm_ordenes'))
  WITH CHECK (public.has_permission('abm_ordenes'));

DROP POLICY IF EXISTS "orden_comisiones_generadas_delete" ON public.orden_comisiones_generadas;
CREATE POLICY "orden_comisiones_generadas_delete"
  ON public.orden_comisiones_generadas FOR DELETE TO authenticated
  USING (public.has_permission('abm_ordenes'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orden_comisiones_generadas TO authenticated;
