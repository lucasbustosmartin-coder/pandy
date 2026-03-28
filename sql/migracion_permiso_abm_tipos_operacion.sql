-- Menú y ABM «Tipos de operación»: permiso dedicado + RLS (además de ingresar/editar orden).
-- Si ya ejecutaste migracion_permisos_ordenes_transacciones.sql sin este bloque, corré este archivo una vez.
-- Instalaciones nuevas: queda integrado en migracion_permisos_ordenes_transacciones.sql.

INSERT INTO public.app_permission (permission, description) VALUES
  ('abm_tipos_operacion', 'ABM Tipos de operación: catálogo, monedas IN/OUT, iconos, orden visual, activo')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'abm_tipos_operacion'),
  ('encargado', 'abm_tipos_operacion')
ON CONFLICT (role, permission) DO NOTHING;

DROP POLICY IF EXISTS "tipos_operacion_insert_perm" ON public.tipos_operacion;
DROP POLICY IF EXISTS "tipos_operacion_update_perm" ON public.tipos_operacion;
DROP POLICY IF EXISTS "tipos_operacion_delete_perm" ON public.tipos_operacion;

CREATE POLICY "tipos_operacion_insert_perm"
  ON public.tipos_operacion FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('abm_tipos_operacion')
    OR public.has_permission('ingresar_orden')
    OR public.has_permission('editar_orden')
  );

CREATE POLICY "tipos_operacion_update_perm"
  ON public.tipos_operacion FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_tipos_operacion')
    OR public.has_permission('editar_orden')
  )
  WITH CHECK (
    public.has_permission('abm_tipos_operacion')
    OR public.has_permission('editar_orden')
  );

CREATE POLICY "tipos_operacion_delete_perm"
  ON public.tipos_operacion FOR DELETE TO authenticated
  USING (
    public.has_permission('abm_tipos_operacion')
    OR public.has_permission('editar_orden')
  );
