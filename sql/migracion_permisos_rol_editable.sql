-- Permitir a usuarios con assign_roles modificar permisos por rol (insert/delete en app_role_permission).
-- Ejecutar en Supabase SQL Editor después de supabase_seguridad.sql (y supabase_seguridad_complejidad.sql si aplica).

DROP POLICY IF EXISTS "app_role_permission_insert_assign_roles" ON public.app_role_permission;
CREATE POLICY "app_role_permission_insert_assign_roles"
  ON public.app_role_permission FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('assign_roles'));

DROP POLICY IF EXISTS "app_role_permission_delete_assign_roles" ON public.app_role_permission;
CREATE POLICY "app_role_permission_delete_assign_roles"
  ON public.app_role_permission FOR DELETE TO authenticated
  USING (public.has_permission('assign_roles'));

GRANT INSERT, DELETE ON public.app_role_permission TO authenticated;
