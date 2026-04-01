-- Panel de Control: tarjetas «Órdenes pendientes» y «Transacciones pendientes» con permisos independientes.
-- Quien tenía ver_inicio_pendientes recibe ambos permisos nuevos (comportamiento igual al actual).
-- Idempotente. Ejecutar en Supabase SQL Editor en bases ya desplegadas.
-- Bootstrap dev: incluido tras migracion_permisos_vistas.sql.

INSERT INTO public.app_permission (permission, description) VALUES
  ('ver_inicio_ordenes_pendientes', 'Panel: tarjeta órdenes pendientes (conteos por estado)'),
  ('ver_inicio_transacciones_pendientes', 'Panel: tarjeta transacciones pendientes')
ON CONFLICT (permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, 'ver_inicio_ordenes_pendientes'
FROM public.app_role_permission rp
WHERE rp.permission = 'ver_inicio_pendientes'
  AND NOT EXISTS (
    SELECT 1 FROM public.app_role_permission x
    WHERE x.role = rp.role AND x.permission = 'ver_inicio_ordenes_pendientes'
  );

INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, 'ver_inicio_transacciones_pendientes'
FROM public.app_role_permission rp
WHERE rp.permission = 'ver_inicio_pendientes'
  AND NOT EXISTS (
    SELECT 1 FROM public.app_role_permission x
    WHERE x.role = rp.role AND x.permission = 'ver_inicio_transacciones_pendientes'
  );
