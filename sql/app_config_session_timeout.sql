-- Parámetro de tiempo de inactividad (minutos). Tras X minutos sin usar la app se cierra la sesión. Solo Admin puede modificarlo.
-- Ejecutar en Supabase SQL Editor después de supabase_seguridad.sql.

-- Tabla de configuración (clave-valor)
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Valor por defecto: 60 minutos de inactividad (clic, teclado, scroll, etc.)
INSERT INTO public.app_config (key, value) VALUES ('session_timeout_minutes', '60')
ON CONFLICT (key) DO NOTHING;

-- RLS: todos los autenticados pueden leer; solo Admin puede actualizar
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_select_authenticated" ON public.app_config;
CREATE POLICY "app_config_select_authenticated"
  ON public.app_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_config_update_admin" ON public.app_config;
CREATE POLICY "app_config_update_admin"
  ON public.app_config FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- INSERT solo para Admin (por si se agregan nuevas claves desde la app)
DROP POLICY IF EXISTS "app_config_insert_admin" ON public.app_config;
CREATE POLICY "app_config_insert_admin"
  ON public.app_config FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

GRANT SELECT ON public.app_config TO authenticated;
GRANT UPDATE ON public.app_config TO authenticated;
GRANT INSERT ON public.app_config TO authenticated;
