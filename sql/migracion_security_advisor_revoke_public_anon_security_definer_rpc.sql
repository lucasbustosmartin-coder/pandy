-- Pandi — Security Advisor (Supabase): lint 0028 «anon_security_definer_function_executable»
--
-- Causa: en `public`, muchas funciones SECURITY DEFINER heredan EXECUTE para rol PUBLIC / anon
-- (o se concedió explícito a anon en RPCs viejas). PostgREST expone esas funciones como RPC:
-- un cliente sin JWT podría invocarlas si el cuerpo no valida sesión (riesgo).
--
-- Qué hace esta migración (idempotente):
-- 1) REVOKE ALL … FROM PUBLIC y FROM anon en las funciones listadas.
-- 2) handle_new_user: solo trigger interno → también REVOKE authenticated (no debe ser RPC).
-- 3) limpiar_base_e2e: solo scripts con service_role → REVOKE authenticated y anon; mantiene service_role.
-- 4) Re-GRANT EXECUTE a authenticated (y service_role donde ya existía) para no romper la app con sesión.
--
-- Lint 0029 «authenticated_security_definer_function_executable»: puede seguir apareciendo mientras la app
-- llame RPCs SECURITY DEFINER con usuario logueado; el control real está en auth.uid() / has_permission
-- dentro de cada función. Reducir 0029 implicaría mover lógica a Edge Functions o INVOKER (cambio grande).
--
-- Orden: ejecutar en Pandy-Dev y en Pandy (producción). Paridad con `sql/rpc_sync_cc_caja_orden.sql` y
-- `sql/rpc_transacciones_cambiar_estado.sql` (allí se quitó GRANT a anon).

-- ---------- Permisos helpers y usuarios ----------
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

REVOKE ALL ON FUNCTION public.get_users_for_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_users_for_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_users_for_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_user_display_name(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_display_name(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_display_name(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_my_display_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_display_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_display_name(text) TO authenticated;

REVOKE ALL ON FUNCTION public.user_profiles_labels_for_ids(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_profiles_labels_for_ids(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_profiles_labels_for_ids(uuid[]) TO authenticated;

-- Trigger auth.users → no debe exponerse como RPC
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- E2E: solo service_role (scripts con clave service)
REVOKE ALL ON FUNCTION public.limpiar_base_e2e() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limpiar_base_e2e() FROM anon;
REVOKE ALL ON FUNCTION public.limpiar_base_e2e() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_base_e2e() TO service_role;

-- Órdenes / sync / transacciones: sesión obligatoria (anon no)
REVOKE ALL ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ordenes_insertar_con_proximo_numero(
  uuid, date, text, uuid, boolean, uuid, text, text, numeric, numeric, numeric, numeric, boolean, boolean, numeric, text, uuid, timestamptz, text
) TO service_role;

REVOKE ALL ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_orden(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transacciones_cambiar_estado(uuid, text, date, uuid, boolean) TO service_role;
