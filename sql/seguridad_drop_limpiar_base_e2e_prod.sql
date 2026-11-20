-- Seguridad: eliminar limpiar_base_e2e de PRODUCCIÓN (Pandy, bxwxuzbahewvptarlnxm) — 2026-11-20
-- La función hace TRUNCATE de órdenes, transacciones, CC y caja (pensada solo para E2E en Pandy-Dev) y existía en
-- prod ejecutable por service_role. SOLO ejecutar en Pandy (prod). En Pandy-Dev se mantiene, con barrera
-- app_config.entorno = 'desarrollo' (sql/rpc_limpiar_base_e2e.sql) y el script scripts/limpiar-base-e2e.js solo
-- acepta el ref de desarrollo.

BEGIN;
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.limpiar_base_e2e();
COMMIT;

-- Verificación: SELECT proname FROM pg_proc WHERE proname = 'limpiar_base_e2e';  → 0 filas
