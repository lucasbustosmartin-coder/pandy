-- Pandi – RLS en tablas de negocio
-- Ejecutar en Supabase SQL Editor después de supabase_seguridad.sql
-- Lectura: todos los autenticados. Escritura: según permiso (abm_*).

-- ========== clientes ==========
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_select_authenticated" ON public.clientes;
CREATE POLICY "clientes_select_authenticated"
  ON public.clientes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "clientes_insert_abm" ON public.clientes;
CREATE POLICY "clientes_insert_abm"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_clientes'));

DROP POLICY IF EXISTS "clientes_update_abm" ON public.clientes;
CREATE POLICY "clientes_update_abm"
  ON public.clientes FOR UPDATE TO authenticated
  USING (public.has_permission('abm_clientes'))
  WITH CHECK (public.has_permission('abm_clientes'));

DROP POLICY IF EXISTS "clientes_delete_abm" ON public.clientes;
CREATE POLICY "clientes_delete_abm"
  ON public.clientes FOR DELETE TO authenticated
  USING (public.has_permission('abm_clientes'));

-- ========== tipos_movimiento_caja ==========
ALTER TABLE public.tipos_movimiento_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tipos_mov_caja_select_authenticated" ON public.tipos_movimiento_caja;
CREATE POLICY "tipos_mov_caja_select_authenticated"
  ON public.tipos_movimiento_caja FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tipos_mov_caja_insert_abm" ON public.tipos_movimiento_caja;
CREATE POLICY "tipos_mov_caja_insert_abm"
  ON public.tipos_movimiento_caja FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_tipos_movimiento_caja'));

DROP POLICY IF EXISTS "tipos_mov_caja_update_abm" ON public.tipos_movimiento_caja;
CREATE POLICY "tipos_mov_caja_update_abm"
  ON public.tipos_movimiento_caja FOR UPDATE TO authenticated
  USING (public.has_permission('abm_tipos_movimiento_caja'))
  WITH CHECK (public.has_permission('abm_tipos_movimiento_caja'));

DROP POLICY IF EXISTS "tipos_mov_caja_delete_abm" ON public.tipos_movimiento_caja;
CREATE POLICY "tipos_mov_caja_delete_abm"
  ON public.tipos_movimiento_caja FOR DELETE TO authenticated
  USING (public.has_permission('abm_tipos_movimiento_caja'));

-- ========== ordenes ==========
ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ordenes_select_authenticated" ON public.ordenes;
CREATE POLICY "ordenes_select_authenticated"
  ON public.ordenes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ordenes_insert_abm" ON public.ordenes;
CREATE POLICY "ordenes_insert_abm"
  ON public.ordenes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_ordenes'));

DROP POLICY IF EXISTS "ordenes_update_abm" ON public.ordenes;
CREATE POLICY "ordenes_update_abm"
  ON public.ordenes FOR UPDATE TO authenticated
  USING (public.has_permission('abm_ordenes'))
  WITH CHECK (public.has_permission('abm_ordenes'));

DROP POLICY IF EXISTS "ordenes_delete_abm" ON public.ordenes;
CREATE POLICY "ordenes_delete_abm"
  ON public.ordenes FOR DELETE TO authenticated
  USING (public.has_permission('abm_ordenes'));

-- ========== movimientos_caja ==========
ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_caja_select_authenticated" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_select_authenticated"
  ON public.movimientos_caja FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "movimientos_caja_insert_abm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_insert_abm"
  ON public.movimientos_caja FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_movimientos_caja'));

DROP POLICY IF EXISTS "movimientos_caja_update_abm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_update_abm"
  ON public.movimientos_caja FOR UPDATE TO authenticated
  USING (public.has_permission('abm_movimientos_caja'))
  WITH CHECK (public.has_permission('abm_movimientos_caja'));

DROP POLICY IF EXISTS "movimientos_caja_delete_abm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_delete_abm"
  ON public.movimientos_caja FOR DELETE TO authenticated
  USING (public.has_permission('abm_movimientos_caja'));

-- ========== movimientos_cuenta_corriente ==========
ALTER TABLE public.movimientos_cuenta_corriente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mov_cc_select_authenticated" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_select_authenticated"
  ON public.movimientos_cuenta_corriente FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mov_cc_insert_abm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_insert_abm"
  ON public.movimientos_cuenta_corriente FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_ordenes'));

DROP POLICY IF EXISTS "mov_cc_update_abm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_update_abm"
  ON public.movimientos_cuenta_corriente FOR UPDATE TO authenticated
  USING (public.has_permission('abm_ordenes'))
  WITH CHECK (public.has_permission('abm_ordenes'));

DROP POLICY IF EXISTS "mov_cc_delete_abm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_delete_abm"
  ON public.movimientos_cuenta_corriente FOR DELETE TO authenticated
  USING (public.has_permission('abm_ordenes'));

-- ========== Grants en tablas de negocio ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_movimiento_caja TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_caja TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_cuenta_corriente TO authenticated;
