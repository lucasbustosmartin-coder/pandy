-- Pandi – Permisos para complejidad (intermediarios)
-- Ejecutar después de supabase_seguridad.sql (una vez).

INSERT INTO public.app_permission (permission, description) VALUES
  ('abm_intermediarios', 'ABM de intermediarios')
ON CONFLICT (permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'abm_intermediarios'),
  ('encargado', 'abm_intermediarios')
ON CONFLICT (role, permission) DO NOTHING;
