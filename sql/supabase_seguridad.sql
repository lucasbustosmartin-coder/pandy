-- Pandi – Módulo de seguridad
-- Roles (Admin, Encargado, Visor), permisos por rol, perfiles de usuario.
-- Ejecutar en Supabase SQL Editor después de supabase_tablas_negocio.sql.

-- ========== 1. Tablas ==========

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles (email);

CREATE TABLE IF NOT EXISTS public.app_role (
  role text PRIMARY KEY,
  label text NOT NULL
);

INSERT INTO public.app_role (role, label) VALUES
  ('admin', 'Admin'),
  ('encargado', 'Encargado'),
  ('visor', 'Visor')
ON CONFLICT (role) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_permission (
  permission text PRIMARY KEY,
  description text
);

INSERT INTO public.app_permission (permission, description) VALUES
  ('assign_roles', 'Asignar roles a usuarios'),
  ('abm_clientes', 'ABM de clientes'),
  ('abm_ordenes', 'ABM de órdenes'),
  ('abm_movimientos_caja', 'Crear/editar movimientos de caja'),
  ('abm_tipos_movimiento_caja', 'ABM de tipos de movimiento de caja')
ON CONFLICT (permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_role_permission (
  role text NOT NULL REFERENCES public.app_role(role) ON DELETE CASCADE,
  permission text NOT NULL REFERENCES public.app_permission(permission) ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'assign_roles'),
  ('admin', 'abm_clientes'),
  ('admin', 'abm_ordenes'),
  ('admin', 'abm_movimientos_caja'),
  ('admin', 'abm_tipos_movimiento_caja'),
  ('encargado', 'abm_clientes'),
  ('encargado', 'abm_ordenes'),
  ('encargado', 'abm_movimientos_caja'),
  ('encargado', 'abm_tipos_movimiento_caja')
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_user_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL REFERENCES public.app_role(role) DEFAULT 'visor',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_user_profile_role ON public.app_user_profile (role);

-- ========== 2. Trigger: nuevo usuario → user_profiles ==========

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''));
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.user_profiles (id, email)
SELECT id, COALESCE(email, '') FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- ========== 3. Funciones de permisos ==========

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.app_user_profile WHERE user_id = auth.uid()),
    'visor'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_role_permission rp
    JOIN public.app_user_profile u ON u.role = rp.role
    WHERE u.user_id = auth.uid() AND rp.permission = perm
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(rp.permission), ARRAY[]::text[])
  FROM public.app_role_permission rp
  JOIN public.app_user_profile u ON u.role = rp.role
  WHERE u.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_users_for_admin()
RETURNS TABLE (user_id uuid, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.email, COALESCE(u.role, 'visor')
  FROM public.user_profiles p
  LEFT JOIN public.app_user_profile u ON u.user_id = p.id
  WHERE public.has_permission('assign_roles');
$$;

-- Admin: asignar rol a un usuario
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
  IF p_role NOT IN ('admin', 'encargado', 'visor') THEN
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

-- ========== 4. RLS en tablas de catálogo ==========

ALTER TABLE public.app_role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_role_select_authenticated" ON public.app_role;
CREATE POLICY "app_role_select_authenticated"
  ON public.app_role FOR SELECT TO authenticated USING (true);

ALTER TABLE public.app_permission ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_permission_select_authenticated" ON public.app_permission;
CREATE POLICY "app_permission_select_authenticated"
  ON public.app_permission FOR SELECT TO authenticated USING (true);

ALTER TABLE public.app_role_permission ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_role_permission_select_authenticated" ON public.app_role_permission;
CREATE POLICY "app_role_permission_select_authenticated"
  ON public.app_role_permission FOR SELECT TO authenticated USING (true);

-- ========== 5. RLS user_profiles ==========

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "user_profiles_select_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_select_admin"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (public.has_permission('assign_roles'));

DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ========== 6. RLS app_user_profile ==========

ALTER TABLE public.app_user_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_user_profile_select_own" ON public.app_user_profile;
CREATE POLICY "app_user_profile_select_own"
  ON public.app_user_profile FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "app_user_profile_select_admin" ON public.app_user_profile;
CREATE POLICY "app_user_profile_select_admin"
  ON public.app_user_profile FOR SELECT TO authenticated
  USING (public.has_permission('assign_roles'));

DROP POLICY IF EXISTS "app_user_profile_insert_admin" ON public.app_user_profile;
CREATE POLICY "app_user_profile_insert_admin"
  ON public.app_user_profile FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('assign_roles'));

DROP POLICY IF EXISTS "app_user_profile_insert_self_visor" ON public.app_user_profile;
CREATE POLICY "app_user_profile_insert_self_visor"
  ON public.app_user_profile FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'visor'
    AND NOT EXISTS (SELECT 1 FROM public.app_user_profile WHERE app_user_profile.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_user_profile_update_admin" ON public.app_user_profile;
CREATE POLICY "app_user_profile_update_admin"
  ON public.app_user_profile FOR UPDATE TO authenticated
  USING (public.has_permission('assign_roles'))
  WITH CHECK (public.has_permission('assign_roles'));

-- ========== 7. Grants ==========

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.app_role TO authenticated;
GRANT SELECT ON public.app_permission TO authenticated;
GRANT SELECT ON public.app_role_permission TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_for_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
