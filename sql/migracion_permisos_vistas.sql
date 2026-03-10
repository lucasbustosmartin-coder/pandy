-- Permisos de vistas (Panel de Control y demás). Panel de Control parametrizable por tarjetas.
-- Ejecutar en Supabase SQL Editor.

-- 1) Insertar permisos de vista (acceso a vistas del menú)
INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_inicio', 'Ver Panel de Control'),
  ('ver_inicio_efectivo', 'Panel: Ver tarjeta Efectivo'),
  ('ver_inicio_banco', 'Panel: Ver tarjeta Banco'),
  ('ver_inicio_pendientes', 'Panel: Ver tarjetas de pendientes'),
  ('ver_ordenes', 'Ver Órdenes'),
  ('ver_cajas', 'Ver Cajas'),
  ('ver_clientes', 'Ver Clientes'),
  ('ver_intermediarios', 'Ver Intermediarios'),
  ('ver_cuenta_corriente', 'Ver Cuenta corriente'),
  ('ver_seguridad', 'Ver Seguridad')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

-- 2) Admin: todas las vistas y todas las tarjetas del Panel
INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'ver_inicio'),
  ('admin', 'ver_inicio_efectivo'),
  ('admin', 'ver_inicio_banco'),
  ('admin', 'ver_inicio_pendientes'),
  ('admin', 'ver_ordenes'),
  ('admin', 'ver_cajas'),
  ('admin', 'ver_clientes'),
  ('admin', 'ver_intermediarios'),
  ('admin', 'ver_cuenta_corriente'),
  ('admin', 'ver_seguridad')
ON CONFLICT (role, permission) DO NOTHING;

-- 3) Encargado: todas excepto Seguridad; todas las tarjetas del Panel
INSERT INTO public.app_role_permission (role, permission) VALUES
  ('encargado', 'ver_inicio'),
  ('encargado', 'ver_inicio_efectivo'),
  ('encargado', 'ver_inicio_banco'),
  ('encargado', 'ver_inicio_pendientes'),
  ('encargado', 'ver_ordenes'),
  ('encargado', 'ver_cajas'),
  ('encargado', 'ver_clientes'),
  ('encargado', 'ver_intermediarios'),
  ('encargado', 'ver_cuenta_corriente')
ON CONFLICT (role, permission) DO NOTHING;

-- 4) Visor: Panel de Control con tarjetas de pendientes ON por defecto; Efectivo y Banco OFF
INSERT INTO public.app_role_permission (role, permission) VALUES
  ('visor', 'ver_inicio'),
  ('visor', 'ver_inicio_pendientes'),
  ('visor', 'ver_ordenes'),
  ('visor', 'ver_cajas'),
  ('visor', 'ver_clientes'),
  ('visor', 'ver_intermediarios'),
  ('visor', 'ver_cuenta_corriente')
ON CONFLICT (role, permission) DO NOTHING;
