-- Agregar rol "Empleado Administrativo" y permitir que set_user_role acepte cualquier rol de app_role.
-- Ejecutar en Supabase SQL Editor (después de supabase_seguridad.sql).

INSERT INTO public.app_role (role, label) VALUES
  ('empleado_administrativo', 'Empleado Administrativo')
ON CONFLICT (role) DO NOTHING;

-- Actualizar set_user_role para que acepte cualquier rol existente en app_role (no solo admin/encargado/visor).
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
  IF NOT EXISTS (SELECT 1 FROM public.app_role WHERE role = p_role) THEN
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
