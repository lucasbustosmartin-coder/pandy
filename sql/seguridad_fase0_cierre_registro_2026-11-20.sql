-- Seguridad Fase 0 — cierre de registro abierto (2026-11-20)
-- APLICADO en Pandy-Dev (ozsofsmnuzliczfphqze) y luego en Pandy (bxwxuzbahewvptarlnxm).
-- Contexto: docs/SALUD_APP_REVISION_2026-11-20.md (P0 #1).
--
-- 1) Configuración de Auth (NO es SQL; se aplicó vía Management API
--    PATCH /v1/projects/{ref}/config/auth, equivalente en Dashboard → Authentication):
--      Dev : disable_signup=true, site_url=https://preview.pandi.company,
--            uri_allow_list=https://preview.pandi.company/**,http://localhost:5173/**
--      Prod: disable_signup=true, site_url=https://pandi.company,
--            uri_allow_list=https://pandi.company/**
--    Antes: disable_signup=false, site_url=http://localhost:3000, uri_allow_list vacío.
--
-- 2) Bloqueo de la cuenta auto-registrada desconocida (rol visor, 0 permisos).
--    Se banea (no se borra, para conservar evidencia) y se quita el perfil.

BEGIN;
UPDATE auth.users
   SET banned_until = '9999-12-31 00:00:00+00'
 WHERE id = 'ee929290-4baa-4d47-a9d8-380608153de4';
DELETE FROM auth.refresh_tokens WHERE user_id = 'ee929290-4baa-4d47-a9d8-380608153de4';
DELETE FROM auth.sessions       WHERE user_id = 'ee929290-4baa-4d47-a9d8-380608153de4';
DELETE FROM public.app_user_profile
 WHERE user_id = 'ee929290-4baa-4d47-a9d8-380608153de4' AND role = 'visor';
COMMIT;

-- Verificación
-- SELECT u.email, u.banned_until, a.role
--   FROM auth.users u LEFT JOIN public.app_user_profile a ON a.user_id = u.id
--  WHERE u.id = 'ee929290-4baa-4d47-a9d8-380608153de4';
-- Signup público: POST /auth/v1/signup → 422 "Signups not allowed for this instance".
