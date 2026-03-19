-- Panel de Control: las tarjetas Efectivo / Banco / Cheque usan los mismos permisos que la vista Cajas
-- (ver_cajas_efectivo, ver_cajas_banco, ver_cajas_cheque). Quien tenía solo los permisos legacy
-- ver_inicio_efectivo / ver_inicio_banco recibe el permiso de caja correspondiente si aún no lo tiene.

INSERT INTO public.app_role_permission (role, permission)
SELECT DISTINCT rp.role, 'ver_cajas_efectivo'
FROM public.app_role_permission rp
WHERE rp.permission = 'ver_inicio_efectivo'
  AND NOT EXISTS (
    SELECT 1 FROM public.app_role_permission x
    WHERE x.role = rp.role AND x.permission = 'ver_cajas_efectivo'
  )
ON CONFLICT (role, permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission)
SELECT DISTINCT rp.role, 'ver_cajas_banco'
FROM public.app_role_permission rp
WHERE rp.permission = 'ver_inicio_banco'
  AND NOT EXISTS (
    SELECT 1 FROM public.app_role_permission x
    WHERE x.role = rp.role AND x.permission = 'ver_cajas_banco'
  )
ON CONFLICT (role, permission) DO NOTHING;
