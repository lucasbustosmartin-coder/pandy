-- Pandi — Security Advisor lint 0029: authenticated + SECURITY DEFINER en RPC public
--
-- El linter avisa cuando `authenticated` puede ejecutar funciones SECURITY DEFINER vía PostgREST.
-- Estas RPC están pensadas para usuarios logueados; el control de permisos pasa a RLS + comprobaciones
-- en el cuerpo (has_permission, políticas en tablas). Cambio: SECURITY INVOKER (mismo cuerpo y GRANTs).
--
-- Excepción documentada: `user_profiles_labels_for_ids` necesita leer perfiles ajenos para etiquetas
-- en listados → política RLS `user_profiles_select_labels_listados` (solo SELECT; columnas sensibles
-- siguen acotadas por uso de la app / no exponer la tabla en el front).
--
-- No aplica a: auth_leaked_password_protection (activar en Dashboard → Auth → Attack Protection).
--
-- Ejecutar en Pandy-Dev y Pandy (prod). Idempotente.

-- Etiquetas en listados (INVOKER en user_profiles_labels_for_ids)
DROP POLICY IF EXISTS user_profiles_select_labels_listados ON public.user_profiles;
CREATE POLICY user_profiles_select_labels_listados
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY user_profiles_select_labels_listados ON public.user_profiles IS
  'Permite a cualquier usuario logueado leer perfiles para armar etiquetas (display_name/email) en listados; la app usa la RPC user_profiles_labels_for_ids.';

-- Permisos / perfil
-- NO pasar a INVOKER: has_permission, get_my_role, get_my_permissions (recursión RLS → stack depth en login).
-- Ver sql/migracion_hotfix_has_permission_security_definer_recursion.sql
ALTER FUNCTION public.get_users_for_admin() SECURITY INVOKER;
ALTER FUNCTION public.set_user_role(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.admin_set_user_display_name(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.set_my_display_name(text) SECURITY INVOKER;
ALTER FUNCTION public.user_profiles_labels_for_ids(uuid[]) SECURITY INVOKER;

-- Modal «Nueva versión»
ALTER FUNCTION public.get_my_release_ack_version() SECURITY INVOKER;
ALTER FUNCTION public.set_my_release_ack_version(text) SECURITY INVOKER;

-- Negocio (RLS en ordenes / transacciones / movimientos CC y caja)
ALTER FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz, text
) SECURITY INVOKER;

ALTER FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) SECURITY INVOKER;

ALTER FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) SECURITY INVOKER;
