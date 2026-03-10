-- Pandi – RLS para tablas de complejidad (tipos operación, modos pago, intermediarios, instrumentación, transacciones, etc.)
-- Ejecutar después de supabase_complejidad_ordenes.sql y supabase_seguridad_complejidad.sql (y supabase_rls_negocio.sql).

-- ========== tipos_operacion (catálogo: todos leen, abm_ordenes escribe) ==========
ALTER TABLE public.tipos_operacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_operacion_select" ON public.tipos_operacion;
CREATE POLICY "tipos_operacion_select" ON public.tipos_operacion FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tipos_operacion_insert" ON public.tipos_operacion;
CREATE POLICY "tipos_operacion_insert" ON public.tipos_operacion FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "tipos_operacion_update" ON public.tipos_operacion;
CREATE POLICY "tipos_operacion_update" ON public.tipos_operacion FOR UPDATE TO authenticated USING (public.has_permission('abm_ordenes')) WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "tipos_operacion_delete" ON public.tipos_operacion;
CREATE POLICY "tipos_operacion_delete" ON public.tipos_operacion FOR DELETE TO authenticated USING (public.has_permission('abm_ordenes'));

-- ========== modos_pago (catálogo) ==========
ALTER TABLE public.modos_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "modos_pago_select" ON public.modos_pago;
CREATE POLICY "modos_pago_select" ON public.modos_pago FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "modos_pago_insert" ON public.modos_pago;
CREATE POLICY "modos_pago_insert" ON public.modos_pago FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "modos_pago_update" ON public.modos_pago;
CREATE POLICY "modos_pago_update" ON public.modos_pago FOR UPDATE TO authenticated USING (public.has_permission('abm_ordenes')) WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "modos_pago_delete" ON public.modos_pago;
CREATE POLICY "modos_pago_delete" ON public.modos_pago FOR DELETE TO authenticated USING (public.has_permission('abm_ordenes'));

-- ========== intermediarios ==========
ALTER TABLE public.intermediarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "intermediarios_select" ON public.intermediarios;
CREATE POLICY "intermediarios_select" ON public.intermediarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "intermediarios_insert" ON public.intermediarios;
CREATE POLICY "intermediarios_insert" ON public.intermediarios FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_intermediarios'));
DROP POLICY IF EXISTS "intermediarios_update" ON public.intermediarios;
CREATE POLICY "intermediarios_update" ON public.intermediarios FOR UPDATE TO authenticated USING (public.has_permission('abm_intermediarios')) WITH CHECK (public.has_permission('abm_intermediarios'));
DROP POLICY IF EXISTS "intermediarios_delete" ON public.intermediarios;
CREATE POLICY "intermediarios_delete" ON public.intermediarios FOR DELETE TO authenticated USING (public.has_permission('abm_intermediarios'));

-- ========== comisiones_orden ==========
ALTER TABLE public.comisiones_orden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comisiones_orden_select" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_select" ON public.comisiones_orden FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "comisiones_orden_insert" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_insert" ON public.comisiones_orden FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "comisiones_orden_update" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_update" ON public.comisiones_orden FOR UPDATE TO authenticated USING (public.has_permission('abm_ordenes')) WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "comisiones_orden_delete" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_delete" ON public.comisiones_orden FOR DELETE TO authenticated USING (public.has_permission('abm_ordenes'));

-- ========== instrumentacion ==========
ALTER TABLE public.instrumentacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "instrumentacion_select" ON public.instrumentacion;
CREATE POLICY "instrumentacion_select" ON public.instrumentacion FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "instrumentacion_insert" ON public.instrumentacion;
CREATE POLICY "instrumentacion_insert" ON public.instrumentacion FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "instrumentacion_update" ON public.instrumentacion;
CREATE POLICY "instrumentacion_update" ON public.instrumentacion FOR UPDATE TO authenticated USING (public.has_permission('abm_ordenes')) WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "instrumentacion_delete" ON public.instrumentacion;
CREATE POLICY "instrumentacion_delete" ON public.instrumentacion FOR DELETE TO authenticated USING (public.has_permission('abm_ordenes'));

-- ========== transacciones ==========
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transacciones_select" ON public.transacciones;
CREATE POLICY "transacciones_select" ON public.transacciones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "transacciones_insert" ON public.transacciones;
CREATE POLICY "transacciones_insert" ON public.transacciones FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "transacciones_update" ON public.transacciones;
CREATE POLICY "transacciones_update" ON public.transacciones FOR UPDATE TO authenticated USING (public.has_permission('abm_ordenes')) WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "transacciones_delete" ON public.transacciones;
CREATE POLICY "transacciones_delete" ON public.transacciones FOR DELETE TO authenticated USING (public.has_permission('abm_ordenes'));

-- ========== movimientos_cuenta_corriente_intermediario ==========
ALTER TABLE public.movimientos_cuenta_corriente_intermediario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mov_cc_int_select" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_select" ON public.movimientos_cuenta_corriente_intermediario FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mov_cc_int_insert" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_insert" ON public.movimientos_cuenta_corriente_intermediario FOR INSERT TO authenticated WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "mov_cc_int_update" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_update" ON public.movimientos_cuenta_corriente_intermediario FOR UPDATE TO authenticated USING (public.has_permission('abm_ordenes')) WITH CHECK (public.has_permission('abm_ordenes'));
DROP POLICY IF EXISTS "mov_cc_int_delete" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_delete" ON public.movimientos_cuenta_corriente_intermediario FOR DELETE TO authenticated USING (public.has_permission('abm_ordenes'));

-- ========== Grants ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_operacion TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modos_pago TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intermediarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_orden TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instrumentacion TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transacciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_cuenta_corriente_intermediario TO authenticated;
