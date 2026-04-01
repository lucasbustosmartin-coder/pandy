-- Perfiles (roles) dinámicos: crear y eliminar desde la app con assign_roles.
-- set_user_role: acepta cualquier rol que exista en app_role (no solo admin/encargado/visor).
--
-- Ejecutar en Supabase SQL Editor en bases ya desplegadas. Idempotente.
-- Bootstrap dev: incluido tras migracion_permisos_rol_editable.sql.

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission('assign_roles') THEN
    RAISE EXCEPTION 'Sin permiso para asignar roles';
  END IF;
  IF p_role IS NULL OR btrim(p_role) = '' THEN
    RAISE EXCEPTION 'Rol no válido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_role r WHERE r.role = p_role) THEN
    RAISE EXCEPTION 'Rol no válido';
  END IF;
  INSERT INTO public.app_user_profile (user_id, role, updated_at, updated_by)
  VALUES (p_user_id, p_role, now(), auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;
END;
$$;

DROP POLICY IF EXISTS "app_role_insert_assign_roles" ON public.app_role;
CREATE POLICY "app_role_insert_assign_roles"
  ON public.app_role FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('assign_roles')
    AND role = lower(btrim(role))
    AND label = btrim(label)
    AND char_length(role) >= 3
    AND char_length(role) <= 64
    AND role ~ '^[a-z][a-z0-9_]*$'
    AND char_length(label) >= 1
    AND char_length(label) <= 120
    AND role NOT IN ('anon', 'authenticated', 'service_role', 'supabase_admin', 'dashboard_user')
    AND role NOT LIKE 'pg\_%' ESCAPE '\'
  );

DROP POLICY IF EXISTS "app_role_delete_assign_roles" ON public.app_role;
CREATE POLICY "app_role_delete_assign_roles"
  ON public.app_role FOR DELETE TO authenticated
  USING (
    public.has_permission('assign_roles')
    AND role NOT IN ('admin', 'encargado', 'visor')
    AND NOT EXISTS (SELECT 1 FROM public.app_user_profile u WHERE u.role = app_role.role)
  );

GRANT INSERT, DELETE ON public.app_role TO authenticated;

COMMENT ON POLICY "app_role_insert_assign_roles" ON public.app_role IS 'Alta de perfiles personalizados (código snake_case + etiqueta visible).';
COMMENT ON POLICY "app_role_delete_assign_roles" ON public.app_role IS 'Baja solo si no es rol base y ningún usuario usa el perfil.';
