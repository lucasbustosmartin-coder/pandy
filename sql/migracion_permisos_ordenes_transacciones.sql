-- Reordenar y reemplazar permisos de órdenes/transacciones. Quitar abm_ordenes, editar_orden, cambiar_estado_transaccion.
-- Nuevos permisos (granulares): Ingresar Orden, Editar Orden, Anular Orden, Editar Estado de Orden, Ingresar Transacciones, Editar Transacciones, Eliminar Transacciones.
-- Ejecutar en Supabase SQL Editor.

-- 1) Quitar asignaciones de roles a los permisos que vamos a eliminar
DELETE FROM public.app_role_permission
WHERE permission IN ('abm_ordenes', 'editar_orden', 'cambiar_estado_transaccion');

-- 2) Eliminar los permisos viejos
DELETE FROM public.app_permission
WHERE permission IN ('abm_ordenes', 'editar_orden', 'cambiar_estado_transaccion');

-- 3) Insertar los 7 permisos nuevos (orden deseado en la app se controla en frontend)
INSERT INTO public.app_permission (permission, description) VALUES
  ('ingresar_orden', 'Ingresar Orden'),
  ('editar_orden', 'Editar Orden'),
  ('anular_orden', 'Anular Orden'),
  ('editar_estado_orden', 'Editar Estado de Orden'),
  ('ingresar_transacciones', 'Ingresar Transacciones'),
  ('editar_transacciones', 'Editar Transacciones'),
  ('eliminar_transacciones', 'Eliminar Transacciones')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

-- 4) Asignar los 7 a admin y encargado
INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'ingresar_orden'),
  ('admin', 'editar_orden'),
  ('admin', 'anular_orden'),
  ('admin', 'editar_estado_orden'),
  ('admin', 'ingresar_transacciones'),
  ('admin', 'editar_transacciones'),
  ('admin', 'eliminar_transacciones'),
  ('encargado', 'ingresar_orden'),
  ('encargado', 'editar_orden'),
  ('encargado', 'anular_orden'),
  ('encargado', 'editar_estado_orden'),
  ('encargado', 'ingresar_transacciones'),
  ('encargado', 'editar_transacciones'),
  ('encargado', 'eliminar_transacciones')
ON CONFLICT (role, permission) DO NOTHING;

-- 5) RLS ordenes
DROP POLICY IF EXISTS "ordenes_insert_abm" ON public.ordenes;
DROP POLICY IF EXISTS "ordenes_update_abm" ON public.ordenes;
CREATE POLICY "ordenes_insert_perm"
  ON public.ordenes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('ingresar_orden'));

CREATE POLICY "ordenes_update_perm"
  ON public.ordenes FOR UPDATE TO authenticated
  USING (
    public.has_permission('editar_orden') OR public.has_permission('anular_orden') OR public.has_permission('editar_estado_orden')
  )
  WITH CHECK (
    public.has_permission('editar_orden') OR public.has_permission('anular_orden') OR public.has_permission('editar_estado_orden')
  );

DROP POLICY IF EXISTS "ordenes_delete_abm" ON public.ordenes;
CREATE POLICY "ordenes_delete_perm"
  ON public.ordenes FOR DELETE TO authenticated
  USING (public.has_permission('editar_orden'));

-- 6) RLS instrumentacion
DROP POLICY IF EXISTS "instrumentacion_insert" ON public.instrumentacion;
DROP POLICY IF EXISTS "instrumentacion_update" ON public.instrumentacion;
CREATE POLICY "instrumentacion_insert_perm"
  ON public.instrumentacion FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('ingresar_orden'));

CREATE POLICY "instrumentacion_update_perm"
  ON public.instrumentacion FOR UPDATE TO authenticated
  USING (public.has_permission('editar_orden'))
  WITH CHECK (public.has_permission('editar_orden'));

-- 7) RLS comisiones_orden
DROP POLICY IF EXISTS "comisiones_orden_insert" ON public.comisiones_orden;
DROP POLICY IF EXISTS "comisiones_orden_update" ON public.comisiones_orden;
DROP POLICY IF EXISTS "comisiones_orden_delete" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_insert_perm"
  ON public.comisiones_orden FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('editar_orden'));
CREATE POLICY "comisiones_orden_update_perm"
  ON public.comisiones_orden FOR UPDATE TO authenticated
  USING (public.has_permission('editar_orden'))
  WITH CHECK (public.has_permission('editar_orden'));
CREATE POLICY "comisiones_orden_delete_perm"
  ON public.comisiones_orden FOR DELETE TO authenticated
  USING (public.has_permission('editar_orden'));

