-- Pandi: nombre visible del usuario (listados, exportaciones).
-- Idempotente: ejecutar en Supabase SQL Editor en bases ya desplegadas.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.user_profiles.display_name IS 'Nombre para mostrar en la app y exportaciones; si es null/vacío se usa el email.';

-- Firma distinta (columna display_name): reemplazar función.
DROP FUNCTION IF EXISTS public.get_users_for_admin();

CREATE OR REPLACE FUNCTION public.get_users_for_admin()
RETURNS TABLE (user_id uuid, email text, role text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.email, COALESCE(u.role, 'visor'), p.display_name
  FROM public.user_profiles p
  LEFT JOIN public.app_user_profile u ON u.user_id = p.id
  WHERE public.has_permission('assign_roles');
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_display_name(p_user_id uuid, p_display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission('assign_roles') THEN
    RAISE EXCEPTION 'Sin permiso para editar usuarios';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no válido';
  END IF;
  UPDATE public.user_profiles
  SET display_name = NULLIF(left(btrim(COALESCE(p_display_name, '')), 120), '')
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_display_name(p_display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.user_profiles
  SET display_name = NULLIF(left(btrim(COALESCE(p_display_name, '')), 120), '')
  WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_display_name(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_display_name(text) TO authenticated;
