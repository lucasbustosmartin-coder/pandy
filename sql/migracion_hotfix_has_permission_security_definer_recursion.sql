-- HOTFIX producción: «stack depth limit exceeded» en login
--
-- Causa: has_permission / get_my_role / get_my_permissions en SECURITY INVOKER (lint 0029)
-- leen app_user_profile bajo RLS; las políticas vuelven a llamar has_permission() → recursión infinita.
-- Tras login la app llama get_my_permissions → error en pantalla «Iniciar sesión».
--
-- Solución: estas tres funciones deben permanecer SECURITY DEFINER (bypasean RLS al evaluar permisos).
-- El resto de RPC puede seguir en INVOKER según migracion_security_advisor_0029_security_invoker_rpc.sql.
--
-- Ejecutar de inmediato en Pandy (prod) y Pandy-Dev.

ALTER FUNCTION public.has_permission(text) SECURITY DEFINER;
ALTER FUNCTION public.get_my_role() SECURITY DEFINER;
ALTER FUNCTION public.get_my_permissions() SECURITY DEFINER;