-- 8) RLS transacciones
DROP POLICY IF EXISTS "transacciones_insert" ON public.transacciones;
DROP POLICY IF EXISTS "transacciones_update" ON public.transacciones;
DROP POLICY IF EXISTS "transacciones_delete" ON public.transacciones;
CREATE POLICY "transacciones_insert_perm"
  ON public.transacciones FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('ingresar_transacciones'));

CREATE POLICY "transacciones_update_perm"
  ON public.transacciones FOR UPDATE TO authenticated
  USING (public.has_permission('editar_transacciones'))
  WITH CHECK (public.has_permission('editar_transacciones'));

CREATE POLICY "transacciones_delete_perm"
  ON public.transacciones FOR DELETE TO authenticated
  USING (public.has_permission('eliminar_transacciones'));

-- 9) RLS movimientos_cuenta_corriente (por transacciones / ejecución)
DROP POLICY IF EXISTS "mov_cc_insert_abm" ON public.movimientos_cuenta_corriente;
DROP POLICY IF EXISTS "mov_cc_update_abm" ON public.movimientos_cuenta_corriente;
DROP POLICY IF EXISTS "mov_cc_delete_abm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_insert_perm"
  ON public.movimientos_cuenta_corriente FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('editar_transacciones'));
CREATE POLICY "mov_cc_update_perm"
  ON public.movimientos_cuenta_corriente FOR UPDATE TO authenticated
  USING (public.has_permission('editar_transacciones'))
  WITH CHECK (public.has_permission('editar_transacciones'));
CREATE POLICY "mov_cc_delete_perm"
  ON public.movimientos_cuenta_corriente FOR DELETE TO authenticated
  USING (public.has_permission('editar_transacciones') OR public.has_permission('eliminar_transacciones'));

-- 10) RLS movimientos_cuenta_corriente_intermediario
DROP POLICY IF EXISTS "mov_cc_int_insert" ON public.movimientos_cuenta_corriente_intermediario;
DROP POLICY IF EXISTS "mov_cc_int_update" ON public.movimientos_cuenta_corriente_intermediario;
DROP POLICY IF EXISTS "mov_cc_int_delete" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_insert_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('editar_transacciones'));
CREATE POLICY "mov_cc_int_update_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR UPDATE TO authenticated
  USING (public.has_permission('editar_transacciones'))
  WITH CHECK (public.has_permission('editar_transacciones'));
CREATE POLICY "mov_cc_int_delete_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR DELETE TO authenticated
  USING (public.has_permission('editar_transacciones') OR public.has_permission('eliminar_transacciones'));

-- 11) RLS tipos_operacion y modos_pago (catálogos: quien puede crear/editar órdenes puede usarlos)
DROP POLICY IF EXISTS "tipos_operacion_insert" ON public.tipos_operacion;
DROP POLICY IF EXISTS "tipos_operacion_update" ON public.tipos_operacion;
DROP POLICY IF EXISTS "tipos_operacion_delete" ON public.tipos_operacion;
CREATE POLICY "tipos_operacion_insert_perm"
  ON public.tipos_operacion FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('ingresar_orden') OR public.has_permission('editar_orden'));
CREATE POLICY "tipos_operacion_update_perm"
  ON public.tipos_operacion FOR UPDATE TO authenticated
  USING (public.has_permission('editar_orden'))
  WITH CHECK (public.has_permission('editar_orden'));
CREATE POLICY "tipos_operacion_delete_perm"
  ON public.tipos_operacion FOR DELETE TO authenticated
  USING (public.has_permission('editar_orden'));

DROP POLICY IF EXISTS "modos_pago_insert" ON public.modos_pago;
DROP POLICY IF EXISTS "modos_pago_update" ON public.modos_pago;
DROP POLICY IF EXISTS "modos_pago_delete" ON public.modos_pago;
CREATE POLICY "modos_pago_insert_perm"
  ON public.modos_pago FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('ingresar_orden') OR public.has_permission('editar_orden'));
CREATE POLICY "modos_pago_update_perm"
  ON public.modos_pago FOR UPDATE TO authenticated
  USING (public.has_permission('editar_orden'))
  WITH CHECK (public.has_permission('editar_orden'));
CREATE POLICY "modos_pago_delete_perm"
  ON public.modos_pago FOR DELETE TO authenticated
  USING (public.has_permission('editar_orden'));

-- 12) instrumentacion DELETE (si existe)
DROP POLICY IF EXISTS "instrumentacion_delete" ON public.instrumentacion;
CREATE POLICY "instrumentacion_delete_perm"
  ON public.instrumentacion FOR DELETE TO authenticated
  USING (public.has_permission('editar_orden'));
