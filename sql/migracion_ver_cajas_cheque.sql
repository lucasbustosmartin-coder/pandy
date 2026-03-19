-- Permiso Ver Caja Cheque (movimientos con modo de pago cheque no imputan a efectivo; se muestran en tarjeta Cheque).
-- Ejecutar en Supabase SQL Editor.

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_cajas_cheque', 'Cajas: Ver tarjeta Cheque')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission)
SELECT role, 'ver_cajas_cheque' FROM public.app_role_permission WHERE permission = 'ver_cajas'
ON CONFLICT (role, permission) DO NOTHING;
