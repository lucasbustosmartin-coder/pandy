-- Permisos granulares Ver para Cajas: Ver Efectivo y Ver Banco.
-- Ejecutar en Supabase SQL Editor.

-- 1) Nuevos permisos
INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_cajas_efectivo', 'Cajas: Ver tarjeta Efectivo'),
  ('ver_cajas_banco', 'Cajas: Ver tarjeta Banco')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

-- 2) Quien tiene ver_cajas recibe también los dos nuevos (admin, encargado, visor que tengan ver_cajas)
INSERT INTO public.app_role_permission (role, permission)
SELECT role, 'ver_cajas_efectivo' FROM public.app_role_permission WHERE permission = 'ver_cajas'
ON CONFLICT (role, permission) DO NOTHING;
INSERT INTO public.app_role_permission (role, permission)
SELECT role, 'ver_cajas_banco' FROM public.app_role_permission WHERE permission = 'ver_cajas'
ON CONFLICT (role, permission) DO NOTHING;
