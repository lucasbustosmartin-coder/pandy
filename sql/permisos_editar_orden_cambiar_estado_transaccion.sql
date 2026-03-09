-- Permisos granulares: editar_orden y cambiar_estado_transaccion.
-- abm_ordenes sigue siendo el permiso "completo" (crear orden, instrumentación, etc.).
-- Quien tiene abm_ordenes puede hacer todo; quien solo tiene editar_orden puede editar datos de la orden;
-- quien solo tiene cambiar_estado_transaccion puede cambiar estado pendiente/ejecutada y editar transacción.

-- 1) Nuevos permisos
INSERT INTO public.app_permission (permission, description) VALUES
  ('editar_orden', 'Editar datos de una orden (acuerdo comercial) e instrumentación'),
  ('cambiar_estado_transaccion', 'Cambiar estado de transacciones (pendiente/ejecutada) y editar transacción')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

-- 2) Asignar a admin y encargado (comportamiento actual se mantiene: tienen todo)
INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'editar_orden'),
  ('admin', 'cambiar_estado_transaccion'),
  ('encargado', 'editar_orden'),
  ('encargado', 'cambiar_estado_transaccion')
ON CONFLICT (role, permission) DO NOTHING;

-- 3) RLS: permitir UPDATE en ordenes con abm_ordenes O editar_orden
DROP POLICY IF EXISTS "ordenes_update_abm" ON public.ordenes;
CREATE POLICY "ordenes_update_abm"
  ON public.ordenes FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_ordenes') OR public.has_permission('editar_orden')
  )
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('editar_orden')
  );

-- 4) RLS: permitir UPDATE en transacciones con abm_ordenes O cambiar_estado_transaccion
DROP POLICY IF EXISTS "transacciones_update" ON public.transacciones;
CREATE POLICY "transacciones_update"
  ON public.transacciones FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  )
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  );

-- 5) movimientos_cuenta_corriente: INSERT/UPDATE al ejecutar transacción
DROP POLICY IF EXISTS "mov_cc_insert_abm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_insert_abm"
  ON public.movimientos_cuenta_corriente FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  );

DROP POLICY IF EXISTS "mov_cc_update_abm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_update_abm"
  ON public.movimientos_cuenta_corriente FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  )
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  );

-- 6) movimientos_cuenta_corriente_intermediario
DROP POLICY IF EXISTS "mov_cc_int_insert" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_insert"
  ON public.movimientos_cuenta_corriente_intermediario FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  );

DROP POLICY IF EXISTS "mov_cc_int_update" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_update"
  ON public.movimientos_cuenta_corriente_intermediario FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  )
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('cambiar_estado_transaccion')
  );

-- 7) instrumentación: UPDATE con abm_ordenes O editar_orden (editar orden puede tocar instrumentación)
DROP POLICY IF EXISTS "instrumentacion_update" ON public.instrumentacion;
CREATE POLICY "instrumentacion_update"
  ON public.instrumentacion FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_ordenes') OR public.has_permission('editar_orden')
  )
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('editar_orden')
  );

-- 8) comisiones_orden: UPDATE con abm_ordenes O editar_orden
DROP POLICY IF EXISTS "comisiones_orden_update" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_update"
  ON public.comisiones_orden FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_ordenes') OR public.has_permission('editar_orden')
  )
  WITH CHECK (
    public.has_permission('abm_ordenes') OR public.has_permission('editar_orden')
  );
