-- Permiso ABM reglas de negocio (CC): menú crítico en la app. Por defecto solo **admin**.
-- RLS: INSERT/UPDATE/DELETE en reglas_de_negocio solo con has_permission('abm_reglas_negocio').
-- Ejecutar en Supabase SQL Editor después de supabase_seguridad.sql (has_permission).

INSERT INTO public.app_permission (permission, description) VALUES
  ('abm_reglas_negocio', 'Reglas de negocio (CC): menú crítico — ver, editar, replicar matriz en reglas_de_negocio')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'abm_reglas_negocio')
ON CONFLICT (role, permission) DO NOTHING;

-- No se asigna a encargado/visor por defecto (solo Admin puede delegar desde Seguridad).

ALTER TABLE public.reglas_de_negocio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reglas_de_negocio_insert_abm" ON public.reglas_de_negocio;
CREATE POLICY "reglas_de_negocio_insert_abm"
  ON public.reglas_de_negocio FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_reglas_negocio'));

DROP POLICY IF EXISTS "reglas_de_negocio_update_abm" ON public.reglas_de_negocio;
CREATE POLICY "reglas_de_negocio_update_abm"
  ON public.reglas_de_negocio FOR UPDATE TO authenticated
  USING (public.has_permission('abm_reglas_negocio'))
  WITH CHECK (public.has_permission('abm_reglas_negocio'));

DROP POLICY IF EXISTS "reglas_de_negocio_delete_abm" ON public.reglas_de_negocio;
CREATE POLICY "reglas_de_negocio_delete_abm"
  ON public.reglas_de_negocio FOR DELETE TO authenticated
  USING (public.has_permission('abm_reglas_negocio'));
