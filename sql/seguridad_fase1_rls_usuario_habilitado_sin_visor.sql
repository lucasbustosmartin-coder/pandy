-- Seguridad Fase 1 — lectura solo para usuarios habilitados y eliminación del rol visor (2026-11-20)
-- Contexto: docs/SALUD_APP_REVISION_2026-11-20.md (P0 #1) y sql/seguridad_fase0_cierre_registro_2026-11-20.sql.
--
-- Antes: 20 tablas con SELECT ... USING (true) para cualquier usuario autenticado y política que permitía
-- auto-asignarse el rol 'visor'. Un usuario sin perfil también caía en 'visor' por defecto.
-- Después: "habilitado" = tiene fila en app_user_profile (rol asignado por un admin en Seguridad).
-- Sin rol → no lee nada de negocio. El rol 'visor' deja de existir.
--
-- Idempotente. Aplicar primero en Pandy-Dev, probar y luego en Pandy.
-- app_empresa queda pública (anon) porque el login muestra nombre/logo.

BEGIN;
-- Si alguna tabla está ocupada, abortar entero (rollback) en vez de trabar la app.
SET LOCAL lock_timeout = '5s';

-- 1) Helper: el usuario actual tiene un rol asignado
CREATE OR REPLACE FUNCTION public.es_usuario_habilitado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_user_profile u WHERE u.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.es_usuario_habilitado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_usuario_habilitado() TO authenticated;

-- 2) Políticas de lectura: USING (true) → USING (public.es_usuario_habilitado())
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('app_config',                                 'app_config_select_authenticated'),
      ('app_permission',                             'app_permission_select_authenticated'),
      ('app_role',                                   'app_role_select_authenticated'),
      ('app_role_permission',                        'app_role_permission_select_authenticated'),
      ('clientes',                                   'clientes_select_authenticated'),
      ('comisiones_orden',                           'comisiones_orden_select'),
      ('contraparte_vinculo',                        'contraparte_vinculo_select'),
      ('instrumentacion',                            'instrumentacion_select'),
      ('intermediarios',                             'intermediarios_select'),
      ('modos_pago',                                 'modos_pago_select'),
      ('movimientos_caja',                           'movimientos_caja_select_authenticated'),
      ('movimientos_cuenta_corriente',               'mov_cc_select_authenticated'),
      ('movimientos_cuenta_corriente_intermediario', 'mov_cc_int_select'),
      ('orden_comisiones_generadas',                 'orden_comisiones_generadas_select'),
      ('ordenes',                                    'ordenes_select_authenticated'),
      ('reglas_de_negocio',                          'reglas_de_negocio_select_authenticated'),
      ('tipos_movimiento_caja',                      'tipos_mov_caja_select_authenticated'),
      ('tipos_operacion',                            'tipos_operacion_select'),
      ('transacciones',                              'transacciones_select'),
      ('user_profiles',                              'user_profiles_select_labels_listados')
    ) AS t(tabla, politica)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.politica, r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.es_usuario_habilitado()))',
      r.politica, r.tabla
    );
  END LOOP;
END $$;

-- 3) Sin auto-asignación de rol
DROP POLICY IF EXISTS "app_user_profile_insert_self_visor" ON public.app_user_profile;

-- 4) Sin rol por defecto
ALTER TABLE public.app_user_profile ALTER COLUMN role DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.app_user_profile WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_users_for_admin()
RETURNS TABLE (user_id uuid, email text, role text, display_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p.id, p.email, u.role, p.display_name
  FROM public.user_profiles p
  LEFT JOIN public.app_user_profile u ON u.user_id = p.id
  WHERE public.has_permission('assign_roles');
$$;

-- 5) Eliminar el rol visor (solo si nadie lo tiene)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_user_profile WHERE role = 'visor') THEN
    RAISE EXCEPTION 'Hay usuarios con rol visor: reasignarlos antes de eliminar el rol';
  END IF;
  DELETE FROM public.app_role_permission WHERE role = 'visor';
  DELETE FROM public.app_role WHERE role = 'visor';
END $$;

DROP POLICY IF EXISTS "app_role_delete_assign_roles" ON public.app_role;
CREATE POLICY "app_role_delete_assign_roles"
  ON public.app_role FOR DELETE TO authenticated
  USING (
    public.has_permission('assign_roles')
    AND role NOT IN ('admin', 'encargado')
    AND NOT EXISTS (SELECT 1 FROM public.app_user_profile u WHERE u.role = app_role.role)
  );

COMMIT;

-- Verificación
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND cmd IN ('SELECT','ALL') AND qual='true';
--   → solo app_empresa (anon + authenticated)
-- SELECT role FROM public.app_role ORDER BY 1;  → sin 'visor'
