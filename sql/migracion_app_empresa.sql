-- Marca / empresa en pantalla (white-label). Los valores internos pagador/cobrador 'pandy' en BD no cambian.
-- Ejecutar en Supabase SQL Editor (después de supabase_seguridad / get_my_role).

CREATE TABLE IF NOT EXISTS public.app_empresa (
  id smallint PRIMARY KEY CHECK (id = 1),
  nombre_legal text NOT NULL DEFAULT '',
  nombre_sistema text NOT NULL DEFAULT 'Pandi',
  logo_url text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.app_empresa (id, nombre_legal, nombre_sistema, logo_url)
VALUES (1, '', 'Pandi', '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_empresa_select_anon_auth ON public.app_empresa;
CREATE POLICY app_empresa_select_anon_auth
  ON public.app_empresa FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS app_empresa_update_admin ON public.app_empresa;
CREATE POLICY app_empresa_update_admin
  ON public.app_empresa FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS app_empresa_insert_admin ON public.app_empresa;
CREATE POLICY app_empresa_insert_admin
  ON public.app_empresa FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

GRANT SELECT ON public.app_empresa TO anon;
GRANT SELECT ON public.app_empresa TO authenticated;
GRANT UPDATE ON public.app_empresa TO authenticated;
GRANT INSERT ON public.app_empresa TO authenticated;

INSERT INTO public.app_permission (permission, description) VALUES
  ('abm_configuracion_empresa', 'Configuración de empresa / marca (nombre legal, nombre en sistema, URL del logo)')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'abm_configuracion_empresa')
ON CONFLICT (role, permission) DO NOTHING;
